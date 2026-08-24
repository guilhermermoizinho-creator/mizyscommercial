-- ============================================================================
-- MIGRAÇÃO — campos de precificação na convenção e na proposta
--
-- Onde rodar:  Supabase > SQL Editor > New query > cole tudo > Run
-- Atalho:      https://supabase.com/dashboard/project/idhtqlaasdkhllcsiukz/sql/new
--
-- Não apaga nada e pode ser rodada mais de uma vez: tudo é `if not exists`.
--
-- POR QUE ESTES CAMPOS
-- O motor de cálculo (calculo.py e calculo.js) já lê todos eles. Enquanto não
-- existirem, ele usa o valor global de `configuracoes` — o que funciona, mas
-- obriga a mudar a configuração inteira para orçar uma proposta com regime,
-- FAP ou turnover diferentes. Com as colunas, cada proposta guarda o seu.
--
-- Todas nascem NULAS de propósito: nulo significa "usa o padrão global". Só
-- quando alguém preenche é que a proposta passa a mandar.
-- ============================================================================

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CONVENÇÃO — o que a CCT precisa guardar para precificar                  │
-- └──────────────────────────────────────────────────────────────────────────┘

-- Reajuste. É o campo que mais vale dinheiro no contrato longo: mão de obra se
-- repactua pela DATA-BASE da convenção (1º de janeiro no asseio e na
-- vigilância), não pelo IPCA no aniversário do contrato. Um contrato reajustado
-- fora da data-base perde de 4 a 8 meses de reajuste de folha por ano.
alter table ccts add column if not exists data_base date;
alter table ccts add column if not exists reajuste_pct numeric(8,4) not null default 0;
comment on column ccts.data_base is
  'Data-base da categoria. A repactuação do contrato se amarra nela, nunca no aniversário.';
comment on column ccts.reajuste_pct is
  'Percentual do reajuste da vigência atual (asseio 2026/2027: 7%; vigilância: 5,75%).';

-- Cláusula do adicional noturno na escala 12x36. A CCT do asseio SP 2026/2027
-- AFASTA o adicional sobre as horas posteriores às 05h nessa escala, derrogando
-- a Súmula 60, II do TST. Se a cláusula cair na próxima convenção, o custo do
-- posto noturno sobe — e é preciso saber por proposta qual regra valia.
alter table ccts add column if not exists noturno_12x36_prorrogado boolean not null default false;
comment on column ccts.noturno_12x36_prorrogado is
  'true = paga adicional também depois das 05h no 12x36 (Súmula 60 II do TST). '
  'false = a convenção afasta, como faz a do asseio SP 2026/2027.';

-- Intervalo intrajornada. Posto unipessoal sem substituto indeniza o período
-- com adicional (art. 71 §4º da CLT).
alter table ccts add column if not exists intervalo_min integer not null default 30;
alter table ccts add column if not exists intervalo_adicional_pct numeric(8,4) not null default 50;

-- Contribuições e benefícios que são custo da EMPRESA e costumam ficar de fora
-- da planilha — e que, somados, dão dezenas de reais por posto por mês.
alter table ccts add column if not exists crts_pct numeric(8,4) not null default 0;
alter table ccts add column if not exists auxilio_creche_pct numeric(8,4) not null default 0;
alter table ccts add column if not exists cesta_teto_salario numeric(12,2) not null default 0;
comment on column ccts.crts_pct is
  'CRTS ao sindicato patronal, em % sobre a base do FGTS (SEAC-SP: 0,40%).';
comment on column ccts.auxilio_creche_pct is
  'Auxílio-creche em % do salário mínimo, quando a convenção obriga.';
comment on column ccts.cesta_teto_salario is
  'Salário acima do qual a cesta não é devida. Zero = sempre devida.';

-- Jornada reduzida: a CCT do asseio paga 60% do piso abaixo de 4h e piso
-- integral na jornada de 6h.
alter table ccts add column if not exists piso_jornada_reduzida_pct numeric(8,4) not null default 60;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PROPOSTA — os parâmetros de precificação, por proposta                   │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Nulo = usa o padrão de `configuracoes`. É assim que params_preco() lê.

alter table propostas add column if not exists regime text
  check (regime is null or regime in ('presumido','real','simples','cprb'));
alter table propostas add column if not exists rat numeric(8,4);
alter table propostas add column if not exists fap numeric(8,4);
alter table propostas add column if not exists turnover numeric(8,4);
alter table propostas add column if not exists absenteismo numeric(8,4);
alter table propostas add column if not exists ci_pct numeric(8,4);
alter table propostas add column if not exists iss numeric(8,4);
alter table propostas add column if not exists credito_pct numeric(8,4);
alter table propostas add column if not exists rbt12 numeric(14,2);
alter table propostas add column if not exists modo_preco text
  check (modo_preco is null or modo_preco in ('privado','licitacao'));
alter table propostas add column if not exists cobertura_modo text
  check (cobertura_modo is null or cobertura_modo in ('headcount','modulo4'));

comment on column propostas.regime is
  'Regime tributário desta proposta. Nulo = o global de configuracoes.';
comment on column propostas.modo_preco is
  'privado = IRPJ e CSLL entram no T. licitacao = ficam fora (vedação do TCU, '
  'Acórdão 950/2007-Plenário).';
comment on column propostas.cobertura_modo is
  'headcount = a cobertura está no fator da escala. modulo4 = está no Módulo 4. '
  'NUNCA nos dois: contar duas vezes infla o preço em ~13%.';

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ Congelamento                                                             │
-- └──────────────────────────────────────────────────────────────────────────┘
-- O snapshot da proposta congelada guarda a convenção como ela era. Como os
-- campos novos vivem dentro do JSON de `snapshot`, nada precisa mudar aqui —
-- mas propostas congeladas ANTES desta migração não terão os campos novos no
-- snapshot, e o motor cai no padrão global para elas. É o comportamento certo:
-- não se inventa retroativamente uma cláusula que não foi registrada.
