-- ============================================================================
-- Mizys CRM — MODELO DE PROPOSTA "FACILITIES E SEGURANÇA"
--
-- Rode uma vez no SQL Editor do Supabase. É idempotente.
--
-- O modelo de PPT passou a ser o deck de facilities e segurança
-- (`modelo_ppt/proposta_facilities.pptx`, gerado por
-- `modelo_ppt/preparar_modelo.py`). Ele pede da empresa cinco informações que
-- o modelo antigo não usava — ano de fundação, tamanho da equipe, número de
-- clientes, certificações e WhatsApp — e todas aparecem no slide "Quem somos"
-- e na carta de apresentação.
--
-- Enquanto estiverem em branco, o slide imprime "—" no lugar. Não quebra nada,
-- mas "Desde —, atuamos..." é uma frase que o cliente lê.
--
-- A tela de Configurações monta os campos a partir DESTA tabela: chave que não
-- existe aqui não aparece lá para ser preenchida. É por isso que a migração
-- precede o uso do modelo, e não o contrário.
-- ============================================================================

insert into configuracoes (chave, valor, descricao, grupo) values
  ('empresa_ano', '', 'Ano de fundação — slide "Quem somos"', 'empresa'),
  ('empresa_colaboradores', '', 'Quantidade de colaboradores — slide "Quem somos"', 'empresa'),
  ('empresa_clientes', '', 'Quantidade de clientes atendidos — slide "Quem somos"', 'empresa'),
  ('empresa_certificacoes', '', 'Certificações e filiações, separadas por vírgula', 'empresa'),
  ('empresa_whatsapp', '', 'WhatsApp comercial (vazio: usa o telefone)', 'empresa'),
  ('empresa_missao', '', 'Missão (vazio: usa a redação padrão do modelo)', 'empresa'),
  ('empresa_visao', '', 'Visão (vazio: usa a redação padrão do modelo)', 'empresa'),
  ('empresa_valores', '', 'Valores, separados por ponto e vírgula', 'empresa'),
  ('vendedor_cargo', 'Consultor comercial',
   'Cargo impresso abaixo do responsável, na carta de apresentação', 'empresa')
on conflict (chave) do update
  set descricao = excluded.descricao,
      grupo = excluded.grupo;

-- O modelo em uso. Trocar de volta para 'mizys_proposta.pptx' devolve o antigo:
-- os dois convivem na pasta e usam o mesmo motor.
update configuracoes
   set valor = 'proposta_facilities.pptx'
 where chave = 'ppt_modelo';

-- Quais slides a tela deixa ligar e desligar por proposta. Os nomes vêm das
-- anotações "SLIDE:<nome>" do modelo — quem manda é o arquivo, não esta linha:
-- nome que não existe no modelo simplesmente não faz nada.
--
-- `gente` está na lista porque nasce DESLIGADO: é o único slide que o CRM não
-- preenche sozinho (quer a foto de cada colaborador). Quem montar as fotos no
-- modelo liga por aqui.
update configuracoes
   set valor = 'sobre,gente,missao,servicos,diferencial,tecnologia,equipamentos,beneficios,resumo'
 where chave = 'ppt_slides_opcionais';

select chave, valor from configuracoes
 where grupo = 'empresa' or chave like 'ppt_%'
 order by grupo, chave;
