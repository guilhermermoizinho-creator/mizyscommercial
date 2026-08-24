/* ════════════════════════════════════════════════════════════════════════════
   TELAS DO CRM — dashboard, pipeline, leads, contatos, oportunidades,
   atividades e relatórios.
   ════════════════════════════════════════════════════════════════════════════ */

/* ── filtro de período (3.9) ─────────────────────────────────────────────────
   O dashboard mostrava "pipeline aberto" e "ganho acumulado" desde o começo dos
   tempos. Número sem recorte não responde pergunta nenhuma: o que interessa é
   quanto entrou NESTE mês, neste trimestre, neste ano. */
const Periodo = {
  atual: localStorage.getItem('mizys_periodo') || '90',
  PRESETS: [['30','30 dias'], ['90','90 dias'], ['mes','Este mês'],
            ['tri','Trimestre'], ['ano','Este ano'], ['tudo','Tudo']],
  faixa(){
    const h = new Date(), p = this.atual;
    const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(p === 'tudo') return {de:'0000-01-01', ate:'9999-12-31'};
    if(p === 'mes')  return {de:iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate:iso(h)};
    if(p === 'tri'){ const t = Math.floor(h.getMonth()/3)*3;
                     return {de:iso(new Date(h.getFullYear(), t, 1)), ate:iso(h)}; }
    if(p === 'ano')  return {de:`${h.getFullYear()}-01-01`, ate:iso(h)};
    return {de:somaDias(hoje(), -parseInt(p, 10)), ate:iso(h)};
  },
  contem(data){
    if(!data) return this.atual === 'tudo';
    const {de, ate} = this.faixa();
    const d = diaDe(data);
    return d >= de && d <= ate;
  },
  rotulo(){ return (this.PRESETS.find(p => p[0] === this.atual) || ['', ''])[1]; },
  seletor(){
    return `<select data-mudar="trocarPeriodo" title="Período considerado nos números">
      ${this.PRESETS.map(([v,r]) =>
        `<option value="${v}" ${this.atual === v ? 'selected' : ''}>${r}</option>`).join('')}
    </select>`;
  },
};
acoes({ trocarPeriodo(d, el){
  Periodo.atual = el.value;
  localStorage.setItem('mizys_periodo', el.value);
  render();
}});

/* Data que define "quando o negócio aconteceu": fechamento para ganho/perda,
   criação para o resto. */
const dataDaOp = o => diaDe((['Ganho','Perdido'].includes(o.fase) && (o.fechada_em || o.fecha))
  ? (o.fechada_em || o.fecha) : o.created_at);

/* ════════ DASHBOARD ════════ */
/* ── Os meses do painel ──────────────────────────────────────────────────────
   Doze meses corridos até o atual. Não usa o filtro de período de propósito:
   uma linha do tempo que muda de tamanho conforme o filtro deixa de ser
   comparável entre uma abertura e outra, e o que a diretoria quer ver aqui é
   sempre a mesma janela. */
function _mesesCorridos(n = 12){
  const l = [];
  for(let i = n - 1; i >= 0; i--){
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    l.push({ym:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
            rot:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')});
  }
  return l;
}

/* ── Os três gráficos que a diretoria lê ─────────────────────────────────────
   A régua para escolher foi: o número responde a uma decisão? Receita ganha
   diz se o ano fecha. Proposta emitida contra ganha diz se o problema é falta
   de proposta ou falta de conversão — que são remédios opostos. Margem média
   diz se o crescimento está sendo comprado com desconto, que é o jeito mais
   caro de crescer.

   O que NÃO entrou: número de ligações, leads por origem, ranking de vendedor.
   São indicadores de operação; painel de diretoria com quinze gráficos vira
   parede, e ninguém olha parede. */
function graficosDaDiretoria(){
  const meses = _mesesCorridos(12);
  const ops = DB.list('ops');
  const props = DB.list('propostas');

  /* 1. Receita mensal ganha, pela data de fechamento. */
  const ganho = meses.map(m => ops
    .filter(o => o.fase === 'Ganho' && String(dataDaOp(o)).startsWith(m.ym))
    .reduce((s, o) => s + (+o.valor || 0), 0));
  const iPico = ganho.reduce((mx, v, i) => (v > ganho[mx] ? i : mx), 0);
  const pontosGanho = meses.map((m, i) => ({
    r:m.rot, v:ganho[i],
    nota: ganho[i] > 0 && i === iPico ? 'melhor mês'
        : i === meses.length - 1 ? (ganho[i] > 0 ? 'mês corrente' : 'nada fechado ainda')
        : null,
  }));

  /* 2. Proposta emitida contra proposta ganha, no mesmo eixo — as duas são
        contagem de propostas, então dividem a escala sem mentir. */
  const emitidas = meses.map(m => props.filter(p => String(p.emissao).startsWith(m.ym)).length);
  const ganhas = meses.map(m => props.filter(p =>
    String(p.emissao).startsWith(m.ym) && (p.aceite_em || p.status === 'Aprovada')).length);

  /* 3. Margem média das propostas emitidas no mês. */
  const minima = CFGN('proposta_margem_minima', 8);
  const margens = meses.map(m => {
    const doMes = props.filter(p => String(p.emissao).startsWith(m.ym));
    if(!doMes.length) return 0;
    return doMes.reduce((s, p) => s + calcProposta(p).margem, 0) / doMes.length;
  });
  const iPiorMargem = margens.reduce((mn, v, i) =>
    (v > 0 && (margens[mn] === 0 || v < margens[mn]) ? i : mn), 0);

  const vazio = ganho.every(v => !v) && emitidas.every(v => !v);
  if(vazio) return {propostas:'', margem:'', receita:
    `<div class="card mt"><div class="card-h"><h3>Evolução</h3></div>
     ${emptyState('Ainda não há histórico',
       'Os gráficos aparecem assim que a primeira proposta for emitida.')}</div>`};

  /* Devolve as peças separadas em vez de um bloco pronto: quem monta a tela é
     o dashboard, e a ordem dos gráficos é decisão dele. Proposta emitida contra
     ganha e margem média vêm primeiro porque são as duas que mudam o que se faz
     amanhã — a receita do mês passado já aconteceu. */
  return {
    propostas: `<div class="card"><div class="card-h"><div style="flex:1"><h3>Propostas emitidas e ganhas</h3>
     <p>Se a linha de baixo não acompanha a de cima, o problema é conversão</p></div></div>
    <div class="card-b">${graficoDuasLinhas(
      meses.map((m,i) => ({r:m.rot, v:emitidas[i]})),
      meses.map((m,i) => ({r:m.rot, v:ganhas[i]})),
      'Emitidas', 'Ganhas', v => num(v, 0),
      {titulo:'Propostas emitidas e ganhas', coluna:'Mês'})}</div></div>`,

    margem: `<div class="card"><div class="card-h"><div style="flex:1"><h3>Margem média das propostas</h3>
     <p>Mínima aceitável: ${pctTxt(minima,0)}</p></div></div>
    <div class="card-b">${graficoLinha(
      meses.map((m,i) => ({r:m.rot, v:margens[i],
        nota: margens[i] > 0 && i === iPiorMargem ? 'menor margem' : null})),
      v => pctTxt(v,1),
      {titulo:'Margem média', coluna:'Mês', valor:'Margem', limite:minima,
       limiteRotulo:'mínima ' + pctTxt(minima,0)})}</div></div>`,

    receita: `<div class="card mt"><div class="card-h"><div style="flex:1"><h3>Receita ganha por mês</h3>
     <p>Valor mensal das oportunidades ganhas · 12 meses corridos</p></div></div>
    <div class="card-b">${graficoLinha(pontosGanho, money0,
      {titulo:'Receita ganha por mês', coluna:'Mês', valor:'Ganho'})}</div></div>`,
  };
}

VIEWS.dashboard = function(){
  const ops = DB.list('ops').filter(o => Periodo.contem(dataDaOp(o)));
  const leads = DB.list('leads');
  const fases = OPC('op_fase');
  const abertas = ops.filter(o => !['Ganho','Perdido'].includes(o.fase));
  const pipe = abertas.reduce((s,o) => s + +o.valor, 0);
  const ponderado = abertas.reduce((s,o) => s + +o.valor * (+o.prob||0)/100, 0);
  const ganhas = ops.filter(o => o.fase === 'Ganho');
  const ganho = ganhas.reduce((s,o) => s + +o.valor, 0);
  const fech = ops.filter(o => ['Ganho','Perdido'].includes(o.fase));
  const taxa = fech.length ? Math.round(ganhas.length / fech.length * 100) : 0;
  const props = DB.list('propostas').filter(p => Periodo.contem(p.emissao));
  /* A lista de atividades pendentes saiu do dashboard: ela é a tela de
     Atividades inteira, encolhida em seis linhas, num painel que existe para
     responder "como vai o negócio", não "o que eu faço agora". */

  /* Meta do mês corrente — do usuário, ou de todo mundo para quem gere. */
  const h = new Date();
  const minhas = DB.list('metas').filter(m => m.ano === h.getFullYear() && m.mes === h.getMonth()+1
    && (Sessao.podeGerir() || m.owner === Sessao.nome() || m.owner_id === Sessao.usuario?.id));
  const metaValor = minhas.reduce((s,m) => s + +m.meta_valor, 0);
  const ganhoMes = DB.list('ops').filter(o => o.fase === 'Ganho'
      && String(dataDaOp(o)).startsWith(`${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}`)
      && (Sessao.podeGerir() || o.owner === Sessao.nome()))
    .reduce((s,o) => s + +o.valor, 0);

  const g = graficosDaDiretoria();

  const kpi = (ic, solid, k, v, d, cls) => `<div class="kpi"><div class="kpi-top">
   <div class="kpi-ic${solid ? ' solid' : ''}"><svg viewBox="0 0 24 24">${ic}</svg></div>
   <div class="k">${k}</div></div><div class="v">${v}</div><div class="d ${cls||''}">${d}</div></div>`;

  return `<div class="toolbar">
   <div style="flex:1;font-size:13px;color:var(--muted)">Números de <b>${esc(Periodo.rotulo())}</b></div>
   ${Periodo.seletor()}</div>
  <div class="kpis">
   ${kpi(SVG.mais, true, 'Pipeline aberto', money0(pipe),
      `${abertas.length} oportunidade${abertas.length === 1 ? '' : 's'} · ${money0(ponderado)} ponderado`)}
   ${kpi(SVG.ok, false, 'Ganho no período', money0(ganho),
      `${ganhas.length} negócio${ganhas.length === 1 ? '' : 's'} fechado${ganhas.length === 1 ? '' : 's'}`, 'up')}
   ${kpi(SVG.arquivo, false, 'Propostas', props.length,
      `${props.filter(p => p.status === 'Enviada').length} aguardando retorno`)}
   ${kpi('<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>', false, 'Taxa de conversão',
      taxa + '%', `${ganhas.length} de ${fech.length} fechadas`)}
  </div>

  <div class="card mt"><div class="card-h">
    <div style="flex:1"><h3>Meta de ${esc(new Date().toLocaleDateString('pt-BR',{month:'long'}))}</h3>
     <p>${metaValor > 0
        ? `${money0(ganhoMes)} de ${money0(metaValor)} · ${pctTxt(ganhoMes/metaValor*100, 0)}`
        : 'Nenhuma meta definida para este mês'}</p></div>
    <button class="btn btn-sm" data-acao="formMeta">${metaValor > 0 ? 'Alterar meta' : 'Definir meta'}</button></div>
   ${metaValor > 0 ? `<div class="card-b"><div class="meta-bar">
     <i style="width:${Math.min(ganhoMes/metaValor*100, 100)}%"></i></div></div>` : ''}</div>

  <div class="grid2 mt">${g.propostas}${g.margem}</div>

  <div class="card mt"><div class="card-h"><div style="flex:1"><h3>Funil de vendas</h3>
    <p>Distribuição das oportunidades por fase</p></div>
    <button class="btn btn-sm" data-acao="irPara" data-v="pipeline">Ver pipeline</button></div>
   <div class="card-b">${barraFina(fases.map(f => {
     const l = ops.filter(o => o.fase === f), v = l.reduce((s,o) => s + +o.valor, 0);
     return {r:f, v, txt:`${money0(v)}<small>${l.length} ${l.length === 1 ? 'negócio' : 'negócios'}</small>`};
   }), {vazio:'Sem oportunidades no período'})}</div></div>

  ${g.receita}

  ${(() => {
    const opsP = DB.list('ops').filter(o => Periodo.contem(dataDaOp(o)));
    const owners = [...new Set(opsP.map(o => o.owner).filter(Boolean))];
    const por = owners.map(o => ({o,
      n: opsP.filter(x => x.owner === o).length,
      ganho: opsP.filter(x => x.owner === o && x.fase === 'Ganho').reduce((s,x) => s + +x.valor, 0),
      aberto: opsP.filter(x => x.owner === o && !['Ganho','Perdido'].includes(x.fase)).reduce((s,x) => s + +x.valor, 0),
      perdido: opsP.filter(x => x.owner === o && x.fase === 'Perdido').reduce((s,x) => s + +x.valor, 0),
    })).filter(x => x.n).sort((a,b) => b.ganho - a.ganho);
    if(!por.length) return '';
    const maxO = Math.max(...por.map(x => x.ganho + x.aberto), 1);
    return `<div class="card mt"><div class="card-h"><div style="flex:1"><h3>Desempenho por responsável</h3>
      <p>No período de ${esc(Periodo.rotulo())}</p></div>
      <button class="btn btn-sm" data-acao="exportarDesempenho">Exportar CSV</button></div>
     <table><thead><tr><th>Responsável</th><th>Negócios</th><th>Ganho</th>
      <th>Em aberto</th><th>Perdido</th><th style="width:26%">Ganho e aberto</th></tr></thead><tbody>
     ${por.map(x => `<tr><td><div class="row-flex">${av(x.o)}<span class="cell-main">${esc(x.o)}</span></div></td>
      <td>${x.n}</td>
      <td style="font-weight:700">${money0(x.ganho)}</td>
      <td style="font-weight:700;color:var(--blue)">${money0(x.aberto)}</td>
      <td class="cell-sub">${money0(x.perdido)}</td>
      <td><div class="bfx-t duo"><i style="width:${(x.ganho/maxO*100).toFixed(1)}%"></i>
       <i style="width:${(x.aberto/maxO*100).toFixed(1)}%"></i></div></td></tr>`).join('')}
     </tbody></table></div>`;
  })()}

  <div class="grid2 mt">
   <div class="card"><div class="card-h"><h3 style="flex:1">Propostas recentes</h3>
    <button class="btn btn-sm" data-acao="irPara" data-v="propostas">Ver todas</button></div>
    <table><thead><tr><th>Proposta</th><th>Lead</th><th>Mensal</th><th>Status</th></tr></thead><tbody>
    ${DB.list('propostas').slice(0,5).map(p => { const c = calcProposta(p);
      return `<tr style="cursor:pointer" data-acao="abrirProposta" data-id="${p.id}">
      <td><div class="cell-main">${esc(p.numero)}${p.snapshot ? ' 🔒' : ''}</div>
        <div class="cell-sub">${esc(p.titulo)}</div></td>
      <td class="cell-sub">${esc(leadNome(p.leadId))}</td>
      <td style="font-weight:700">${money0C(c.mensalC)}</td>
      <td>${tagOf(p.status)}</td></tr>`; }).join('')}
    </tbody></table></div>

   <div class="card"><div class="card-h"><h3 style="flex:1">Leads recentes</h3>
    <button class="btn btn-sm" data-acao="irPara" data-v="leads">Ver todos</button></div>
    <table><thead><tr><th>Lead</th><th>Origem</th><th>Status</th></tr></thead><tbody>
    ${leads.slice().sort((a,b) => String(b.criado).localeCompare(String(a.criado))).slice(0,5)
      .map(l => `<tr style="cursor:pointer" data-acao="abrirLead" data-id="${l.id}">
      <td><div class="row-flex">${av(l.empresa)}<div><div class="cell-main">${esc(l.empresa)}</div>
       <div class="cell-sub">${esc(l.contato_nome || '')}</div></div></div></td>
      <td>${tagOf(l.origem)}</td><td>${tagOf(l.status)}</td></tr>`).join('')}
    </tbody></table></div>
  </div>`;
};

/* ════════ PIPELINE ════════ */
/* Quantas perdas o quadro mostra antes de virar cemitério. Perda velha não é
   trabalho em andamento — vira consulta, e consulta é a tela de oportunidades. */
const PERDAS_NO_QUADRO = 8;

VIEWS.pipeline = function(){
  const ops = DB.list('ops');
  /* Perdido sai da varredura das fases e ganha coluna própria no fim: ele não
     é uma etapa por onde o negócio passa, é onde ele para. Sem essa coluna, a
     única forma de marcar perda era abrir o cartão e caçar o botão — e o gesto
     natural, arrastar para fora do funil, não existia. */
  const fases = OPC('op_fase').filter(f => f !== 'Perdido');
  const perdidas = ops.filter(o => o.fase === 'Perdido')
    .sort((a,b) => String(b.fechada_em || b.updated_at || '').localeCompare(
                   String(a.fechada_em || a.updated_at || '')));
  const vPerdido = perdidas.reduce((s,o) => s + +o.valor, 0);

  const cartao = o => `<div class="kcard" draggable="true" data-id="${o.id}"
    data-acao="abrirOp" data-op="${o.id}">
   <b>${esc(o.titulo)}</b><div class="co">${esc(leadNome(o.leadId))}</div>
   <div class="ft"><span class="val">${money0(o.valor)}</span>
    ${o.fase === 'Perdido'
      ? (o.motivo ? `<span class="tag t-gray" title="${esc(o.motivo_obs || '')}">${esc(o.motivo)}</span>` : '')
      : `<span class="tag t-gray">${o.prob}%</span>`}
    ${o.fase_desde ? `<span class="tag t-gray" title="Nesta fase desde ${esc(dth(o.fase_desde))}">${esc(desde(o.fase_desde))}</span>` : ''}
    <div class="av">${esc(ini(o.owner))}</div></div></div>`;

  return `<div class="toolbar"><div style="flex:1"></div>
   <span style="font-size:13px;color:var(--muted)">Arraste os cartões entre as fases</span>
   <button class="btn btn-primary" data-acao="formOp">+ Nova oportunidade</button></div>
  <div class="kanban">${fases.map(f => {
   const l = ops.filter(o => o.fase === f), v = l.reduce((s,o) => s + +o.valor, 0);
   return `<div class="col" data-fase="${esc(f)}"><div class="col-h"><b>${esc(f)}</b>
    <span class="n">${l.length}</span><span class="sum">${money0(v)}</span></div>
    ${l.map(cartao).join('')}
   </div>`; }).join('')}

   <div class="col perda" data-fase="Perdido"><div class="col-h"><b>Perdido</b>
    <span class="n">${perdidas.length}</span><span class="sum">${money0(vPerdido)}</span></div>
    ${perdidas.slice(0, PERDAS_NO_QUADRO).map(cartao).join('')}
    ${perdidas.length > PERDAS_NO_QUADRO
      ? `<button class="btn btn-sm" style="width:100%;justify-content:center"
          data-acao="verPerdidas">+ ${perdidas.length - PERDAS_NO_QUADRO} mais</button>`
      : ''}
    ${perdidas.length ? '' : `<div class="col-vazia">Arraste para cá o que não fechou.
      O motivo é o que faz a perda virar informação.</div>`}
   </div></div>`;
};

acoes({ verPerdidas(){ go('oportunidades', {fase:'Perdido'}); } });

function bindKanban(){
  let arrastado = null;
  $$('.kcard').forEach(c => {
    c.ondragstart = () => { arrastado = c; c.classList.add('dragging'); };
    c.ondragend = () => { c.classList.remove('dragging');
      $$('.col').forEach(x => x.classList.remove('over')); };
  });
  $$('.col').forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async e => {
      e.preventDefault(); col.classList.remove('over');
      if(!arrastado) return;
      const fase = col.dataset.fase, id = +arrastado.dataset.id;
      /* Ganho e Perdido pedem motivo (3.5): fase final sem motivo é um relatório
         de perdas que nunca vai existir. */
      if(['Ganho','Perdido'].includes(fase)){ formDesfecho(id, fase); return; }
      await DB.upd('ops', id, {fase, prob:OPC_NUM('op_fase', fase)});
      toast('Movido para ' + fase); render();
    };
  });
}

/* ════════ OPORTUNIDADES ════════ */
VIEWS.oportunidades = function(){
  const q = semAcento(state.q || ''), ff = state.fase || '';
  const l = DB.list('ops').filter(o =>
    (!q || semAcento(o.titulo).includes(q) || semAcento(leadNome(o.leadId)).includes(q))
    && (!ff || o.fase === ff));
  const tot = l.reduce((s,o) => s + +o.valor, 0);
  const pond = l.reduce((s,o) => s + +o.valor * (+o.prob||0)/100, 0);
  return `<div class="toolbar">
   ${barraBusca('Buscar negócio ou lead…')}
   <select data-mudar="filtrar" data-campo="fase"><option value="">Todas as fases</option>
    ${optsLista('op_fase', ff)}</select>
   <button class="btn" data-acao="exportarOps">Exportar CSV</button>
   <button class="btn btn-primary" data-acao="formOp">+ Nova oportunidade</button></div>
  <div class="kpis" style="margin-bottom:16px">
   <div class="kpi"><div class="k">Total listado</div><div class="v">${money0(tot)}</div>
    <div class="d">${l.length} negócio${l.length === 1 ? "" : "s"}</div></div>
   <div class="kpi"><div class="k">Previsão ponderada</div><div class="v">${money0(pond)}</div>
    <div class="d">Valor × probabilidade</div></div></div>
  <div class="card">${l.length ? `<table><thead><tr><th>Negócio</th><th>Lead</th><th>Valor</th>
   <th>Prob.</th><th>Fase</th><th>Na fase há</th><th>Previsão</th><th></th></tr></thead><tbody>
  ${l.map(o => `<tr><td class="cell-main">${esc(o.titulo)}</td>
   <td>${esc(leadNome(o.leadId))}</td>
   <td style="font-weight:700">${money0(o.valor)}</td><td>${o.prob}%</td>
   <td>${tagOf(o.fase)}${o.motivo ? `<div class="cell-sub">${esc(o.motivo)}</div>` : ''}</td>
   <td class="cell-sub">${esc(desde(o.fase_desde) || '—')}</td>
   <td class="cell-sub">${dt(o.fecha)}</td>
   <td style="text-align:right;white-space:nowrap">
    <button class="btn btn-sm" data-acao="propostaDeOp" data-id="${o.id}">Gerar proposta</button>
    <button class="btn btn-sm" data-acao="abrirOp" data-op="${o.id}">Abrir</button>
    ${btnExcluir('ops', o.id, 'Oportunidade')}</td></tr>`).join('')}
  </tbody></table>${pager('ops', l.length)}` : emptyState('Nenhuma oportunidade','')}</div>`;
};

/* ════════ LEADS ════════ */

/* ── O estágio comercial do lead ─────────────────────────────────────────────
   "Este lead virou cliente?" era uma pergunta que só se respondia abrindo a
   aba de contratos e olhando. Agora ela é uma etiqueta, e a etiqueta é
   DEDUZIDA do que existe no banco — não é mais um campo que alguém precisa
   lembrar de mudar depois de fechar o negócio. Campo manual de conversão
   envelhece na primeira semana corrida: o contrato entra no sistema e o lead
   fica "Em negociação" para sempre.

   A ordem abaixo é a do funil, de trás para a frente: a primeira que bater é
   a que vale. Contrato ativo manda mais que proposta aceita, que manda mais
   que proposta enviada.

   `status` continua existindo e continua sendo do vendedor — ele diz o que a
   PESSOA acha do lead (Contatado, Qualificado, Desqualificado). O estágio diz
   o que os DOCUMENTOS provam. Os dois juntos contam a história inteira. */
function estagioLead(leadId){
  const id = +leadId;
  const prs = DB.list('propostas').filter(p => +p.leadId === id);
  const cts = DB.list('contratos').filter(c => +c.leadId === id);

  const vivo = cts.find(c => ['Ativo','Em implantação'].includes(c.status));
  if(vivo) return {k:'cliente', r:'Cliente', tag:'t-green',
                   d:'contrato ' + (vivo.numero || '') + ' ' + String(vivo.status).toLowerCase(),
                   v:'contratos', id:vivo.id};
  if(cts.length){
    const c = cts[0];
    return {k:'ex', r:'Ex-cliente', tag:'t-red',
            d:'contrato ' + (c.numero || '') + ' ' + String(c.status).toLowerCase(),
            v:'contratos', id:c.id};
  }
  const ganha = prs.find(p => p.aceite_em) || prs.find(p => p.status === 'Aprovada');
  if(ganha) return {k:'convertido', r:'Convertido', tag:'t-green',
                    d:'proposta ' + (ganha.numero || '') + (ganha.aceite_em ? ' aceita pelo cliente' : ' aprovada')
                      + ' — falta gerar o contrato',
                    v:'propostas', id:ganha.id};
  const aberta = prs.find(p => ['Enviada','Em análise'].includes(p.status));
  if(aberta) return {k:'proposta', r:'Em proposta', tag:'t-blue',
                     d:'proposta ' + (aberta.numero || '') + ' ' + String(aberta.status).toLowerCase(),
                     v:'propostas', id:aberta.id};
  if(prs.some(p => p.status === 'Recusada') && prs.every(p => p.status === 'Recusada'))
    return {k:'recusado', r:'Proposta recusada', tag:'t-red',
            d:prs.length + (prs.length > 1 ? ' propostas recusadas' : ' proposta recusada')};
  if(prs.length) return {k:'rascunho', r:'Proposta em rascunho', tag:'t-gray',
                         d:prs.length + (prs.length > 1 ? ' propostas' : ' proposta') + ' sem envio'};
  return null;   /* ainda é só um lead: nenhum documento existe */
}

/* Os estágios na ordem do funil, para o filtro da lista. */
const ESTAGIOS_FILTRO = [
  ['cliente','Clientes'], ['convertido','Convertidos'], ['proposta','Em proposta'],
  ['rascunho','Só rascunho'], ['recusado','Proposta recusada'], ['ex','Ex-clientes'],
  ['nenhum','Sem proposta'],
];

/* A etiqueta do estágio. Some quando não há estágio nenhum — lead recém-criado
   não precisa de um selo dizendo "nada aconteceu ainda". */
function selaEstagio(leadId){
  const e = estagioLead(leadId);
  return e ? `<span class="tag ${e.tag}">${esc(e.r)}</span>` : '';
}

/* ── Propostas de um lead, com a margem ──────────────────────────────────────
   A margem é o número que decide se valeu a pena, e ela não estava em lugar
   nenhum fora do editor da proposta. Aqui ela aparece ao lado do status: dá
   para varrer a lista e ver que a proposta aceita foi a de margem menor.

   Abaixo do mínimo configurado (Configurações > proposta_margem_minima) o
   número vira etiqueta — é o único tratamento de alerta da tabela, então não
   se perde no meio. */
function tabelaPropostasDoLead(prs, compacta, limite){
  if(!prs.length) return emptyState('Sem propostas',
    compacta ? '' : 'Monte a primeira proposta para este lead.');
  const minima = CFGN('proposta_margem_minima', 8);
  /* Ordena e SÓ ENTÃO corta: no resumo aparecem as mais recentes, não as
     primeiras que o banco devolveu. */
  const todas = prs.slice().sort((a,b) => String(b.emissao||'').localeCompare(String(a.emissao||'')));
  const linhas = limite ? todas.slice(0, limite) : todas;
  return `<table><thead><tr><th>Número</th>${compacta ? '' : '<th>Título</th>'}
   <th>Emissão</th><th>Mensal</th><th>Margem</th><th>Status</th><th></th></tr></thead><tbody>
  ${linhas.map(p => {
    const c = calcProposta(p);
    const baixa = c.margem < minima;
    return `<tr>
    <td><div class="cell-main">${esc(p.numero)}${p.snapshot ? ' 🔒' : ''}</div>
     ${p.aceite_em ? '<div class="cell-sub">aceita pelo cliente</div>' : ''}</td>
    ${compacta ? '' : `<td class="cell-sub">${esc(p.titulo || '—')}</td>`}
    <td class="cell-sub">${dt(p.emissao)}</td>
    <td style="font-weight:700;white-space:nowrap">${money0C(c.mensalC)}</td>
    <td style="white-space:nowrap">${baixa
      ? `<span class="tag t-red">${num(c.margem, 1)}%</span>`
      : `<b>${num(c.margem, 1)}%</b>`}
     <div class="cell-sub">${money0C(c.lucroC)}/mês</div></td>
    <td>${tagOf(p.status)}</td>
    <td style="text-align:right"><button class="btn btn-sm" data-acao="abrirProposta"
      data-id="${p.id}">Abrir</button></td></tr>`;
  }).join('')}
  </tbody><tfoot><tr>
   <td colspan="${compacta ? 2 : 3}" class="cell-sub">${todas.length}
    ${todas.length > 1 ? 'propostas' : 'proposta'}${linhas.length < todas.length
      ? ` · mostrando as ${linhas.length} mais recentes` : ''} · margem mínima ${num(minima, 1)}%</td>
   <td style="font-weight:700">${money0C(todas.reduce((s,p) => s + calcProposta(p).mensalC, 0))}</td>
   <td colspan="3" class="cell-sub">soma de todas</td>
  </tr></tfoot></table>`;
}

VIEWS.leads = function(){
  const q = semAcento(state.q || ''), fs = state.status || '', fo = state.owner || '';
  const fe = state.estagio || '';
  const l = DB.list('leads').filter(x =>
    (!q || semAcento(x.empresa).includes(q) || semAcento(x.contato_nome).includes(q)
        || soDigitos(x.cnpj).includes(soDigitos(q)) && soDigitos(q))
    && (!fs || x.status === fs) && (!fo || x.owner === fo)
    && (!fe || (estagioLead(x.id) || {k:'nenhum'}).k === fe));
  return `<div class="toolbar">
   ${barraBusca('Buscar empresa, contato ou CNPJ…')}
   <select data-mudar="filtrar" data-campo="status"><option value="">Todos os status</option>
    ${optsLista('lead_status', fs)}</select>
   <select data-mudar="filtrar" data-campo="owner"><option value="">Todos os responsáveis</option>
    ${optsLista('owner', fo)}</select>
   <select data-mudar="filtrar" data-campo="estagio"><option value="">Todos os estágios</option>
    ${ESTAGIOS_FILTRO.map(([k, r]) => `<option value="${k}" ${fe === k ? 'selected' : ''}>${r}</option>`).join('')}</select>
   <button class="btn" data-acao="exportarLeads">Exportar</button>
   <button class="btn" data-acao="importarLeads">Importar</button>
   <button class="btn btn-primary" data-acao="formLead">+ Novo lead</button></div>
  <div class="card">${l.length ? `<table><thead><tr><th>Empresa / contato</th><th>E-mail</th>
   <th>Telefone</th><th>Origem</th><th>Valor est.</th><th>Status</th><th>Estágio</th>
   <th></th></tr></thead><tbody>
   ${l.map(x => `<tr><td><div class="row-flex">${av(x.empresa)}<div>
    <div class="cell-main">${esc(x.empresa)}</div>
    <div class="cell-sub">${esc(x.contato_nome || '—')}${x.contato_cargo ? ' · ' + esc(x.contato_cargo) : ''}</div></div></div></td>
    <td class="cell-sub">${esc(x.contato_email || '—')}</td>
    <td class="cell-sub">${esc(x.contato_telefone || '—')}</td>
    <td>${tagOf(x.origem)}</td>
    <td style="font-weight:700">${money0(x.valor)}</td>
    <td>${tagOf(x.status)}${x.motivo ? `<div class="cell-sub">${esc(x.motivo)}</div>` : ''}</td>
    <td>${selaEstagio(x.id) || '<span class="cell-sub">—</span>'}</td>
    <td style="text-align:right;white-space:nowrap">
     <button class="btn btn-sm" data-acao="abrirLead" data-id="${x.id}">Abrir</button>
     <button class="btn btn-sm" data-acao="novaProposta" data-lead="${x.id}">Proposta</button>
     <button class="btn btn-sm" data-acao="formLead" data-id="${x.id}">Editar</button></td></tr>`).join('')}
  </tbody></table>${pager('leads', l.length)}`
   : emptyState('Nenhum lead','Cadastre a empresa e o contato principal.')}</div>`;
};

VIEWS.leadDetalhe = function(){
  const l = DB.get('leads', state.id);
  if(!l) return emptyState('Lead não encontrado','');
  const t = state.tab || 'resumo';
  const cts = contatosLead(l.id);
  const ops = DB.list('ops').filter(o => +o.leadId === l.id);
  const prs = DB.list('propostas').filter(p => +p.leadId === l.id);
  const cts2 = DB.list('contratos').filter(c => +c.leadId === l.id);
  const estagio = estagioLead(l.id);
  const dups = duplicadosDeLead(l);
  const aba = (k, r, n) => `<button class="${t === k ? 'active' : ''}" data-acao="trocarAba"
    data-tab="${k}">${r}${n !== undefined ? ` <span class="tag t-gray">${n}</span>` : ''}</button>`;

  return `<button class="btn btn-sm" data-acao="irPara" data-v="leads" style="margin-bottom:16px">← Voltar</button>
  ${dups.length ? `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Possível duplicidade: <b>${dups.map(d => esc(d.empresa)).join(', ')}</b>
      ${dups.some(d => soDigitos(d.cnpj) && soDigitos(d.cnpj) === soDigitos(l.cnpj))
        ? 'com o mesmo CNPJ' : 'com nome parecido'}.</span>
    <button class="btn btn-sm" data-acao="abrirLead" data-id="${dups[0].id}">Ver o outro</button></div>` : ''}
  <div class="card"><div class="card-b"><div class="detail-head">${av(l.empresa)}
   <div style="flex:1"><h2>${esc(l.empresa)}</h2>
    <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
     ${selaEstagio(l.id)}${tagOf(l.status)}
     ${tagOf(l.origem)}<span class="tag t-gray">${esc(CFG('segmento',''))}</span>
     ${l.owner ? `<span class="tag t-purple">${esc(l.owner)}</span>` : ''}</div>
    ${estagio ? `<div class="cell-sub" style="margin-top:5px">${esc(estagio.d)}</div>` : ''}</div>
   <button class="btn btn-primary" data-acao="novaProposta" data-lead="${l.id}">Nova proposta</button>
   <button class="btn" data-acao="formLead" data-id="${l.id}">Editar</button></div>
   <div class="dl">
    <div class="it"><b>CNPJ</b><span>${esc(l.cnpj || '—')}</span></div>
    <div class="it"><b>Site</b><span>${esc(l.site || '—')}</span></div>
    <div class="it"><b>Endereço</b><span>${esc(l.endereco || '—')}</span></div>
    <div class="it"><b>Cidade</b><span>${esc(l.cidade || '—')}${l.uf ? '/' + esc(l.uf) : ''}</span></div>
    <div class="it"><b>Contato principal</b><span>${esc(l.contato_nome || '—')}${l.contato_cargo ? ' · ' + esc(l.contato_cargo) : ''}</span></div>
    <div class="it"><b>E-mail</b><span>${esc(l.contato_email || '—')}</span></div>
    <div class="it"><b>Telefones</b><span>${esc(l.contato_telefone || '—')}${l.contato_telefone2 ? ' / ' + esc(l.contato_telefone2) : ''}</span></div>
    <div class="it"><b>Responsável</b><span>${esc(l.owner || '—')}</span></div>
    ${l.motivo ? `<div class="it"><b>Motivo da desqualificação</b><span>${esc(l.motivo)}${l.motivo_obs ? ' — ' + esc(l.motivo_obs) : ''}</span></div>` : ''}
    <div class="it"><b>Observações</b><span>${esc(l.obs || '—')}</span></div>
   </div></div></div>

  <div class="tabs mt">${aba('resumo','Resumo')}${aba('historico','Histórico e notas')}
   ${aba('propostas','Propostas', prs.length)}${aba('contratos','Contratos', cts2.length)}</div>

  ${t === 'historico' ? `<div class="card">${blocoHistorico('Lead', l.id, l.id)}</div>`
  : t === 'propostas' ? `<div class="card"><div class="card-h"><h3 style="flex:1">Propostas deste lead</h3>
     <button class="btn btn-sm btn-primary" data-acao="novaProposta" data-lead="${l.id}">+ Nova proposta</button></div>
     ${tabelaPropostasDoLead(prs, false)}</div>`
  : t === 'contratos' ? `<div class="card">${cts2.length ? `<table><thead><tr>
     <th>Contrato</th><th>Vigência</th><th>Mensal</th><th>Status</th><th></th></tr></thead><tbody>
     ${cts2.map(c => `<tr><td class="cell-main">${esc(c.numero)}</td>
      <td class="cell-sub">${dt(c.inicio)} — ${dt(c.fim)}</td>
      <td style="font-weight:700">${money0(c.valor_mensal)}</td><td>${tagOf(c.status)}</td>
      <td style="text-align:right"><button class="btn btn-sm" data-acao="abrirContrato" data-id="${c.id}">Abrir</button></td>
      </tr>`).join('')}</tbody></table>`
     : emptyState('Sem contratos','Ganhe uma proposta para gerar o contrato.')}</div>`
  : `<div class="card"><div class="card-h">
    <h3 style="flex:1">Propostas${prs.length ? ` <span class="tag t-gray">${prs.length}</span>` : ''}</h3>
    ${prs.length > 1 ? `<button class="btn btn-sm" data-acao="trocarAba" data-tab="propostas">Ver todas</button>` : ''}
    <button class="btn btn-sm btn-primary" data-acao="novaProposta" data-lead="${l.id}">+ Nova proposta</button></div>
   ${tabelaPropostasDoLead(prs, true, 5)}</div>

  <div class="grid2 mt">
   <div class="card"><div class="card-h"><h3 style="flex:1">Contatos</h3>
    <button class="btn btn-sm" data-acao="formContato" data-lead="${l.id}">+ Contato</button></div>
    ${cts.length ? `<table><tbody>${cts.map(x => `<tr><td><div class="row-flex">${av(x.nome)}
     <div><div class="cell-main">${esc(x.nome)}${x.principal ? ' <span class="tag t-blue">principal</span>' : ''}</div>
     <div class="cell-sub">${esc(x.cargo || '—')}</div></div></div></td>
     <td class="cell-sub">${esc(x.email || '—')}<br>${esc(x.telefone || '')}</td>
     <td style="text-align:right"><button class="btn btn-sm" data-acao="formContato" data-id="${x.id}">Editar</button></td></tr>`).join('')}
    </tbody></table>` : emptyState('Sem contatos adicionais','')}</div>
   <div class="card"><div class="card-h"><h3 style="flex:1">Oportunidades</h3>
    <button class="btn btn-sm" data-acao="formOp" data-lead="${l.id}">+ Oportunidade</button></div>
    ${ops.length ? `<table><tbody>${ops.map(o => `<tr>
     <td class="cell-main">${esc(o.titulo)}</td><td style="font-weight:700">${money0(o.valor)}</td>
     <td>${tagOf(o.fase)}</td><td class="cell-sub">${dt(o.fecha)}</td></tr>`).join('')}
    </tbody></table>` : emptyState('Sem oportunidades','')}</div>
  </div>
  <div class="card mt"><div class="card-h"><h3 style="flex:1">Atividades</h3>
    <button class="btn btn-sm" data-acao="formAtiv" data-reftipo="Lead" data-refid="${l.id}">+ Atividade</button></div>
   ${(() => { const at = DB.list('ativs').filter(a => a.refTipo === 'Lead' && +a.refId === l.id);
     return at.length ? `<table><tbody>${at.map(a => `<tr>
      <td><input type="checkbox" ${a.feito ? 'checked' : ''} data-mudar="alternarAtiv" data-id="${a.id}"
        style="width:17px;height:17px;accent-color:var(--accent-600)"></td>
      <td class="cell-main ${a.feito ? 'done' : ''}">${esc(a.titulo)}</td>
      <td>${tagOf(a.tipo)}</td><td class="cell-sub">${dt(a.data)} ${esc(a.hora||'')}</td></tr>`).join('')}
     </tbody></table>` : emptyState('Sem atividades',''); })()}</div>`}`;
};

/* ════════ CONTATOS ════════ */
VIEWS.contatos = function(){
  const q = semAcento(state.q || '');
  const l = DB.list('contatos').filter(c => !q || semAcento(c.nome).includes(q)
    || semAcento(leadNome(c.leadId)).includes(q) || semAcento(c.email).includes(q));
  return `<div class="toolbar">
   ${barraBusca('Buscar contato, lead ou e-mail…')}
   <button class="btn" data-acao="exportarContatos">Exportar CSV</button>
   <button class="btn btn-primary" data-acao="formContato">+ Novo contato</button></div>
  <div class="card">${l.length ? `<table><thead><tr><th>Contato</th><th>Lead</th><th>E-mail</th>
   <th>Telefone</th><th></th></tr></thead><tbody>
  ${l.map(c => `<tr><td><div class="row-flex">${av(c.nome)}<div>
   <div class="cell-main">${esc(c.nome)}${c.principal ? ' <span class="tag t-blue">principal</span>' : ''}</div>
   <div class="cell-sub">${esc(c.cargo || '—')}</div></div></div></td>
   <td><button class="btn btn-sm" data-acao="abrirLead" data-id="${c.leadId}">${esc(leadNome(c.leadId))}</button></td>
   <td class="cell-sub">${esc(c.email || '—')}</td>
   <td class="cell-sub">${esc(c.telefone || '—')}</td>
   <td style="text-align:right;white-space:nowrap">
    <button class="btn btn-sm" data-acao="formContato" data-id="${c.id}">Editar</button>
    ${btnExcluir('contatos', c.id, 'Contato')}</td></tr>`).join('')}
  </tbody></table>` : emptyState('Nenhum contato','')}</div>`;
};

/* ════════ ATIVIDADES ════════ */
VIEWS.atividades = function(){
  const show = state.show || 'pendentes';
  let l = DB.list('ativs').slice().sort((a,b) =>
    (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
  if(show === 'pendentes') l = l.filter(a => !a.feito);
  if(show === 'concluidas') l = l.filter(a => a.feito);
  if(show === 'atrasadas') l = l.filter(a => !a.feito && a.data < hoje());
  const rotuloRef = a => {
    if(!a.refTipo || !a.refId) return '—';
    if(a.refTipo === 'Lead') return leadNome(a.refId);
    if(a.refTipo === 'Oportunidade') return DB.get('ops', a.refId)?.titulo || '—';
    if(a.refTipo === 'Proposta') return DB.get('propostas', a.refId)?.numero || '—';
    if(a.refTipo === 'Contrato') return DB.get('contratos', a.refId)?.numero || '—';
    return '—';
  };
  return `<div class="toolbar"><div class="tabs" style="margin:0;border:none">
   ${[['pendentes','Pendentes'],['atrasadas','Atrasadas'],['concluidas','Concluídas'],['todas','Todas']]
     .map(([k,t]) => `<button class="${show === k ? 'active' : ''}" data-acao="trocarShow" data-show="${k}">${t}</button>`).join('')}</div>
   <div style="flex:1"></div>
   <button class="btn btn-primary" data-acao="formAtiv">+ Nova atividade</button></div>
  <div class="card">${l.length ? `<table><thead><tr><th style="width:44px"></th><th>Atividade</th>
   <th>Tipo</th><th>Relacionado a</th><th>Data</th><th>Responsável</th><th></th></tr></thead><tbody>
  ${l.map(a => `<tr><td><input type="checkbox" ${a.feito ? 'checked' : ''}
    style="width:17px;height:17px;accent-color:var(--accent-600)"
    data-mudar="alternarAtiv" data-id="${a.id}"></td>
   <td class="cell-main ${a.feito ? 'done' : ''}">${esc(a.titulo)}
     ${a.recorrencia && a.recorrencia !== 'nenhuma' ? `<span class="tag t-purple">repete ${esc(a.recorrencia)}</span>` : ''}</td>
   <td>${tagOf(a.tipo)}</td>
   <td class="cell-sub">${esc(a.refTipo || '')} ${esc(rotuloRef(a))}</td>
   <td>${dt(a.data)} ${esc(a.hora || '')}${!a.feito && a.data < hoje() ? ' <span class="tag t-red">atrasada</span>' : ''}</td>
   <td class="cell-sub">${esc(a.owner || '—')}</td>
   <td style="text-align:right;white-space:nowrap">
    <button class="btn btn-sm" data-acao="formAtiv" data-id="${a.id}">Editar</button>
    ${btnExcluir('ativs', a.id, 'Atividade')}</td></tr>`).join('')}
  </tbody></table>${pager('ativs', l.length)}` : emptyState('Nenhuma atividade','')}</div>`;
};

/* ════════ RELATÓRIOS ════════ */
/* A tela de relatórios saiu. Ela e o painel de indicadores mostravam recortes
   do mesmo dado, e obrigavam a escolher onde procurar antes de procurar — o
   funil aparecia nas duas, a receita numa, a margem na outra. Agora é uma tela
   só: VIEWS.dashboard. As funções de relatório que ainda serviam viraram parte
   dela; o resto foi embora com o arquivo. */

/* ── ações desta tela ── */
acoes({
  trocarAba(d){ state.tab = d.tab; render(); },
  trocarShow(d){ state.show = d.show; render(); },
  trocarAnoMeta(d, el){ state.metaAno = +el.value; render(); },
  abrirLead(d){ go('leadDetalhe', {id:+d.id}); },
  /* "Abrir" agora leva à tela de CONFERÊNCIA, não ao editor. É o gesto certo
     por padrão: quase toda vez que alguém abre uma proposta é para olhar, e
     abrir direto no editor deixa dezenas de campos editáveis debaixo do cursor
     de quem só queria ver o valor. Quem vai mexer clica em Editar. */
  abrirProposta(d){ go('propostaResumo', {id:+d.id}); },
  editarProposta(d){ go('propostaEditor', {id:+d.id}); },
  verResumo(d){ go('propostaResumo', {id:+d.id}); },
  abrirContrato(d){ go('contratoDetalhe', {id:+d.id}); },
  /* `data-tab` é opcional e retrocompatível: sem ele o comportamento é o de
     sempre. Com ele dá para mandar alguém direto na aba certa — a faixa de
     pedidos de acesso precisa abrir Configurações JÁ em Usuários, senão o
     atalho larga a pessoa numa tela de parâmetros. */
  irPara(d){ go(d.v, d.tab ? {tab:d.tab} : {}); },

  async alternarAtiv(d){
    const a = DB.get('ativs', d.id);
    if(!a) return;
    const feito = !a.feito;
    await DB.upd('ativs', d.id, {feito, feito_em: feito ? agoraISO() : null});
    /* Recorrente concluída gera a próxima ocorrência — senão "repete semanal"
       seria só um rótulo bonito. */
    if(feito && a.recorrencia && a.recorrencia !== 'nenhuma'){
      const dias = OPC_NUM('ativ_recorrencia', a.recorrencia) || 7;
      const nova = {...a, data:somaDias(a.data, dias), feito:false, feito_em:null};
      delete nova.id; delete nova.created_at; delete nova.updated_at;
      await DB.add('ativs', nova);
      toast(`Concluída — próxima agendada para ${dt(somaDias(a.data, dias))}`);
    } else {
      toast(feito ? 'Concluída' : 'Reaberta');
    }
    render();
  },

  /* ── CSV ── */
  exportarLeads(){
    exportarCSV('leads.csv', DB.list('leads'), [
      {campo:'empresa', rotulo:'Empresa'}, {campo:'cnpj', rotulo:'CNPJ'},
      {campo:'endereco', rotulo:'Endereço'}, {campo:'cidade', rotulo:'Cidade'},
      {campo:'uf', rotulo:'UF'}, {campo:'site', rotulo:'Site'},
      {campo:'contato_nome', rotulo:'Contato'}, {campo:'contato_cargo', rotulo:'Cargo'},
      {campo:'contato_email', rotulo:'E-mail'}, {campo:'contato_telefone', rotulo:'Telefone'},
      {campo:'origem', rotulo:'Origem'}, {campo:'status', rotulo:'Status'},
      {campo:'valor', rotulo:'Valor estimado'}, {campo:'owner', rotulo:'Responsável'},
      {campo:'criado', rotulo:'Criado em'}, {campo:'obs', rotulo:'Observações'},
    ]);
  },
  exportarContatos(){
    exportarCSV('contatos.csv', DB.list('contatos'), [
      {campo:'nome', rotulo:'Nome'}, {campo:'cargo', rotulo:'Cargo'},
      {rotulo:'Lead', valor:c => leadNome(c.leadId)},
      {campo:'email', rotulo:'E-mail'}, {campo:'telefone', rotulo:'Telefone'},
      {campo:'telefone2', rotulo:'Telefone 2'},
      {rotulo:'Principal', valor:c => c.principal ? 'sim' : 'não'},
    ]);
  },
  exportarOps(){
    exportarCSV('oportunidades.csv', DB.list('ops'), [
      {campo:'titulo', rotulo:'Negócio'}, {rotulo:'Lead', valor:o => leadNome(o.leadId)},
      {campo:'valor', rotulo:'Valor'}, {campo:'fase', rotulo:'Fase'},
      {campo:'prob', rotulo:'Probabilidade'}, {campo:'fecha', rotulo:'Previsão'},
      {campo:'owner', rotulo:'Responsável'}, {campo:'motivo', rotulo:'Motivo'},
      {campo:'motivo_obs', rotulo:'Detalhe do motivo'},
    ]);
  },
  exportarDesempenho(){
    const ops = DB.list('ops').filter(o => Periodo.contem(dataDaOp(o)));
    const owners = [...new Set(ops.map(o => o.owner).filter(Boolean))];
    exportarCSV('desempenho.csv', owners.map(o => ({
      owner:o,
      negocios: ops.filter(x => x.owner === o).length,
      ganho: ops.filter(x => x.owner === o && x.fase === 'Ganho').reduce((s,x) => s + +x.valor, 0),
      perdido: ops.filter(x => x.owner === o && x.fase === 'Perdido').reduce((s,x) => s + +x.valor, 0),
      aberto: ops.filter(x => x.owner === o && !['Ganho','Perdido'].includes(x.fase)).reduce((s,x) => s + +x.valor, 0),
    })), [
      {campo:'owner', rotulo:'Responsável'}, {campo:'negocios', rotulo:'Negócios'},
      {campo:'ganho', rotulo:'Ganho'}, {campo:'perdido', rotulo:'Perdido'},
      {campo:'aberto', rotulo:'Em aberto'},
    ]);
  },
  exportarPropostas(){
    exportarCSV('propostas.csv', DB.list('propostas'), [
      {campo:'numero', rotulo:'Número'}, {campo:'titulo', rotulo:'Título'},
      {rotulo:'Lead', valor:p => leadNome(p.leadId)}, {campo:'status', rotulo:'Status'},
      {campo:'emissao', rotulo:'Emissão'},
      {rotulo:'Mensal', valor:p => (calcProposta(p).mensalC / 100).toFixed(2).replace('.',',')},
      {rotulo:'Margem %', valor:p => calcProposta(p).margem.toFixed(2).replace('.',',')},
      {rotulo:'Congelada', valor:p => p.snapshot ? 'sim' : 'não'},
    ]);
  },

  importarLeads(){
    modalImportar('Importar leads',
      'empresa (obrigatório); cnpj; endereco; cidade; uf; site; contato_nome; ' +
      'contato_cargo; contato_email; contato_telefone; origem; status; valor; owner; obs',
      'processarImportLeads');
  },
  processarImportLeads(){
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,text/csv';
    inp.onchange = async () => {
      const f = inp.files[0]; if(!f) return;
      const linhas = lerCSV(await f.text());
      const alvo = $('#previaImport');
      if(!linhas.length){ alvo.innerHTML = '<p style="color:var(--muted)">Arquivo vazio.</p>'; return; }

      /* Aceita cabeçalho em português com ou sem acento. */
      const norm = o => {
        const m = {};
        Object.entries(o).forEach(([k,v]) => m[semAcento(k).replace(/[^a-z0-9]+/g,'_')] = v);
        return {
          empresa: m.empresa || m.razao_social || m.nome || '',
          cnpj: m.cnpj || '', endereco: m.endereco || '', cidade: m.cidade || '',
          uf: (m.uf || m.estado || '').toUpperCase().slice(0,2), site: m.site || '',
          contato_nome: m.contato_nome || m.contato || '',
          contato_cargo: m.contato_cargo || m.cargo || '',
          contato_email: m.contato_email || m.email || '',
          contato_telefone: m.contato_telefone || m.telefone || '',
          origem: m.origem || OPC('lead_origem')[0] || '',
          status: m.status || OPC('lead_status')[0] || 'Novo',
          valor: parseFloat(String(m.valor || '0').replace(/\./g,'').replace(',','.')) || 0,
          owner: m.owner || m.responsavel || Sessao.nome(),
          obs: m.obs || m.observacoes || '', criado: hoje(),
        };
      };
      const registros = linhas.map(norm).filter(r => r.empresa);
      const novos = [], duplicados = [];
      registros.forEach(r => (duplicadosDeLead(r).length ? duplicados : novos).push(r));

      alvo.innerHTML = `<div class="readbox">
        <b>Prévia</b>${registros.length} linhas com empresa preenchida ·
        <b style="color:var(--blue)">${novos.length}</b> novos ·
        ${duplicados.length} já existentes (serão ignorados)
        ${duplicados.length ? `<div class="cell-sub" style="margin-top:6px">Ignorados:
          ${duplicados.slice(0,8).map(d => esc(d.empresa)).join(', ')}${duplicados.length > 8 ? '…' : ''}</div>` : ''}
       </div>
       <button class="btn btn-primary" style="margin-top:12px;width:100%;justify-content:center"
        data-acao="gravarImportLeads" ${novos.length ? '' : 'disabled'}>Importar ${novos.length} leads</button>`;
      window.__importLeads = novos;
    };
    inp.click();
  },
  async gravarImportLeads(){
    const novos = window.__importLeads || [];
    let ok = 0, falhas = 0;
    for(const r of novos){
      try{ await DB.add('leads', r); ok++; }catch(e){ falhas++; }
    }
    window.__importLeads = null;
    closeModal();
    toast(`${ok} leads importados${falhas ? ` · ${falhas} falharam` : ''}`);
    render();
  },
});
