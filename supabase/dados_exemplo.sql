-- ============================================================================
-- MIZYS CRM — dados de exemplo (opcional)
-- Rode em: Supabase > SQL Editor > New query > Run
--
-- Só depois do `schema.sql`, e só se você quiser a base povoada para conhecer
-- o sistema: cinco leads, seis contatos, cinco oportunidades, duas propostas
-- (uma delas montada posto a posto), cinco atividades e metas do mês.
--
-- É tudo inventado. Numa base de trabalho de verdade, não rode este arquivo —
-- ou apague estas linhas depois, pela própria tela do CRM.
--
-- Ele conta com a base de cálculo que o schema.sql já criou (convenção 1,
-- escalas 1/2/4, turnos 1/3, equipamentos 1..10): as propostas de exemplo
-- referenciam esses ids.
-- ============================================================================

insert into leads (id,empresa,cnpj,endereco,cidade,uf,site,
  contato_nome,contato_cargo,contato_email,contato_telefone,contato_telefone2,
  origem,status,valor,owner,obs,criado) values
 (1,'Cond. Four Seasons','12.345.678/0001-90','Av. das Nações Unidas, 1200','São Paulo','SP','fourseasons.com.br',
  'Ricardo Alves','Síndico','ricardo@fourseasons.com.br','(11) 98811-2233','(11) 3555-1200',
  'Indicação','Qualificado',18500,'Guilherme M.','Duas torres, 320 unidades.','2026-07-04'),
 (2,'Edifício Aurora','23.456.789/0001-01','Rua Oratório, 455','Santo André','SP','edaurora.com.br',
  'Marcos Dias','Síndico','marcos@edaurora.com.br','(11) 99633-1180','(11) 4432-8800',
  'Site','Em negociação',24000,'Marina S.','Contrato anual de facilities.','2026-06-28'),
 (3,'Grupo Vertax','34.567.890/0001-12','Rod. dos Imigrantes, km 18','Diadema','SP','vertax.ind.br',
  'Fernanda Lima','Dir. Operações','fernanda@vertax.ind.br','(11) 97544-6620',null,
  'LinkedIn','Contatado',42000,'Guilherme M.','Planta industrial com 3 turnos.','2026-07-11'),
 (4,'Shopping Praça Sul','45.678.901/0001-23','Av. Kennedy, 900','São Bernardo','SP','pracasul.com.br',
  'Eduardo Castro','Gerente de Facilities','eduardo@pracasul.com.br','(11) 98455-3390','(11) 4123-7700',
  'Feira','Novo',28000,'Rafael T.','Piloto em uma ala.','2026-07-21'),
 (5,'Centro Log. Anchieta','56.789.012/0001-34','Rod. Anchieta, km 23','São Bernardo','SP','loganchieta.com.br',
  'Beatriz Fonseca','Coord. Administrativa','bia@loganchieta.com.br','(11) 95544-2277',null,
  'Site','Novo',15400,'Guilherme M.',null,'2026-07-23');
select setval(pg_get_serial_sequence('leads','id'), 5);

insert into contatos (id,"leadId",nome,cargo,email,telefone,principal) values
 (1,1,'Ricardo Alves','Síndico','ricardo@fourseasons.com.br','(11) 98811-2233',true),
 (2,1,'Patrícia Nunes','Gerente Predial','patricia@fourseasons.com.br','(11) 98722-4411',false),
 (3,2,'Marcos Dias','Síndico','marcos@edaurora.com.br','(11) 99633-1180',true),
 (4,3,'Fernanda Lima','Dir. Operações','fernanda@vertax.ind.br','(11) 97544-6620',true),
 (5,4,'Eduardo Castro','Gerente de Facilities','eduardo@pracasul.com.br','(11) 98455-3390',true),
 (6,5,'Beatriz Fonseca','Coord. Administrativa','bia@loganchieta.com.br','(11) 95544-2277',true);
select setval(pg_get_serial_sequence('contatos','id'), 6);

insert into ops (id,titulo,"leadId",valor,fase,prob,fecha,owner) values
 (1,'Facilities — 2 torres',1,18500,'Proposta',60,'2026-08-14','Guilherme M.'),
 (2,'Facilities — contrato anual',2,24000,'Negociação',75,'2026-08-05','Marina S.'),
 (3,'Limpeza industrial — 3 turnos',3,42000,'Qualificação',35,'2026-09-10','Guilherme M.'),
 (4,'Facilities — piloto',4,9600,'Prospecção',15,'2026-09-25','Rafael T.'),
 (5,'Conservação e portaria',5,15400,'Prospecção',15,'2026-09-30','Guilherme M.');
select setval(pg_get_serial_sequence('ops','id'), 5);

insert into propostas (id,numero,"leadId","contatoId","opId","cctId",titulo,status,emissao,
  validade,prazo,encargos,markup,imposto,desconto,itens,equipamentos,escopo,obs) values
 (1,'PRP-2026-0001',1,1,1,1,'Facilities — 2 torres','Enviada','2026-07-15',30,12,
  72,18,14.33,0,
  '[{"cargoId":1,"escalaId":1,"turnoId":1,"qtd":4,"adicionais":[],"a20":20,"beneficios":[1,2,3],"obs":""},
    {"cargoId":4,"escalaId":2,"turnoId":1,"qtd":2,"adicionais":["P30"],"a20":20,"beneficios":[1,2],"obs":""},
    {"cargoId":9,"escalaId":4,"turnoId":3,"qtd":1,"adicionais":["A20"],"a20":20,"beneficios":[1,2,4],"obs":""}]',
  '[{"id":1,"qtd":7},{"id":2,"qtd":7},{"id":3,"qtd":2},{"id":9,"qtd":1},{"id":10,"qtd":1}]',
  'Serviços de limpeza, conservação, portaria e supervisão operacional nas duas torres, com fornecimento de mão de obra treinada e uniformizada, equipamentos e materiais.',
  'Valores válidos para o escopo descrito. Reajuste anual pela data-base da categoria.'),
 (2,'PRP-2026-0002',2,3,2,1,'Facilities — contrato anual','Rascunho','2026-07-20',15,12,
  72,20,14.33,2,
  '[{"cargoId":3,"escalaId":1,"turnoId":3,"qtd":1,"adicionais":[],"a20":20,"beneficios":[1,2,4],"obs":""},
    {"cargoId":1,"escalaId":1,"turnoId":1,"qtd":2,"adicionais":["I20"],"a20":20,"beneficios":[1,2],"obs":""}]',
  '[{"id":1,"qtd":3},{"id":2,"qtd":3},{"id":3,"qtd":1}]',
  'Serviços de zeladoria e limpeza de áreas comuns, com fornecimento de mão de obra treinada, uniformizada e supervisão periódica.',
  'Materiais de limpeza não inclusos, salvo negociação em aditivo.');
select setval(pg_get_serial_sequence('propostas','id'), 2);
-- A sequence da numeração começa depois das propostas de exemplo.
select setval('proposta_numero_seq', 2);

insert into ativs (id,tipo,titulo,"refTipo","refId",data,hora,owner,feito) values
 (1,'Ligação','Follow-up da proposta','Oportunidade',1,'2026-07-28','09:30','Guilherme M.',false),
 (2,'Reunião','Apresentação técnica','Oportunidade',3,'2026-07-29','14:00','Guilherme M.',false),
 (3,'E-mail','Enviar minuta inicial','Oportunidade',2,'2026-07-27','11:00','Marina S.',false),
 (4,'Visita','Vistoria no local','Lead',4,'2026-07-30','10:00','Rafael T.',false),
 (5,'Ligação','Qualificar lead','Lead',5,'2026-07-24','16:00','Guilherme M.',true);
select setval(pg_get_serial_sequence('ativs','id'), 5);

insert into metas (owner,ano,mes,meta_valor,meta_qtd) values
 ('Guilherme M.',2026,7,60000,3),
 ('Marina S.',2026,7,40000,2),
 ('Rafael T.',2026,7,30000,2);
