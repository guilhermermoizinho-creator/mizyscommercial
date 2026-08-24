/* ════════════════════════════════════════════════════════════════════════════
   CONTRATOS — o pós-venda (item 3.8)
   ════════════════════════════════════════════════════════════════════════════

   O fluxo antigo morria em "Ganho". Para uma empresa de facilities isso é
   perder de vista justamente onde o dinheiro mora: o contrato é recorrente,
   dura anos, é reajustado todo ano e cresce por aditivo. Uma proposta ganha é
   um evento; um contrato é a receita.

   O que este módulo responde, e antes ninguém respondia:
     · quanto entra por mês, hoje, somando tudo que está vigente;
     · o que vence nos próximos 90 dias — janela para renegociar, não para
       descobrir depois que já venceu;
     · o que está com reajuste atrasado (data-base passou e ninguém aplicou);
     · o histórico de reajustes e aditivos de cada contrato.
   ════════════════════════════════════════════════════════════════════════════ */

const MESES_NOME = ['janeiro','fevereiro','março','abril','maio','junho','julho',
                    'agosto','setembro','outubro','novembro','dezembro'];

const diasAte = iso => iso ? Math.round((new Date(iso + 'T12:00') - Date.now()) / 86400000) : null;

/* Reajuste está vencido quando o mês da data-base já passou neste ano e o
   último reajuste registrado é anterior a ele. */
function reajusteVencido(c){
  if(!c.reajuste_mes || c.status !== 'Ativo') return false;
  const h = new Date();
  const base = new Date(h.getFullYear(), c.reajuste_mes - 1, 1);
  if(base > h) return false;
  const ults = DB.list('contrato_reajustes')
    .filter(r => +r.contratoId === c.id && r.tipo === 'Reajuste')
    .map(r => r.data).sort();
  const ultimo = ults[ults.length - 1] || c.inicio;
  return new Date(ultimo + 'T12:00') < base;
}

VIEWS.contratos = function(){
  const q = semAcento(state.q || ''), fs = state.status || '';
  const l = DB.list('contratos').filter(c =>
    (!q || semAcento(c.numero).includes(q) || semAcento(c.titulo).includes(q)
        || semAcento(leadNome(c.leadId)).includes(q))
    && (!fs || c.status === fs));

  const ativos = DB.list('contratos').filter(c => c.status === 'Ativo');
  const mrr = ativos.reduce((s,c) => s + +c.valor_mensal, 0);
  const vencendo90 = ativos.filter(c => { const d = diasAte(c.fim); return d !== null && d >= 0 && d <= 90; });
  const atrasados = ativos.filter(reajusteVencido);

  return `<div class="toolbar">
   ${barraBusca('Buscar contrato, título ou cliente…')}
   <select data-mudar="filtrar" data-campo="status"><option value="">Todos os status</option>
    ${optsLista('contrato_status', fs)}</select>
   <button class="btn" data-acao="exportarContratos">Exportar CSV</button>
   <button class="btn btn-primary" data-acao="formContrato">+ Novo contrato</button></div>

  <div class="kpis" style="margin-bottom:16px">
   <div class="kpi"><div class="kpi-top"><div class="kpi-ic solid">
     <svg viewBox="0 0 24 24">${SVG.ok}</svg></div><div class="k">Receita recorrente</div></div>
    <div class="v">${money0(mrr)}</div><div class="d">${ativos.length} contratos ativos</div></div>
   <div class="kpi"><div class="k">Anualizado</div><div class="v">${money0(mrr * 12)}</div>
    <div class="d">Se nada mudar nos próximos 12 meses</div></div>
   <div class="kpi"><div class="k">Vencem em 90 dias</div><div class="v">${vencendo90.length}</div>
    <div class="d">${money0(vencendo90.reduce((s,c) => s + +c.valor_mensal, 0))} em risco</div></div>
   <div class="kpi"><div class="k">Reajuste atrasado</div><div class="v">${atrasados.length}</div>
    <div class="d">Data-base já passou</div></div>
  </div>

  ${vencendo90.length ? `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Vencem nos próximos 90 dias:
     <b>${vencendo90.map(c => esc(c.numero) + ' (' + esc(leadNome(c.leadId)) + ')').join(', ')}</b>.</span></div>` : ''}
  ${atrasados.length ? `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Com reajuste em atraso:
     <b>${atrasados.map(c => esc(c.numero)).join(', ')}</b> — a data-base já passou.</span></div>` : ''}

  <div class="card">${l.length ? `<table><thead><tr><th>Contrato</th><th>Cliente</th>
   <th>Vigência</th><th>Mensal</th><th>Reajuste</th><th>Status</th><th></th></tr></thead><tbody>
  ${l.map(c => { const d = diasAte(c.fim);
   return `<tr>
   <td><div class="cell-main">${esc(c.numero)}</div><div class="cell-sub">${esc(c.titulo || '')}</div></td>
   <td><div class="row-flex">${av(leadNome(c.leadId))}<span>${esc(leadNome(c.leadId))}</span></div></td>
   <td class="cell-sub">${dt(c.inicio)} — ${dt(c.fim)}
     ${d !== null && d >= 0 && d <= 90 ? `<div><span class="tag t-amber">${d} dias</span></div>` : ''}
     ${d !== null && d < 0 ? '<div><span class="tag t-red">vencido</span></div>' : ''}</td>
   <td style="font-weight:700">${money0(c.valor_mensal)}</td>
   <td class="cell-sub">${esc(c.reajuste_indice || '—')}
     ${c.reajuste_mes ? `<div>${esc(MESES_NOME[c.reajuste_mes - 1])}</div>` : ''}
     ${reajusteVencido(c) ? '<span class="tag t-amber">atrasado</span>' : ''}</td>
   <td>${tagOf(c.status)}</td>
   <td style="text-align:right;white-space:nowrap">
    <button class="btn btn-sm" data-acao="abrirContrato" data-id="${c.id}">Abrir</button>
    <button class="btn btn-sm" data-acao="formContrato" data-id="${c.id}">Editar</button>
    ${btnExcluir('contratos', c.id, 'Contrato')}</td></tr>`; }).join('')}
  </tbody></table>${pager('contratos', l.length)}`
   : emptyState('Nenhum contrato','Ganhe uma proposta e gere o contrato a partir dela.')}</div>`;
};

VIEWS.contratoDetalhe = function(){
  const c = DB.get('contratos', state.id);
  if(!c) return emptyState('Contrato não encontrado','');
  const t = state.tab || 'resumo';
  const hist = DB.list('contrato_reajustes').filter(r => +r.contratoId === c.id)
    .sort((a,b) => String(b.data).localeCompare(String(a.data)));
  const prop = c.propostaId ? DB.get('propostas', c.propostaId) : null;
  const d = diasAte(c.fim);
  const aba = (k,r,n) => `<button class="${t === k ? 'active' : ''}" data-acao="trocarAba"
    data-tab="${k}">${r}${n !== undefined ? ` <span class="tag t-gray">${n}</span>` : ''}</button>`;

  return `<button class="btn btn-sm" data-acao="irPara" data-v="contratos" style="margin-bottom:14px">← Voltar para contratos</button>
  ${reajusteVencido(c) ? `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">A data-base de <b>${esc(MESES_NOME[c.reajuste_mes-1])}</b> passou e nenhum
     reajuste foi registrado neste ciclo.</span>
    <button class="btn btn-sm btn-primary" data-acao="formReajuste" data-contrato="${c.id}">Registrar reajuste</button></div>` : ''}
  ${d !== null && d >= 0 && d <= 90 ? `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Vence em <b>${d} dias</b>${c.renovacao_automatica
      ? ' — renovação automática ligada, aviso prévio de ' + c.aviso_previa_dias + ' dias.'
      : ' e NÃO tem renovação automática.'}</span></div>` : ''}

  <div class="card"><div class="card-b"><div class="detail-head">${av(leadNome(c.leadId))}
   <div style="flex:1"><h2>${esc(c.numero)}</h2>
    <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">${tagOf(c.status)}
     <span class="tag t-blue">${esc(leadNome(c.leadId))}</span>
     <span class="tag t-gray">${money0(c.valor_mensal)}/mês</span></div></div>
   <button class="btn btn-primary" data-acao="formReajuste" data-contrato="${c.id}">+ Reajuste ou aditivo</button>
   <button class="btn" data-acao="formContrato" data-id="${c.id}">Editar</button></div>
   <div class="dl">
    <div class="it"><b>Título</b><span>${esc(c.titulo || '—')}</span></div>
    <div class="it"><b>Vigência</b><span>${dt(c.inicio)} — ${dt(c.fim)} (${c.meses} meses)</span></div>
    <div class="it"><b>Valor mensal</b><span>${money(c.valor_mensal)}</span></div>
    <div class="it"><b>Implantação</b><span>${money(c.valor_implantacao)}</span></div>
    <div class="it"><b>Total do período</b><span>${money(+c.valor_mensal * (+c.meses || 0) + +c.valor_implantacao)}</span></div>
    <div class="it"><b>Reajuste</b><span>${esc(c.reajuste_indice || '—')}
      ${c.reajuste_mes ? ' · data-base em ' + esc(MESES_NOME[c.reajuste_mes-1]) : ''}</span></div>
    <div class="it"><b>Renovação</b><span>${c.renovacao_automatica
      ? 'automática, aviso prévio de ' + c.aviso_previa_dias + ' dias' : 'manual'}</span></div>
    <div class="it"><b>Proposta de origem</b><span>${prop
      ? `<button class="btn btn-sm" data-acao="abrirProposta" data-id="${prop.id}">${esc(prop.numero)}</button>`
      : '—'}</span></div>
    ${c.encerrado_em ? `<div class="it"><b>Encerrado em</b><span>${dt(c.encerrado_em)}
      ${c.motivo ? ' — ' + esc(c.motivo) : ''}</span></div>` : ''}
    <div class="it"><b>Observações</b><span>${esc(c.obs || '—')}</span></div>
   </div></div></div>

  <div class="tabs mt">${aba('resumo','Reajustes e aditivos', hist.length)}${aba('historico','Histórico e notas')}</div>

  ${t === 'historico' ? `<div class="card">${blocoHistorico('Contrato', c.id, c.leadId)}</div>`
   : `<div class="card">${hist.length ? `<table><thead><tr><th>Data</th><th>Tipo</th>
     <th>Índice</th><th>Percentual</th><th>De</th><th>Para</th><th>Descrição</th><th></th></tr></thead><tbody>
    ${hist.map(r => `<tr><td>${dt(r.data)}</td>
     <td>${tagOf(r.tipo)}</td>
     <td class="cell-sub">${esc(r.indice || '—')}</td>
     <td style="font-weight:700">${r.percentual ? pctTxt(r.percentual, 2) : '—'}</td>
     <td class="cell-sub">${money(r.valor_anterior)}</td>
     <td style="font-weight:700">${money(r.valor_novo)}</td>
     <td class="cell-sub">${esc(r.descricao || '—')}</td>
     <td style="text-align:right">${btnExcluir('contrato_reajustes', r.id, 'Registro')}</td></tr>`).join('')}
    </tbody></table>` : emptyState('Nenhum reajuste ou aditivo',
      'O primeiro reajuste normalmente acontece na data-base da categoria.')}
    <div class="card-b" style="border-top:1px solid var(--border);font-size:12.5px;color:var(--muted)">
     Registrar o reajuste aqui atualiza o valor mensal do contrato e guarda o
     valor anterior — é assim que a receita recorrente do painel acompanha a
     realidade sem ninguém refazer conta.</div></div>`}`;
};

acoes({
  /* Do aceite ao contrato, sem redigitar nada (o fluxo que não existia). */
  async contratoDaProposta(d){
    const p = DB.get('propostas', d.id);
    if(!p) return;
    const c = calcProposta(p);
    const inicio = hoje();
    const numero = (p.numero || 'CTR').replace(/^PRP/, 'CTR');
    const novo = await DB.add('contratos', {
      numero, leadId:p.leadId, propostaId:p.id, titulo:p.titulo, status:'Em implantação',
      inicio, fim:somaDias(inicio, 30 * (+p.prazo || 12)), meses:+p.prazo || 12,
      valor_mensal:+(c.mensalC / 100).toFixed(2),
      valor_implantacao:+(c.implantacaoC / 100).toFixed(2),
      reajuste_indice:'Data-base', reajuste_mes:new Date(inicio + 'T12:00').getMonth() + 1,
      renovacao_automatica:true, aviso_previa_dias:30,
      obs:'Gerado a partir da proposta ' + p.numero, owner:Sessao.nome(),
    });
    await Historico.registrar('Proposta', p.id, {tipo:'contrato',
      titulo:'Contrato ' + numero + ' gerado', leadId:p.leadId});
    toast('Contrato ' + numero + ' criado');
    go('contratoDetalhe', {id:novo.id});
  },

  formContrato(d){
    const c = d.id ? DB.get('contratos', d.id) : {
      numero:'', leadId:DB.list('leads')[0]?.id, titulo:'', status:'Em implantação',
      inicio:hoje(), fim:somaDias(hoje(), 365), meses:12, valor_mensal:'',
      valor_implantacao:0, reajuste_indice:OPC('contrato_indice')[0] || 'INPC',
      reajuste_mes:new Date().getMonth() + 1, renovacao_automatica:true,
      aviso_previa_dias:30, obs:''};
    modal(d.id ? 'Editar contrato' : 'Novo contrato', `<div class="fgrid">
      ${fld('ct_num','Número do contrato *', c.numero, 'text', true)}
      ${sel('ct_lead','Cliente', DB.list('leads').map(l => [l.id, l.empresa]), c.leadId, true)}
      ${fld('ct_titulo','Título / objeto', c.titulo, 'text', true)}
      ${selLista('ct_status','Situação','contrato_status', c.status)}
      ${fld('ct_ini','Início da vigência *', c.inicio, 'date')}
      ${fld('ct_fim','Fim da vigência', c.fim, 'date')}
      ${fld('ct_meses','Prazo (meses)', c.meses, 'number')}
      ${fld('ct_mensal','Valor mensal (R$) *', c.valor_mensal, 'number')}
      ${fld('ct_impl','Implantação (R$)', c.valor_implantacao, 'number')}
      ${selLista('ct_indice','Índice de reajuste','contrato_indice', c.reajuste_indice)}
      ${nota('Em contrato de mão de obra, o certo é <b>data-base da CCT</b>: a folha sobe na data-base da categoria (1º de janeiro no asseio e na vigilância) e o contrato acompanha no mesmo dia. Amarrar a IPCA ou INPC no aniversário do contrato atrasa o reajuste da folha de 4 a 8 meses por ano — em cinco anos, é a margem inteira. Índice de preços só para o que não é folha.')}
      ${sel('ct_mes','Mês da data-base', MESES_NOME.map((m,i) => [i+1, m]), c.reajuste_mes)}
      ${fld('ct_aviso','Aviso prévio (dias)', c.aviso_previa_dias, 'number')}
      ${chk('ct_auto','Renovação automática', c.renovacao_automatica)}
      ${txa('ct_obs','Observações', c.obs)}
     </div>`, acoesModal('salvarContrato', d.id), 'wide');
  },
  async salvarContrato(d){
    if(!valid(['ct_num','ct_ini','ct_mensal'])) return;
    const o = {
      numero:$('#ct_num').value.trim(), leadId:+$('#ct_lead').value,
      titulo:$('#ct_titulo').value.trim(), status:$('#ct_status').value,
      inicio:$('#ct_ini').value, fim:$('#ct_fim').value || null,
      meses:+$('#ct_meses').value || 12, valor_mensal:+$('#ct_mensal').value || 0,
      valor_implantacao:+$('#ct_impl').value || 0,
      reajuste_indice:$('#ct_indice').value, reajuste_mes:+$('#ct_mes').value || null,
      aviso_previa_dias:+$('#ct_aviso').value || 30,
      renovacao_automatica:$('#ct_auto').checked, obs:$('#ct_obs').value.trim(),
    };
    if(!d.id) o.owner = Sessao.nome();
    if(o.status === 'Encerrado' && !DB.get('contratos', d.id)?.encerrado_em) o.encerrado_em = hoje();
    try{ d.id ? await DB.upd('contratos', d.id, o) : await DB.add('contratos', o); }
    catch(e){ return; }
    closeModal(); toast('Contrato salvo'); render();
  },

  formReajuste(d){
    const c = DB.get('contratos', d.contrato);
    modal('Reajuste ou aditivo', `<div class="fgrid">
      ${sel('rr_tipo','Tipo',[['Reajuste','Reajuste anual'],['Aditivo','Aditivo de escopo']],'Reajuste')}
      ${fld('rr_data','Data *', hoje(), 'date')}
      ${selLista('rr_indice','Índice','contrato_indice', c.reajuste_indice)}
      ${fld('rr_pct','Percentual (%)','', 'number')}
      ${fld('rr_novo','Novo valor mensal (R$)', c.valor_mensal, 'number')}
      ${txa('rr_desc','Descrição','')}
      ${nota('Preencha o percentual OU o novo valor: o que faltar é calculado a partir do valor atual de ' + money(c.valor_mensal) + '.')}
     </div>`,
     `<button class="btn" data-acao="fecharModal">Cancelar</button>
      <button class="btn btn-primary" data-acao="salvarReajuste" data-contrato="${esc(d.contrato)}">Registrar</button>`, 'wide');
  },
  async salvarReajuste(d){
    if(!valid(['rr_data'])) return;
    const c = DB.get('contratos', d.contrato);
    const anterior = +c.valor_mensal;
    let pct = parseFloat(String($('#rr_pct').value).replace(',','.'));
    let novo = parseFloat(String($('#rr_novo').value).replace(',','.'));
    if(isNaN(pct) && isNaN(novo)){ toast('Informe o percentual ou o novo valor.'); return; }
    if(isNaN(novo)) novo = +(anterior * (1 + pct/100)).toFixed(2);
    if(isNaN(pct)) pct = anterior ? +(((novo / anterior) - 1) * 100).toFixed(4) : 0;

    await DB.add('contrato_reajustes', {
      contratoId:+d.contrato, tipo:$('#rr_tipo').value, data:$('#rr_data').value,
      percentual:pct, valor_anterior:anterior, valor_novo:novo,
      indice:$('#rr_indice').value, descricao:$('#rr_desc').value.trim()});
    await DB.upd('contratos', d.contrato, {valor_mensal:novo});
    await Historico.registrar('Contrato', d.contrato, {tipo:'reajuste',
      titulo:`${$('#rr_tipo').value} de ${pctTxt(pct,2)}`,
      detalhe:`${money(anterior)} → ${money(novo)}`, leadId:c.leadId});
    closeModal();
    toast(`Registrado: ${money(anterior)} → ${money(novo)}`);
    render();
  },

  exportarContratos(){
    exportarCSV('contratos.csv', DB.list('contratos'), [
      {campo:'numero', rotulo:'Contrato'}, {rotulo:'Cliente', valor:c => leadNome(c.leadId)},
      {campo:'titulo', rotulo:'Objeto'}, {campo:'status', rotulo:'Status'},
      {campo:'inicio', rotulo:'Início'}, {campo:'fim', rotulo:'Fim'},
      {campo:'valor_mensal', rotulo:'Mensal'}, {campo:'valor_implantacao', rotulo:'Implantação'},
      {campo:'reajuste_indice', rotulo:'Índice'},
      {rotulo:'Data-base', valor:c => c.reajuste_mes ? MESES_NOME[c.reajuste_mes-1] : ''},
    ]);
  },
});
