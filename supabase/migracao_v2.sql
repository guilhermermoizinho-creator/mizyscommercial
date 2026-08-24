-- ============================================================================
-- MIGRAÇÃO v1 → v2 — Mizys CRM
-- Rode em: Supabase > SQL Editor > New query > Run
--
-- É o mesmo conteúdo do schema.sql, mas SEM apagar nada: só adiciona colunas,
-- tabelas, funções, triggers e políticas. Rode neste banco se você já tem
-- dados. Se a base está vazia, use o schema.sql direto.
--
-- Pode ser rodado mais de uma vez sem estragar nada (tudo é if-not-exists ou
-- drop-and-create).
-- ============================================================================

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. PERFIS E PAPÉIS (item 3.3)                                            │
-- └──────────────────────────────────────────────────────────────────────────┘

create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  papel text not null default 'vendedor'
    check (papel in ('admin','gestor','vendedor')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Traz para `perfis` quem já existe no Auth. O primeiro da fila vira admin,
-- senão ninguém conseguiria promover ninguém depois.
insert into perfis (id, email, nome, papel)
select u.id, u.email, split_part(coalesce(u.email,''),'@',1),
       case when row_number() over (order by u.created_at) = 1 then 'admin' else 'vendedor' end
from auth.users u
where not exists (select 1 from perfis p where p.id = u.id);

create or replace function tg_perfil_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, email, nome, papel)
  values (new.id, new.email, split_part(coalesce(new.email,''),'@',1),
          case when (select count(*) from perfis) = 0 then 'admin' else 'vendedor' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function tg_perfil_novo_usuario();

create or replace function app_papel() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from perfis where id = auth.uid() and ativo), 'vendedor')
$$;
create or replace function app_pode_gerir() returns boolean
language sql stable security definer set search_path = public as $$
  select app_papel() in ('admin','gestor')
$$;
create or replace function app_e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select app_papel() = 'admin'
$$;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. COLUNAS NOVAS NAS TABELAS EXISTENTES                                  │
-- └──────────────────────────────────────────────────────────────────────────┘

-- updated_at, dono e autor em tudo (P9.5)
do $$
declare t text;
begin
  for t in select unnest(array[
    'configuracoes','ccts','cct_cargos','cct_beneficios','cct_encargos','escalas',
    'turnos','equipamentos','leads','contatos','ops','propostas','ativs'])
  loop
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
  end loop;
  for t in select unnest(array['leads','ops','propostas','ativs','contatos'])
  loop
    execute format('alter table %I add column if not exists created_by uuid references auth.users(id) on delete set null', t);
  end loop;
  for t in select unnest(array['leads','ops','propostas','ativs'])
  loop
    execute format('alter table %I add column if not exists owner_id uuid references auth.users(id) on delete set null', t);
  end loop;
end $$;

-- CCT: regras de cálculo (itens 2.2 e 2.1)
alter table ccts add column if not exists insalubridade_base text not null default 'minimo';
alter table ccts add column if not exists salario_minimo numeric(12,2) not null default 0;
alter table ccts add column if not exists piso_categoria numeric(12,2) not null default 0;
alter table ccts add column if not exists horas_mensais numeric(8,2) not null default 220;
do $$ begin
  alter table ccts add constraint ccts_insal_ck
    check (insalubridade_base in ('minimo','piso','salario'));
exception when duplicate_object then null; end $$;

-- Benefícios: desconto legal do empregado (item 2.4)
alter table cct_beneficios add column if not exists dias_mes numeric(6,2) not null default 22;
alter table cct_beneficios add column if not exists desconto_tipo text not null default 'nenhum';
alter table cct_beneficios add column if not exists desconto_pct numeric(6,3) not null default 0;
do $$ begin
  alter table cct_beneficios add constraint cct_benef_desc_ck
    check (desconto_tipo in ('nenhum','pct_salario','pct_valor'));
exception when duplicate_object then null; end $$;
-- Vale-transporte já cadastrado passa a descontar os 6% legais.
update cct_beneficios set desconto_tipo = 'pct_salario', desconto_pct = 6
  where desconto_tipo = 'nenhum' and lower(nome) like '%transporte%';

-- Escalas: fator de cobertura calculado (item 2.3)
alter table escalas add column if not exists fator_modo text not null default 'manual';
alter table escalas add column if not exists dias_semana numeric(4,2) not null default 7;
alter table escalas add column if not exists horas_posto_dia numeric(6,2) not null default 0;
alter table escalas add column if not exists absenteismo_pct numeric(6,3) not null default 0;
alter table escalas add column if not exists cobertura_ferias boolean not null default false;
do $$ begin
  alter table escalas add constraint escalas_modo_ck check (fator_modo in ('manual','calculado'));
exception when duplicate_object then null; end $$;

-- Propostas: congelamento, versão, aprovação, aceite, documento (P3, 4.4, 4.5, 4.8)
alter table propostas add column if not exists snapshot jsonb;
alter table propostas add column if not exists congelada_em timestamptz;
alter table propostas add column if not exists versao integer not null default 1;
alter table propostas add column if not exists "propostaPaiId" bigint references propostas(id) on delete set null;
alter table propostas add column if not exists aprovacao_status text not null default 'nao_requer';
alter table propostas add column if not exists aprovacao_por uuid references auth.users(id) on delete set null;
alter table propostas add column if not exists aprovacao_em timestamptz;
alter table propostas add column if not exists aprovacao_obs text;
alter table propostas add column if not exists aceite_token text;
alter table propostas add column if not exists aceite_em timestamptz;
alter table propostas add column if not exists aceite_nome text;
alter table propostas add column if not exists aceite_ip text;
alter table propostas add column if not exists aberturas integer not null default 0;
alter table propostas add column if not exists aberta_em timestamptz;
alter table propostas add column if not exists modelo_ppt text;
alter table propostas add column if not exists slides jsonb not null default '{}';
alter table propostas add column if not exists motivo text;
alter table propostas add column if not exists motivo_obs text;
-- `owner` é o NOME do responsável (para relatório); `owner_id` é o usuário do
-- Auth (para a RLS). Nem todo vendedor do relatório tem login no sistema.
alter table propostas add column if not exists owner text;
do $$ begin
  alter table propostas add constraint propostas_aprov_ck
    check (aprovacao_status in ('nao_requer','pendente','aprovado','recusado'));
exception when duplicate_object then null; end $$;
create unique index if not exists propostas_aceite_token_uniq on propostas (aceite_token)
  where aceite_token is not null;

-- Lead órfão: excluir um lead deixava propostas apontando para o nada (P9.4).
-- Agora o banco recusa a exclusão enquanto houver proposta ligada.
do $$ begin
  alter table propostas drop constraint if exists "propostas_leadId_fkey";
  alter table propostas add constraint "propostas_leadId_fkey"
    foreign key ("leadId") references leads(id) on delete restrict;
exception when others then null; end $$;

-- Leads e oportunidades: motivo de desfecho (item 3.5)
alter table leads add column if not exists motivo text;
alter table leads add column if not exists motivo_obs text;
alter table ops add column if not exists motivo text;
alter table ops add column if not exists motivo_obs text;
alter table ops add column if not exists fechada_em date;
alter table ops add column if not exists fase_desde timestamptz not null default now();

-- Atividades: recorrência e alvo real (P9.6)
alter table ativs add column if not exists obs text;
alter table ativs add column if not exists feito_em timestamptz;
alter table ativs add column if not exists recorrencia text not null default 'nenhuma';
alter table ativs add column if not exists lembrete_dias integer not null default 0;
update ativs set "refTipo" = 'Lead' where "refTipo" is null or "refTipo" = '';
do $$ begin
  alter table ativs add constraint ativs_rec_ck
    check (recorrencia in ('nenhuma','diaria','semanal','quinzenal','mensal'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table ativs add constraint ativs_ref_ck
    check ("refTipo" in ('Lead','Oportunidade','Proposta','Contrato'));
exception when duplicate_object then null; end $$;

-- Deduplicação de leads pelo CNPJ (item 3.7). Se a base já tiver duplicados o
-- índice falha — o erro diz qual CNPJ está repetido; resolva e rode de novo.
create unique index if not exists leads_cnpj_uniq
  on leads (regexp_replace(coalesce(cnpj,''), '[^0-9]', '', 'g'))
  where regexp_replace(coalesce(cnpj,''), '[^0-9]', '', 'g') <> '';
create index if not exists leads_empresa_idx on leads (lower(empresa));

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. NUMERAÇÃO SEM CORRIDA (item 1.4 / P5)                                 │
-- └──────────────────────────────────────────────────────────────────────────┘

create sequence if not exists proposta_numero_seq;

create or replace function proximo_numero_proposta(prefixo text default 'PRP', ano integer default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  a integer := coalesce(ano, extract(year from current_date)::integer);
  n bigint;
begin
  n := nextval('proposta_numero_seq');
  return prefixo || '-' || a::text || '-' || lpad(n::text, 4, '0');
end $$;

-- Alinha a sequence com o maior número já usado, para não repetir.
select setval('proposta_numero_seq',
  greatest(coalesce((select max((regexp_match(numero, '(\d+)$'))[1]::bigint)
                     from propostas where numero ~ '\d+$'), 0), 1));

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. TABELAS NOVAS                                                         │
-- └──────────────────────────────────────────────────────────────────────────┘

create table if not exists proposta_documentos (
  id bigint generated by default as identity primary key,
  "propostaId" bigint not null references propostas(id) on delete cascade,
  formato text not null check (formato in ('pptx','pdf')),
  versao integer not null default 1,
  caminho text not null,
  tamanho bigint not null default 0,
  enviado_para text,
  enviado_em timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists proposta_documentos_prop_idx on proposta_documentos ("propostaId");

create table if not exists contratos (
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
  reajuste_indice text,
  reajuste_mes integer,
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
create index if not exists contratos_lead_idx on contratos ("leadId");

create table if not exists contrato_reajustes (
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
create index if not exists contrato_reajustes_idx on contrato_reajustes ("contratoId");

create table if not exists metas (
  id bigint generated by default as identity primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  owner text,
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  meta_valor numeric(14,2) not null default 0,
  meta_qtd integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, ano, mes)
);

create table if not exists timeline (
  id bigint generated by default as identity primary key,
  "refTipo" text not null check ("refTipo" in ('Lead','Oportunidade','Proposta','Contrato')),
  "refId" bigint not null,
  "leadId" bigint references leads(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  detalhe text,
  dados jsonb,
  autor uuid references auth.users(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now()
);
create index if not exists timeline_ref_idx on timeline ("refTipo","refId");
create index if not exists timeline_lead_idx on timeline ("leadId");

create table if not exists notas (
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
create index if not exists notas_ref_idx on notas ("refTipo","refId");

create table if not exists anexos (
  id bigint generated by default as identity primary key,
  "refTipo" text not null check ("refTipo" in ('Lead','Oportunidade','Proposta','Contrato')),
  "refId" bigint not null,
  "leadId" bigint references leads(id) on delete cascade,
  nome text not null,
  caminho text not null,
  mime text,
  tamanho bigint not null default 0,
  autor uuid references auth.users(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now()
);
create index if not exists anexos_ref_idx on anexos ("refTipo","refId");

create table if not exists auditoria (
  id bigint generated by default as identity primary key,
  tabela text not null,
  registro text not null,
  acao text not null check (acao in ('INSERT','UPDATE','DELETE')),
  campos jsonb,
  autor uuid,
  created_at timestamptz not null default now()
);
create index if not exists auditoria_reg_idx on auditoria (tabela, registro);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 5. TRIGGERS                                                              │
-- └──────────────────────────────────────────────────────────────────────────┘

create or replace function tg_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function tg_dono() returns trigger
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

create or replace function tg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare antes jsonb; depois jsonb; diff jsonb := '{}'::jsonb; k text; pk text;
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
      diff := diff || jsonb_build_object(k, jsonb_build_object('de', antes->k, 'para', depois->k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into auditoria (tabela, registro, acao, campos, autor)
      values (tg_table_name, pk, 'UPDATE', diff, auth.uid());
  end if;
  return new;
end $$;

create or replace function tg_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare ref text; lead_id bigint; quem text;
begin
  ref := case tg_table_name when 'leads' then 'Lead' when 'ops' then 'Oportunidade'
           when 'propostas' then 'Proposta' when 'contratos' then 'Contrato' end;
  if ref is null then return new; end if;
  lead_id := case tg_table_name when 'leads' then new.id
                                else (to_jsonb(new)->>'leadId')::bigint end;
  quem := coalesce((select nome from perfis where id = auth.uid()),
                   (select email from perfis where id = auth.uid()));
  if tg_op = 'INSERT' then
    insert into timeline ("refTipo","refId","leadId",tipo,titulo,autor,autor_nome)
      values (ref, new.id, lead_id, 'criado',
              -- via jsonb, e não new.titulo: o Postgres resolve os campos do
              -- record ao planejar a expressão inteira, inclusive o ramo não
              -- tomado do case. Como `leads` não tem `titulo`, a forma direta
              -- derrubava todo insert de lead.
              ref || ' criado' || coalesce(': ' || (to_jsonb(new)->>'titulo'), ''),
              auth.uid(), quem);
    return new;
  end if;
  if tg_table_name = 'ops' then
    if new.fase is distinct from old.fase then
      new.fase_desde := now();
      insert into timeline ("refTipo","refId","leadId",tipo,titulo,detalhe,dados,autor,autor_nome)
        values (ref, new.id, lead_id, 'fase', 'Fase: ' || old.fase || ' → ' || new.fase,
                new.motivo, jsonb_build_object('de', old.fase, 'para', new.fase), auth.uid(), quem);
    end if;
  elsif to_jsonb(new) ? 'status' and new.status is distinct from old.status then
    insert into timeline ("refTipo","refId","leadId",tipo,titulo,detalhe,dados,autor,autor_nome)
      values (ref, new.id, lead_id, 'status', 'Status: ' || old.status || ' → ' || new.status,
              null, jsonb_build_object('de', old.status, 'para', new.status), auth.uid(), quem);
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'perfis','configuracoes','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','leads','contatos','ops','propostas',
    'ativs','contratos','metas','notas'])
  loop
    execute format('drop trigger if exists tg_touch_%1$s on %1$I', t);
    execute format('create trigger tg_touch_%1$s before update on %1$I
                    for each row execute function tg_touch()', t);
  end loop;

  for t in select unnest(array['leads','ops','propostas','ativs','contratos','contatos','metas'])
  loop
    execute format('drop trigger if exists tg_dono_%1$s on %1$I', t);
    execute format('create trigger tg_dono_%1$s before insert or update on %1$I
                    for each row execute function tg_dono()', t);
  end loop;

  for t in select unnest(array[
    'configuracoes','listas','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','leads','contatos','ops','propostas',
    'ativs','contratos','contrato_reajustes','metas','perfis'])
  loop
    execute format('drop trigger if exists tg_audit_%1$s on %1$I', t);
    execute format('create trigger tg_audit_%1$s after insert or update or delete on %1$I
                    for each row execute function tg_auditoria()', t);
  end loop;

  for t in select unnest(array['leads','ops','propostas','contratos'])
  loop
    execute format('drop trigger if exists tg_tl_ins_%1$s on %1$I', t);
    execute format('drop trigger if exists tg_tl_upd_%1$s on %1$I', t);
    execute format('create trigger tg_tl_ins_%1$s after insert on %1$I
                    for each row execute function tg_timeline()', t);
    execute format('create trigger tg_tl_upd_%1$s before update on %1$I
                    for each row execute function tg_timeline()', t);
  end loop;
end $$;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 6. RLS COM PAPÉIS — substitui a política "todo mundo faz tudo"           │
-- └──────────────────────────────────────────────────────────────────────────┘

do $$
declare t text;
begin
  for t in select unnest(array[
    'perfis','configuracoes','listas','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','leads','contatos','ops','propostas',
    'proposta_documentos','ativs','contratos','contrato_reajustes','metas',
    'timeline','notas','anexos','auditoria'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all_%1$s" on %1$I', t);
    execute format('drop policy if exists "%1$s_ler" on %1$I', t);
    execute format('drop policy if exists "%1$s_inserir" on %1$I', t);
    execute format('drop policy if exists "%1$s_editar" on %1$I', t);
    execute format('drop policy if exists "%1$s_apagar" on %1$I', t);
    execute format('drop policy if exists "%1$s_tudo" on %1$I', t);
  end loop;

  for t in select unnest(array[
    'configuracoes','listas','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos'])
  loop
    execute format($f$
      create policy "%1$s_ler" on %1$I for select to authenticated using (true);
      create policy "%1$s_inserir" on %1$I for insert to authenticated with check (app_pode_gerir());
      create policy "%1$s_editar" on %1$I for update to authenticated using (app_pode_gerir()) with check (app_pode_gerir());
      create policy "%1$s_apagar" on %1$I for delete to authenticated using (app_pode_gerir());
    $f$, t);
  end loop;

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

create policy "contatos_ler" on contatos for select to authenticated
  using (exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_inserir" on contatos for insert to authenticated
  with check (exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_editar" on contatos for update to authenticated
  using (exists (select 1 from leads l where l.id = contatos."leadId"))
  with check (exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_apagar" on contatos for delete to authenticated
  using (exists (select 1 from leads l where l.id = contatos."leadId"));

create policy "contrato_reajustes_tudo" on contrato_reajustes for all to authenticated
  using (exists (select 1 from contratos c where c.id = contrato_reajustes."contratoId"))
  with check (exists (select 1 from contratos c where c.id = contrato_reajustes."contratoId"));
create policy "proposta_documentos_tudo" on proposta_documentos for all to authenticated
  using (exists (select 1 from propostas p where p.id = proposta_documentos."propostaId"))
  with check (exists (select 1 from propostas p where p.id = proposta_documentos."propostaId"));

create policy "perfis_ler" on perfis for select to authenticated using (true);
create policy "perfis_editar" on perfis for update to authenticated
  using (app_e_admin() or id = auth.uid()) with check (app_e_admin() or id = auth.uid());
create policy "perfis_inserir" on perfis for insert to authenticated with check (app_e_admin());
create policy "auditoria_ler" on auditoria for select to authenticated using (app_e_admin());

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 7. STORAGE                                                               │
-- └──────────────────────────────────────────────────────────────────────────┘

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

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 8. PARÂMETROS E LISTAS NOVOS                                             │
-- └──────────────────────────────────────────────────────────────────────────┘

insert into configuracoes (chave,valor,descricao,grupo) values
 ('proposta_desconto_limite','5','Acima deste desconto (%) a proposta precisa de aprovação de um gestor','proposta'),
 ('proposta_margem_minima','8','Margem (%) abaixo da qual a proposta é sinalizada como crítica','proposta'),
 ('noturno_hora_inicio','22:00','Início da jornada noturna urbana','calculo'),
 ('noturno_hora_fim','05:00','Fim da jornada noturna urbana','calculo'),
 ('noturno_hora_reduzida','52.5','Minutos que valem uma hora noturna (hora ficta)','calculo'),
 ('salario_minimo','1518','Salário mínimo nacional — base padrão da insalubridade','calculo'),
 ('insalubridade_base','minimo','Base padrão da insalubridade: minimo, piso ou salario','calculo'),
 ('vt_desconto_pct','6','Teto do desconto de vale-transporte na folha do empregado (%)','calculo'),
 ('cobertura_ferias_pct','9.0909','Acréscimo de cobertura de férias no fator de funcionários (1/11)','calculo'),
 ('ppt_slides_opcionais','equipamentos,missao','Slides que podem ser ligados/desligados por proposta','documento'),
 ('email_assunto','Proposta comercial {NUMERO} — {EMPRESA_FANTASIA}','Assunto padrão do e-mail de proposta','documento'),
 ('email_corpo','Olá, {CONTATO}.

Segue em anexo a proposta comercial {NUMERO} para {CLIENTE}, no valor mensal de {VALOR_MENSAL_TOTAL}.

A proposta é válida por {VALIDADE} dias. Ficamos à disposição para esclarecimentos.

Atenciosamente,
{EMPRESA_FANTASIA}
{EMPRESA_TELEFONE} · {EMPRESA_EMAIL}','Corpo padrão do e-mail (aceita os mesmos {CAMPOS} do PPT)','documento'),
 ('aceite_base_url','http://localhost:5050','URL pública do servidor, usada para montar o link de aceite','documento')
on conflict (chave) do nothing;

insert into listas (grupo,valor,rotulo,num,ordem) values
 ('lead_motivo_perda','Sem fit','Sem fit com o serviço',null,1),
 ('lead_motivo_perda','Sem verba','Sem verba',null,2),
 ('lead_motivo_perda','Sem retorno','Não respondeu aos contatos',null,3),
 ('lead_motivo_perda','Concorrente','Fechou com concorrente',null,4),
 ('lead_motivo_perda','Duplicado','Cadastro duplicado',null,5),
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
 ('ativ_recorrencia','nenhuma','Não repete',null,1),
 ('ativ_recorrencia','diaria','Diária',1,2),
 ('ativ_recorrencia','semanal','Semanal',7,3),
 ('ativ_recorrencia','quinzenal','Quinzenal',15,4),
 ('ativ_recorrencia','mensal','Mensal',30,5),
 ('beneficio_desconto','nenhum','Sem desconto do empregado',null,1),
 ('beneficio_desconto','pct_salario','% do salário (teto = valor do benefício)',null,2),
 ('beneficio_desconto','pct_valor','% do próprio benefício (coparticipação)',null,3),
 ('escala_fator_modo','manual','Informado à mão',null,1),
 ('escala_fator_modo','calculado','Calculado pela cobertura',null,2),
 ('insalubridade_base','minimo','Salário mínimo nacional',null,1),
 ('insalubridade_base','piso','Piso da categoria',null,2),
 ('insalubridade_base','salario','Salário do cargo',null,3),
 ('contrato_status','Ativo','Ativo',null,1),
 ('contrato_status','Em implantação','Em implantação',null,2),
 ('contrato_status','Suspenso','Suspenso',null,3),
 ('contrato_status','Encerrado','Encerrado',null,4),
 ('contrato_indice','INPC','INPC',null,1),
 ('contrato_indice','IPCA','IPCA',null,2),
 ('contrato_indice','IGP-M','IGP-M',null,3),
 ('contrato_indice','Data-base','Data-base da categoria',null,4),
 ('papel','admin','Administrador',null,1),
 ('papel','gestor','Gestor comercial',null,2),
 ('papel','vendedor','Vendedor',null,3)
on conflict (grupo, valor) do nothing;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 9. CONGELAMENTO RETROATIVO                                               │
-- └──────────────────────────────────────────────────────────────────────────┘
-- As propostas que JÁ saíram de Rascunho estão hoje acompanhando a CCT viva:
-- o próximo reajuste mudaria o valor delas. Congelar agora prende o valor de
-- hoje — que é o mais próximo do que o cliente recebeu. Se preferir revisar
-- uma a uma pela tela, comente este bloco.
--
-- Aqui só marcamos quais precisam: o snapshot em si é montado pelo servidor
-- (POST /api/propostas/<id>/congelar), que é quem tem o motor de cálculo.
select numero, status, emissao
  from propostas
 where snapshot is null and status <> 'Rascunho'
 order by id;
