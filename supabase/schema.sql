-- ============================================================================
-- MIZYS CRM — banco completo para um projeto Supabase NOVO
-- Rode este arquivo INTEIRO em: Supabase > SQL Editor > New query > Run.
--
-- O que ele cria, nesta ordem:
--   1. tabelas e colunas de todo o sistema (23 tabelas)
--   2. funções, triggers, numeração de proposta, auditoria e linha do tempo
--   3. RLS — nenhuma linha é visível sem login, e o papel define o que se vê
--   4. buckets de Storage (`propostas` e `anexos`), privados
--   5. parâmetros e listas do sistema (fases do funil, status, UFs, tipos de
--      atividade…) — a tela de Configurações edita tudo isso depois
--   6. escalas e turnos padrão do setor: 44h, 12x36 diurno e noturno, 5x2,
--      6x1, plantão 24h / diurno, noturno, comercial, manhã, tarde, madrugada
--
-- O que ele NÃO cria: NENHUM dado inventado. Sem empresa de mentira nos
-- parâmetros, sem convenção coletiva de exemplo com salário fictício, sem
-- catálogo de equipamentos, sem lead, proposta, contrato ou vendedor. A
-- primeira coisa a fazer depois de entrar é preencher Configurações (dados da
-- empresa) e cadastrar a sua convenção coletiva de verdade.
--
-- Quem quiser a base povoada só para conhecer o sistema roda
-- `supabase/dados_exemplo.sql` — e depois apaga.
--
-- Segmento único: FACILITIES.
-- Fluxo: Lead → Contato → Oportunidade → Proposta → Contrato.
--
-- ⚠ Este arquivo APAGA e recria as tabelas do CRM. Numa base que já tem dados
--   use `supabase/migracao_v2.sql`, que só adiciona o que falta.
--
-- Depois de rodar, no painel do Supabase:
--   Authentication > Providers > Email  → deixe "Confirm email" DESLIGADO,
--   senão o primeiro usuário criado pela tela de login não consegue entrar.
--   O PRIMEIRO usuário que se cadastrar vira admin automaticamente.
-- ============================================================================

-- ⚠ Recria tudo do zero. Apaga os dados existentes destas tabelas.
drop table if exists
  auditoria, timeline, notas, anexos,
  contrato_reajustes, contratos, metas,
  proposta_documentos,
  ativs, propostas, ops, contatos, leads,
  equipamentos, turnos, escalas,
  cct_encargos, cct_beneficios, cct_cargos, ccts,
  contas, cargos, beneficios,
  listas, configuracoes, perfis
cascade;

drop function if exists proximo_numero_proposta(text, integer) cascade;
drop function if exists app_papel() cascade;
drop function if exists app_pode_gerir() cascade;
drop function if exists app_e_admin() cascade;
drop function if exists tg_touch() cascade;
drop function if exists tg_dono() cascade;
drop function if exists tg_auditoria() cascade;
drop function if exists tg_timeline() cascade;
drop function if exists tg_perfil_novo_usuario() cascade;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PERFIS E PAPÉIS                                                          │
-- │ admin    — faz tudo, inclusive mexer em parâmetros e papéis              │
-- │ gestor   — vê e edita o comercial de todo mundo, mexe em cadastros       │
-- │ vendedor — vê e edita só o que é dele; cadastros são somente leitura     │
-- └──────────────────────────────────────────────────────────────────────────┘

create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  papel text not null default 'vendedor'
    check (papel in ('admin','gestor','vendedor')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Todo usuário novo do Supabase Auth ganha um perfil. O PRIMEIRO vira admin —
-- senão ninguém conseguiria promover ninguém.
create function tg_perfil_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, email, nome, papel)
  values (
    new.id, new.email, split_part(coalesce(new.email,''), '@', 1),
    case when (select count(*) from perfis) = 0 then 'admin' else 'vendedor' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function tg_perfil_novo_usuario();

-- Papel do usuário da requisição. `security definer` para poder ser chamada de
-- dentro das próprias policies sem cair em recursão de RLS.
create function app_papel() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from perfis where id = auth.uid() and ativo), 'vendedor')
$$;

create function app_pode_gerir() returns boolean
language sql stable security definer set search_path = public as $$
  select app_papel() in ('admin','gestor')
$$;

create function app_e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select app_papel() = 'admin'
$$;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PARAMETRIZAÇÃO — substitui as constantes que antes viviam no JavaScript  │
-- └──────────────────────────────────────────────────────────────────────────┘

create table configuracoes (
  chave text primary key,
  valor text not null default '',
  descricao text,
  grupo text not null default 'geral',
  updated_at timestamptz not null default now()
);

create table listas (
  id bigint generated by default as identity primary key,
  grupo text not null,
  valor text not null,
  rotulo text not null,
  num numeric(12,4),
  ordem integer not null default 0,
  ativo boolean not null default true,
  unique (grupo, valor)
);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CONVENÇÕES COLETIVAS (CCT)                                               │
-- └──────────────────────────────────────────────────────────────────────────┘

create table ccts (
  id bigint generated by default as identity primary key,
  nome text not null,
  sindicato text,
  vigencia_inicio date,
  vigencia_fim date,
  uf text,
  cidade text,
  obs text,
  -- Base de cálculo da insalubridade. Na maioria das CCTs é o salário mínimo;
  -- em algumas é o piso da categoria ou o próprio salário do cargo.
  insalubridade_base text not null default 'minimo'
    check (insalubridade_base in ('minimo','piso','salario')),
  salario_minimo numeric(12,2) not null default 0,   -- 0 = usa configuracoes
  piso_categoria numeric(12,2) not null default 0,
  -- Divisor de horas mensais (44h semanais → 220h). Vira salário-hora.
  horas_mensais numeric(8,2) not null default 220,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cct_cargos (
  id bigint generated by default as identity primary key,
  "cctId" bigint not null references ccts(id) on delete cascade,
  nome text not null,
  cbo text,
  salario numeric(12,2) not null default 0,
  obs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cct_beneficios (
  id bigint generated by default as identity primary key,
  "cctId" bigint not null references ccts(id) on delete cascade,
  nome text not null,
  valor numeric(12,2) not null default 0,
  unid text not null default 'mês',
  -- Quando `unid` = 'dia', quantos dias por mês entram na conta.
  dias_mes numeric(6,2) not null default 22,
  -- Desconto legal da parte do empregado:
  --   nenhum      — a empresa paga tudo
  --   pct_salario — % do salário, limitado ao valor do benefício (VT: 6%)
  --   pct_valor   — % do próprio benefício (coparticipação de VR/saúde)
  desconto_tipo text not null default 'nenhum'
    check (desconto_tipo in ('nenhum','pct_salario','pct_valor')),
  desconto_pct numeric(6,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cct_encargos (
  id bigint generated by default as identity primary key,
  "cctId" bigint not null references ccts(id) on delete cascade,
  nome text not null,
  percentual numeric(8,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ESCALAS E TURNOS                                                         │
-- └──────────────────────────────────────────────────────────────────────────┘

create table escalas (
  id bigint generated by default as identity primary key,
  nome text not null,
  descricao text,
  horas_semanais numeric(6,2) not null default 44,
  -- Quantos funcionários cobrem 1 posto nesta escala.
  --   'manual'    — usa fator_func como está (comportamento histórico)
  --   'calculado' — deriva de horas de cobertura ÷ horas contratuais,
  --                 acrescido de absenteísmo e cobertura de férias
  fator_modo text not null default 'manual'
    check (fator_modo in ('manual','calculado')),
  fator_func numeric(6,3) not null default 1,
  dias_semana numeric(4,2) not null default 7,      -- dias que o POSTO opera
  horas_posto_dia numeric(6,2) not null default 0,  -- 0 = usa a duração do turno
  absenteismo_pct numeric(6,3) not null default 0,
  cobertura_ferias boolean not null default false,  -- soma 1/11 (≈9,09%)
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table turnos (
  id bigint generated by default as identity primary key,
  nome text not null,
  hora_inicio text not null default '07:00',
  hora_fim text not null default '19:00',
  intervalo_min integer not null default 60,
  noturno boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ EQUIPAMENTOS                                                             │
-- └──────────────────────────────────────────────────────────────────────────┘

create table equipamentos (
  id bigint generated by default as identity primary key,
  nome text not null,
  marca_modelo text,
  valor numeric(12,2) not null default 0,
  tipo text not null default 'Mensal',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ MATERIAIS — o MÓDULO 5 da planilha (insumos)                             │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Insumo NÃO é equipamento. Equipamento é bem durável e o valor cheio cai todo
-- mês. Insumo é reposição, e o que importa é o PRAZO DE TROCA: um conjunto de
-- uniforme de R$ 190 trocado a cada 6 meses custa R$ 31,67 por funcionário por
-- mês. É esse número que entra no custo direto — nunca os R$ 190.

create table materiais (
  id bigint generated by default as identity primary key,
  nome text not null,
  categoria text not null default 'Material',   -- só rótulo, para agrupar
  unidade text not null default 'un',
  valor numeric(12,2) not null default 0,       -- AQUISIÇÃO de uma unidade
  meses integer not null default 1 check (meses >= 1),   -- custo mensal = valor ÷ meses
  -- Por quanto multiplicar:
  --   funcionario · uniforme, EPI, exame  → × nº de funcionários (headcount real)
  --   posto       · rádio, chave, livro   → × nº de postos
  --   contrato    · produto da área comum → × 1
  base text not null default 'funcionario'
    check (base in ('funcionario','posto','contrato')),
  obs text,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index materiais_nome_idx on materiais (lower(nome));

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LEADS E CONTATOS                                                         │
-- └──────────────────────────────────────────────────────────────────────────┘

create table leads (
  id bigint generated by default as identity primary key,
  empresa text not null,
  cnpj text,
  endereco text,
  cidade text,
  uf text,
  site text,
  contato_nome text,
  contato_cargo text,
  contato_email text,
  contato_telefone text,
  contato_telefone2 text,
  origem text,
  status text not null default 'Novo',
  valor numeric(12,2) not null default 0,
  owner text,
  obs text,
  -- Motivo de desqualificação (lista `lead_motivo_perda`).
  motivo text,
  motivo_obs text,
  criado date not null default current_date,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chave de deduplicação: CNPJ só com dígitos. Índice parcial, porque lead sem
-- CNPJ é normal e não pode travar o cadastro.
create unique index leads_cnpj_uniq
  on leads (regexp_replace(coalesce(cnpj,''), '[^0-9]', '', 'g'))
  where regexp_replace(coalesce(cnpj,''), '[^0-9]', '', 'g') <> '';
create index leads_empresa_idx on leads (lower(empresa));
create index leads_owner_idx on leads (owner_id);

create table contatos (
  id bigint generated by default as identity primary key,
  "leadId" bigint not null references leads(id) on delete cascade,
  nome text not null,
  cargo text,
  email text,
  telefone text,
  telefone2 text,
  principal boolean not null default false,
  obs text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contatos_lead_idx on contatos ("leadId");

create table ops (
  id bigint generated by default as identity primary key,
  titulo text not null,
  "leadId" bigint references leads(id) on delete set null,
  valor numeric(12,2) not null default 0,
  fase text not null default 'Prospecção',
  prob numeric(5,2) not null default 0,
  fecha date,
  owner text,
  -- Motivo do desfecho (listas `op_motivo_ganho` / `op_motivo_perda`).
  motivo text,
  motivo_obs text,
  fechada_em date,
  -- Quando a oportunidade entrou na fase atual — base do tempo médio por fase.
  fase_desde timestamptz not null default now(),
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ops_lead_idx on ops ("leadId");
create index ops_owner_idx on ops (owner_id);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PROPOSTAS                                                                │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- `itens` (postos de trabalho) — array de objetos:
--   { "cargoId": 1, "escalaId": 1, "turnoId": 1, "qtd": 2,
--     "adicionais": ["P30","I20"], "a20": 20, "beneficios": [1,2], "obs": "" }
--
-- `equipamentos` — array de objetos: { "id": 3, "qtd": 2 }
--
-- `snapshot` — CONGELAMENTO. Assim que a proposta sai de Rascunho, o servidor
--   grava aqui salários, benefícios, encargos, escalas e turnos como estavam
--   naquele instante, mais o resultado do cálculo. A partir daí a tela e o
--   documento leem o snapshot, nunca a CCT viva: reajuste de convenção não
--   muda mais o valor de uma proposta já enviada.

create table propostas (
  id bigint generated by default as identity primary key,
  numero text not null unique,
  "leadId" bigint references leads(id) on delete restrict,
  "contatoId" bigint references contatos(id) on delete set null,
  "opId" bigint references ops(id) on delete set null,
  "cctId" bigint references ccts(id) on delete restrict,
  titulo text,
  status text not null default 'Rascunho',
  emissao date not null default current_date,
  validade integer not null default 30,
  prazo integer not null default 12,
  encargos numeric(8,4) not null default 72,
  markup numeric(8,4) not null default 18,
  imposto numeric(8,4) not null default 14.33,
  desconto numeric(8,4) not null default 0,
  itens jsonb not null default '[]',
  equipamentos jsonb not null default '[]',
  -- MÓDULO 5: [{ "id": 3, "qtd": 2 }] — qtd é por BASE do material
  -- (2 conjuntos de uniforme POR FUNCIONÁRIO, não 2 no contrato inteiro).
  materiais jsonb not null default '[]',
  -- Margem líquida desejada em %. Preenchida, ela MANDA no lucro de planilha:
  -- o motor resolve L = (1−T) ÷ [((1−T) − m) × (1−d)] − 1. Zero = lucro de
  -- planilha digitado à mão, como era antes.
  margem_alvo numeric(8,4) not null default 0,
  escopo text,
  obs text,

  -- Congelamento (P3)
  snapshot jsonb,
  congelada_em timestamptz,

  -- Versionamento (4.8)
  versao integer not null default 1,
  "propostaPaiId" bigint references propostas(id) on delete set null,

  -- Aprovação de desconto acima do limite (4.8)
  aprovacao_status text not null default 'nao_requer'
    check (aprovacao_status in ('nao_requer','pendente','aprovado','recusado')),
  aprovacao_por uuid references auth.users(id) on delete set null,
  aprovacao_em timestamptz,
  aprovacao_obs text,

  -- Aceite pelo cliente e rastreio de abertura (4.4)
  aceite_token text unique,
  aceite_em timestamptz,
  aceite_nome text,
  aceite_ip text,
  aberturas integer not null default 0,
  aberta_em timestamptz,

  -- Documento (4.5)
  modelo_ppt text,
  slides jsonb not null default '{}',

  -- Desfecho
  motivo text,
  motivo_obs text,

  -- `owner` é o NOME do responsável (lista `owner`), usado nos relatórios;
  -- `owner_id` é o usuário do Auth, usado pela RLS. Os dois convivem porque
  -- nem todo vendedor do relatório tem login no sistema.
  owner text,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index propostas_lead_idx on propostas ("leadId");
create index propostas_owner_idx on propostas (owner_id);

-- Numeração sem corrida (P5): quem decide o próximo número é o banco.
create sequence proposta_numero_seq;

create function proximo_numero_proposta(prefixo text default 'PRP', ano integer default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  a integer := coalesce(ano, extract(year from current_date)::integer);
  n bigint;
begin
  -- nextval é atômico: dois vendedores clicando ao mesmo tempo recebem
  -- números diferentes, sem depender de MAX+1 lido no navegador.
  n := nextval('proposta_numero_seq');
  return prefixo || '-' || a::text || '-' || lpad(n::text, 4, '0');
end $$;

create table proposta_documentos (
  id bigint generated by default as identity primary key,
  "propostaId" bigint not null references propostas(id) on delete cascade,
  formato text not null check (formato in ('pptx','pdf')),
  versao integer not null default 1,
  caminho text not null,               -- caminho dentro do bucket `propostas`
  tamanho bigint not null default 0,
  enviado_para text,                   -- e-mail de destino, quando houve envio
  enviado_em timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index proposta_documentos_prop_idx on proposta_documentos ("propostaId");

create table ativs (
  id bigint generated by default as identity primary key,
  tipo text not null,
  titulo text not null,
  "refTipo" text check ("refTipo" in ('Lead','Oportunidade','Proposta','Contrato')),
  "refId" bigint,
  data date not null,
  hora text,
  owner text,
  obs text,
  feito boolean not null default false,
  feito_em timestamptz,
  -- Recorrência: gera a próxima ocorrência ao concluir (3.x / "atividades
  -- recorrentes e lembretes").
  recorrencia text not null default 'nenhuma'
    check (recorrencia in ('nenhuma','diaria','semanal','quinzenal','mensal')),
  lembrete_dias integer not null default 0,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ativs_ref_idx on ativs ("refTipo","refId");

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PÓS-VENDA — o fluxo não morre mais em "Ganho"                            │
-- └──────────────────────────────────────────────────────────────────────────┘

create table contratos (
  id bigint generated by default as identity primary key,
  numero text not null unique,
  "leadId" bigint not null references leads(id) on delete restrict,
  "propostaId" bigint references propostas(id) on delete set null,
  titulo text,
  status text not null default 'Ativo',
  inicio date not null default current_date,
  fim date,
  meses integer not null default 12,
  valor_mensal numeric(14,2) not null default 0,
  valor_implantacao numeric(14,2) not null default 0,
  reajuste_indice text,                       -- INPC, IPCA, data-base…
  reajuste_mes integer,                       -- mês da data-base (1–12)
  renovacao_automatica boolean not null default true,
  aviso_previa_dias integer not null default 30,
  encerrado_em date,
  motivo text,
  obs text,
  owner text,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contratos_lead_idx on contratos ("leadId");

-- Reajustes e aditivos: um histórico só, distinguido por `tipo`.
create table contrato_reajustes (
  id bigint generated by default as identity primary key,
  "contratoId" bigint not null references contratos(id) on delete cascade,
  tipo text not null default 'Reajuste' check (tipo in ('Reajuste','Aditivo')),
  data date not null default current_date,
  percentual numeric(8,4) not null default 0,
  valor_anterior numeric(14,2) not null default 0,
  valor_novo numeric(14,2) not null default 0,
  indice text,
  descricao text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index contrato_reajustes_idx on contrato_reajustes ("contratoId");

create table metas (
  id bigint generated by default as identity primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  owner text,                                  -- nome, para o CRM sem convite
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  meta_valor numeric(14,2) not null default 0,
  meta_qtd integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, ano, mes)
);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ RELACIONAMENTO — timeline, notas e anexos                                │
-- └──────────────────────────────────────────────────────────────────────────┘

-- Histórico do que aconteceu. Alimentado por trigger (mudança de status/fase)
-- e pela aplicação (e-mail enviado, documento gerado, proposta aberta…).
create table timeline (
  id bigint generated by default as identity primary key,
  "refTipo" text not null check ("refTipo" in ('Lead','Oportunidade','Proposta','Contrato')),
  "refId" bigint not null,
  "leadId" bigint references leads(id) on delete cascade,
  tipo text not null,            -- criado, status, nota, email, documento, aceite…
  titulo text not null,
  detalhe text,
  dados jsonb,
  autor uuid references auth.users(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now()
);
create index timeline_ref_idx on timeline ("refTipo","refId");
create index timeline_lead_idx on timeline ("leadId");
create index timeline_data_idx on timeline (created_at desc);

create table notas (
  id bigint generated by default as identity primary key,
  "refTipo" text not null check ("refTipo" in ('Lead','Oportunidade','Proposta','Contrato')),
  "refId" bigint not null,
  "leadId" bigint references leads(id) on delete cascade,
  texto text not null,
  autor uuid references auth.users(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notas_ref_idx on notas ("refTipo","refId");

create table anexos (
  id bigint generated by default as identity primary key,
  "refTipo" text not null check ("refTipo" in ('Lead','Oportunidade','Proposta','Contrato')),
  "refId" bigint not null,
  "leadId" bigint references leads(id) on delete cascade,
  nome text not null,
  caminho text not null,          -- caminho dentro do bucket `anexos`
  mime text,
  tamanho bigint not null default 0,
  autor uuid references auth.users(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now()
);
create index anexos_ref_idx on anexos ("refTipo","refId");

-- Auditoria: quem mudou o quê, quando. Só o diff, para não virar um segundo
-- banco de dados.
create table auditoria (
  id bigint generated by default as identity primary key,
  tabela text not null,
  registro text not null,
  acao text not null check (acao in ('INSERT','UPDATE','DELETE')),
  campos jsonb,
  autor uuid,
  created_at timestamptz not null default now()
);
create index auditoria_reg_idx on auditoria (tabela, registro);
create index auditoria_data_idx on auditoria (created_at desc);

-- ============================================================================
-- TRIGGERS — updated_at, dono, auditoria e timeline
-- ============================================================================

create function tg_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Preenche dono e autor na inserção, e impede que um vendedor "doe" o registro
-- para outra pessoa sem ser gestor.
create function tg_dono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if to_jsonb(new) ? 'owner_id' then
      new.owner_id := coalesce(new.owner_id, auth.uid());
    end if;
  else
    new.created_by := old.created_by;
    if to_jsonb(new) ? 'owner_id' and new.owner_id is distinct from old.owner_id
       and not app_pode_gerir() then
      new.owner_id := old.owner_id;
    end if;
  end if;
  return new;
end $$;

create function tg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  antes jsonb;
  depois jsonb;
  diff jsonb := '{}'::jsonb;
  k text;
  pk text;
begin
  if tg_op = 'DELETE' then
    antes := to_jsonb(old);
    pk := coalesce(antes->>'id', antes->>'chave', '?');
    insert into auditoria (tabela, registro, acao, campos, autor)
      values (tg_table_name, pk, 'DELETE', antes, auth.uid());
    return old;
  end if;

  depois := to_jsonb(new);
  pk := coalesce(depois->>'id', depois->>'chave', '?');

  if tg_op = 'INSERT' then
    insert into auditoria (tabela, registro, acao, campos, autor)
      values (tg_table_name, pk, 'INSERT', depois, auth.uid());
    return new;
  end if;

  antes := to_jsonb(old);
  for k in select jsonb_object_keys(depois) loop
    if k not in ('updated_at') and (antes->k) is distinct from (depois->k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object(
        'de', antes->k, 'para', depois->k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into auditoria (tabela, registro, acao, campos, autor)
      values (tg_table_name, pk, 'UPDATE', diff, auth.uid());
  end if;
  return new;
end $$;

-- Timeline automática: criação e troca de status/fase viram evento.
create function tg_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ref text;
  lead_id bigint;
  quem text;
begin
  ref := case tg_table_name
           when 'leads' then 'Lead'
           when 'ops' then 'Oportunidade'
           when 'propostas' then 'Proposta'
           when 'contratos' then 'Contrato'
         end;
  if ref is null then return new; end if;

  lead_id := case tg_table_name when 'leads' then new.id
                                else (to_jsonb(new)->>'leadId')::bigint end;
  quem := coalesce((select nome from perfis where id = auth.uid()),
                   (select email from perfis where id = auth.uid()));

  if tg_op = 'INSERT' then
    insert into timeline ("refTipo","refId","leadId",tipo,titulo,autor,autor_nome)
      values (ref, new.id, lead_id, 'criado',
              -- to_jsonb(new)->>'titulo' e NÃO new.titulo: o Postgres resolve os
              -- campos do record ao PLANEJAR a expressão inteira, inclusive o
              -- ramo do case que não vai ser tomado. Como `leads` não tem a
              -- coluna `titulo`, a versão com new.titulo derrubava todo insert
              -- de lead com «record "new" has no field "titulo"» — e sem lead
              -- não existe proposta, contrato, nada. A forma via jsonb é
              -- resolvida em tempo de execução e serve para qualquer tabela.
              ref || ' criado' || coalesce(': ' || (to_jsonb(new)->>'titulo'), ''),
              auth.uid(), quem);
    return new;
  end if;

  if tg_table_name = 'ops' then
    if new.fase is distinct from old.fase then
      new.fase_desde := now();
      insert into timeline ("refTipo","refId","leadId",tipo,titulo,detalhe,dados,autor,autor_nome)
        values (ref, new.id, lead_id, 'fase', 'Fase: ' || old.fase || ' → ' || new.fase,
                new.motivo, jsonb_build_object('de', old.fase, 'para', new.fase),
                auth.uid(), quem);
    end if;
  elsif to_jsonb(new) ? 'status' and new.status is distinct from old.status then
    insert into timeline ("refTipo","refId","leadId",tipo,titulo,detalhe,dados,autor,autor_nome)
      values (ref, new.id, lead_id, 'status', 'Status: ' || old.status || ' → ' || new.status,
              null, jsonb_build_object('de', old.status, 'para', new.status),
              auth.uid(), quem);
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  -- updated_at em tudo que tem a coluna
  for t in select unnest(array[
    'perfis','configuracoes','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','materiais','leads','contatos','ops','propostas',
    'ativs','contratos','metas','notas'])
  loop
    execute format('create trigger tg_touch_%1$s before update on %1$I
                    for each row execute function tg_touch()', t);
  end loop;

  -- dono e autor
  for t in select unnest(array['leads','ops','propostas','ativs','contratos','contatos','metas'])
  loop
    execute format('create trigger tg_dono_%1$s before insert or update on %1$I
                    for each row execute function tg_dono()', t);
  end loop;

  -- auditoria
  for t in select unnest(array[
    'configuracoes','listas','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','materiais','leads','contatos','ops','propostas',
    'ativs','contratos','contrato_reajustes','metas','perfis'])
  loop
    execute format('create trigger tg_audit_%1$s after insert or update or delete on %1$I
                    for each row execute function tg_auditoria()', t);
  end loop;

  -- timeline
  for t in select unnest(array['leads','ops','propostas','contratos'])
  loop
    execute format('create trigger tg_tl_ins_%1$s after insert on %1$I
                    for each row execute function tg_timeline()', t);
    execute format('create trigger tg_tl_upd_%1$s before update on %1$I
                    for each row execute function tg_timeline()', t);
  end loop;
end $$;

-- ============================================================================
-- RLS — agora com papéis (P9.5 / 3.3)
--   catálogos  → todo autenticado lê; só admin/gestor escreve
--   comercial  → vendedor vê e edita o que é dele; gestor e admin, tudo
--   auditoria  → só admin lê; ninguém escreve pela API (é trigger)
-- ============================================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'perfis','configuracoes','listas','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','materiais','leads','contatos','ops','propostas',
    'proposta_documentos','ativs','contratos','contrato_reajustes','metas',
    'timeline','notas','anexos','auditoria'])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Catálogos: leitura para todos, escrita para quem gere.
do $$
declare t text;
begin
  for t in select unnest(array[
    'configuracoes','listas','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','materiais'])
  loop
    execute format($f$
      create policy "%1$s_ler" on %1$I for select to authenticated using (true);
      create policy "%1$s_inserir" on %1$I for insert to authenticated with check (app_pode_gerir());
      create policy "%1$s_editar" on %1$I for update to authenticated using (app_pode_gerir()) with check (app_pode_gerir());
      create policy "%1$s_apagar" on %1$I for delete to authenticated using (app_pode_gerir());
    $f$, t);
  end loop;
end $$;

-- Comercial com dono.
do $$
declare t text;
begin
  for t in select unnest(array['leads','ops','propostas','ativs','contratos','metas'])
  loop
    execute format($f$
      create policy "%1$s_ler" on %1$I for select to authenticated
        using (app_pode_gerir() or owner_id is null or owner_id = auth.uid());
      create policy "%1$s_inserir" on %1$I for insert to authenticated
        with check (app_pode_gerir() or owner_id is null or owner_id = auth.uid());
      create policy "%1$s_editar" on %1$I for update to authenticated
        using (app_pode_gerir() or owner_id is null or owner_id = auth.uid())
        with check (app_pode_gerir() or owner_id is null or owner_id = auth.uid());
      create policy "%1$s_apagar" on %1$I for delete to authenticated
        using (app_pode_gerir() or owner_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- Contatos seguem o lead. Se o usuário enxerga o lead, enxerga os contatos.
create policy "contatos_ler" on contatos for select to authenticated
  using (exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_inserir" on contatos for insert to authenticated
  with check (exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_editar" on contatos for update to authenticated
  using (exists (select 1 from leads l where l.id = contatos."leadId"))
  with check (exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_apagar" on contatos for delete to authenticated
  using (exists (select 1 from leads l where l.id = contatos."leadId"));

-- Filhos de contrato / proposta seguem o pai.
create policy "contrato_reajustes_tudo" on contrato_reajustes for all to authenticated
  using (exists (select 1 from contratos c where c.id = contrato_reajustes."contratoId"))
  with check (exists (select 1 from contratos c where c.id = contrato_reajustes."contratoId"));
create policy "proposta_documentos_tudo" on proposta_documentos for all to authenticated
  using (exists (select 1 from propostas p where p.id = proposta_documentos."propostaId"))
  with check (exists (select 1 from propostas p where p.id = proposta_documentos."propostaId"));

-- Timeline, notas e anexos: leitura para autenticado, escrita idem, edição só
-- do próprio autor (ou gestor).
do $$
declare t text;
begin
  for t in select unnest(array['timeline','notas','anexos'])
  loop
    execute format($f$
      create policy "%1$s_ler" on %1$I for select to authenticated using (true);
      create policy "%1$s_inserir" on %1$I for insert to authenticated with check (true);
      create policy "%1$s_editar" on %1$I for update to authenticated
        using (autor = auth.uid() or app_pode_gerir());
      create policy "%1$s_apagar" on %1$I for delete to authenticated
        using (autor = auth.uid() or app_pode_gerir());
    $f$, t);
  end loop;
end $$;

-- Perfis: cada um lê a lista (para escolher responsável); só admin muda papel.
create policy "perfis_ler" on perfis for select to authenticated using (true);
create policy "perfis_editar" on perfis for update to authenticated
  using (app_e_admin() or id = auth.uid())
  with check (app_e_admin() or id = auth.uid());
create policy "perfis_inserir" on perfis for insert to authenticated
  with check (app_e_admin());

-- Auditoria é só de leitura, e só para admin.
create policy "auditoria_ler" on auditoria for select to authenticated using (app_e_admin());

-- ============================================================================
-- STORAGE — buckets privados para documentos gerados e anexos
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('propostas','propostas',false), ('anexos','anexos',false)
  on conflict (id) do nothing;

drop policy if exists "storage_crm_ler" on storage.objects;
drop policy if exists "storage_crm_gravar" on storage.objects;
drop policy if exists "storage_crm_atualizar" on storage.objects;
drop policy if exists "storage_crm_apagar" on storage.objects;

create policy "storage_crm_ler" on storage.objects for select to authenticated
  using (bucket_id in ('propostas','anexos'));
create policy "storage_crm_gravar" on storage.objects for insert to authenticated
  with check (bucket_id in ('propostas','anexos'));
create policy "storage_crm_atualizar" on storage.objects for update to authenticated
  using (bucket_id in ('propostas','anexos'));
create policy "storage_crm_apagar" on storage.objects for delete to authenticated
  using (bucket_id in ('propostas','anexos') and app_pode_gerir());

-- ============================================================================
-- PARÂMETROS — edite pela tela "Configurações" do CRM, não pelo código.
-- ============================================================================
insert into configuracoes (chave,valor,descricao,grupo) values
 ('empresa_nome','','Razão social da emissora','empresa'),
 ('empresa_fantasia','','Nome fantasia','empresa'),
 ('empresa_cnpj','','CNPJ','empresa'),
 ('empresa_ie','','Inscrição estadual','empresa'),
 ('empresa_endereco','','Endereço','empresa'),
 ('empresa_cidade','','Cidade usada na data por extenso do PPT','empresa'),
 ('empresa_telefone','','Telefone comercial','empresa'),
 ('empresa_email','','E-mail comercial','empresa'),
 ('empresa_site','','Site','empresa'),
 ('empresa_missao','','Missão (vai para o PPT)','institucional'),
 ('empresa_visao','','Visão (vai para o PPT)','institucional'),
 ('empresa_valores','','Valores separados por ponto e vírgula (vai para o PPT)','institucional'),
 ('segmento','Facilities','Segmento único atendido pelo sistema','geral'),
 ('proposta_prefixo','PRP','Prefixo da numeração das propostas','proposta'),
 ('proposta_validade','30','Validade padrão em dias','proposta'),
 ('proposta_prazo','12','Prazo contratual padrão em meses','proposta'),
 ('proposta_encargos','72','Encargos sociais padrão (%)','proposta'),
 ('proposta_markup','18','Lucro de planilha padrão (%) — markup sobre o custo, usado só quando não há margem alvo','proposta'),
 ('proposta_imposto','14.33','Impostos padrão (%)','proposta'),
 ('proposta_desconto','0','Desconto comercial padrão (%)','proposta'),
 ('proposta_desconto_limite','5','Acima deste desconto (%) a proposta precisa de aprovação de um gestor','proposta'),
 ('proposta_margem_minima','8','Margem (%) abaixo da qual a proposta é sinalizada como crítica','proposta'),
 ('adicional_noturno','20','Adicional noturno (%) sobre a hora normal, aplicado só às horas entre 22h e 5h','calculo'),
 ('noturno_hora_inicio','22:00','Início da jornada noturna urbana','calculo'),
 ('noturno_hora_fim','05:00','Fim da jornada noturna urbana','calculo'),
 ('noturno_hora_reduzida','52.5','Minutos que valem uma hora noturna (hora ficta)','calculo'),
 ('salario_minimo','1518','Salário mínimo nacional — base padrão da insalubridade','calculo'),
 ('insalubridade_base','minimo','Base padrão da insalubridade: minimo, piso ou salario','calculo'),
 ('vt_desconto_pct','6','Teto do desconto de vale-transporte na folha do empregado (%)','calculo'),
 ('cobertura_ferias_pct','9.0909','Acréscimo de cobertura de férias no fator de funcionários (1/11)','calculo'),
 ('regime_tributario','presumido','Regime: presumido, real, simples (Anexo IV) ou cprb','calculo'),
 ('rat_nominal','3','RAT nominal (%) — CNAE de limpeza e vigilância é grau de risco 3','calculo'),
 ('fap','1','FAP da empresa (0,5 a 2,0). RAT efetivo = RAT × FAP','calculo'),
 ('turnover_pct','60','Turnover anual (%) — calibra a provisão de rescisão do Módulo 3','calculo'),
 ('aviso_indenizado_pct','35','% dos desligamentos com aviso prévio INDENIZADO','calculo'),
 ('absenteismo_pct','3.5','Absenteísmo real (%) usado no Módulo 4','calculo'),
 ('cobertura_modo','headcount','Onde a cobertura entra: headcount (fator da escala) OU modulo4. NUNCA os dois','calculo'),
 ('piso_jornada_reduzida_pct','60','% do piso pago em jornada abaixo de 4h (cláusula da CCT)','calculo'),
 ('custos_indiretos_pct','8','Custos indiretos (%) sobre o custo direto — Módulo 6','proposta'),
 ('modo_preco','privado','privado (com IRPJ/CSLL) ou licitacao (sem — vedação do TCU)','proposta'),
 ('iss_pct','2','ISS (%) — São Paulo: 2% para os itens 7.10, 11.02 e 17.05','proposta'),
 ('insumos_credito_pct','10','Insumos creditáveis (%) da receita — só vale no Lucro Real','proposta'),
 ('rbt12','0','Receita bruta dos últimos 12 meses — só para o Simples','proposta'),
 ('proposta_escopo_padrao','Prestação de serviços de facilities conforme especificações técnicas e comerciais descritas nesta proposta, com fornecimento de mão de obra qualificada, equipamentos, materiais e supervisão operacional.','Texto de escopo sugerido em propostas novas','proposta'),
 ('ppt_modelo','mizys_proposta.pptx','Arquivo em modelo_ppt/ usado na geração de PPT e PDF','documento'),
 ('ppt_slides_opcionais','equipamentos,missao','Slides que podem ser ligados/desligados por proposta','documento'),
 ('email_assunto','Proposta comercial {NUMERO} — {EMPRESA_FANTASIA}','Assunto padrão do e-mail de proposta','documento'),
 ('email_corpo','Olá, {CONTATO}.

Segue em anexo a proposta comercial {NUMERO} para {CLIENTE}, no valor mensal de {VALOR_MENSAL_TOTAL}.

A proposta é válida por {VALIDADE} dias. Ficamos à disposição para esclarecimentos.

Atenciosamente,
{EMPRESA_FANTASIA}
{EMPRESA_TELEFONE} · {EMPRESA_EMAIL}','Corpo padrão do e-mail (aceita os mesmos {CAMPOS} do PPT)','documento'),
 ('aceite_base_url','http://localhost:5050','URL pública do servidor, usada para montar o link de aceite','documento');

-- ============================================================================
-- LISTAS
-- ============================================================================
insert into listas (grupo,valor,rotulo,num,ordem) values
 ('lead_status','Novo','Novo',null,1),
 ('lead_status','Contatado','Contatado',null,2),
 ('lead_status','Qualificado','Qualificado',null,3),
 ('lead_status','Em negociação','Em negociação',null,4),
 ('lead_status','Desqualificado','Desqualificado',null,5),

 ('lead_origem','Site','Site',null,1),
 ('lead_origem','Indicação','Indicação',null,2),
 ('lead_origem','Feira','Feira',null,3),
 ('lead_origem','LinkedIn','LinkedIn',null,4),
 ('lead_origem','Telefone','Telefone',null,5),
 ('lead_origem','E-mail','E-mail',null,6),

 ('lead_motivo_perda','Sem fit','Sem fit com o serviço',null,1),
 ('lead_motivo_perda','Sem verba','Sem verba',null,2),
 ('lead_motivo_perda','Sem retorno','Não respondeu aos contatos',null,3),
 ('lead_motivo_perda','Concorrente','Fechou com concorrente',null,4),
 ('lead_motivo_perda','Duplicado','Cadastro duplicado',null,5),

 ('proposta_status','Rascunho','Rascunho',null,1),
 ('proposta_status','Enviada','Enviada',null,2),
 ('proposta_status','Em análise','Em análise',null,3),
 ('proposta_status','Aprovada','Aprovada',null,4),
 ('proposta_status','Recusada','Recusada',null,5),

 ('op_fase','Prospecção','Prospecção',15,1),
 ('op_fase','Qualificação','Qualificação',35,2),
 ('op_fase','Proposta','Proposta',60,3),
 ('op_fase','Negociação','Negociação',75,4),
 ('op_fase','Ganho','Ganho',100,5),
 ('op_fase','Perdido','Perdido',0,6),

 ('op_motivo_ganho','Preço','Melhor preço',null,1),
 ('op_motivo_ganho','Escopo','Escopo mais aderente',null,2),
 ('op_motivo_ganho','Relacionamento','Relacionamento / indicação',null,3),
 ('op_motivo_ganho','Prazo','Prazo de implantação',null,4),

 ('op_motivo_perda','Preço','Preço acima do concorrente',null,1),
 ('op_motivo_perda','Prazo','Prazo de implantação',null,2),
 ('op_motivo_perda','Escopo','Escopo não atendido',null,3),
 ('op_motivo_perda','Sem verba','Cliente sem verba',null,4),
 ('op_motivo_perda','Sem decisão','Decisão adiada',null,5),
 ('op_motivo_perda','Concorrente','Fechou com concorrente',null,6),

 -- A lista `owner` nasce vazia: os responsáveis são as pessoas da casa, e
 -- entram em Configurações > Listas quando o time estiver definido.

 ('ativ_tipo','Ligação','Ligação',null,1),
 ('ativ_tipo','Reunião','Reunião',null,2),
 ('ativ_tipo','E-mail','E-mail',null,3),
 ('ativ_tipo','Visita','Visita',null,4),

 ('ativ_recorrencia','nenhuma','Não repete',null,1),
 ('ativ_recorrencia','diaria','Diária',1,2),
 ('ativ_recorrencia','semanal','Semanal',7,3),
 ('ativ_recorrencia','quinzenal','Quinzenal',15,4),
 ('ativ_recorrencia','mensal','Mensal',30,5),

 ('beneficio_unid','mês','por mês',null,1),
 ('beneficio_unid','dia','por dia',null,2),

 ('beneficio_desconto','nenhum','Sem desconto do empregado',null,1),
 ('beneficio_desconto','pct_salario','% do salário (teto = valor do benefício)',null,2),
 ('beneficio_desconto','pct_valor','% do próprio benefício (coparticipação)',null,3),

 ('equipamento_tipo','Mensal','Mensal',null,1),
 ('equipamento_tipo','Único','Único (implantação)',null,2),

 ('escala_fator_modo','manual','Informado à mão',null,1),
 ('escala_fator_modo','calculado','Calculado pela cobertura',null,2),

 ('insalubridade_base','minimo','Salário mínimo nacional',null,1),
 ('insalubridade_base','piso','Piso da categoria',null,2),
 ('insalubridade_base','salario','Salário do cargo',null,3),

 ('contrato_status','Ativo','Ativo',null,1),
 ('contrato_status','Em implantação','Em implantação',null,2),
 ('contrato_status','Suspenso','Suspenso',null,3),
 ('contrato_status','Encerrado','Encerrado',null,4),

 -- Data-base primeiro de propósito: em contrato de mão de obra ela é a
 -- resposta certa, e o formulário sugere o primeiro item da lista. Índice de
 -- preços no aniversário do contrato atrasa o reajuste da folha meses por ano.
 ('contrato_indice','Data-base da CCT','Data-base da CCT',null,1),
 ('contrato_indice','INPC','INPC',null,2),
 ('contrato_indice','IPCA','IPCA',null,3),
 ('contrato_indice','IGP-M','IGP-M',null,4),

 ('papel','admin','Administrador',null,1),
 ('papel','gestor','Gestor comercial',null,2),
 ('papel','vendedor','Vendedor',null,3),

 ('uf','AC','AC',null,1),('uf','AL','AL',null,2),('uf','AP','AP',null,3),
 ('uf','AM','AM',null,4),('uf','BA','BA',null,5),('uf','CE','CE',null,6),
 ('uf','DF','DF',null,7),('uf','ES','ES',null,8),('uf','GO','GO',null,9),
 ('uf','MA','MA',null,10),('uf','MT','MT',null,11),('uf','MS','MS',null,12),
 ('uf','MG','MG',null,13),('uf','PA','PA',null,14),('uf','PB','PB',null,15),
 ('uf','PR','PR',null,16),('uf','PE','PE',null,17),('uf','PI','PI',null,18),
 ('uf','RJ','RJ',null,19),('uf','RN','RN',null,20),('uf','RS','RS',null,21),
 ('uf','RO','RO',null,22),('uf','RR','RR',null,23),('uf','SC','SC',null,24),
 ('uf','SP','SP',null,25),('uf','SE','SE',null,26),('uf','TO','TO',null,27);

-- ============================================================================
-- Dados iniciais de exemplo (Facilities). Apague este bloco para começar vazio.
-- ============================================================================

-- Convenções, cargos, salários, benefícios e encargos entram pela tela
-- Cadastros > Convenções. Nada de CCT de exemplo aqui: salário inventado é o
-- tipo de dado que sobrevive à demonstração e vai parar numa proposta de
-- verdade.


insert into escalas (id,nome,descricao,horas_semanais,fator_modo,fator_func,
                     dias_semana,horas_posto_dia,absenteismo_pct,cobertura_ferias) values
 (1,'44h Semanais','Segunda a sexta 8h48 ou 8h + sábado',44,'manual',1,6,0,0,false),
 (2,'12x36 Diurno','12 horas de trabalho por 36 de descanso',44,'calculado',2,7,12,4,true),
 (3,'12x36 Noturno','12 horas noturnas por 36 de descanso',44,'calculado',2,7,12,4,true),
 (4,'5x2 Comercial','Segunda a sexta em horário comercial',40,'manual',1,5,0,0,false),
 (5,'6x1 Diurno','Seis dias de trabalho por um de folga',44,'manual',1.2,6,0,0,false),
 (6,'Plantão 24h','Cobertura ininterrupta 24 horas',44,'calculado',4,7,24,4,true);
select setval(pg_get_serial_sequence('escalas','id'), 6);

insert into turnos (id,nome,hora_inicio,hora_fim,intervalo_min,noturno) values
 (1,'Diurno',   '07:00','19:00',60,false),
 (2,'Noturno',  '19:00','07:00',60,true),
 (3,'Comercial','08:00','17:00',60,false),
 (4,'Manhã',    '06:00','14:00',15,false),
 (5,'Tarde',    '14:00','22:00',15,false),
 (6,'Madrugada','22:00','06:00',15,true);
select setval(pg_get_serial_sequence('turnos','id'), 6);

-- O catálogo de equipamentos entra pela tela (Cadastros > Equipamentos):
-- enceradeira, aspirador, carrinho — com o preço que a empresa paga, não com o
-- de um exemplo.

-- Materiais já nascem preenchidos porque o PRAZO DE TROCA é o que quase
-- ninguém acerta de primeira, e ele é o que transforma compra anual em custo
-- mensal. Os valores são de referência do mercado de facilities em SP, 2026 —
-- troque pelos seus; os prazos costumam servir como estão.
insert into materiais (nome, categoria, unidade, valor, meses, base, obs) values
 ('Conjunto de uniforme',        'Uniforme', 'conj', 190.00,  6, 'funcionario',
  'Calça e camisa. A CCT do asseio em SP manda 2 conjuntos por ano.'),
 ('Calçado de segurança',        'EPI',      'par',   95.00, 12, 'funcionario',
  'CA obrigatório. Troca anual ou por desgaste.'),
 ('Kit de EPI (luva, óculos, máscara)', 'EPI', 'kit',  48.00,  3, 'funcionario',
  'Reposição trimestral. A luva nitrílica é o item que mais sai.'),
 ('Crachá e porta-crachá',       'Uniforme', 'un',     18.00, 12, 'funcionario', null),
 ('Exame admissional e periódico','Exames',  'un',    130.00, 12, 'funcionario',
  'ASO periódico anual. O admissional entra no primeiro mês e dilui no prazo.'),
 ('Material de limpeza — cota mensal', 'Material', 'cota', 320.00, 1, 'contrato',
  'Produto, pano, saco de lixo. Cota fechada por contrato, não por pessoa.'),
 ('Rádio comunicador',           'Equipagem','un',    240.00, 24, 'posto',
  'Um por posto, não por funcionário: o rádio fica no posto e troca de mão.'),
 ('Livro de ocorrência',         'Equipagem','un',     35.00,  6, 'posto', null);

-- ============================================================================
-- Pronto. O banco está de pé e vazio de movimento — nenhum lead, nenhuma
-- proposta, nenhum contrato inventado.
--
-- Próximos passos:
--   1. Project Settings > API: copie a URL e a chave `anon` para o .env
--   2. Authentication > Providers > Email: "Confirm email" desligado
--   3. Abra o CRM e crie a sua conta — a primeira vira admin
--   4. (opcional) rode `supabase/dados_exemplo.sql` para testar com dados
-- ============================================================================
