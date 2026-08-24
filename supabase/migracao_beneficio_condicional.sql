-- ============================================================================
-- Mizys CRM — BENEFÍCIO CONDICIONAL, e só a CCT do SIEMACO ativa
--
-- Rode uma vez no SQL Editor do Supabase. É idempotente.
--
-- ----------------------------------------------------------------------------
-- 1. O PROBLEMA: o auxílio-creche entrava em todo posto
-- ----------------------------------------------------------------------------
--
-- Posto novo nasce com TODOS os benefícios da convenção marcados, e a razão
-- está certa: benefício de CCT é obrigação, não escolha comercial — deixar o
-- usuário caçar um por um o que a lei já manda pagar produz proposta que não
-- cobre o próprio custo.
--
-- Só que nem todo benefício da convenção é devido a todo empregado. O
-- auxílio-creche da CLÁUSULA VIGÉSIMA (30% do salário mínimo, R$ 486,30) tem
-- três condições cumulativas:
--
--   - empresa com pelo menos 30 empregadas com mais de 16 anos;
--   - empresa sem creche própria ou conveniada;
--   - devido à empregada-MÃE, por filho de até 24 meses.
--
-- Entrando por cabeça, ele somava **R$ 705,25 por posto por mês** ao preço
-- final — 10,5% da proposta, R$ 8.463,00 num contrato de 12 meses. Foi o que
-- deixou o preço "alto demais" sem explicação visível na planilha.
--
-- A correção não é apagar o benefício: ele existe na convenção e é devido a
-- quem se enquadra. É marcá-lo como CONDICIONAL, para nascer desmarcado e ser
-- ligado por quem sabe que o posto se enquadra.
-- ============================================================================

alter table cct_beneficios
  add column if not exists condicional boolean not null default false;

comment on column cct_beneficios.condicional is
  'Benefício que a convenção prevê mas NÃO é devido a todo empregado '
  '(auxílio-creche, por exemplo). Nasce desmarcado no posto novo; quem monta '
  'liga quando o caso se enquadra.';

update cct_beneficios
   set condicional = true
 where lower(nome) like '%creche%';

-- ----------------------------------------------------------------------------
-- 2. Só a CCT do SIEMACO-SP fica ativa
-- ----------------------------------------------------------------------------
--
-- `ativo = false` esconde a convenção dos seletores SEM apagar nada: proposta
-- que já usa uma delas continua abrindo e calculando igual. Para voltar a
-- oferecer qualquer uma, é `set ativo = true`.
update ccts set ativo = (nome ilike '%SIEMACO%');

select nome, ativo from ccts order by ativo desc, nome;
select c.nome as cct, b.nome as beneficio, b.valor, b.condicional
  from cct_beneficios b join ccts c on c.id = b."cctId"
 where c.ativo order by b.condicional, b.nome;
