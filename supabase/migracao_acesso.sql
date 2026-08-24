-- ============================================================================
-- Mizys CRM — LIBERAÇÃO DE ACESSO
--
-- Rode uma vez no SQL Editor do Supabase. É idempotente.
--
-- Hoje qualquer pessoa que chegue na tela de login cria uma conta e entra como
-- vendedor. Isso foi desenhado para instalação local, onde só quem está na rede
-- da empresa alcança a tela. Com o CRM num endereço público, virou porta aberta.
--
-- Depois desta migração, conta nova nasce PENDENTE: entra na lista de espera e
-- não enxerga UMA LINHA do sistema até um admin liberar em
-- Configurações → Usuários.
--
-- ----------------------------------------------------------------------------
-- DOIS FUROS QUE ESTA MIGRAÇÃO FECHA
-- ----------------------------------------------------------------------------
--
-- 1. O `ativo` de perfis não fazia nada.
--
--        select coalesce((select papel from perfis
--                         where id = auth.uid() and ativo), 'vendedor')
--
--    Desativar alguém fazia a subconsulta não devolver linha; o coalesce então
--    entregava 'vendedor'. Ou seja: o usuário "desativado" continuava com
--    acesso de vendedor a tudo. O botão existia e não protegia nada.
--
-- 2. Qualquer usuário podia se promover a admin.
--
--        create policy "perfis_editar" ... using (app_e_admin() or id = auth.uid())
--
--    A intenção era deixar a pessoa corrigir o próprio nome. Só que a policy
--    libera a LINHA inteira, e `papel` é uma coluna dela: um UPDATE em
--    perfis set papel='admin' where id = auth.uid() passava. RLS não filtra
--    coluna — quem faz isso aqui é o gatilho criado no fim deste arquivo.
-- ============================================================================

-- ── 1. o papel 'pendente' ───────────────────────────────────────────────────
alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check
  check (papel in ('admin','gestor','vendedor','pendente'));

-- Quando a pessoa pediu acesso, para a fila de espera mostrar a espera.
alter table perfis add column if not exists solicitado_em timestamptz default now();
-- Quem liberou e quando — para a auditoria responder "quem deixou entrar".
alter table perfis add column if not exists liberado_em timestamptz;
alter table perfis add column if not exists liberado_por uuid references auth.users(id) on delete set null;

-- ── 2. o papel de quem não foi liberado é 'pendente', não 'vendedor' ────────
create or replace function app_papel() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from perfis where id = auth.uid() and ativo), 'pendente')
$$;

create or replace function app_liberado() returns boolean
language sql stable security definer set search_path = public as $$
  select app_papel() <> 'pendente'
$$;

create or replace function app_pode_gerir() returns boolean
language sql stable security definer set search_path = public as $$
  select app_papel() in ('admin','gestor')
$$;

create or replace function app_e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select app_papel() = 'admin'
$$;

-- ── 3. conta nova nasce pendente (a primeira, não: alguém tem que liberar) ──
create or replace function tg_perfil_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, email, nome, papel, ativo, solicitado_em)
  values (
    new.id, new.email, split_part(coalesce(new.email,''), '@', 1),
    case when (select count(*) from perfis) = 0 then 'admin' else 'pendente' end,
    true, now()
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ── 4. ninguém muda o próprio papel ─────────────────────────────────────────
-- RLS libera a linha inteira e não sabe filtrar coluna. Este gatilho é o que
-- impede um vendedor de rodar `update perfis set papel='admin' where id = eu`.
create or replace function tg_perfil_protege_papel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if app_e_admin() then
    return new;                                   -- admin muda o que quiser
  end if;
  if new.papel is distinct from old.papel
     or new.ativo is distinct from old.ativo
     or new.liberado_em is distinct from old.liberado_em
     or new.liberado_por is distinct from old.liberado_por then
    raise exception 'Só um administrador pode mudar papel ou liberar acesso.';
  end if;
  return new;
end $$;

drop trigger if exists tg_perfil_papel on perfis;
create trigger tg_perfil_papel before update on perfis
  for each row execute function tg_perfil_protege_papel();

-- ── 5. as policies, agora com a tranca ──────────────────────────────────────
-- Toda policy passa a exigir `app_liberado()`. Sem isso, um pendente ainda
-- enxergaria as tabelas de convenção, cargos e salários — que são justamente
-- o que não pode vazar.
do $$
declare t text; p text;
begin
  for t in select unnest(array[
    'configuracoes','listas','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','materiais','leads','contatos','ops','propostas',
    'proposta_documentos','ativs','contratos','contrato_reajustes','metas',
    'timeline','notas','anexos'])
  loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on %I', p, t);
    end loop;
  end loop;
end $$;

-- Catálogos: liberado lê; só admin/gestor escreve.
do $$
declare t text;
begin
  for t in select unnest(array[
    'configuracoes','listas','ccts','cct_cargos','cct_beneficios','cct_encargos',
    'escalas','turnos','equipamentos','materiais'])
  loop
    execute format($f$
      create policy "%1$s_ler" on %1$I for select to authenticated
        using (app_liberado());
      create policy "%1$s_inserir" on %1$I for insert to authenticated
        with check (app_pode_gerir());
      create policy "%1$s_editar" on %1$I for update to authenticated
        using (app_pode_gerir()) with check (app_pode_gerir());
      create policy "%1$s_apagar" on %1$I for delete to authenticated
        using (app_pode_gerir());
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
        using (app_liberado() and (app_pode_gerir() or owner_id is null or owner_id = auth.uid()));
      create policy "%1$s_inserir" on %1$I for insert to authenticated
        with check (app_liberado() and (app_pode_gerir() or owner_id is null or owner_id = auth.uid()));
      create policy "%1$s_editar" on %1$I for update to authenticated
        using (app_liberado() and (app_pode_gerir() or owner_id is null or owner_id = auth.uid()))
        with check (app_liberado() and (app_pode_gerir() or owner_id is null or owner_id = auth.uid()));
      create policy "%1$s_apagar" on %1$I for delete to authenticated
        using (app_liberado() and (app_pode_gerir() or owner_id = auth.uid()));
    $f$, t);
  end loop;
end $$;

-- Contatos seguem o lead.
create policy "contatos_ler" on contatos for select to authenticated
  using (app_liberado() and exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_inserir" on contatos for insert to authenticated
  with check (app_liberado() and exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_editar" on contatos for update to authenticated
  using (app_liberado() and exists (select 1 from leads l where l.id = contatos."leadId"))
  with check (app_liberado() and exists (select 1 from leads l where l.id = contatos."leadId"));
create policy "contatos_apagar" on contatos for delete to authenticated
  using (app_liberado() and exists (select 1 from leads l where l.id = contatos."leadId"));

-- Filhos de contrato / proposta seguem o pai.
create policy "contrato_reajustes_tudo" on contrato_reajustes for all to authenticated
  using (app_liberado() and exists (select 1 from contratos c where c.id = contrato_reajustes."contratoId"))
  with check (app_liberado() and exists (select 1 from contratos c where c.id = contrato_reajustes."contratoId"));
create policy "proposta_documentos_tudo" on proposta_documentos for all to authenticated
  using (app_liberado() and exists (select 1 from propostas p where p.id = proposta_documentos."propostaId"))
  with check (app_liberado() and exists (select 1 from propostas p where p.id = proposta_documentos."propostaId"));

-- Timeline, notas e anexos.
do $$
declare t text;
begin
  for t in select unnest(array['timeline','notas','anexos'])
  loop
    execute format($f$
      create policy "%1$s_ler" on %1$I for select to authenticated using (app_liberado());
      create policy "%1$s_inserir" on %1$I for insert to authenticated with check (app_liberado());
      create policy "%1$s_editar" on %1$I for update to authenticated
        using (app_liberado() and (autor = auth.uid() or app_pode_gerir()));
      create policy "%1$s_apagar" on %1$I for delete to authenticated
        using (app_liberado() and (autor = auth.uid() or app_pode_gerir()));
    $f$, t);
  end loop;
end $$;

-- ── 6. perfis: o pendente enxerga só a própria linha ────────────────────────
-- É o mínimo para a tela dizer "aguardando liberação" em vez de dar erro seco.
drop policy if exists "perfis_ler" on perfis;
drop policy if exists "perfis_editar" on perfis;
drop policy if exists "perfis_inserir" on perfis;

create policy "perfis_ler" on perfis for select to authenticated
  using (app_liberado() or id = auth.uid());
create policy "perfis_editar" on perfis for update to authenticated
  using (app_e_admin() or id = auth.uid())
  with check (app_e_admin() or id = auth.uid());
create policy "perfis_inserir" on perfis for insert to authenticated
  with check (app_e_admin());

-- ── 7. quem já usa o sistema não pode ser trancado do lado de fora ─────────
-- Perfis existentes ficam como estão. Só quem estiver com papel nulo ou fora
-- da lista vira pendente.
update perfis set papel = 'pendente'
 where papel is null or papel not in ('admin','gestor','vendedor','pendente');

-- ── conferência ─────────────────────────────────────────────────────────────
select papel, count(*) as quantos from perfis group by papel order by papel;
