/* ════════════════════════════════════════════════════════════════════════════
   CADASTROS — convenções, escalas, turnos, equipamentos, parâmetros, usuários.
   ════════════════════════════════════════════════════════════════════════════ */

/* Aviso padrão de quem não pode editar catálogo. Botão escondido não é
   permissão — quem barra é a RLS —, mas explicar é melhor que sumir. */
const soGestor = () => Sessao.podeGerir();
const avisoLeitura = () => soGestor() ? '' : `<div class="faixa">${ico('cadeado')}
  <span class="sp">Você entra como <b>${esc(Sessao.papel())}</b>: os cadastros
  ficam em modo leitura. Peça a um gestor para alterar.</span></div>`;

/* ════════ BASE TRABALHISTA — convenções, escalas e turnos ════════
   Uma tela, três abas. Escalas e turnos tinham tela própria no menu e não
   sustentavam uma: são meia dúzia de linhas cada, mexidas duas ou três vezes
   por ano, e existem pelo mesmo motivo que a convenção existe — dizer quanto
   custa manter um posto coberto. A convenção dá o salário e o benefício, a
   escala diz quantos funcionários o posto consome, o turno diz quantas horas
   são noturnas. Separá-las em três entradas de menu obrigava a atravessar o
   sistema para conferir uma conta que é uma só.

   Quem chega aqui por um link antigo (#escalas) cai na aba certa: o desvio
   está no go() do app.js. */
VIEWS.ccts = function(){
  const t = state.tab || 'convencoes';
  const aba = (k, l, n) => `<button class="${t === k ? 'active' : ''}" data-acao="trocarAba"
    data-tab="${k}">${l} <span class="tag t-gray">${n}</span></button>`;
  return `${avisoLeitura()}
  <div class="tabs">
   ${aba('convencoes', 'Convenções', DB.list('ccts').length)}
   ${aba('escalas', 'Escalas', DB.list('escalas').length)}
   ${aba('turnos', 'Turnos', DB.list('turnos').length)}</div>
  ${t === 'escalas' ? _abaEscalas() : t === 'turnos' ? _abaTurnos() : _abaConvencoes()}`;
};

function _abaConvencoes(){
  const q = semAcento(state.q || '');
  const l = DB.list('ccts').filter(c => !q || semAcento(c.nome).includes(q)
    || semAcento(c.sindicato).includes(q));
  return `<div class="toolbar">
   ${barraBusca('Buscar convenção ou sindicato…')}
   ${soGestor() ? '<button class="btn btn-primary" data-acao="formCCT">+ Nova convenção</button>' : ''}</div>
  <div class="card">${l.length ? `<table><thead><tr><th>Convenção</th><th>Sindicato</th>
   <th>Vigência</th><th>Local</th><th>Cargos</th><th>Benefícios</th><th>Encargos</th>
   <th>Insalubridade</th><th></th></tr></thead><tbody>
  ${l.map(c => `<tr>
   <td><div class="cell-main">${esc(c.nome)}</div>
    ${c.ativo ? '' : '<span class="tag t-gray">inativa</span>'}
    ${vencendo(c) ? '<span class="tag t-amber">vence em breve</span>' : ''}</td>
   <td class="cell-sub">${esc(c.sindicato || '—')}</td>
   <td class="cell-sub">${dt(c.vigencia_inicio)} — ${dt(c.vigencia_fim)}</td>
   <td class="cell-sub">${esc(c.cidade || '—')}${c.uf ? '/' + esc(c.uf) : ''}</td>
   <td style="font-weight:700">${cargosCCT(c.id).length}</td>
   <td style="font-weight:700">${benefCCT(c.id).length}</td>
   <td><span class="tag t-blue">${somaEncargosCCT(c.id).toFixed(2)}%</span></td>
   <td class="cell-sub">${esc({minimo:'salário mínimo', piso:'piso da categoria',
     salario:'salário do cargo'}[c.insalubridade_base] || 'salário mínimo')}</td>
   <td style="text-align:right;white-space:nowrap">
    <button class="btn btn-sm" data-acao="abrirCCT" data-id="${c.id}">Abrir</button>
    ${soGestor() ? `<button class="btn btn-sm" data-acao="formCCT" data-id="${c.id}">Editar</button>
     ${btnExcluir('ccts', c.id, 'Convenção', 'Propostas ligadas a esta convenção impedem a exclusão.')}` : ''}
   </td></tr>`).join('')}
  </tbody></table>` : emptyState('Nenhuma convenção','Cadastre a CCT com cargos, salários, benefícios e encargos.')}</div>`;
}

function _abaEscalas(){
  const escalas = DB.list('escalas');
  const cfg = cfgObj();
  return `<div class="toolbar"><div style="flex:1"></div>
   ${soGestor() ? '<button class="btn btn-primary" data-acao="formEscala">+ Nova escala</button>' : ''}</div>
   <div class="card">${escalas.length ? `<table><thead><tr><th>Escala</th><th>Descrição</th>
    <th>Jornada</th><th>Cobertura do posto</th><th>Func. por posto</th><th>Situação</th><th></th></tr></thead><tbody>
   ${escalas.map(x => {
     const {fator, det} = Calc.fatorEscala(x, null, cfg);
     return `<tr><td class="cell-main">${esc(x.nome)}</td>
     <td class="cell-sub">${esc(x.descricao || '—')}</td>
     <td style="font-weight:700">${num(x.horas_semanais)}h/sem</td>
     <td class="cell-sub">${x.fator_modo === 'calculado'
       ? `${num(x.horas_posto_dia)}h × ${num(x.dias_semana)} dias = ${num(det.horas_posto_semana)}h/sem`
       : '—'}</td>
     <td style="font-weight:700">${num(fator, 3)}×
       <div class="cell-sub">${x.fator_modo === 'calculado'
         ? `calculado · absent. ${num(x.absenteismo_pct)}%${x.cobertura_ferias ? ' + férias' : ''}`
         : 'informado à mão'}</div></td>
     <td><span class="tag ${x.ativo ? 't-green' : 't-gray'}">${x.ativo ? 'ativa' : 'inativa'}</span></td>
     <td style="text-align:right;white-space:nowrap">
      ${soGestor() ? `<button class="btn btn-sm" data-acao="formEscala" data-id="${x.id}">Editar</button>
       ${btnExcluir('escalas', x.id, 'Escala')}` : ''}</td></tr>`; }).join('')}
   </tbody></table>
   <div class="card-b" style="border-top:1px solid var(--border);font-size:12.5px;color:var(--muted)">
    O fator diz quantos funcionários são necessários para manter <b>um posto</b>
    coberto. No modo calculado ele sai das horas de cobertura ÷ jornada
    contratual, acrescido de absenteísmo e cobertura de férias — para 12x36 isso
    dá ~2,17 e não 2,0.</div>`
   : emptyState('Nenhuma escala','Cadastre 12x36, 5x2, 6x1 — o que a operação usa.')}</div>`;
}

function _abaTurnos(){
  const turnos = DB.list('turnos');
  return `<div class="toolbar"><div style="flex:1"></div>
   ${soGestor() ? '<button class="btn btn-primary" data-acao="formTurno">+ Novo turno</button>' : ''}</div>
   <div class="card">${turnos.length ? `<table><thead><tr><th>Turno</th><th>Início</th><th>Fim</th>
    <th>Intervalo</th><th>Jornada líquida</th><th>Horas noturnas</th><th>Situação</th><th></th></tr></thead><tbody>
   ${turnos.map(x => {
     const dur = Calc.duracaoTurnoH(x);
     const not = Calc.horasNoturnasH(x, CFG('noturno_hora_inicio','22:00'), CFG('noturno_hora_fim','05:00'));
     return `<tr><td class="cell-main">${esc(x.nome)}</td>
     <td>${esc(x.hora_inicio)}</td><td>${esc(x.hora_fim)}</td>
     <td class="cell-sub">${x.intervalo_min} min</td>
     <td style="font-weight:700">${num(dur)}h</td>
     <td>${not > 0 ? `<span class="tag t-purple">${num(not)}h · +${num(CFGN('adicional_noturno',20))}%</span>`
       : x.noturno ? '<span class="tag t-amber">marcado, sem horas 22h–5h</span>'
       : '<span class="tag t-gray">—</span>'}</td>
     <td><span class="tag ${x.ativo ? 't-green' : 't-gray'}">${x.ativo ? 'ativo' : 'inativo'}</span></td>
     <td style="text-align:right;white-space:nowrap">
      ${soGestor() ? `<button class="btn btn-sm" data-acao="formTurno" data-id="${x.id}">Editar</button>
       ${btnExcluir('turnos', x.id, 'Turno')}` : ''}</td></tr>`; }).join('')}
   </tbody></table>
   <div class="card-b" style="border-top:1px solid var(--border);font-size:12.5px;color:var(--muted)">
    O adicional noturno incide só sobre as horas entre
    ${esc(CFG('noturno_hora_inicio','22:00'))} e ${esc(CFG('noturno_hora_fim','05:00'))},
    com hora reduzida de ${esc(CFG('noturno_hora_reduzida','52.5'))} minutos.</div>`
   : emptyState('Nenhum turno','Cadastre as faixas de horário usadas nos postos.')}</div>`;
}

/* Uma CCT que vence em menos de 60 dias é um reajuste chegando — e reajuste é
   exatamente o que faz proposta não congelada mudar de valor sozinha. */
function vencendo(c){
  if(!c.vigencia_fim) return false;
  const d = (new Date(c.vigencia_fim + 'T12:00') - Date.now()) / 86400000;
  return d > 0 && d < 60;
}

VIEWS.cctDetalhe = function(){
  const c = DB.get('ccts', state.id);
  if(!c) return emptyState('Convenção não encontrada','');
  const t = state.tab || 'cargos';
  const cargos = cargosCCT(c.id), benefs = benefCCT(c.id), encs = encCCT(c.id);
  const propostas = DB.list('propostas').filter(p => +p.cctId === +c.id);
  const congeladas = propostas.filter(p => p.snapshot).length;
  const aba = (k,l,n) => `<button class="${t === k ? 'active' : ''}" data-acao="trocarAba"
    data-tab="${k}">${l} <span class="tag t-gray">${n}</span></button>`;

  return `<button class="btn btn-sm" data-acao="irPara" data-v="ccts" style="margin-bottom:14px">${ico('voltar')}Voltar para convenções</button>
  ${propostas.length > congeladas ? `<div class="faixa aviso">${ico('aviso')}
    <span class="sp"><b>${propostas.length - congeladas}</b> proposta(s) usam esta convenção
     <b>sem congelamento</b>: mexer nos salários aqui muda o valor delas.</span></div>` : ''}
  <div class="card"><div class="card-b"><div class="detail-head">${av(c.nome)}
   <div style="flex:1"><h2>${esc(c.nome)}</h2>
    <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
     <span class="tag t-blue">${esc(c.sindicato || 'sem sindicato')}</span>
     <span class="tag t-gray">${esc(c.cidade || '—')}${c.uf ? '/' + esc(c.uf) : ''}</span>
     <span class="tag ${c.ativo ? 't-green' : 't-red'}">${c.ativo ? 'ativa' : 'inativa'}</span>
     <span class="tag t-amber">encargos ${somaEncargosCCT(c.id).toFixed(2)}%</span></div></div>
   ${soGestor() ? `<button class="btn" data-acao="formCCT" data-id="${c.id}">Editar</button>` : ''}</div>
   <div class="dl">
    <div class="it"><b>Vigência</b><span>${dt(c.vigencia_inicio)} — ${dt(c.vigencia_fim)}</span></div>
    <div class="it"><b>Propostas usando</b><span>${propostas.length} (${congeladas} congeladas)</span></div>
    <div class="it"><b>Base da insalubridade</b><span>${esc({minimo:'salário mínimo',
      piso:'piso da categoria', salario:'salário do cargo'}[c.insalubridade_base] || 'salário mínimo')}
      ${c.insalubridade_base === 'minimo' ? '· ' + money(c.salario_minimo || CFGN('salario_minimo')) : ''}
      ${c.insalubridade_base === 'piso' ? '· ' + money(c.piso_categoria) : ''}</span></div>
    <div class="it"><b>Divisor de horas mensais</b><span>${num(c.horas_mensais || 220)}h</span></div>
    <div class="it"><b>Observações</b><span>${esc(c.obs || '—')}</span></div>
   </div></div></div>
  <div class="tabs mt">${aba('cargos','Cargos e salários', cargos.length)}
   ${aba('beneficios','Benefícios', benefs.length)}${aba('encargos','Encargos', encs.length)}</div>

  ${t === 'cargos' ? `<div class="toolbar"><div style="flex:1"></div>
    <button class="btn" data-acao="exportarCargos" data-id="${c.id}">Exportar CSV</button>
    ${soGestor() ? `<button class="btn" data-acao="reajustarCCT" data-id="${c.id}">Reajustar salários</button>
     <button class="btn btn-primary" data-acao="formCargo" data-cct="${c.id}">+ Novo cargo</button>` : ''}</div>
   <div class="card">${cargos.length ? `<table><thead><tr><th>Cargo</th><th>CBO</th>
    <th>Salário base</th><th>Salário-hora</th><th>Observação</th><th></th></tr></thead><tbody>
   ${cargos.map(x => `<tr><td class="cell-main">${esc(x.nome)}</td>
    <td class="cell-sub">${esc(x.cbo || '—')}</td>
    <td style="font-weight:700">${money(x.salario)}</td>
    <td class="cell-sub">${money((+x.salario || 0) / (+c.horas_mensais || 220))}</td>
    <td class="cell-sub">${esc(x.obs || '—')}</td>
    <td style="text-align:right;white-space:nowrap">
     ${soGestor() ? `<button class="btn btn-sm" data-acao="formCargo" data-id="${x.id}" data-cct="${c.id}">Editar</button>
      ${btnExcluir('cct_cargos', x.id, 'Cargo')}` : ''}</td></tr>`).join('')}
   </tbody></table>` : emptyState('Nenhum cargo nesta convenção','')}</div>`

  : t === 'beneficios' ? `<div class="toolbar"><div style="flex:1"></div>
    ${soGestor() ? `<button class="btn btn-primary" data-acao="formBenef" data-cct="${c.id}">+ Novo benefício</button>` : ''}</div>
   <div class="card">${benefs.length ? `<table><thead><tr><th>Benefício</th><th>Valor</th>
    <th>Periodicidade</th><th>Desconto do empregado</th><th>Custo da empresa*</th><th></th></tr></thead><tbody>
   ${benefs.map(x => {
     const exemplo = Calc.calcBeneficio(x, Calc.cents(cargos[0]?.salario || 0), cfgObj());
     return `<tr><td class="cell-main">${esc(x.nome)}</td>
     <td style="font-weight:700">${money(x.valor)}</td>
     <td class="cell-sub">por ${esc(x.unid)}${x.unid === 'dia' ? ` · ${num(x.dias_mes)} dias/mês` : ''}</td>
     <td class="cell-sub">${x.desconto_tipo === 'pct_salario' ? `${num(x.desconto_pct)}% do salário (teto no valor)`
       : x.desconto_tipo === 'pct_valor' ? `${num(x.desconto_pct)}% do benefício` : '—'}</td>
     <td style="font-weight:700">${moneyC(exemplo.custoC)}</td>
     <td style="text-align:right;white-space:nowrap">
      ${soGestor() ? `<button class="btn btn-sm" data-acao="formBenef" data-id="${x.id}" data-cct="${c.id}">Editar</button>
       ${btnExcluir('cct_beneficios', x.id, 'Benefício')}` : ''}</td></tr>`; }).join('')}
   </tbody></table>
   <div class="card-b" style="border-top:1px solid var(--border);font-size:12px;color:var(--muted)">
     * Custo da empresa calculado sobre o salário do primeiro cargo da convenção
     (${esc(cargos[0]?.nome || '—')}). O desconto de vale-transporte varia com o
     salário de cada cargo, então na proposta ele é recalculado posto a posto.</div>`
   : emptyState('Nenhum benefício nesta convenção','')}</div>`

  : `<div class="toolbar"><div style="flex:1"></div>
    ${soGestor() ? `<button class="btn btn-primary" data-acao="formEncargo" data-cct="${c.id}">+ Novo encargo</button>` : ''}</div>
   <div class="card">${encs.length ? `<table><thead><tr><th>Encargo</th><th>Percentual</th><th></th></tr></thead><tbody>
   ${encs.map(x => `<tr><td class="cell-main">${esc(x.nome)}</td>
    <td style="font-weight:700">${(+x.percentual).toFixed(2)}%</td>
    <td style="text-align:right;white-space:nowrap">
     ${soGestor() ? `<button class="btn btn-sm" data-acao="formEncargo" data-id="${x.id}" data-cct="${c.id}">Editar</button>
      ${btnExcluir('cct_encargos', x.id, 'Encargo')}` : ''}</td></tr>`).join('')}
   </tbody><tfoot><tr><th>Total</th><th colspan="2">${somaEncargosCCT(c.id).toFixed(2)}%</th></tr></tfoot></table>`
   : emptyState('Nenhum encargo nesta convenção','')}</div>`}`;
};

/* ════════ ESCALAS E TURNOS ════════ */
/* ════════ EQUIPAMENTOS ════════ */
VIEWS.equipamentos = function(){
  const q = semAcento(state.q || '');
  const l = DB.list('equipamentos').filter(e => !q || semAcento(e.nome).includes(q)
    || semAcento(e.marca_modelo).includes(q));
  return `${avisoLeitura()}
  <div class="toolbar">
   ${barraBusca('Buscar equipamento…')}
   ${soGestor() ? '<button class="btn btn-primary" data-acao="formEquipCad">+ Novo equipamento</button>' : ''}</div>
  <div class="card">${l.length ? `<table><thead><tr><th>Equipamento</th><th>Marca / modelo</th>
   <th>Valor</th><th>Cobrança</th><th>Situação</th><th>Em propostas</th><th></th></tr></thead><tbody>
  ${l.map(e => { const uso = DB.list('propostas')
     .filter(p => (p.equipamentos || []).some(x => +x.id === e.id)).length;
   return `<tr><td class="cell-main">${esc(e.nome)}</td>
   <td class="cell-sub">${esc(e.marca_modelo || '—')}</td>
   <td style="font-weight:700">${money(e.valor)}</td>
   <td><span class="tag ${e.tipo === 'Único' ? 't-amber' : 't-blue'}">${esc(e.tipo)}</span></td>
   <td><span class="tag ${e.ativo ? 't-green' : 't-gray'}">${e.ativo ? 'ativo' : 'inativo'}</span></td>
   <td style="font-weight:700">${uso}</td>
   <td style="text-align:right;white-space:nowrap">
    ${soGestor() ? `<button class="btn btn-sm" data-acao="formEquipCad" data-id="${e.id}">Editar</button>
     ${btnExcluir('equipamentos', e.id, 'Equipamento')}` : ''}</td></tr>`; }).join('')}
  </tbody></table>` : emptyState('Nenhum equipamento','Cadastre os equipamentos reutilizáveis nas propostas.')}</div>`;
};

/* ════════ MATERIAIS E INSUMOS ════════
   A coluna que importa nesta tela é a do CUSTO MENSAL, não a do preço de
   compra: é ela que entra na proposta. Um calçado de R$ 95 trocado uma vez ao
   ano são R$ 7,92 por funcionário por mês, e é esse número que precisa estar
   à vista quando alguém for conferir por que o posto custa o que custa. */
VIEWS.materiais = function(){
  const q = semAcento(state.q || '');
  const l = DB.list('materiais').filter(m => !q || semAcento(m.nome).includes(q)
    || semAcento(m.categoria).includes(q));
  const grupos = [...new Set(l.map(m => m.categoria || 'Outros'))].sort();

  const linha = m => {
    const meses = Math.max(Math.trunc(+m.meses) || 1, 1);
    const uso = DB.list('propostas').filter(p => (p.materiais || []).some(x => +x.id === m.id)).length;
    return `<tr><td class="cell-main">${esc(m.nome)}
      ${m.obs ? `<div class="cell-sub">${esc(m.obs)}</div>` : ''}</td>
     <td class="cell-sub">${esc(m.unidade || 'un')}</td>
     <td>${money(m.valor)}</td>
     <td class="cell-sub">${meses === 1 ? 'todo mês' : 'a cada ' + meses + ' meses'}</td>
     <td style="font-weight:700;color:var(--blue)" title="É este valor que entra no custo direto">
      ${money((+m.valor || 0) / meses)}</td>
     <td><span class="tag t-gray">${esc(Calc.MAT_BASES[m.base] || m.base || '—')}</span></td>
     <td><span class="tag ${m.ativo ? 't-green' : 't-gray'}">${m.ativo ? 'ativo' : 'inativo'}</span></td>
     <td style="font-weight:700">${uso}</td>
     <td style="text-align:right;white-space:nowrap">
      ${soGestor() ? `<button class="btn btn-sm" data-acao="formMaterial" data-id="${m.id}">Editar</button>
       ${btnExcluir('materiais', m.id, 'Material')}` : ''}</td></tr>`;
  };

  return `${avisoLeitura()}
  <div class="toolbar">
   ${barraBusca('Buscar material…')}
   ${soGestor() ? '<button class="btn btn-primary" data-acao="formMaterial">+ Novo material</button>' : ''}</div>
  ${l.length ? grupos.map(g => `<div class="card mt"><div class="card-h">
    <h3 style="flex:1">${esc(g)}</h3>
    <span class="tag t-gray">${l.filter(m => (m.categoria || 'Outros') === g).length}</span></div>
   <table><thead><tr><th>Material</th><th>Unid.</th><th>Aquisição</th><th>Troca</th>
    <th>Custo mensal</th><th>Multiplicar por</th><th>Situação</th><th>Em propostas</th><th></th></tr></thead>
   <tbody>${l.filter(m => (m.categoria || 'Outros') === g).map(linha).join('')}</tbody></table></div>`).join('')
   : `<div class="card">${emptyState('Nenhum material cadastrado',
      'Uniforme, EPI, material de limpeza e exames — o Módulo 5 da planilha. ' +
      'O que manda o custo aqui é o prazo de troca, não o preço de compra.')}</div>`}`;
};

/* ════════ CONFIGURAÇÕES ════════ */
VIEWS.configuracoes = function(){
  const t = state.tab || 'parametros';
  const cfgs = DB.list('configuracoes');
  const grupos = [...new Set(cfgs.map(c => c.grupo))].sort();
  const listas = DB.list('listas');
  const gruposLista = [...new Set(listas.map(l => l.grupo))].sort();
  const aba = (k,r,n) => `<button class="${t === k ? 'active' : ''}" data-acao="trocarAba"
    data-tab="${k}">${r}${n !== undefined ? ` <span class="tag t-gray">${n}</span>` : ''}</button>`;

  return `${avisoLeitura()}
  <div class="tabs">${aba('parametros','Parâmetros', cfgs.length)}${aba('listas','Listas', listas.length)}
   ${aba('sistema','Sistema')}${Sessao.eAdmin() ? aba('usuarios','Usuários', DB.list('perfis').length) : ''}</div>

  ${t === 'parametros' ? grupos.map(g => `<div class="card mt"><div class="card-h">
    <h3 style="flex:1">${esc(g)}</h3></div>
    <table><thead><tr><th>Chave</th><th>Valor</th><th>Descrição</th><th></th></tr></thead><tbody>
    ${cfgs.filter(c => c.grupo === g).map(c => `<tr>
     <td class="cell-main">${esc(c.chave)}</td>
     <td style="max-width:340px"><div class="cell-sub" style="white-space:pre-wrap">${esc(c.valor)}</div></td>
     <td class="cell-sub">${esc(c.descricao || '')}</td>
     <td style="text-align:right">${soGestor()
       ? `<button class="btn btn-sm" data-acao="formConfig" data-chave="${esc(c.chave)}">Editar</button>` : ''}</td>
    </tr>`).join('')}
    </tbody></table></div>`).join('')

  : t === 'listas' ? `<div class="toolbar"><div style="flex:1"></div>
    ${soGestor() ? '<button class="btn btn-primary" data-acao="formLista">+ Novo item</button>' : ''}</div>
   ${gruposLista.map(g => `<div class="card mt"><div class="card-h"><h3 style="flex:1">${esc(g)}</h3>
    ${soGestor() ? `<button class="btn btn-sm" data-acao="formLista" data-grupo="${esc(g)}">+ Item</button>` : ''}</div>
    <table><thead><tr><th>Valor</th><th>Rótulo</th><th>Número</th><th>Ordem</th><th>Ativo</th><th></th></tr></thead><tbody>
    ${listas.filter(l => l.grupo === g).sort((a,b) => a.ordem - b.ordem).map(l => `<tr>
     <td class="cell-main">${esc(l.valor)}</td><td class="cell-sub">${esc(l.rotulo)}</td>
     <td class="cell-sub">${l.num == null ? '—' : +l.num}</td><td class="cell-sub">${l.ordem}</td>
     <td><span class="tag ${l.ativo ? 't-green' : 't-gray'}">${l.ativo ? 'sim' : 'não'}</span></td>
     <td style="text-align:right;white-space:nowrap">
      ${soGestor() ? `<button class="btn btn-sm" data-acao="formLista" data-id="${l.id}">Editar</button>
       ${btnExcluir('listas', l.id, 'Item')}` : ''}</td>
    </tr>`).join('')}
    </tbody></table></div>`).join('')}`

  : t === 'usuarios' ? telaUsuarios()
  : telaSistema()}`;
};

/* Papéis (3.3) e fila de liberação.
   Conta nova nasce PENDENTE e não enxerga uma linha do sistema até um admin
   liberar aqui. A fila fica em cima e destacada: pedido de acesso que passa
   despercebido é alguém da equipe parado esperando — e a tendência é a pessoa
   ligar para o admin em vez de o admin ver sozinho. */
function telaUsuarios(){
  const perfis = DB.list('perfis');
  const fila = perfis.filter(p => p.papel === 'pendente');
  const time = perfis.filter(p => p.papel !== 'pendente');

  const espera = p => {
    if(!p.solicitado_em) return '';
    const dias = Math.floor((Date.now() - new Date(p.solicitado_em)) / 86400000);
    return dias <= 0 ? 'pediu hoje' : 'esperando há ' + dias + (dias === 1 ? ' dia' : ' dias');
  };

  return `${fila.length ? `<div class="card mt" style="border-color:var(--accent)">
    <div class="card-h"><span class="bloco-n">${fila.length}</span>
     <div style="flex:1"><h3>Pedidos de acesso</h3>
      <p>Estas pessoas criaram conta e estão esperando. Sem liberação elas não
       veem nada — nem convenção, nem salário, nem proposta.</p></div></div>
    <table><thead><tr><th>Quem pediu</th><th>E-mail</th><th>Quando</th>
     <th style="text-align:right">Liberar como</th></tr></thead><tbody>
    ${fila.map(p => `<tr>
     <td><div class="row-flex">${av(p.nome || p.email)}<span class="cell-main">${esc(p.nome || '—')}</span></div></td>
     <td class="cell-sub">${esc(p.email || '—')}</td>
     <td class="cell-sub">${esc(espera(p))}</td>
     <td style="text-align:right;white-space:nowrap">
      ${Sessao.eAdmin() ? `
       <button class="btn btn-sm" data-acao="liberarAcesso" data-id="${esc(p.id)}" data-papel="vendedor"
         title="Vê e edita só o que é dele; cadastros somente leitura">Vendedor</button>
       <button class="btn btn-sm" data-acao="liberarAcesso" data-id="${esc(p.id)}" data-papel="gestor"
         title="Vê o comercial de todo mundo e mexe nos cadastros">Gestor</button>
       <button class="btn btn-sm btn-icon" data-acao="recusarAcesso" data-id="${esc(p.id)}"
         title="Recusar e apagar o pedido">${ico('lixo')}</button>`
       : '<span class="cell-sub">só um admin libera</span>'}</td>
    </tr>`).join('')}
    </tbody></table></div>` : ''}

  <div class="card mt"><div class="card-h"><div style="flex:1"><h3>Usuários e papéis</h3>
    <p>Conta nova entra como pendente. O primeiro usuário do sistema vira admin.</p></div></div>
   ${time.length ? `<table><thead><tr><th>Usuário</th><th>E-mail</th><th>Papel</th>
    <th>Situação</th><th></th></tr></thead><tbody>
   ${time.map(p => `<tr>
    <td><div class="row-flex">${av(p.nome || p.email)}<span class="cell-main">${esc(p.nome || '—')}</span></div></td>
    <td class="cell-sub">${esc(p.email || '—')}</td>
    <td>${tagOf(p.papel)}</td>
    <td><span class="tag ${p.ativo ? 't-green' : 't-gray'}">${p.ativo ? 'ativo' : 'inativo'}</span></td>
    <td style="text-align:right;white-space:nowrap">${p.id === Sessao.usuario?.id
      ? '<span class="cell-sub">você</span>'
      : `<button class="btn btn-sm" data-acao="formPerfil" data-id="${esc(p.id)}">Alterar papel</button>
         ${Sessao.eAdmin() ? `<button class="btn btn-sm" data-acao="recusarAcesso" data-id="${esc(p.id)}"
           title="Tira o acesso: a pessoa volta para a fila de pedidos">Bloquear</button>` : ''}`}</td>
   </tr>`).join('')}
   </tbody></table>` : emptyState('Nenhum usuário liberado','Rode supabase/migracao_acesso.sql se a coluna de papéis não existir.')}
   <div class="card-b" style="border-top:1px solid var(--border);font-size:12.5px;color:var(--muted)">
    <b>admin</b> faz tudo, inclusive mudar parâmetros e papéis.
    <b>gestor</b> vê e edita o comercial de todo mundo e mexe nos cadastros.
    <b>vendedor</b> vê e edita só os registros dele; cadastros ficam em leitura.
    Quem aplica isso é a política de segurança do banco, não a tela.</div></div>`;
}

function telaSistema(){
  const s = state.saude;
  const linha = (r, ok, det) => `<div class="sum-row"><span class="lb">${r}</span>
    <span class="vl">${ok ? '<span class="tag t-green">ok</span>' : '<span class="tag t-amber">pendente</span>'}
    ${det ? `<span class="cell-sub"> ${esc(det)}</span>` : ''}</span></div>`;
  return `<div class="card mt"><div class="card-h"><div style="flex:1"><h3>Estado do servidor</h3>
    <p>O que está configurado e o que falta</p></div>
    <button class="btn btn-sm" data-acao="verificarSaude">Verificar</button></div>
   <div class="card-b">
    ${s ? `
     ${linha('Conexão com o Supabase', s.supabase)}
     ${linha('Conversão para PDF', s.pdf, s.pdf
        ? (s.libreoffice || s.pdf_motor || '')
        : 'instale o LibreOffice (libreoffice.org) ou aponte LIBREOFFICE_PATH no .env')}
     ${linha('Envio de e-mail (SMTP)', s.email, s.email ? '' : 'falta ' + (s.email_faltando || 'configuração'))}
     ${linha('Link público de aceite', s.link_publico, s.link_publico ? '' : 'falta SUPABASE_SERVICE_KEY no .env')}
     ${linha('Logo na capa do PPT', s.logo, s.logo ? '' : 'coloque modelo_ppt/logo.png')}
     <div class="sum-row"><span class="lb">Modelos de apresentação</span>
      <span class="vl">${s.modelos?.length ? s.modelos.map(m => esc(m)).join(', ') : '—'}</span></div>`
    : '<p style="color:var(--muted);font-size:13px">Clique em Verificar para consultar o servidor.</p>'}
   </div></div>
   <div class="card mt"><div class="card-h"><h3>Base de dados</h3></div>
    <table><thead><tr><th>Tabela</th><th>Na memória</th><th>No banco</th></tr></thead><tbody>
    ${ENTIDADES.map(e => `<tr><td class="cell-main">${esc(e.n)}</td>
      <td>${DB.carregado[e.n] ?? DB.list(e.n).length}</td>
      <td>${DB.total[e.n] ?? '—'}</td></tr>`).join('')}
    </tbody></table></div>`;
}

acoes({
  abrirCCT(d){ go('cctDetalhe', {id:+d.id}); },
  async verificarSaude(){
    try{ state.saude = await api('/api/saude'); render(); }
    catch(e){ toast('Servidor não respondeu: ' + e.message); }
  },
  /* ── liberação de acesso ─────────────────────────────────────────────────
     Quem decide é o admin, aqui dentro. O banco confere de novo: um gatilho em
     `perfis` recusa mudança de papel feita por quem não é admin, porque a RLS
     libera a LINHA inteira e não sabe proteger uma coluna sozinha. */
  async liberarAcesso(d){
    const p = DB.get('perfis', d.id);
    if(!p) return;
    try{
      await DB.upd('perfis', d.id, {papel:d.papel, ativo:true,
        liberado_em:new Date().toISOString(), liberado_por:Sessao.usuario?.id ?? null});
    }catch(e){ return; }
    toast(`${p.nome || p.email} liberado como ${d.papel}`);
    render();
  },

  recusarAcesso(d){
    const p = DB.get('perfis', d.id);
    if(!p) return;
    const pendente = p.papel === 'pendente';
    modal(pendente ? 'Recusar este pedido?' : 'Bloquear este usuário?', `
      <p style="font-size:13.5px;line-height:1.6;color:var(--muted)">
       <b style="color:var(--text)">${esc(p.nome || p.email || '—')}</b>
       ${pendente
         ? ' continua com a conta criada, mas segue sem ver nada do sistema.'
         : ' perde o acesso agora e volta para a fila de pedidos. O que ele já cadastrou não é apagado.'}
       ${Sessao.usuario?.id === p.id ? '<br><b style="color:var(--text)">Este é o seu próprio usuário.</b>' : ''}</p>`,
      `<button class="btn" data-acao="fecharModal">Cancelar</button>
       <button class="btn btn-primary" data-acao="confirmarRecusa" data-id="${esc(p.id)}">
        ${pendente ? 'Recusar' : 'Bloquear'}</button>`);
  },
  async confirmarRecusa(d){
    closeModal();
    try{ await DB.upd('perfis', d.id, {papel:'pendente', ativo:false, liberado_em:null}); }
    catch(e){ return; }
    toast('Acesso removido');
    render();
  },

  exportarMateriais(){
    exportarCSV('materiais.csv', DB.list('materiais'), [
      ['nome','Material'], ['categoria','Categoria'], ['unidade','Unidade'],
      ['valor','Aquisição'], ['meses','Troca (meses)'], ['base','Multiplicar por'],
      ['obs','Observação']]);
  },
  exportarCargos(d){
    exportarCSV('cargos.csv', cargosCCT(+d.id), [
      {campo:'nome', rotulo:'Cargo'}, {campo:'cbo', rotulo:'CBO'},
      {campo:'salario', rotulo:'Salário'}, {campo:'obs', rotulo:'Observação'}]);
  },
  /* Reajuste de CCT em um passo — é o evento que mais mexe em dinheiro no ano,
     e fazê-lo cargo a cargo é onde nasce o erro de digitação. */
  reajustarCCT(d){
    modal('Reajustar salários da convenção', `<div class="fgrid">
      ${fld('rj_pct','Percentual de reajuste (%)','', 'number')}
      ${sel('rj_arred','Arredondamento',[['0.01','Centavo'],['1','Real inteiro'],['5','Múltiplo de 5']],'0.01')}
      ${nota('Aplica a todos os cargos desta convenção. Propostas já congeladas não mudam — é exatamente para isso que existe o congelamento.')}
     </div>`,
     `<button class="btn" data-acao="fecharModal">Cancelar</button>
      <button class="btn btn-primary" data-acao="aplicarReajuste" data-id="${esc(d.id)}">Aplicar</button>`);
  },
  async aplicarReajuste(d){
    if(!valid(['rj_pct'])) return;
    const pct = parseFloat($('#rj_pct').value.replace(',','.'));
    const passo = parseFloat($('#rj_arred').value);
    const cargos = cargosCCT(+d.id);
    let n = 0;
    for(const c of cargos){
      const novo = Math.round((+c.salario) * (1 + pct/100) / passo) * passo;
      await DB.upd('cct_cargos', c.id, {salario: +novo.toFixed(2)});
      n++;
    }
    const vivas = DB.list('propostas').filter(p => +p.cctId === +d.id && !p.snapshot);
    closeModal();
    toast(`${n} cargos reajustados em ${pctTxt(pct)}` +
      (vivas.length ? ` · ${vivas.length} proposta(s) não congelada(s) mudaram de valor` : ''));
    render();
  },
});
