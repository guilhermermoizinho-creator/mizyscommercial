/* ════════════════════════════════════════════════════════════════════════════
   FORMULÁRIOS
   Nenhum handler é montado por interpolação de string: tudo passa pelo
   despachante de data-acao (ver util.js). Um cargo chamado "Zelador d'água"
   não quebra mais nada.
   ════════════════════════════════════════════════════════════════════════════ */

acoes({

/* ── convenção coletiva ── */
formCCT(d){
  const c = d.id ? DB.get('ccts', d.id) : {nome:'', sindicato:'', vigencia_inicio:'',
    vigencia_fim:'', uf:OPC('uf')[0] || 'SP', cidade:'', obs:'', ativo:true,
    insalubridade_base:CFG('insalubridade_base','minimo'),
    salario_minimo:CFGN('salario_minimo', 1518), piso_categoria:0, horas_mensais:220,
    data_base:'', reajuste_pct:0, noturno_12x36_prorrogado:false,
    intervalo_min:30, intervalo_adicional_pct:50, crts_pct:0,
    auxilio_creche_pct:0, cesta_teto_salario:0, piso_jornada_reduzida_pct:60};
  modal(d.id ? 'Editar convenção' : 'Nova convenção coletiva', `<div class="fgrid">
   ${fld('k_nome','Nome da convenção *', c.nome, 'text', true)}
   ${fld('k_sind','Sindicato', c.sindicato, 'text', true)}
   ${fld('k_ini','Início da vigência', c.vigencia_inicio, 'date')}
   ${fld('k_fim','Fim da vigência', c.vigencia_fim, 'date')}
   ${fld('k_cid','Cidade', c.cidade)}
   ${selLista('k_uf','UF','uf', c.uf)}
   <div class="f full"><label style="color:var(--text);font-weight:700;margin-top:6px">Regras de cálculo desta convenção</label></div>
   ${selLista('k_insal','Base da insalubridade','insalubridade_base', c.insalubridade_base)}
   ${fld('k_min','Salário mínimo vigente (R$)', c.salario_minimo, 'number')}
   ${fld('k_piso','Piso da categoria (R$)', c.piso_categoria, 'number')}
   ${fld('k_horas','Divisor de horas mensais', c.horas_mensais || 220, 'number')}
   ${nota('A insalubridade quase sempre incide sobre o salário mínimo, não sobre o salário do cargo — e é isso que a maioria dos sistemas erra. O divisor de horas (220 para jornada de 44h) é o que transforma salário em salário-hora para o adicional noturno.')}

   <div class="f full"><label style="color:var(--text);font-weight:700;margin-top:6px">Reajuste</label></div>
   ${fld('k_dbase','Data-base da categoria', c.data_base, 'date')}
   ${fld('k_reaj','Reajuste da vigência (%)', c.reajuste_pct, 'number')}
   ${nota('Contrato de mão de obra se repactua pela DATA-BASE da convenção — 1º de janeiro no asseio e na vigilância. Amarrar o reajuste ao IPCA no aniversário do contrato custa de 4 a 8 meses de reajuste de folha por ano; em cinco anos, é a margem inteira.')}

   <div class="f full"><label style="color:var(--text);font-weight:700;margin-top:6px">Cláusulas que mexem no custo do posto</label></div>
   ${chk('k_not1236','Paga adicional noturno depois das 05h na escala 12x36', c.noturno_12x36_prorrogado)}
   ${nota('Marcado = vale a Súmula 60, II do TST (jornada integralmente noturna e prorrogada). Desmarcado = a convenção afasta, como faz a do asseio de SP 2026/2027. A diferença passa de R$ 400/mês no preço de um posto noturno — confirme a cláusula antes de fechar.')}
   ${fld('k_intmin','Intervalo no 12x36 (minutos)', c.intervalo_min, 'number')}
   ${fld('k_intadd','Adicional se não concedido (%)', c.intervalo_adicional_pct, 'number')}
   ${fld('k_crts','CRTS ao sindicato patronal (% do FGTS)', c.crts_pct, 'number')}
   ${fld('k_creche','Auxílio-creche (% do salário mínimo)', c.auxilio_creche_pct, 'number')}
   ${fld('k_cestateto','Cesta não devida acima do salário de (R$)', c.cesta_teto_salario, 'number')}
   ${fld('k_pisored','Piso em jornada abaixo de 4h (% do piso)', c.piso_jornada_reduzida_pct, 'number')}

   ${txa('k_obs','Observações', c.obs)}
   ${chk('k_ativo','Convenção ativa', c.ativo)}</div>`, acoesModal('saveCCT', d.id), 'wide');
},
async saveCCT(d){
  if(!valid(['k_nome'])) return;
  const o = {nome:$('#k_nome').value.trim(), sindicato:$('#k_sind').value.trim(),
   vigencia_inicio:$('#k_ini').value || null, vigencia_fim:$('#k_fim').value || null,
   cidade:$('#k_cid').value.trim(), uf:$('#k_uf').value, obs:$('#k_obs').value.trim(),
   ativo:$('#k_ativo').checked, insalubridade_base:$('#k_insal').value,
   salario_minimo:+$('#k_min').value || 0, piso_categoria:+$('#k_piso').value || 0,
   horas_mensais:+$('#k_horas').value || 220,
   data_base:$('#k_dbase').value || null, reajuste_pct:+$('#k_reaj').value || 0,
   noturno_12x36_prorrogado:$('#k_not1236').checked,
   intervalo_min:+$('#k_intmin').value || 0,
   intervalo_adicional_pct:+$('#k_intadd').value || 0,
   crts_pct:+$('#k_crts').value || 0,
   auxilio_creche_pct:+$('#k_creche').value || 0,
   cesta_teto_salario:+$('#k_cestateto').value || 0,
   piso_jornada_reduzida_pct:+$('#k_pisored').value || 60};
  try{ d.id ? await DB.upd('ccts', d.id, o) : await DB.add('ccts', o); }catch(e){ return; }
  closeModal(); toast('Convenção salva'); render();
},

formCargo(d){
  const c = d.id ? DB.get('cct_cargos', d.id) : {nome:'', salario:'', cbo:'', obs:''};
  modal(d.id ? 'Editar cargo' : 'Novo cargo', `<div class="fgrid">
   ${fld('g_nome','Nome do cargo *', c.nome, 'text', true)}
   ${fld('g_sal','Salário base da convenção (R$) *', c.salario, 'number')}
   ${fld('g_cbo','Código CBO', c.cbo)}
   ${txa('g_obs','Observação', c.obs)}</div>`,
   `<button class="btn" data-acao="fecharModal">Cancelar</button>
    <button class="btn btn-primary" data-acao="saveCargo" data-id="${esc(d.id ?? '')}"
     data-cct="${esc(d.cct ?? '')}">Salvar</button>`);
},
async saveCargo(d){
  if(!valid(['g_nome','g_sal'])) return;
  const antigo = d.id ? DB.get('cct_cargos', d.id) : null;
  const o = {nome:$('#g_nome').value.trim(), salario:+$('#g_sal').value,
   cbo:$('#g_cbo').value.trim(), obs:$('#g_obs').value.trim(),
   cctId:antigo ? antigo.cctId : +(d.cct || state.id)};
  try{ d.id ? await DB.upd('cct_cargos', d.id, o) : await DB.add('cct_cargos', o); }catch(e){ return; }
  closeModal(); toast('Cargo salvo'); render();
},

formBenef(d){
  const b = d.id ? DB.get('cct_beneficios', d.id) : {nome:'', valor:'',
    unid:OPC('beneficio_unid')[0] || 'mês', dias_mes:22, desconto_tipo:'nenhum', desconto_pct:0};
  modal(d.id ? 'Editar benefício' : 'Novo benefício', `<div class="fgrid">
   ${fld('b_nome','Nome *', b.nome, 'text', true)}
   ${fld('b_val','Valor (R$) *', b.valor, 'number')}
   ${selLista('b_un','Periodicidade','beneficio_unid', b.unid)}
   ${fld('b_dias','Dias por mês (quando for por dia)', b.dias_mes ?? 22, 'number')}
   ${selLista('b_dtipo','Desconto do empregado','beneficio_desconto', b.desconto_tipo)}
   ${fld('b_dpct','Percentual do desconto (%)', b.desconto_pct ?? 0, 'number')}
   ${nota('Vale-transporte: escolha "% do salário" com 6 — o desconto legal é de até 6% do salário, limitado ao valor do vale. Vale-refeição com coparticipação: "% do próprio benefício". O que a proposta cobra é o custo líquido da empresa.')}
   </div>`,
   `<button class="btn" data-acao="fecharModal">Cancelar</button>
    <button class="btn btn-primary" data-acao="saveBenef" data-id="${esc(d.id ?? '')}"
     data-cct="${esc(d.cct ?? '')}">Salvar</button>`, 'wide');
},
async saveBenef(d){
  if(!valid(['b_nome','b_val'])) return;
  const antigo = d.id ? DB.get('cct_beneficios', d.id) : null;
  const o = {nome:$('#b_nome').value.trim(), valor:+$('#b_val').value, unid:$('#b_un').value,
   dias_mes:+$('#b_dias').value || 22, desconto_tipo:$('#b_dtipo').value,
   desconto_pct:+$('#b_dpct').value || 0,
   cctId:antigo ? antigo.cctId : +(d.cct || state.id)};
  try{ d.id ? await DB.upd('cct_beneficios', d.id, o) : await DB.add('cct_beneficios', o); }catch(e){ return; }
  closeModal(); toast('Benefício salvo'); render();
},

formEncargo(d){
  const e = d.id ? DB.get('cct_encargos', d.id) : {nome:'', percentual:''};
  modal(d.id ? 'Editar encargo' : 'Novo encargo', `<div class="fgrid">
   ${fld('n_nome','Nome do encargo *', e.nome, 'text', true)}
   ${fld('n_pct','Percentual (%) *', e.percentual, 'number')}</div>`,
   `<button class="btn" data-acao="fecharModal">Cancelar</button>
    <button class="btn btn-primary" data-acao="saveEncargo" data-id="${esc(d.id ?? '')}"
     data-cct="${esc(d.cct ?? '')}">Salvar</button>`);
},
async saveEncargo(d){
  if(!valid(['n_nome','n_pct'])) return;
  const antigo = d.id ? DB.get('cct_encargos', d.id) : null;
  const o = {nome:$('#n_nome').value.trim(), percentual:+$('#n_pct').value,
   cctId:antigo ? antigo.cctId : +(d.cct || state.id)};
  try{ d.id ? await DB.upd('cct_encargos', d.id, o) : await DB.add('cct_encargos', o); }catch(e){ return; }
  closeModal(); toast('Encargo salvo'); render();
},

/* ── escalas e turnos ── */
formEscala(d){
  const e = d.id ? DB.get('escalas', d.id) : {nome:'', descricao:'', horas_semanais:44,
    fator_modo:'manual', fator_func:1, dias_semana:7, horas_posto_dia:0,
    absenteismo_pct:0, cobertura_ferias:false, ativo:true};
  modal(d.id ? 'Editar escala' : 'Nova escala', `<div class="fgrid">
   ${fld('s_nome','Nome da escala *', e.nome, 'text', true)}
   ${fld('s_desc','Descrição', e.descricao, 'text', true)}
   ${fld('s_horas','Jornada contratual (horas/semana) *', e.horas_semanais, 'number')}
   ${selLista('s_modo','Como calcular os funcionários por posto','escala_fator_modo', e.fator_modo)}
   ${fld('s_fator','Funcionários por posto (modo manual)', e.fator_func, 'number')}
   ${fld('s_hdia','Horas de cobertura do posto por dia', e.horas_posto_dia, 'number')}
   ${fld('s_dias','Dias por semana em que o posto opera', e.dias_semana, 'number')}
   ${fld('s_abs','Absenteísmo previsto (%)', e.absenteismo_pct, 'number')}
   ${chk('s_ferias','Somar cobertura de férias (1/11 ≈ 9,09%)', e.cobertura_ferias)}
   ${nota('No modo calculado: horas de cobertura por semana ÷ jornada contratual, acrescido de absenteísmo e cobertura de férias. Um 12x36 com posto aberto 12h nos 7 dias e jornada de 44h dá ~2,17 funcionários por posto — a conta antiga assumia 2,0 e subdimensionava a equipe.')}
   ${chk('s_ativo','Escala ativa', e.ativo)}</div>`, acoesModal('saveEscala', d.id), 'wide');
},
async saveEscala(d){
  if(!valid(['s_nome','s_horas'])) return;
  const o = {nome:$('#s_nome').value.trim(), descricao:$('#s_desc').value.trim(),
   horas_semanais:+$('#s_horas').value || 44, fator_modo:$('#s_modo').value,
   fator_func:+$('#s_fator').value || 1, horas_posto_dia:+$('#s_hdia').value || 0,
   dias_semana:+$('#s_dias').value || 7, absenteismo_pct:+$('#s_abs').value || 0,
   cobertura_ferias:$('#s_ferias').checked, ativo:$('#s_ativo').checked};
  try{ d.id ? await DB.upd('escalas', d.id, o) : await DB.add('escalas', o); }catch(e){ return; }
  closeModal(); toast('Escala salva'); render();
},

formTurno(d){
  const t = d.id ? DB.get('turnos', d.id) : {nome:'', hora_inicio:'07:00',
    hora_fim:'19:00', intervalo_min:60, noturno:false, ativo:true};
  modal(d.id ? 'Editar turno' : 'Novo turno', `<div class="fgrid">
   ${fld('u_nome','Nome do turno *', t.nome, 'text', true)}
   ${fld('u_ini','Hora de início *', t.hora_inicio, 'time')}
   ${fld('u_fim','Hora de término *', t.hora_fim, 'time')}
   ${fld('u_int','Intervalo (minutos)', t.intervalo_min, 'number')}
   ${chk('u_not','Marcar como turno noturno', t.noturno)}
   ${nota('A marcação é informativa. O adicional é calculado pelas horas reais entre ' + esc(CFG('noturno_hora_inicio','22:00')) + ' e ' + esc(CFG('noturno_hora_fim','05:00')) + ', com hora reduzida de ' + esc(CFG('noturno_hora_reduzida','52.5')) + ' minutos: um turno 19h–7h paga sobre 7 horas, não sobre as 11.')}
   ${chk('u_ativo','Turno ativo', t.ativo)}</div>`, acoesModal('saveTurno', d.id), 'wide');
},
async saveTurno(d){
  if(!valid(['u_nome','u_ini','u_fim'])) return;
  const o = {nome:$('#u_nome').value.trim(), hora_inicio:$('#u_ini').value,
   hora_fim:$('#u_fim').value, intervalo_min:+$('#u_int').value || 0,
   noturno:$('#u_not').checked, ativo:$('#u_ativo').checked};
  try{ d.id ? await DB.upd('turnos', d.id, o) : await DB.add('turnos', o); }catch(e){ return; }
  closeModal(); toast('Turno salvo'); render();
},

formEquipCad(d){
  const e = d.id ? DB.get('equipamentos', d.id) : {nome:'', marca_modelo:'', valor:'',
    tipo:OPC('equipamento_tipo')[0] || 'Mensal', ativo:true};
  modal(d.id ? 'Editar equipamento' : 'Novo equipamento', `<div class="fgrid">
   ${fld('e_nome','Nome *', e.nome, 'text', true)}
   ${fld('e_marca','Marca / modelo', e.marca_modelo, 'text', true)}
   ${fld('e_val','Valor de custo (R$) *', e.valor, 'number')}
   ${selLista('e_tipo','Tipo de cobrança','equipamento_tipo', e.tipo)}
   ${nota('Informe o CUSTO. O preço que aparece na proposta sai deste valor com markup e tributos aplicados — inclusive nos itens de implantação, que antes eram vendidos a preço de custo.')}
   ${chk('e_ativo','Equipamento ativo', e.ativo)}</div>`, acoesModal('saveEquipCad', d.id));
},
async saveEquipCad(d){
  if(!valid(['e_nome','e_val'])) return;
  const o = {nome:$('#e_nome').value.trim(), marca_modelo:$('#e_marca').value.trim(),
   valor:+$('#e_val').value, tipo:$('#e_tipo').value, ativo:$('#e_ativo').checked};
  try{ d.id ? await DB.upd('equipamentos', d.id, o) : await DB.add('equipamentos', o); }catch(e){ return; }
  closeModal(); toast('Equipamento salvo'); render();
},

/* ── materiais e insumos (MÓDULO 5) ──────────────────────────────────────────
   O campo que decide tudo aqui é o PRAZO DE TROCA, e é o que quase ninguém
   preenche direito na primeira vez. Uniforme de R$ 190 com prazo 1 vira
   R$ 190 por funcionário TODO MÊS — quinze vezes o custo real. Por isso o
   formulário mostra o custo mensal calculado ao vivo, embaixo do campo: o erro
   aparece antes de virar preço. */
formMaterial(d){
  const m = d.id ? DB.get('materiais', d.id)
    : {nome:'', categoria:'Material', unidade:'un', valor:'', meses:1,
       base:'funcionario', obs:'', ativo:true};
  const bases = Object.entries(Calc.MAT_BASES).map(([k, r]) => [k, r]);
  modal(d.id ? 'Editar material' : 'Novo material', `<div class="fgrid">
   ${fld('m_nome','Nome *', m.nome, 'text', true)}
   ${sel('m_cat','Categoria', ['Uniforme','EPI','Material','Exames','Equipagem','Outros'], m.categoria)}
   ${fld('m_unid','Unidade', m.unidade)}
   ${fld('m_val','Custo de aquisição (R$) *', m.valor, 'number')}
   ${fld('m_meses','Troca a cada (meses) *', m.meses, 'number')}
   ${sel('m_base','Multiplicar por', bases, m.base, true)}
   <div class="f full"><div class="readbox" id="m_previa"></div></div>
   ${nota('<b>Custo de aquisição</b> é o que você paga por UMA unidade, não o custo mensal — ' +
          'quem divide pelo prazo é o sistema. <b>Multiplicar por</b> é o erro mais caro: ' +
          'uniforme é por funcionário (num 12x36 são 2 pessoas por posto), rádio é por posto, ' +
          'cota de produto de limpeza é fixa no contrato.')}
   ${fld('m_obs','Observação', m.obs, 'text', true)}
   ${chk('m_ativo','Material ativo', m.ativo)}</div>`, acoesModal('saveMaterial', d.id));

  /* Prévia viva: sem ela o prazo de troca é um número abstrato. */
  const previa = () => {
    const v = +$('#m_val').value || 0, ms = Math.max(Math.trunc(+$('#m_meses').value) || 1, 1);
    const base = $('#m_base').value;
    const porMes = v / ms;
    $('#m_previa').innerHTML = `<b>Custo mensal</b>
     ${money(porMes)} ${esc(Calc.MAT_BASES[base] || '')}
     <div style="margin-top:4px;font-size:12px;color:var(--muted)">
      ${money(v)} ÷ ${ms} ${ms === 1 ? 'mês' : 'meses'}${ms === 1
        ? ' — reposição mensal' : ' — ' + num(12 / ms, 2) + '× por ano'}</div>`;
  };
  ['m_val','m_meses','m_base'].forEach(id => { $('#' + id).oninput = previa; $('#' + id).onchange = previa; });
  previa();
},
async saveMaterial(d){
  if(!valid(['m_nome','m_val','m_meses'])) return;
  const o = {nome:$('#m_nome').value.trim(), categoria:$('#m_cat').value,
   unidade:$('#m_unid').value.trim() || 'un', valor:+$('#m_val').value,
   meses:Math.max(Math.trunc(+$('#m_meses').value) || 1, 1),
   base:$('#m_base').value, obs:$('#m_obs').value.trim(), ativo:$('#m_ativo').checked};
  try{ d.id ? await DB.upd('materiais', d.id, o) : await DB.add('materiais', o); }catch(e){ return; }
  closeModal(); toast('Material salvo'); render();
},

/* ── leads e contatos ── */
formLead(d){
  const l = d.id ? DB.get('leads', d.id) : {empresa:'', cnpj:'', endereco:'', cidade:'',
   uf:OPC('uf')[0] || 'SP', site:'', contato_nome:'', contato_cargo:'', contato_email:'',
   contato_telefone:'', contato_telefone2:'', origem:OPC('lead_origem')[0] || '',
   status:OPC('lead_status')[0] || 'Novo', valor:'', owner:Sessao.nome(), obs:'',
   motivo:'', motivo_obs:''};
  modal(d.id ? 'Editar lead' : 'Novo lead',
   `<div class="sublabel" style="margin-top:0">Dados da empresa</div><div class="fgrid">
    ${fld('l_emp','Empresa *', l.empresa, 'text', true)}
    ${fld('l_cnpj','CNPJ', l.cnpj)}${fld('l_site','Site', l.site)}
    ${fld('l_end','Endereço', l.endereco, 'text', true)}
    ${fld('l_cid','Cidade', l.cidade)}${selLista('l_uf','UF','uf', l.uf)}</div>
   <div id="alertaDup"></div>
   <div class="sublabel">Contato principal</div><div class="fgrid">
    ${fld('l_cnome','Nome do contato *', l.contato_nome, 'text', true)}
    ${fld('l_ccargo','Cargo do contato', l.contato_cargo, 'text', true)}
    ${fld('l_cmail','E-mail', l.contato_email, 'email', true)}
    ${fld('l_ctel','Telefone', l.contato_telefone)}
    ${fld('l_ctel2','Telefone 2', l.contato_telefone2)}</div>
   <div class="sublabel">Gestão comercial</div><div class="fgrid">
    ${fld('l_valor','Valor estimado', l.valor, 'number')}
    ${selLista('l_origem','Origem','lead_origem', l.origem)}
    ${selLista('l_status','Status','lead_status', l.status)}
    ${selLista('l_owner','Responsável','owner', l.owner)}
    ${selLista('l_motivo','Motivo (se desqualificado)','lead_motivo_perda', l.motivo)}
    ${fld('l_motobs','Detalhe do motivo', l.motivo_obs, 'text')}
    ${txa('l_obs','Observações', l.obs)}</div>`,
   /* `vincular` sobrevive ao modal porque viaja no próprio botão: sem isto, o
      cadastro feito de dentro da proposta salvaria o cliente e voltaria para o
      editor com o seletor ainda apontando para o cliente antigo — que é a
      forma mais rápida de mandar uma proposta para a empresa errada. */
   `<button class="btn" data-acao="fecharModal">Cancelar</button>
    <button class="btn btn-primary" data-acao="saveLead" data-id="${d.id ?? ''}"
     data-vincular="${esc(d.vincular || '')}">Salvar</button>`, 'wide');
  /* Aviso de duplicidade enquanto digita — antes de gravar, não depois (3.7). */
  const checar = debounce(() => {
    const alvo = $('#alertaDup');
    if(!alvo) return;
    const dups = duplicadosDeLead({empresa:$('#l_emp').value, cnpj:$('#l_cnpj').value, id:d.id});
    alvo.innerHTML = dups.length ? `<div class="faixa aviso" style="margin-top:10px">${ico('aviso')}
      <span class="sp">Já existe: <b>${dups.map(x => esc(x.empresa)).join(', ')}</b>.
       ${dups.some(x => soDigitos(x.cnpj) && soDigitos(x.cnpj) === soDigitos($('#l_cnpj').value))
         ? 'Mesmo CNPJ — o banco vai recusar a gravação.' : 'Nome parecido; confira antes de duplicar a base.'}</span></div>` : '';
  }, 350);
  ['#l_emp','#l_cnpj'].forEach(s => $(s)?.addEventListener('input', checar));
},
async saveLead(d){
  if(!valid(['l_emp','l_cnome'])) return;
  const o = {empresa:$('#l_emp').value.trim(), cnpj:$('#l_cnpj').value.trim(),
   site:$('#l_site').value.trim(), endereco:$('#l_end').value.trim(),
   cidade:$('#l_cid').value.trim(), uf:$('#l_uf').value,
   contato_nome:$('#l_cnome').value.trim(), contato_cargo:$('#l_ccargo').value.trim(),
   contato_email:$('#l_cmail').value.trim(), contato_telefone:$('#l_ctel').value.trim(),
   contato_telefone2:$('#l_ctel2').value.trim(), valor:+$('#l_valor').value || 0,
   origem:$('#l_origem').value, status:$('#l_status').value, owner:$('#l_owner').value,
   motivo:$('#l_motivo').value || null, motivo_obs:$('#l_motobs').value.trim(),
   obs:$('#l_obs').value.trim(),
   criado:d.id ? DB.get('leads', d.id).criado : hoje()};
  let lead;
  try{
    lead = d.id ? await DB.upd('leads', d.id, o) : await DB.add('leads', o);
    /* O contato principal também vira registro em `contatos`, para poder ser
       escolhido na proposta junto com os demais. */
    const principal = contatosLead(lead.id).find(c => c.principal);
    const dadosCt = {nome:o.contato_nome, cargo:o.contato_cargo, email:o.contato_email,
     telefone:o.contato_telefone, telefone2:o.contato_telefone2, principal:true, leadId:lead.id};
    principal ? await DB.upd('contatos', principal.id, dadosCt) : await DB.add('contatos', dadosCt);
  }catch(e){ return; }
  closeModal();

  /* Veio do editor de proposta: além de salvar, JÁ AMARRA o cliente novo à
     proposta aberta, junto com o contato principal que acabou de nascer. */
  if(d.vincular === 'proposta' && !d.id && lead && view === 'propostaEditor'){
    const cts = contatosLead(lead.id);
    const principal = cts.find(x => x.principal) || cts[0];
    try{
      await DB.upd('propostas', state.id,
        {leadId: lead.id, contatoId: principal ? principal.id : null});
    }catch(e){ /* o toast já saiu */ }
    toast('Cliente ' + lead.empresa + ' criado e já escolhido na proposta');
    render();
    return;
  }
  toast('Lead salvo'); render();
},

formContato(d){
  const c = d.id ? DB.get('contatos', d.id) : {nome:'', cargo:'',
   leadId:d.lead ? +d.lead : DB.list('leads')[0]?.id, email:'', telefone:'',
   telefone2:'', principal:false, obs:''};
  if(!c.leadId){ toast('Cadastre um lead antes'); return; }
  modal(d.id ? 'Editar contato' : 'Novo contato', `<div class="fgrid">
   ${fld('t_nome','Nome *', c.nome, 'text', true)}${fld('t_cargo','Cargo', c.cargo)}
   ${sel('t_lead','Lead', DB.list('leads').map(x => [x.id, x.empresa]), c.leadId)}
   ${fld('t_email','E-mail', c.email, 'email')}${fld('t_tel','Telefone', c.telefone)}
   ${fld('t_tel2','Telefone 2', c.telefone2)}
   ${txa('t_obs','Observações', c.obs)}
   ${chk('t_princ','Contato principal', c.principal)}</div>`, acoesModal('saveContato', d.id));
},
async saveContato(d){
  if(!valid(['t_nome'])) return;
  const o = {nome:$('#t_nome').value.trim(), cargo:$('#t_cargo').value.trim(),
   leadId:+$('#t_lead').value, email:$('#t_email').value.trim(),
   telefone:$('#t_tel').value.trim(), telefone2:$('#t_tel2').value.trim(),
   obs:$('#t_obs').value.trim(), principal:$('#t_princ').checked};
  let ct;
  try{ ct = d.id ? await DB.upd('contatos', d.id, o) : await DB.add('contatos', o); }
  catch(e){ return; }
  closeModal();
  /* Criado de dentro da proposta: já vira o destinatário dela. Cadastrar o
     contato e ter que escolhê-lo em seguida num seletor é um passo que só
     existe porque o sistema não presumiu o óbvio. */
  if(!d.id && ct && view === 'propostaEditor' && +o.leadId === +DB.get('propostas', state.id)?.leadId){
    try{ await DB.upd('propostas', state.id, {contatoId: ct.id}); }catch(e){}
    toast('Contato ' + ct.nome + ' criado e já escolhido');
    render();
    return;
  }
  toast('Contato salvo'); render();
},

/* ── oportunidades ── */
formOp(d){
  const o = d.id ? DB.get('ops', d.id) : {titulo:'',
   leadId:d.lead ? +d.lead : DB.list('leads')[0]?.id, valor:'', fase:OPC('op_fase')[0] || '',
   prob:OPC_NUM('op_fase', OPC('op_fase')[0]), fecha:'', owner:Sessao.nome()};
  modal(d.id ? 'Editar oportunidade' : 'Nova oportunidade', `<div class="fgrid">
   ${fld('o_tit','Título *', o.titulo, 'text', true)}
   ${sel('o_lead','Lead', DB.list('leads').map(x => [x.id, x.empresa]), o.leadId, true)}
   ${fld('o_valor','Valor (R$) *', o.valor, 'number')}
   ${selLista('o_fase','Fase','op_fase', o.fase)}
   ${fld('o_prob','Probabilidade (%)', o.prob, 'number')}
   ${fld('o_data','Previsão de fechamento', o.fecha, 'date')}
   ${selLista('o_owner','Responsável','owner', o.owner, true)}</div>`, acoesModal('saveOp', d.id));
},
async saveOp(d){
  if(!valid(['o_tit','o_valor'])) return;
  const antiga = d.id ? DB.get('ops', d.id) : null;
  const fase = $('#o_fase').value;
  const o = {titulo:$('#o_tit').value.trim(), leadId:+$('#o_lead').value,
   valor:+$('#o_valor').value, fase, prob:+$('#o_prob').value || 0,
   fecha:$('#o_data').value || null, owner:$('#o_owner').value};
  if(['Ganho','Perdido'].includes(fase) && (!antiga || antiga.fase !== fase))
    o.fechada_em = hoje();
  try{ d.id ? await DB.upd('ops', d.id, o) : await DB.add('ops', o); }catch(e){ return; }
  closeModal();
  /* Fase final exige motivo — pergunta agora, enquanto a memória está fresca. */
  if(['Ganho','Perdido'].includes(fase) && (!antiga || antiga.fase !== fase) && d.id){
    formDesfecho(+d.id, fase);
  } else { toast('Oportunidade salva'); render(); }
},

abrirOp(d){
  const id = +d.op;
  const o = DB.get('ops', id);
  if(!o) return;
  const prs = DB.list('propostas').filter(p => +p.opId === id);
  modal(esc(o.titulo), `<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">${tagOf(o.fase)}
   <span class="tag t-gray">${o.prob}%</span>
   ${o.fase_desde ? `<span class="tag t-purple">nesta fase ${esc(desde(o.fase_desde))}</span>` : ''}</div>
  <div class="dl"><div class="it"><b>Lead</b><span>${esc(leadNome(o.leadId))}</span></div>
   <div class="it"><b>Valor</b><span>${money(o.valor)}</span></div>
   <div class="it"><b>Previsão</b><span>${dt(o.fecha)}</span></div>
   <div class="it"><b>Responsável</b><span>${esc(o.owner || '—')}</span></div>
   ${o.motivo ? `<div class="it"><b>Motivo do desfecho</b><span>${esc(o.motivo)}
     ${o.motivo_obs ? ' — ' + esc(o.motivo_obs) : ''}</span></div>` : ''}</div>
  <h3 style="font-size:14px;margin:18px 0 10px">Propostas vinculadas</h3>
  ${prs.length ? prs.map(p => `<div style="display:flex;align-items:center;gap:10px;padding:9px;
    border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:7px">
    <b style="flex:1">${esc(p.numero)}</b>${tagOf(p.status)}
    <button class="btn btn-sm" data-acao="abrirPropostaModal" data-id="${p.id}">Abrir</button></div>`).join('')
   : '<p style="color:var(--muted);font-size:13px">Nenhuma proposta gerada.</p>'}`,
  `<button class="btn" data-acao="desfecho" data-id="${id}" data-fase="Perdido">Marcar como perdida</button>
   <button class="btn" data-acao="desfecho" data-id="${id}" data-fase="Ganho">Marcar como ganha</button>
   <button class="btn" data-acao="gerarPropostaModal" data-id="${id}">Gerar proposta</button>
   <button class="btn btn-primary" data-acao="editarOpModal" data-id="${id}">Editar</button>`, 'wide');
},
abrirPropostaModal(d){ closeModal(); go('propostaResumo', {id:+d.id}); },
async gerarPropostaModal(d){ closeModal(); await ACOES.propostaDeOp({id:d.id}); },
editarOpModal(d){ closeModal(); ACOES.formOp({id:d.id}); },
desfecho(d){ closeModal(); formDesfecho(+d.id, d.fase); },

/* ── motivo de ganho/perda (3.5) ── */
async salvarDesfecho(d){
  const fase = d.fase;
  const motivo = $('#df_motivo').value;
  const obs = $('#df_obs').value.trim();
  const o = DB.get('ops', d.id);
  await DB.upd('ops', d.id, {fase, prob:OPC_NUM('op_fase', fase), motivo,
    motivo_obs:obs, fechada_em:hoje()});
  await Historico.registrar('Oportunidade', d.id, {tipo: fase === 'Ganho' ? 'ganho' : 'perda',
    titulo:`${fase}: ${motivo}`, detalhe:obs, leadId:o.leadId});
  closeModal();
  toast(fase === 'Ganho' ? 'Negócio ganho!' : 'Registrado como perdido');
  /* Ganhou: a proposta que originou o negócio passa a Aprovada e congela junto
     — senão o funil diz "ganho" e a lista de propostas diz "rascunho". Depois
     vem a próxima pergunta, o contrato, que é onde o fluxo morria. */
  if(fase === 'Ganho'){
    const props = await aprovarPropostasDaOp(d.id);
    if(props.length && !DB.list('contratos').some(c => +c.propostaId === props[0].id)){
      modal('Gerar o contrato?', `<p style="color:var(--muted)">A proposta
        <b>${esc(props[0].numero)}</b> está aprovada e com os valores congelados.
        Gerar o contrato agora preenche vigência, valor mensal e data-base a
        partir dela.</p>`,
        `<button class="btn" data-acao="fecharModal">Depois</button>
         <button class="btn btn-primary" data-acao="contratoDaProposta" data-id="${props[0].id}">Gerar contrato</button>`);
      return;
    }
  }
  render();
},

/* ── atividades ── */
formAtiv(d){
  const a = d.id ? DB.get('ativs', d.id) : {tipo:OPC('ativ_tipo')[0] || '', titulo:'',
   refTipo:d.reftipo || 'Lead', refId:d.refid ? +d.refid : DB.list('leads')[0]?.id,
   data:hoje(), hora:'09:00', owner:Sessao.nome(), feito:false,
   recorrencia:'nenhuma', obs:''};
  const alvos = {
    Lead: DB.list('leads').map(x => [x.id, x.empresa]),
    Oportunidade: DB.list('ops').map(x => [x.id, x.titulo]),
    Proposta: DB.list('propostas').map(x => [x.id, x.numero + ' — ' + (x.titulo || '')]),
    Contrato: DB.list('contratos').map(x => [x.id, x.numero + ' — ' + (x.titulo || '')]),
  };
  modal(d.id ? 'Editar atividade' : 'Nova atividade', `<div class="fgrid">
   ${fld('v_tit','Título *', a.titulo, 'text', true)}
   ${selLista('v_tipo','Tipo','ativ_tipo', a.tipo)}
   ${sel('v_reftipo','Relacionado a',[['Lead','Lead'],['Oportunidade','Oportunidade'],
     ['Proposta','Proposta'],['Contrato','Contrato']], a.refTipo || 'Lead')}
   <div class="f full" data-f="v_ref" id="wrapRef">
    <label for="v_ref">Registro</label>
    <select id="v_ref">${(alvos[a.refTipo || 'Lead'] || []).map(([v,r]) =>
      `<option value="${esc(v)}" ${String(a.refId) === String(v) ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
    <span class="err">Campo obrigatório</span></div>
   ${fld('v_data','Data *', a.data, 'date')}${fld('v_hora','Hora', a.hora, 'time')}
   ${selLista('v_rec','Repetição','ativ_recorrencia', a.recorrencia || 'nenhuma')}
   ${selLista('v_owner','Responsável','owner', a.owner)}
   ${txa('v_obs','Observações', a.obs)}
   ${nota('Atividade recorrente: ao concluir, a próxima é agendada automaticamente.')}
   </div>`, acoesModal('saveAtiv', d.id), 'wide');
  /* O refTipo agora é escolhido de verdade — antes era fixado em 'Lead' no
     formulário, embora o schema já aceitasse os quatro (P9.6). */
  $('#v_reftipo')?.addEventListener('change', e => {
    const opts = alvos[e.target.value] || [];
    $('#v_ref').innerHTML = opts.map(([v,r]) => `<option value="${esc(v)}">${esc(r)}</option>`).join('')
      || '<option value="">— nenhum cadastrado —</option>';
  });
},
async saveAtiv(d){
  if(!valid(['v_tit','v_data'])) return;
  const o = {titulo:$('#v_tit').value.trim(), tipo:$('#v_tipo').value,
   refTipo:$('#v_reftipo').value, refId:+$('#v_ref').value || null,
   data:$('#v_data').value, hora:$('#v_hora').value, owner:$('#v_owner').value,
   recorrencia:$('#v_rec').value, obs:$('#v_obs').value.trim(),
   feito:d.id ? DB.get('ativs', d.id).feito : false};
  try{ d.id ? await DB.upd('ativs', d.id, o) : await DB.add('ativs', o); }catch(e){ return; }
  closeModal(); toast('Atividade salva'); render();
},

/* ── configurações ── */
formConfig(d){
  const c = DB.get('configuracoes', d.chave);
  if(!c) return;
  modal('Editar parâmetro', `<div class="fgrid">
   <div class="f full"><label>Chave</label><input value="${esc(c.chave)}" disabled></div>
   ${txa('p_valor','Valor', c.valor)}
   ${fld('p_desc','Descrição', c.descricao, 'text', true)}</div>`,
   `<button class="btn" data-acao="fecharModal">Cancelar</button>
    <button class="btn btn-primary" data-acao="saveConfig" data-chave="${esc(d.chave)}">Salvar</button>`);
},
async saveConfig(d){
  try{ await DB.upd('configuracoes', d.chave, {valor:$('#p_valor').value,
    descricao:$('#p_desc').value.trim()}); }catch(e){ return; }
  closeModal(); toast('Parâmetro salvo'); render();
},

formLista(d){
  const l = d.id ? DB.get('listas', d.id)
   : {grupo:d.grupo || '', valor:'', rotulo:'', num:'', ordem:99, ativo:true};
  modal(d.id ? 'Editar item da lista' : 'Novo item de lista', `<div class="fgrid">
   ${fld('z_grupo','Grupo *', l.grupo)}${fld('z_ordem','Ordem', l.ordem, 'number')}
   ${fld('z_valor','Valor (usado no banco) *', l.valor)}
   ${fld('z_rot','Rótulo (exibido na tela) *', l.rotulo)}
   ${fld('z_num','Número associado (opcional)', l.num ?? '', 'number', true)}
   ${chk('z_ativo','Item ativo', l.ativo)}</div>`, acoesModal('saveLista', d.id));
},
async saveLista(d){
  if(!valid(['z_grupo','z_valor','z_rot'])) return;
  const o = {grupo:$('#z_grupo').value.trim(), valor:$('#z_valor').value.trim(),
   rotulo:$('#z_rot').value.trim(), ordem:+$('#z_ordem').value || 0,
   num:$('#z_num').value === '' ? null : +$('#z_num').value, ativo:$('#z_ativo').checked};
  try{ d.id ? await DB.upd('listas', d.id, o) : await DB.add('listas', o); }catch(e){ return; }
  closeModal(); toast('Item salvo'); render();
},

/* ── papéis (3.3) ── */
formPerfil(d){
  const p = DB.get('perfis', d.id);
  if(!p) return;
  modal('Papel de ' + esc(p.email || p.nome), `<div class="fgrid">
   ${fld('pf_nome','Nome', p.nome, 'text', true)}
   ${selLista('pf_papel','Papel','papel', p.papel)}
   ${chk('pf_ativo','Usuário ativo', p.ativo)}
   ${nota('admin: tudo, inclusive parâmetros e papéis. gestor: comercial de todo mundo e cadastros. vendedor: só os registros dele, cadastros em leitura.')}
   </div>`, acoesModal('savePerfil', d.id));
},
async savePerfil(d){
  try{ await DB.upd('perfis', d.id, {nome:$('#pf_nome').value.trim(),
    papel:$('#pf_papel').value, ativo:$('#pf_ativo').checked}); }catch(e){ return; }
  closeModal(); toast('Papel atualizado'); render();
},

/* ── metas (3.9) ── */
formMeta(){
  const h = new Date();
  modal('Definir meta mensal', `<div class="fgrid">
   ${selLista('mt_owner','Responsável','owner', Sessao.nome())}
   ${fld('mt_ano','Ano', state.metaAno || h.getFullYear(), 'number')}
   ${sel('mt_mes','Mês', MESES_NOME.map((m,i) => [i+1, m]), h.getMonth()+1)}
   ${fld('mt_valor','Meta de valor (R$) *','', 'number')}
   ${fld('mt_qtd','Meta de negócios fechados', 0, 'number')}
   ${chk('mt_ano_todo','Repetir para os 12 meses do ano', false)}
   </div>`, acoesModal('saveMeta', null));
},
async saveMeta(){
  if(!valid(['mt_valor'])) return;
  const owner = $('#mt_owner').value, ano = +$('#mt_ano').value;
  const valor = +$('#mt_valor').value, qtd = +$('#mt_qtd').value || 0;
  const meses = $('#mt_ano_todo').checked ? Array.from({length:12}, (_,i) => i+1) : [+$('#mt_mes').value];
  for(const mes of meses){
    const ja = DB.list('metas').find(m => m.owner === owner && m.ano === ano && m.mes === mes);
    try{
      ja ? await DB.upd('metas', ja.id, {meta_valor:valor, meta_qtd:qtd})
         : await DB.add('metas', {owner, ano, mes, meta_valor:valor, meta_qtd:qtd});
    }catch(e){ /* segue para os demais meses */ }
  }
  closeModal(); toast('Meta definida'); render();
},

});

/* Modal de desfecho, chamado de vários lugares (kanban, lista, formulário).

   Ganho e perda usavam o MESMO texto, escrito para a perda: quem arrastava um
   negócio para Ganho lia sobre relatório de perdas e era convidado a informar
   o valor da proposta vencedora — a do concorrente. Fechar venda com a tela
   falando de derrota é o tipo de detalhe que faz o usuário desconfiar do
   sistema inteiro. Agora cada desfecho fala a sua língua. */
function formDesfecho(id, fase){
  const ganhou = fase === 'Ganho';
  const grupo = ganhou ? 'op_motivo_ganho' : 'op_motivo_perda';
  const o = DB.get('ops', id);
  modal(ganhou ? 'Por que ganhamos?' : 'Por que perdemos?', `
   <p style="color:var(--muted);font-size:13px;margin-bottom:14px">
    <b>${esc(o?.titulo || '')}</b> · ${money(o?.valor || 0)}<br>
    ${ganhou
      ? 'Registrar o motivo é o que permite repetir o acerto: saber se o que fecha é preço, escopo ou relacionamento muda a próxima proposta.'
      : 'Sem o motivo registrado não existe relatório de perdas — e é ele que diz se o problema é preço, prazo ou escopo.'}</p>
   <div class="fgrid">
    ${selLista('df_motivo','Motivo', grupo, OPC(grupo)[0], true)}
    ${txa('df_obs', ganhou
       ? 'Detalhe (o que pesou na decisão, quem indicou, contexto…)'
       : 'Detalhe (concorrente, valor da proposta vencedora, contexto…)', '')}
   </div>`,
   `<button class="btn" data-acao="fecharModal">Cancelar</button>
    <button class="btn btn-primary" data-acao="salvarDesfecho" data-id="${esc(id)}"
     data-fase="${esc(fase)}">${ganhou ? 'Registrar ganho' : 'Registrar perda'}</button>`);
}
