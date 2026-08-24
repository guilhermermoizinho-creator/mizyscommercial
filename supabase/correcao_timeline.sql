-- ============================================================================
-- CORREÇÃO — gatilho da linha do tempo (tg_timeline)
--
-- Onde rodar:  Supabase > SQL Editor > New query > cole tudo > Run
-- Atalho:      https://supabase.com/dashboard/project/idhtqlaasdkhllcsiukz/sql/new
--
-- Não apaga nada: só substitui a função. Depois de rodar, criar lead volta a
-- funcionar na hora — não precisa reiniciar o servidor nem sair do sistema.
--
-- O QUE ESTAVA ERRADO
-- A função montava o título do evento com `new.titulo` dentro de um CASE
-- guardado por `to_jsonb(new) ? 'titulo'`. O guarda roda em tempo de execução,
-- mas o Postgres resolve os campos do record ao PLANEJAR a expressão inteira —
-- inclusive o ramo que não seria tomado. Como `leads` não tem coluna `titulo`,
-- todo insert de lead morria com:
--
--     record "new" has no field "titulo"
--
-- A correção lê o campo via jsonb, que é resolvido em tempo de execução e
-- serve para qualquer uma das quatro tabelas com linha do tempo.
-- ============================================================================

create or replace function tg_timeline() returns trigger
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
              -- via jsonb, e não new.titulo: é esta linha que corrige o erro
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
