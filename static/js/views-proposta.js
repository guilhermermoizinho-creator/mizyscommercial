/* ════════════════════════════════════════════════════════════════════════════
   PROPOSTAS — lista, editor, documentos, e-mail, congelamento e versões.
   ════════════════════════════════════════════════════════════════════════════ */

/* ════════ LISTA ════════ */
/* Ganha = aprovada por dentro ou aceita pelo cliente. Estava escrito na mão em
   dois lugares, e os dois precisam concordar: o botão de fechar some quando a
   etiqueta verde aparece. */
function ganha(p){ return p.status === 'Aprovada' || !!p.aceite_em; }

VIEWS.propostas = function(){
  const q = semAcento(state.q || ''), fs = state.status || '';
  /* O rascunho aberto no editor não entra aqui: ele ainda não existe no banco,
     e listar uma proposta que some ao recarregar a página é pior do que não
     listar. Quem quer voltar a ele usa a faixa logo abaixo da barra. */
  const l = DB.list('propostas').filter(p => !DB.eRascunho(p.id)).filter(p =>
    (!q || semAcento(p.numero).includes(q) || semAcento(p.titulo).includes(q)
        || semAcento(leadNome(p.leadId)).includes(q))
    && (!fs || p.status === fs));
  const tot = l.reduce((s,p) => s + calcProposta(p).mensalC, 0);
  const minima = CFGN('proposta_margem_minima', 8);
  const pendentes = l.filter(p => p.aprovacao_status === 'pendente');

  /* O rascunho não aparece na tabela — ele não existe no banco. Mas sumir com
     ele em silêncio depois de a pessoa montar cinco postos seria pior: esta
     faixa é o caminho de volta. */
  const rasc = DB.list('propostas').find(x => DB.eRascunho(x.id));

  return `<div class="toolbar">
   ${barraBusca('Buscar por número, título ou lead…')}
   <select data-mudar="filtrar" data-campo="status"><option value="">Todos os status</option>
    ${optsLista('proposta_status', fs)}</select>
   <button class="btn" data-acao="exportarPropostas">Exportar CSV</button>
   <button class="btn btn-primary" data-acao="novaProposta">
    ${ico('mais')}Nova proposta</button>
  </div>

  ${rasc ? `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Você tem uma proposta <b>montada mas não salva</b>
     para ${esc(leadNome(rasc.leadId))}. Ela não está na lista abaixo porque
     ainda não existe.</span>
    <button class="btn btn-sm btn-primary" data-acao="editarProposta" data-id="${rasc.id}">Continuar</button>
   </div>` : ''}

  ${pendentes.length && Sessao.podeGerir() ? `<div class="faixa forte">${ico('aviso')}
    <span class="sp"><b>${pendentes.length}</b> proposta${pendentes.length > 1 ? 's' : ''}
      aguardando sua aprovação de desconto.</span>
    <button class="btn btn-sm" data-acao="editarProposta" data-id="${pendentes[0].id}">Ver a primeira</button>
   </div>` : ''}

  <div class="kpis" style="margin-bottom:16px">
   <div class="kpi"><div class="k">Propostas listadas</div><div class="v">${l.length}</div>
    <div class="d">${l.filter(p => p.status === 'Aprovada').length} aprovadas ·
      ${l.filter(p => p.snapshot).length} congeladas</div></div>
   <div class="kpi"><div class="k">Valor mensal somado</div><div class="v">${money0C(tot)}</div>
    <div class="d">Recorrente destas propostas</div></div>
   <div class="kpi"><div class="k">Fechadas</div>
    <div class="v">${l.filter(ganha).length}</div>
    <div class="d">${money0C(l.filter(ganha).reduce((s,p) => s + calcProposta(p).mensalC, 0))}/mês ganhos ·
      ${l.filter(p => p.aberturas > 0).length} abertas pelo cliente</div></div>
  </div>

  <div class="card">${l.length ? `<table><thead><tr>
   <th>Número</th><th>Lead</th><th>Postos</th><th>Mensal</th><th>Margem</th>
   <th>Status</th><th>Emissão</th><th></th></tr></thead><tbody>
   ${l.map(p => { const c = calcProposta(p);
    return `<tr>
    <td><div class="cell-main">${esc(p.numero)}${p.versao > 1 ? ` <span class="tag t-gray">v${p.versao}</span>` : ''}
      ${p.snapshot ? '<span class="tag t-blue" title="Valores congelados">🔒</span>' : ''}</div>
     <div class="cell-sub">${esc(p.titulo)}</div></td>
    <td><div class="row-flex">${av(leadNome(p.leadId))}<span>${esc(leadNome(p.leadId))}</span></div></td>
    <td style="font-weight:700">${c.postos}</td>
    <td style="font-weight:700">${money0C(c.mensalC)}</td>
    <td><span class="tag ${c.margem >= minima * 1.8 ? 't-green' : c.margem >= minima ? 't-amber' : 't-red'}">${pctTxt(c.margem)}</span></td>
    <td>${tagOf(p.status)}
      ${p.aprovacao_status === 'pendente' ? '<div class="cell-sub">aguarda aprovação</div>' : ''}
      ${p.aceite_em ? '<div class="cell-sub">aceita pelo cliente</div>' : ''}</td>
    <td class="cell-sub">${dt(p.emissao)}</td>
    <td style="text-align:right;white-space:nowrap">
     ${ganha(p) ? '' : `<button class="btn btn-sm btn-ok" data-acao="marcarGanha"
       data-id="${p.id}" title="Fechar o negócio: aprova, congela os valores e move a oportunidade para Ganho">${ico('ok')}Fechar</button>`}
     <button class="btn btn-sm" data-acao="abrirProposta" data-id="${p.id}"
       title="Conferir: valor, equipe, materiais, lucro e imposto por imposto">Abrir</button>
     <button class="btn btn-sm" data-acao="editarProposta" data-id="${p.id}"
       title="Mexer no escopo, nos materiais e na margem">Editar</button>
     <button class="btn btn-sm" data-acao="gerarDoc" data-id="${p.id}" data-formato="pdf">PDF</button>
     ${btnExcluir('propostas', p.id, 'Proposta')}
    </td></tr>`; }).join('')}
  </tbody></table>${pager('propostas', l.length)}`
   : emptyState('Nenhuma proposta','Crie a primeira proposta comercial.')}</div>`;
};

/* ════════ CRIAÇÃO ════════
   "Nova proposta" NÃO grava nada. Ela abre um rascunho que só existe na
   memória do navegador, e o banco só ouve falar dele quando alguém clica em
   Salvar.

   Antes era o contrário, e custava duas coisas. A lista enchia de proposta
   vazia de quem abriu para ver e desistiu; e cada uma dessas queimava um
   número da sequência — que é uma sequence do Postgres e não anda para trás,
   então a numeração ficava furada para sempre: PRP-2026-0004, 0007, 0011.

   O rascunho não tem número ainda, de propósito. O número é pedido ao banco no
   momento de salvar, que é quando a proposta passa a existir. */
async function criarProposta({leadId, opId, titulo} = {}){
  const lead = leadId ? DB.get('leads', leadId) : DB.list('leads')[0];
  if(!lead){ toast('Cadastre um lead antes de criar a proposta'); return null; }
  const cct = DB.list('ccts').find(c => c.ativo) || DB.list('ccts')[0];
  if(!cct){ toast('Cadastre uma convenção coletiva antes de criar a proposta'); return null; }
  const cts = contatosLead(lead.id);
  const principal = cts.find(c => c.principal) || cts[0];

  const p = DB.rascunho('propostas', {
    numero: 'rascunho',
    leadId: lead.id, contatoId: principal ? principal.id : null,
    opId: opId ?? null, cctId: cct.id,
    titulo: titulo || ('Proposta ' + CFG('segmento','') + ' — ' + lead.empresa),
    status: OPC('proposta_status')[0] || 'Rascunho',
    emissao: hoje(),
    validade: CFGN('proposta_validade', 30), prazo: CFGN('proposta_prazo', 12),
    /* Vazio de propósito quando a convenção não publica a própria tabela de
       encargos: aí quem monta o submódulo 2.2 é o regime tributário
       (INSS + RAT×FAP + terceiros + FGTS). Ver paramsPreco() no calculo.js. */
    encargos: somaEncargosCCT(cct.id) || 0,
    /* `markup` é o lucro de planilha da IN SEGES — só vale quando não há
       margem definida, e vive na gaveta de avançado. `imposto` só serve para
       sobrescrever o T do regime, quando o contador fecha outro número. */
    markup: CFGN('proposta_markup', 10), imposto: 0,
    /* Nasce VAZIA. A margem é a decisão comercial de cada contrato — chutar um
       número por quem está vendendo é pior do que perguntar, porque um padrão
       plausível é aceito sem ser olhado. O bloco Condições mostra o mínimo da
       empresa e cobra o preenchimento. */
    margem_alvo: 0,
    desconto: 0,
    itens: [], equipamentos: [], materiais: [],
    escopo: CFG('proposta_escopo_padrao',''), obs: '',
    modelo_ppt: CFG('ppt_modelo','mizys_proposta.pptx'), slides: {},
    owner: Sessao.nome(),
  });
  go('propostaEditor', {id: p.id});
  return p;
}

/* Rascunho → linha no banco. É aqui que a proposta passa a existir: pega o
   número da sequence, insere, joga fora o rascunho e reabre o editor já com o
   id de verdade. A oportunidade no funil nasce junto, senão a diretoria vê
   painel zerado com R$ 80 mil em negociação na mesa. */
async function salvarRascunho(){
  const r = propostaAtual();
  if(!r || !DB.eRascunho(r.id)) return null;
  if(!(r.itens || []).length){
    toast('Adicione pelo menos um posto antes de salvar.');
    return null;
  }
  const {id, ...campos} = r;
  let nova;
  _estadoSalvo('salvando…', 'var(--blue)');
  try{
    nova = await DB.add('propostas', {...campos, numero: await proximoNumero()});
  }catch(e){
    _estadoSalvo('falhou ao salvar', 'var(--blue)');
    return null;
  }
  DB.descartar('propostas');
  const lead = DB.get('leads', nova.leadId);
  if(!nova.opId) await garantirOportunidade(nova, lead);
  await sincronizarOportunidade(DB.get('propostas', nova.id));
  toast('Proposta ' + nova.numero + ' criada');
  go('propostaEditor', {id: nova.id});
  return nova;
}

/* ── O elo entre proposta e funil ─────────────────────────────────────────────
   Este era o buraco no meio do processo: proposta e oportunidade viviam em
   tabelas separadas e ninguém as ligava. O vendedor montava uma proposta de
   R$ 80 mil, e o pipeline continuava vazio; o funil de vendas, zerado; o
   painel da diretoria, mentindo. Cada tela lia uma verdade diferente.

   Agora toda proposta nasce com uma oportunidade atrás dela, e as duas andam
   juntas:

     · o VALOR da oportunidade é o valor mensal da proposta, recalculado a cada
       mudança de posto, de escala ou de margem;
     · a FASE do funil segue o status da proposta — enviada vira Proposta, em
       análise vira Negociação, aprovada ou aceita vira Ganho, recusada vira
       Perdido.

   Quem já tinha oportunidade (proposta criada a partir do pipeline) mantém a
   dela; ninguém ganha duas. */
const FASE_DO_STATUS = {
  'Rascunho':   'Qualificação',
  'Enviada':    'Proposta',
  'Em análise': 'Negociação',
  'Aprovada':   'Ganho',
  'Recusada':   'Perdido',
};

/* A probabilidade de cada fase vem da lista `op_fase` (coluna num), que é
   editável em Configurações — não fica fixa no código. */
function probDaFase(fase){
  const l = LISTA('op_fase').find(x => x.valor === fase);
  return l && l.num != null ? +l.num : 50;
}

async function garantirOportunidade(p, lead){
  if(!p || p.opId) return p.opId;
  const c = calcProposta(p);
  const op = await DB.add('ops', {
    titulo: p.titulo || ('Proposta ' + p.numero),
    leadId: p.leadId ?? lead?.id ?? null,
    valor: Math.round((c.mensalC || 0) / 100),
    fase: FASE_DO_STATUS[p.status] || 'Qualificação',
    prob: probDaFase(FASE_DO_STATUS[p.status] || 'Qualificação'),
    /* A data provável de fechamento é o fim da validade da proposta: é o
       prazo que o próprio documento dá ao cliente para responder. */
    fecha: somaDias(p.emissao || hoje(), +p.validade || 30),
    owner: p.owner || Sessao.nome(),
  });
  await DB.upd('propostas', p.id, {opId: op.id});
  p.opId = op.id;
  return op.id;
}

/* Mantém a oportunidade igual à proposta. Chamada depois de cada gravação —
   é barata: só grava quando algum campo realmente mudou. */
/* O elo no sentido contrário: a oportunidade foi ganha no funil, então a
   proposta que a originou não pode continuar em Rascunho. Sem isto o sistema
   se contradiz — o funil diz "ganho", a lista de propostas diz "rascunho" e o
   dashboard conta as duas coisas. Congelar junto é o mesmo motivo de sempre:
   o contrato tem que usar exatamente o que o cliente aceitou.
   Devolve as propostas aprovadas, para quem chamou oferecer o contrato. */
async function aprovarPropostasDaOp(opId){
  const props = DB.list('propostas').filter(p => +p.opId === +opId && p.status !== 'Aprovada');
  for(const p of props){
    try{
      await DB.upd('propostas', p.id, {status:'Aprovada'});
      if(!p.snapshot){
        await api(`/api/propostas/${p.id}/congelar`, {method:'POST', body:'{}'});
        await DB.refrescar('propostas', p.id);
      }
      Historico.limpar('Proposta', p.id);
    }catch(e){ toast('Proposta ' + p.numero + ': ' + e.message); }
  }
  return DB.list('propostas').filter(p => +p.opId === +opId && p.status === 'Aprovada');
}

async function sincronizarOportunidade(p){
  if(!p) return;
  /* Rascunho não entra no funil. Sem esta linha, abrir "Nova proposta" criava
     uma oportunidade no pipeline — que é justamente o lixo que o rascunho
     local existe para evitar, só que numa tabela diferente. */
  if(DB.eRascunho(p.id)) return;
  /* Proposta antiga, de antes de existir o elo, não tem oportunidade — e sem
     ela continua fora do funil para sempre. A primeira gravação conserta. */
  if(!p.opId) await garantirOportunidade(p, DB.get('leads', p.leadId));
  if(!p.opId) return;
  const op = DB.get('ops', p.opId);
  if(!op) return;
  const c = calcProposta(p);
  const valor = Math.round((c.mensalC || 0) / 100);
  const fase = p.aceite_em ? 'Ganho' : (FASE_DO_STATUS[p.status] || op.fase);
  const campos = {};
  if(Math.abs(+op.valor - valor) >= 1) campos.valor = valor;
  if(op.fase !== fase){
    campos.fase = fase;
    campos.prob = probDaFase(fase);
    if(['Ganho','Perdido'].includes(fase)) campos.fechada_em = hoje();
  }
  if(op.titulo !== p.titulo && p.titulo) campos.titulo = p.titulo;
  if(!Object.keys(campos).length) return;
  try{ await DB.upd('ops', p.opId, campos); }catch(e){ /* o toast já saiu */ }
}

/* somaDias já existe no util.js — os arquivos de tela compartilham o escopo
   global, então redeclarar com `const` derruba o ARQUIVO INTEIRO no navegador
   com "Identifier has already been declared". O node --check não pega isso:
   ele valida um arquivo por vez e não enxerga a colisão entre eles. */

/* ════════ CONFERÊNCIA ════════
   O que o botão "Abrir" mostra: a proposta inteira, aberta, sem nenhum campo
   editável. É a tela para bater o olho antes de mandar para o cliente.

   Ela existe porque o editor não serve para conferir. No editor cada número
   está do lado de um campo que pode mudá-lo, o painel da direita é um resumo
   de coluna estreita, e a memória de cálculo mora dentro de <details> por
   posto. Para responder "o ISS está certo? e o INSS?" era preciso abrir cinco
   gavetas e somar de cabeça.

   Aqui a regra é uma só: TODO número aparece com o nome, a alíquota e o valor
   em reais, e cada bloco fecha a própria soma. Nada de "16,53%" solto.

   Os dois blocos de imposto são separados de propósito, porque são coisas
   diferentes que a mesma palavra costuma juntar:

     ENCARGOS SOBRE A FOLHA  — INSS, RAT×FAP, terceiros, FGTS, 13º, férias,
       rescisão. Incidem sobre o salário, entram no CUSTO, e quem define é a
       lei trabalhista mais o regime.

     TRIBUTOS SOBRE O FATURAMENTO — PIS, COFINS, ISS, IRPJ, CSLL. Incidem
       sobre o preço de venda, saem POR DENTRO dele, e quem define é o regime
       tributário mais o município.

   Somar os dois num número só é o erro que faz empresa de facilities vender no
   prejuízo achando que tem 20% de margem. */
VIEWS.propostaResumo = function(){
  const p = DB.get('propostas', state.id);
  if(!p) return emptyState('Proposta não encontrada','');
  const c = calcProposta(p);
  const lead = DB.get('leads', p.leadId);
  const contato = DB.get('contatos', p.contatoId);
  const minima = CFGN('proposta_margem_minima', 8);
  const rascunho = DB.eRascunho(p.id);

  return `<div class="ed-topo">
   <button class="btn btn-sm" data-acao="irPara" data-v="propostas">← Propostas</button>
   <b>${rascunho ? 'Nova proposta' : esc(p.numero) + (p.versao > 1 ? ' · v' + p.versao : '')}</b>
   ${rascunho ? '<span class="tag t-amber">não salva</span>' : tagOf(p.status)}
   ${p.snapshot ? '<span class="tag t-blue" title="Valores congelados">🔒 congelada</span>' : ''}
   <div style="flex:1"></div>
   <button class="btn btn-sm" data-acao="editarProposta" data-id="${p.id}">Editar</button>
   ${rascunho ? '' : `
    <button class="btn btn-sm btn-primary" data-acao="gerarDoc" data-id="${p.id}" data-formato="pdf">
     ${ico('baixar')}Gerar PDF</button>`}
  </div>

  ${cabecalhoResumo(p, c, lead, contato, minima)}
  ${blocoConfEquipe(p, c)}
  ${blocoConfMateriais(p, c)}
  ${blocoConfImpostos(p, c, minima)}`;
};

/* ── o alto: três números, e só ───────────────────────────────────────────────
   Havia um quarto cartão com a CONVENÇÃO, e ele estava errado por construção:
   cada posto pode ter a sua — portaria pelo asseio, vigilância pela CCT dela —
   e um cartão só no topo dizia que a proposta inteira usava uma. A convenção
   agora aparece onde ela de fato manda: no cabeçalho de cada posto. */
function cabecalhoResumo(p, c, lead, contato, minima){
  const item = (r, v, sub) => `<div class="kpi"><div class="k">${r}</div>
    <div class="v">${v}</div>${sub ? `<div class="d">${sub}</div>` : ''}</div>`;
  return `<div class="card"><div class="card-h">
    <div style="flex:1"><h3>${esc(p.titulo || 'Proposta')}</h3>
     <p>${esc(lead?.empresa || 'sem cliente')}
      ${lead?.cnpj ? ' · CNPJ ' + esc(lead.cnpj) : ''}
      ${contato ? ' · aos cuidados de ' + esc(contato.nome) : ''}</p></div></div>
   <div class="card-b">
    <div class="kpis">
     ${item('Valor mensal', moneyC(c.mensalC), c.postos + ' posto' + (c.postos !== 1 ? 's' : '')
        + ' · ' + num(c.func) + ' funcionário' + (c.func !== 1 ? 's' : ''))}
     ${item('Sua margem', `<span style="color:${c.margem < minima ? 'var(--text)' : 'var(--blue)'}">${pctTxt(c.margem)}</span>`,
        moneyC(c.lucroC) + ' por mês' + (c.margem < minima ? ' · abaixo do mínimo de ' + pctTxt(minima,0) : ''))}
     ${item('Total do contrato', moneyC(c.contratoC), p.prazo + ' meses'
        + (c.implantacaoC ? ' · com ' + moneyC(c.implantacaoC) + ' de implantação' : ''))}
    </div>
   </div></div>`;
}

/* ── a equipe ────────────────────────────────────────────────────────────────
   Um cartão por posto, com a FOLHA ABERTA de uma pessoa.

   A versão anterior era uma tabela com uma coluna "salário-base", e era pouco:
   ninguém contrata um auxiliar por R$ 1.780. Quem confere precisa ver o que
   entra em cima do piso e — principalmente — o que NÃO entra, porque é aí que
   mora a discussão.

   O adicional noturno é o caso: ele não incide sobre o salário inteiro, incide
   só sobre as horas entre 22h e 5h, e cada 52'30" delas conta como uma hora
   cheia (art. 73 da CLT). Num turno 19h–7h isso dá 7 horas de 11 — 64%, não
   100%. Quando o sistema mostrava só o valor final, a pergunta "por que o
   noturno deu R$ 201 e não R$ 356?" não tinha resposta na tela. Agora tem:
   cada cartão diz quantas horas ganham adicional, quantas não ganham, e por
   que a conta é essa. */
function blocoConfEquipe(p, c){
  if(!c.itens.length) return `<div class="card mt"><div class="card-b">
    ${emptyState('Nenhum posto nesta proposta','')}</div></div>`;
  return `<div class="card mt"><div class="card-h">
    <div style="flex:1"><h3>Equipe</h3>
     <p>O que cada pessoa recebe, o que a empresa gasta e o preço de cada posto</p></div>
    <span class="tag t-blue">${money0C(c.precoMoC)}/mês</span></div>
   <div class="card-b">${c.itens.map((i, ix) => cartaoPosto(i, ix)).join('')}
    <div class="sum-row" style="border-top:2px solid var(--border-forte);padding-top:12px">
     <span class="lb"><b>Total da mão de obra</b></span>
     <span class="vl"><b>${moneyC(c.precoMoC)}</b></span></div>
   </div></div>`;
}

/* ── o cartão de um posto ── */
function cartaoPosto(i, ix){
  const linha = (rot, val, obs, forte) => `<div class="folha-l ${forte ? 'forte' : ''}">
    <div class="r">${rot}${obs ? `<div class="o">${obs}</div>` : ''}</div>
    <div class="v">${val}</div></div>`;

  const turno = i.turno || {};
  const dur = Calc.duracaoTurnoH(turno);
  const n = i.noturno || {};
  /* O divisor da hora é do CARGO quando ele tem o seu: na CCT dos bombeiros o
     operacional faz 180 h/mês e a chefia 220, dentro da mesma convenção.
     Mostrar a divisão inteira — e não a hora-base já arredondada — é o que faz
     a conta bater na calculadora: R$ 1.920 ÷ 220 dá R$ 8,7273, e os R$ 8,73
     que caberiam na tela erram o resultado final em nove centavos. */
  const horasMes = +(i.cargo?.horas_mensais) || +(i.cct?.horas_mensais) || 220;
  const horasDia = dur ? num(dur, 2) + 'h' : '—';

  /* ── a linha do noturno, nos quatro estados possíveis ── */
  let linhaNoturno;
  if(i.valorNoturnoC > 0){
    const foraH = Math.max(dur - n.horasRelogio, 0);
    linhaNoturno = linha(
      `Adicional noturno <span class="pv">${n.pct}%</span>`,
      moneyC(i.valorNoturnoC),
      `<b>Ganham adicional:</b> ${num(n.horasRelogio, 2)}h da jornada, as que caem
       entre ${esc(CFG('noturno_hora_inicio','22:00'))} e ${esc(CFG('noturno_hora_fim','05:00'))}
       — ${pctTxt(n.proporcao * 100, 0)} do turno.
       <br><b>Não ganham:</b> as outras ${num(foraH, 2)}h${foraH > 0
         ? ' do turno de ' + horasDia + ', que são hora normal' : ''}.
       <br>Hora ficta do art. 73 da CLT: cada 52 min e 30 s valem uma hora cheia,
       então as ${num(n.horasRelogio, 2)}h viram ${num(n.horasFicta, 2)}h por dia
       e ${num(n.horasMesFicta, 2)}h no mês.
       <br>Conta: ${moneyC(i.baseC)} ÷ ${num(horasMes)}h de jornada
       × ${n.pct}% × ${num(n.horasMesFicta, 2)}h = <b>${moneyC(i.valorNoturnoC)}</b>.`);
  } else if(n.aviso){
    linhaNoturno = linha('Adicional noturno',
      `<i style="color:var(--muted)">R$ 0,00</i>`, esc(n.aviso));
  } else if(n.marcado){
    linhaNoturno = linha('Adicional noturno', `<i style="color:var(--muted)">não calculado</i>`,
      'O turno está marcado como noturno mas não tem horas entre 22h e 5h.');
  } else {
    linhaNoturno = linha('Adicional noturno', `<i style="color:var(--muted)">não se aplica</i>`,
      `O turno ${esc(turno.nome || '')} (${esc(turno.hora_inicio || '—')}–${esc(turno.hora_fim || '—')})
       não pega nenhuma hora entre ${esc(CFG('noturno_hora_inicio','22:00'))} e
       ${esc(CFG('noturno_hora_fim','05:00'))}.`);
  }

  const brutoC = i.baseC + i.valorAdicC + i.valorNoturnoC + (i.intervaloC || 0);

  return `<div class="posto-c">
   <div class="posto-h">
    <span class="n">${ix + 1}</span>
    <div style="flex:1">
     <b>${esc(i.cargo?.nome || '—')}</b>
     <div class="cell-sub">${esc(i.escala?.nome || '—')} ·
      ${esc(turno.nome || '—')} ${turno.hora_inicio
        ? '(' + esc(turno.hora_inicio) + '–' + esc(turno.hora_fim) + ' · ' + horasDia + ')' : ''}
      ${i.cct?.nome ? ' · ' + esc(i.cct.nome) : ''}</div>
     ${i.obs ? `<div class="cell-sub">${esc(i.obs)}</div>` : ''}</div>
    <div class="posto-q">
     <div><b>${i.postos}</b> posto${i.postos !== 1 ? 's' : ''}</div>
     <div><b>${num(i.func)}</b> pessoa${i.func !== 1 ? 's' : ''}
      <span title="Uma escala 12x36 precisa de mais de uma pessoa por posto: entram a cobertura da folga, do absenteísmo e das férias">
       (fator ${num(i.fator, 3)}×)</span></div></div>
    <span class="tag t-blue">${money0C(i.precoC)}/mês</span>
   </div>

   <div class="sublabel">O que cada pessoa recebe por mês, na folha</div>
   <div class="folha">
    ${linha('Salário-base da convenção', moneyC(i.baseC),
       i.salarioPisoC && i.salarioPisoC !== i.baseC
         ? 'piso da categoria: ' + moneyC(i.salarioPisoC) : '')}
    ${i.adics.map(a => linha(
       `${esc(a.nome)} <span class="pv">${a.pct}%</span>`, moneyC(a.valorC),
       `calculado sobre ${esc(a.baseNome)} — ${moneyC(a.baseC)}`)).join('')}
    ${linhaNoturno}
    ${(i.afastados || []).map(a => linha(
       `<s>${esc(a.nome)} <span class="pv">${a.pct}%</span></s>`,
       `<s style="color:var(--muted)">${moneyC(a.valorC)}</s>`,
       'Não é pago: insalubridade e periculosidade não se acumulam (art. 193 §2º ' +
       'da CLT) — paga-se a maior das duas.')).join('')}
    ${i.intervaloC > 0 ? linha('Intervalo intrajornada indenizado', moneyC(i.intervaloC),
       'Posto sem quem cubra o intervalo: o período é pago com adicional de 50% ' +
       '(art. 71 §4º da CLT).') : ''}
    ${linha('<b>Salário bruto na folha</b>', `<b>${moneyC(brutoC)}</b>`, '', true)}
   </div>

   ${(i.beneficios || []).length ? `
    <div class="sublabel">Benefícios da convenção — não são salário e não têm encargo</div>
    <div class="folha">
     ${i.beneficios.map(b => linha(esc(b.nome), moneyC(b.custoC),
        b.descontoC
          ? `${moneyC(b.valorC)} de valor cheio − ${moneyC(b.descontoC)} descontados do
             empregado por lei${b.unid === 'dia' ? ' · ' + num(b.dias) + ' dias no mês' : ''}`
          : (b.unid === 'dia' ? num(b.dias) + ' dias no mês' : 'sem desconto do empregado'))).join('')}
     ${linha('<b>Total de benefícios</b>', `<b>${moneyC(i.benefC)}</b>`, '', true)}
    </div>` : ''}

   <div class="posto-f">
    <span>Salário + adicionais <b>${moneyC(brutoC)}</b></span>
    <span>13º, férias e encargos <b>${moneyC(i.encargosC)}</b>
     <span class="pv">${pctTxt(i.encargosPct)}</span></span>
    <span>Benefícios <b>${moneyC(i.benefC)}</b></span>
    <span>Rescisão e cobertura <b>${moneyC(i.m3.total + i.m4.total)}</b></span>
    <span class="tot">Custo por pessoa <b>${moneyC(i.unitFuncC)}</b></span>
   </div>
  </div>`;
}

/* ── materiais e equipamentos ── */
function blocoConfMateriais(p, c){
  const nada = !c.materiais.length && !c.equipamentos.length;
  if(nada) return '';
  return `<div class="card mt"><div class="card-h">
    <div style="flex:1"><h3>Materiais e equipamentos</h3>
     <p>Insumo entra pelo prazo de troca; equipamento, pelo valor do mês</p></div>
    <span class="tag t-blue">${money0C(c.precoMatC + c.precoEquipC)}/mês</span></div>
   <table><thead><tr><th>Item</th><th>Como entra na conta</th>
    <th class="num">Qtd</th><th class="num">Custo/mês</th>
    <th class="num">Preço/mês</th></tr></thead><tbody>
   ${c.materiais.map(m => `<tr>
     <td class="cell-main">${esc(m.mat?.nome || '—')}
      <div class="cell-sub">${esc(m.mat?.categoria || '')}</div></td>
     <td class="cell-sub">${moneyC(m.unitC)} ${m.meses > 1
        ? '÷ ' + m.meses + ' meses = ' + moneyC(m.unitMesC) + '/mês' : 'por mês'}
      <div class="cell-sub">× ${m.base === 'contrato' ? '1 (fixo no contrato)'
        : num(m.mult, 2) + (m.base === 'posto' ? ' postos' : ' pessoas')}</div></td>
     <td class="num">${num(m.qtd)}</td>
     <td class="num">${moneyC(m.custoC)}</td>
     <td class="num" style="font-weight:700">${moneyC(m.precoC)}</td></tr>`).join('')}
   ${c.equipamentos.map(e => `<tr>
     <td class="cell-main">${esc(e.eq?.nome || '—')}
      ${e.eq?.marca_modelo ? `<div class="cell-sub">${esc(e.eq.marca_modelo)}</div>` : ''}</td>
     <td class="cell-sub">${e.unico
        ? 'cobrado uma vez, na implantação' : moneyC(e.unitC) + ' por mês, cada'}</td>
     <td class="num">${e.qtd}</td>
     <td class="num">${moneyC(e.custoC)}</td>
     <td class="num" style="font-weight:700">${moneyC(e.precoC)}
      ${e.unico ? '<div class="cell-sub">implantação</div>' : ''}</td></tr>`).join('')}
   </tbody></table></div>`;
}

/* ── como o valor se forma ────────────────────────────────────────────────────
   A coluna que FECHA. É a única do sistema que a pessoa pode somar na
   calculadora e bater com o total, e é por isso que ela existe. */
/* ── impostos, encargos e o que sobra ────────────────────────────────────────
   Eram TRÊS cartões: a cascata do valor, os tributos e os encargos, cada um com
   a sua tabela. Viraram um.

   Duas escolhas de recorte aqui:

   1. IRPJ, adicional de IRPJ e CSLL viram UMA linha. São três alíquotas que
      dependem da mesma presunção de 32% e ninguém as decide separadamente —
      mas some-las com o resto e mostrar só ISS, PIS e COFINS faria a coluna
      não fechar, que é o defeito que este sistema já teve uma vez. Agrupar
      mantém as quatro linhas que se lê e a soma exata.

   2. Os encargos da folha aparecem como UM número, com o detalhe no title.
      Eles não entram nesta soma — já estão dentro da mão de obra — e repetir a
      tabela de INSS, RAT, terceiros e FGTS aqui era o principal motivo de a
      tela parecer um relatório contábil. */
function blocoConfImpostos(p, c, minima){
  const det = c.trib?.detalhe || [];
  const cidade = CFG('empresa_cidade','São Paulo');
  const e = c.par.encargos;

  /* Junta o que é da mesma decisão; mantém separado o que se confere sozinho. */
  const eLucro = nome => /IRPJ|CSLL/i.test(nome);
  const sobreLucro = det.filter(([nome]) => eLucro(nome));
  const linhas = det.filter(([nome]) => !eLucro(nome));
  if(sobreLucro.length) linhas.push([
    'IRPJ e CSLL', sobreLucro.reduce((s, x) => s + x[1], 0),
    sobreLucro.map(([n, pc]) => n + ' (' + pctTxt(pc, 2) + ')').join(' · ')]);

  const l = (rot, pct, val, obs) => `<tr>
    <td class="cell-main">${rot}${obs ? `<div class="cell-sub">${obs}</div>` : ''}</td>
    <td class="num">${pct}</td><td class="num">${val}</td></tr>`;

  const custoTotalC = c.custoDiretoC + c.ciC;

  return `<div class="card mt"><div class="card-h">
    <div style="flex:1"><h3>Impostos e o que sobra</h3>
     <p>Some a coluna: ela fecha exatamente no valor mensal</p></div>
    <span class="tag t-amber">${pctTxt(c.T * 100, 2)} de imposto</span></div>
   <table><thead><tr><th>Imposto sobre o faturamento</th>
    <th class="num">Alíquota</th><th class="num">Por mês</th></tr></thead><tbody>
   ${linhas.map(([nome, pct, obs]) => l(
      /^ISS/i.test(nome) ? esc(nome) + ' · ' + esc(cidade) : esc(nome),
      pctTxt(pct, 2), moneyC(arredC(c.mensalC * pct / 100)),
      obs ? esc(obs) : (/^ISS/i.test(nome)
        ? 'itens 7.10, 11.02 e 17.05 da LC 116/2003' : ''))).join('')}
   </tbody><tfoot><tr><td><b>Total de impostos</b></td>
    <td class="num"><b>${pctTxt(c.T * 100, 2)}</b></td>
    <td class="num"><b>${moneyC(c.impostoC)}</b></td></tr></tfoot></table>

   <table class="conf-conta"><tbody>
    <tr><td>Custo total
      <div class="cell-sub">mão de obra${c.insumosC ? ', materiais' : ''}${
        c.equipMensalC ? ', equipamentos' : ''} e ${pctTxt(c.par.ci)} de administração ·
        encargos da folha de <b title="INSS ${num(e.inss,0)}% + RAT×FAP ${num(c.par.ratEf,2)}% + ${
          e.terceirosIsento ? 'terceiros isento' : 'terceiros ' + num(e.terceiros,2) + '%'
        } + FGTS ${num(e.fgts,0)}% — já dentro da mão de obra">${pctTxt(c.par.encPct)}</b>
        já inclusos</div></td>
     <td class="num">${moneyC(custoTotalC)}</td></tr>
    <tr><td>Impostos</td><td class="num">${moneyC(c.impostoC)}</td></tr>
    ${c.descontoC > 0 ? `<tr><td>Desconto dado ao cliente
      <div class="cell-sub">${pctTxt(p.desconto)}</div></td>
      <td class="num">− ${moneyC(c.descontoC)}</td></tr>` : ''}
    <tr class="forte"><td><b>Seu lucro</b>
      <div class="cell-sub">margem de ${pctTxt(c.margem)}${c.margem < minima
        ? ' — <b>abaixo do mínimo de ' + pctTxt(minima, 0) + '</b>' : ''}</div></td>
     <td class="num"><b>${moneyC(c.lucroC)}</b></td></tr>
    <tr><td><b>VALOR MENSAL</b></td><td class="num"><b>${moneyC(c.mensalC)}</b></td></tr>
   </tbody></table>
   ${c.implantacaoC > 0 ? `<div class="card-b">
     <div class="faixa">${ico('ok')}<span class="sp">Mais <b>${moneyC(c.implantacaoC)}</b>
      de implantação, cobrados uma única vez no primeiro mês.</span></div></div>` : ''}
   </div>`;
}

/* ════════ EDITOR ════════ */
VIEWS.propostaEditor = function(){
  const p = DB.get('propostas', state.id);
  if(!p) return emptyState('Proposta não encontrada','');
  const c = calcProposta(p);
  const ctx = ctxProposta(p);
  const congelada = !!p.snapshot;
  const lead = DB.get('leads', p.leadId);
  const limite = CFGN('proposta_desconto_limite', 5);
  const encSoma = somaEncargosCCT(p.cctId);
  const vers = versoesDe(p).length;
  /* Rascunho: nada que dependa de a proposta existir no banco funciona ainda —
     PDF, e-mail, congelamento, versão, histórico. Em vez de deixar o botão lá
     para dar erro, ele some, e uma faixa explica que falta salvar. */
  const rascunho = DB.eRascunho(p.id);

  return `<div class="ed-topo">
   <button class="btn btn-sm" data-acao="irPara" data-v="propostas">← Propostas</button>
   <b>${rascunho ? 'Nova proposta' : esc(p.numero) + (p.versao > 1 ? ' · v' + p.versao : '')}</b>
   ${rascunho ? '<span class="tag t-amber">não salva</span>' : tagOf(p.status)}
   <div style="flex:1"></div>
   ${rascunho ? '' : `<span id="estadoSalvo" style="font-size:12px;color:var(--faint)">tudo salvo</span>`}
   ${rascunho || ganha(p) ? '' :
     `<button class="btn btn-sm" data-acao="marcarGanha" data-id="${p.id}">${ico('ok')}Marcar como ganha</button>`}
   ${ganha(p) ? '<span class="tag t-green">Ganha</span>' : ''}
   ${rascunho ? `<button class="btn btn-sm" data-acao="descartarRascunho">Descartar</button>` : ''}
   <button class="btn btn-sm ${rascunho ? 'btn-primary' : ''}" data-acao="salvarPropostaAgora">
    ${ico('ok')}${rascunho ? 'Salvar proposta' : 'Salvar'}</button>
  </div>

  ${rascunho ? `<div class="faixa aviso">${ico('aviso')}<span class="sp">
     <b>Esta proposta ainda não foi salva.</b> Monte o escopo, escolha os materiais
     e defina a margem — ao clicar em <b>Salvar proposta</b> ela recebe o número
     e entra na lista. Sair desta tela sem salvar descarta tudo.</span></div>` : ''}
  ${rascunho ? '' : faixaCongelamento(p, ctx)}
  ${rascunho ? '' : faixaAprovacao(p, limite)}
  ${p.aceite_em ? `<div class="faixa forte">${ico('ok')}<span class="sp">
     Aceita pelo cliente em <b>${esc(dth(p.aceite_em))}</b> por <b>${esc(p.aceite_nome || '—')}</b>.</span>
     ${!DB.list('contratos').some(x => +x.propostaId === p.id)
       ? '<button class="btn btn-sm" data-acao="contratoDaProposta" data-id="' + p.id + '">Gerar contrato</button>' : ''}
    </div>` : ''}

  <div class="builder">
   <div>
    ${cartaoIdentificacao(p, congelada, lead)}
    ${blocoEscopo(p, c, ctx, congelada)}
    ${blocoMateriais(p, c, ctx, congelada)}
    ${blocoCondicoes(p, c, congelada)}

    ${gaveta('avancado', 'Avançado — regime, encargos e parâmetros de cálculo',
      'Já vem tudo certo de Configurações. Abra só se ESTA proposta for exceção.',
      () => abaPrecificacao(p, c, ctx.cct, encSoma))}
    ${rascunho ? '' : gaveta('documento', 'Documento, envio e link de aceite',
      'Modelo do PPT, quais slides entram, versões geradas e o link que o cliente assina.',
      () => abaDocumento(p, c, lead))}
    ${rascunho ? '' : gaveta('versoes', 'Versões',
      vers <= 1 ? 'Só esta.' : vers + ' versões desta proposta.',
      () => abaVersoes(p))}
    ${rascunho ? '' : gaveta('historico', 'Histórico',
      'Cada mudança de situação, documento gerado e e-mail enviado.',
      () => blocoHistorico('Proposta', p.id, p.leadId))}
   </div>

   <div class="sum-card" id="painelResumo">${painelResumo(p, c, encSoma, ctx.cct)}</div>
  </div>`;
};

/* ── gavetas ─────────────────────────────────────────────────────────────────
   Não são <details>. O editor repinta a tela inteira a cada campo gravado, e o
   navegador fecharia a gaveta no meio da digitação — o que é pior do que não
   ter gaveta nenhuma. Quem guarda o que está aberto é o `state`, que sobrevive
   ao render.

   Uma de cada vez, de propósito: com a de precificação e a de documento
   abertas juntas a página passa de três telas de altura, e o resumo — que é
   grudado no topo — perde a referência do que está sendo olhado. */
function gaveta(k, titulo, sub, conteudo){
  const aberta = state.gaveta === k;
  return `<div class="gaveta ${aberta ? 'aberta' : ''}">
   <button class="gaveta-h" data-acao="gaveta" data-g="${esc(k)}" aria-expanded="${aberta}">
    <span class="gaveta-i" aria-hidden="true"></span>
    <span class="gaveta-t">${titulo}</span>
    ${sub ? `<span class="gaveta-s">${sub}</span>` : ''}
   </button>
   ${aberta ? `<div class="gaveta-b">${conteudo()}</div>` : ''}</div>`;
}

/* ── faixas de estado ── */
function faixaCongelamento(p, ctx){
  if(p.snapshot) return `<div class="faixa">${ico('cadeado')}
    <span class="sp">Valores <b>congelados</b> em ${esc(dth(p.congelada_em || ctx.congeladoEm))}.
      Reajuste da convenção não altera mais esta proposta — é isso que faz o PDF
      de hoje ser igual ao que o cliente recebeu.</span>
    ${p.status === 'Rascunho'
      ? `<button class="btn btn-sm" data-acao="descongelar" data-id="${p.id}">Voltar a acompanhar a CCT</button>`
      : `<button class="btn btn-sm" data-acao="recongelar" data-id="${p.id}">Recongelar com os valores de hoje</button>`}
   </div>`;
  if(p.status !== 'Rascunho') return `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Esta proposta está <b>${esc(p.status)}</b> e ainda acompanha a
      convenção viva: um reajuste de CCT muda o valor dela sozinho.</span>
    <button class="btn btn-sm btn-primary" data-acao="congelar" data-id="${p.id}">Congelar agora</button></div>`;
  return '';
}

function faixaAprovacao(p, limite){
  if(p.aprovacao_status === 'pendente') return `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Desconto de <b>${pctTxt(p.desconto)}</b> acima do limite de
      ${pctTxt(limite,0)} — <b>aguardando aprovação</b>.</span>
    ${Sessao.podeGerir() ? `
      <button class="btn btn-sm" data-acao="decidirAprovacao" data-id="${p.id}" data-decisao="recusado">Recusar</button>
      <button class="btn btn-sm btn-primary" data-acao="decidirAprovacao" data-id="${p.id}" data-decisao="aprovado">Aprovar</button>`
     : '<span class="tag t-amber">com o gestor</span>'}</div>`;
  if(p.aprovacao_status === 'aprovado') return `<div class="faixa">${ico('ok')}
    <span class="sp">Desconto de ${pctTxt(p.desconto)} <b>aprovado</b> em ${esc(dth(p.aprovacao_em))}.</span></div>`;
  if(p.aprovacao_status === 'recusado') return `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Desconto <b>recusado</b>${p.aprovacao_obs ? ': ' + esc(p.aprovacao_obs) : ''}.
      Ajuste o desconto e peça de novo.</span></div>`;
  if(+p.desconto > limite) return `<div class="faixa aviso">${ico('aviso')}
    <span class="sp">Desconto de <b>${pctTxt(p.desconto)}</b> passa do limite de
      ${pctTxt(limite,0)} e precisa de aprovação antes do envio.</span>
    <button class="btn btn-sm btn-primary" data-acao="pedirAprovacao" data-id="${p.id}">Pedir aprovação</button></div>`;
  return '';
}

/* ── identificação ───────────────────────────────────────────────────────────
   Quatro campos numa linha. Eram oito num cartão inteiro: contato, emissão,
   validade e prazo desceram para as CONDIÇÕES, que é onde essas decisões são
   tomadas — e não no alto da tela, antes de existir um posto sequer.

   A convenção fica aqui em cima porque é ela que manda em tudo o que vem
   abaixo: cargo, salário, benefício e data-base saem dela. */
function cartaoIdentificacao(p, congelada, lead){
  const trava = congelada ? 'disabled' : '';
  return `<div class="card"><div class="card-b">
   <div class="ident">
    <div class="f" style="flex:3 1 230px"><label>Título da proposta</label>
     <input value="${esc(p.titulo)}" data-mudar="campoProposta" data-campo="titulo"></div>
    <div class="f" style="flex:2 1 190px"><label>Cliente</label>
     <div class="com-botao">
      <select data-mudar="trocarLead" ${trava}>${optsReg(DB.list('leads'), p.leadId, x => x.empresa)}</select>
      ${congelada ? '' : `<button class="btn btn-sm" data-acao="formLead" data-vincular="proposta"
        title="Cadastrar um cliente novo sem sair daqui — ele já entra escolhido nesta proposta">+ Novo</button>`}
     </div></div>
    <div class="f" style="flex:2 1 190px">
     <label title="Define cargos, salários e benefícios de todos os postos">Convenção coletiva</label>
     <select data-mudar="trocarCCT" ${trava}>${optsReg(
       /* Só as convenções ativas — mais a que esta proposta já usa, senão
          trocar de aba apagaria a escolha de uma proposta antiga. Mesma regra
          do seletor por posto, que já filtrava assim. */
       DB.list('ccts').filter(x => x.ativo || +x.id === +p.cctId),
       p.cctId, x => x.nome)}</select></div>
    <div class="f" style="flex:1 1 130px"><label>Situação</label>
     <select data-mudar="trocarStatus">${optsLista('proposta_status', p.status)}</select></div>
   </div>
   ${congelada ? nota('Congelada: a convenção não pode ser trocada sem descongelar.') : ''}
   ${lead ? `<div class="cell-sub" style="margin-top:9px">
     CNPJ ${esc(lead.cnpj || '—')} · ${esc(lead.cidade || '—')}/${esc(lead.uf || '')}
     · ${esc(lead.contato_nome || 'sem contato')}${lead.contato_email ? ' · ' + esc(lead.contato_email) : ''}
    </div>` : ''}
  </div></div>`;
}

/* ── 1 · escopo ── */
function blocoEscopo(p, c, ctx, congelada){
  const cargos = congelada ? Object.values(ctx.cargos) : cargosCCT(p.cctId);
  const benefs = congelada ? Object.values(ctx.beneficios) : benefCCT(p.cctId);
  /* O item calculado da proposta INTEIRA, achado pela posição original. É ele
     que tem o preço rateado; o calcItem() avulso não tem, e era por isso que
     todo posto exibia "R$ 0/mês" na etiqueta. */
  const porIx = Object.fromEntries(c.itens.map(i => [i.ix, i]));

  return `<div class="card mt"><div class="card-h">
    <span class="bloco-n">1</span>
    <div style="flex:1"><h3>Escopo</h3>
     <p>Os postos de trabalho. Cargo, salário e benefícios saem da convenção.</p></div>
    <span class="tag t-blue">${money0C(c.precoMoC)}/mês</span>
    <button class="btn btn-sm btn-primary" data-acao="addPosto"
      ${cargos.length && !congelada ? '' : 'disabled'}>+ Posto</button></div>
   <div class="card-b">
   ${!cargos.length
     ? emptyState('A convenção selecionada não tem cargos',
        `<button class="btn btn-sm mt" data-acao="abrirCCT" data-id="${p.cctId}">Cadastrar cargos na CCT</button>`)
     : (p.itens || []).length
     ? p.itens.map((it, ix) => linhaPosto(p, it, ix, cargos, benefs, congelada, porIx[ix])).join('')
     : emptyState('Nenhum posto ainda',
        'Clique em "+ Posto". Cargo, escala, turno e os benefícios da convenção já vêm marcados.')}
   </div></div>`;
}

/* ── 2 · materiais e equipamentos ────────────────────────────────────────────
   Os dois no mesmo bloco porque, para quem monta, são a mesma pergunta: "o que
   mais entra além de gente?". Para o cálculo não são — material é o MÓDULO 5,
   com custo pelo prazo de troca, e equipamento é valor cheio no mês —, mas
   essa distinção é trabalho do motor, não do vendedor.

   O que a tela precisa deixar claro é o MULTIPLICADOR. A mesma linha de
   uniforme custa muito mais num 12x36 do que num comercial, porque o fator de
   cobertura faz o headcount ser bem maior que o número de postos. Por isso
   cada linha mostra a conta já feita: "2 × 14 pessoas". */
function blocoMateriais(p, c, ctx, congelada){
  const mats = DB.list('materiais').filter(m => m.ativo);
  const eqs = DB.list('equipamentos').filter(e => e.ativo);
  const trava = congelada ? 'disabled' : '';
  const semPosto = !(p.itens || []).length;

  const linhaMat = (m, ix) => {
    const mat = congelada ? (ctx.materiais || {})[String(m.id)] : DB.get('materiais', m.id);
    const cm = c.materiais.find(x => x.mat && +x.mat.id === +m.id);
    const base = cm ? cm.base : (mat?.base || 'funcionario');
    return `<div class="eqitem">
     <select data-mudar="campoMaterial" data-ix="${ix}" data-campo="id" data-numero="1" ${trava}>
      ${optsReg(mats.length ? mats : (mat ? [mat] : []), m.id, x => x.nome)}</select>
     <input type="number" min="0" step="0.5" value="${m.qtd}"
       title="Quantidade ${esc(Calc.MAT_BASES[base] || '')}"
       data-mudar="campoMaterial" data-ix="${ix}" data-campo="qtd" data-numero="1" ${trava}>
     <span class="tag t-gray">${esc(Calc.MAT_BASES[base] || '—')}</span>
     <span class="pr" title="Preço de venda — custo já com markup e tributos">${cm ? moneyC(cm.precoC) : '—'}</span>
     ${congelada ? '' : `<button class="btn btn-sm btn-icon" title="Excluir"
       data-acao="delMaterial" data-ix="${ix}">${ico('lixo')}</button>`}
     ${cm ? `<span class="sub">${moneyC(cm.unitMesC)}/mês cada${cm.meses > 1
        ? ` <span title="Custo de aquisição dividido pelo prazo de troca">(${moneyC(cm.unitC)} ÷ ${cm.meses} meses)</span>` : ''}
       · ${num(cm.qtd)} × ${cm.base === 'contrato' ? '1 contrato'
          : num(cm.mult, 2) + (cm.base === 'posto' ? ' postos' : ' pessoas')}
       = <b>${moneyC(cm.custoC)}</b> de custo</span>` : ''}
    </div>`;
  };

  const linhaEq = (e, ix) => {
    const eq = congelada ? ctx.equipamentos[String(e.id)] : DB.get('equipamentos', e.id);
    const calcEq = c.equipamentos.find(x => x.eq && +x.eq.id === +e.id);
    return `<div class="eqitem">
     <select data-mudar="campoEquip" data-ix="${ix}" data-campo="id" data-numero="1" ${trava}>
      ${optsReg(eqs.length ? eqs : (eq ? [eq] : []), e.id,
         x => x.nome + (x.marca_modelo ? ' — ' + x.marca_modelo : ''))}</select>
     <input type="number" min="1" value="${e.qtd}" data-mudar="campoEquip" data-ix="${ix}"
       data-campo="qtd" data-numero="1" ${trava}>
     <span class="tag ${eq && eq.tipo === 'Único' ? 't-amber' : 't-blue'}">${esc(eq?.tipo || '—')}</span>
     <span class="pr" title="Preço de venda — custo já com markup e tributos">${calcEq ? moneyC(calcEq.precoC) : '—'}</span>
     ${congelada ? '' : `<button class="btn btn-sm btn-icon" title="Excluir"
       data-acao="delEquip" data-ix="${ix}">${ico('lixo')}</button>`}
    </div>`;
  };

  return `<div class="card mt"><div class="card-h">
    <span class="bloco-n">2</span>
    <div style="flex:1"><h3>Materiais e equipamentos</h3>
     <p>Uniforme, EPI e insumos pelo prazo de troca; equipamentos pelo valor mensal.</p></div>
    <span class="tag t-blue">${money0C(c.precoMatC + c.precoEquipC)}/mês</span></div>
   <div class="card-b">

    <div class="sublabel" style="margin-top:0">Materiais e insumos</div>
    ${semPosto && (p.materiais || []).length ? `<div class="faixa aviso">${ico('aviso')}
      <span class="sp">Sem posto nenhum, material por funcionário e por posto multiplica por
       zero. Monte o escopo primeiro.</span></div>` : ''}
    <div class="addrow">
     <div class="f"><label>Material</label>
      <select id="matSel">${mats.length
        ? optsReg(mats, 0, x => x.nome + ' · ' + money0(x.valor)
            + (x.meses > 1 ? '/' + x.meses + 'm' : '/mês'))
        : '<option value="">Nenhum cadastrado</option>'}</select></div>
     <div class="f" style="flex:0 0 110px"><label>Quantidade</label>
      <input id="matQtd" type="number" min="0" step="0.5" value="1"></div>
     <button class="btn btn-primary" data-acao="addMaterial" ${mats.length && !congelada ? '' : 'disabled'}>
      ${ico('mais')}Adicionar</button>
     <button class="btn" data-acao="irPara" data-v="materiais">Cadastrar material</button>
    </div>
    ${(p.materiais || []).length ? p.materiais.map(linhaMat).join('')
      : emptyState('Nenhum material na proposta',
         'Uniforme, EPI, exames e produto de limpeza — o Módulo 5 da planilha.')}

    <div class="sublabel">Equipamentos</div>
    <div class="addrow">
     <div class="f"><label>Equipamento</label>
      <select id="eqSel">${eqs.length
        ? optsReg(eqs, 0, x => x.nome + (x.marca_modelo ? ' — ' + x.marca_modelo : '')
            + ' · ' + money0(x.valor) + (x.tipo === 'Único' ? ' (único)' : '/mês'))
        : '<option value="">Nenhum cadastrado</option>'}</select></div>
     <div class="f" style="flex:0 0 110px"><label>Quantidade</label>
      <input id="eqQtd" type="number" min="1" value="1"></div>
     <button class="btn btn-primary" data-acao="addEquip" ${eqs.length && !congelada ? '' : 'disabled'}>
      ${ico('mais')}Adicionar</button>
     <button class="btn" data-acao="irPara" data-v="equipamentos">Cadastrar equipamento</button>
    </div>
    ${(p.equipamentos || []).length ? p.equipamentos.map(linhaEq).join('')
      : emptyState('Nenhum equipamento na proposta','Enceradeira, aspirador, carrinho.')}
   </div></div>`;
}

/* ── 3 · condições ───────────────────────────────────────────────────────────
   A MARGEM é o campo desta tela, e ela nasce VAZIA.

   Duas decisões aqui, e as duas são sobre confiança no número:

   1. NADA de valor padrão. Um campo pré-preenchido com um número plausível é
      aceito sem ser olhado — e margem é a decisão comercial de cada contrato,
      não uma configuração de sistema. Vazio, ele pergunta. O que a tela mostra
      é o MÍNIMO da empresa, que é informação, não sugestão.

   2. NADA de "lucro de planilha" nesta tela. Esse é o nome que a IN SEGES
      05/2017 dá ao markup sobre o custo, e ele não é margem: 18% de lucro de
      planilha com T de 16,53% entregam 12,73% de margem. Quem vende pensa em
      margem. O markup continua existindo, calculado por trás, e editável na
      gaveta de avançado — que é onde uma licitação precisa dele. */
function blocoCondicoes(p, c, congelada){
  const cts = contatosLead(p.leadId);
  const minima = CFGN('proposta_margem_minima', 8);
  const limite = CFGN('proposta_desconto_limite', 5);
  const alvo = +p.margem_alvo || 0;
  const aviso = c.par.margemAviso || '';
  const noAlvo = alvo > 0 && !aviso;

  /* Três estados, três frases. A do meio é a que evita o suporte: sem margem
     definida o preço SAI do mesmo jeito, e sem esta frase parece bug. */
  const explica = noAlvo
    ? `O preço já está acertado para entregar exatamente esta margem.`
    : aviso
    ? esc(aviso)
    : `Ainda sem margem definida — este é o resultado do padrão da empresa.
       Digite ao lado a margem que você quer neste contrato.`;

  return `<div class="card mt"><div class="card-h">
    <span class="bloco-n">3</span>
    <div style="flex:1"><h3>Condições</h3>
     <p>Quanto você quer ganhar, por quanto tempo e para quem</p></div></div>
   <div class="card-b">

    <div class="alvo ${noAlvo ? 'ligado' : ''}">
     <div class="alvo-c"><label for="mgAlvo">Margem desejada</label>
      <div class="alvo-in">
       <input id="mgAlvo" type="number" step="0.5" min="0" placeholder="—"
        value="${alvo || ''}" data-mudar="campoProposta" data-campo="margem_alvo" data-numero="1"
        ${congelada ? 'disabled' : ''}>
       <span>%</span></div>
      <div class="alvo-min">mínimo da empresa: ${pctTxt(minima, 0)}</div></div>
     <div class="alvo-r">
      <b>${pctTxt(c.margem)}</b>
      <span>é a margem deste contrato hoje${c.margem < minima
        ? ' — <b style="color:var(--text)">abaixo do mínimo</b>' : ''}
       <br>${explica}</span>
     </div>
    </div>

    <div class="cond">
     <div class="f"><label>Desconto para o cliente (%)</label>
      <input type="number" step="0.5" min="0" value="${p.desconto ?? ''}"
       data-mudar="campoProposta" data-campo="desconto" data-numero="1">
      <span class="cell-sub">${+p.desconto > limite
        ? 'acima de ' + pctTxt(limite,0) + ' precisa de aprovação do gestor'
        : 'abatimento no valor final. Deixe 0 se não houver.'}</span></div>
     <div class="f"><label>Prazo contratual (meses)</label>
      <input type="number" min="1" value="${p.prazo}" data-mudar="campoProposta"
       data-campo="prazo" data-numero="1"></div>
     <div class="f"><label>Validade (dias)</label>
      <input type="number" min="1" value="${p.validade}" data-mudar="campoProposta"
       data-campo="validade" data-numero="1"></div>
     <div class="f"><label>Data de emissão</label>
      <input type="date" value="${esc(p.emissao)}" data-mudar="campoProposta" data-campo="emissao"></div>
     <div class="f"><label>Contato que recebe</label>
      <div class="com-botao">
       <select data-mudar="campoProposta" data-campo="contatoId" data-numero="1">
        <option value="">— Selecione —</option>
        ${optsReg(cts, p.contatoId, x => x.nome + (x.cargo ? ' — ' + x.cargo : ''))}</select>
       ${p.leadId ? `<button class="btn btn-sm" data-acao="formContato" data-lead="${p.leadId}"
         title="Outra pessoa do mesmo cliente">+ Novo</button>` : ''}
      </div></div>
    </div>

    <div class="fgrid" style="margin-top:14px">
     <div class="f full"><label>Descrição do escopo (vai para o PPT e o PDF)</label>
      <textarea data-mudar="campoProposta" data-campo="escopo"
       placeholder="Descreva os serviços contratados…">${esc(p.escopo)}</textarea></div>
     <div class="f full"><label>Observações e condições</label>
      <textarea data-mudar="campoProposta" data-campo="obs"
       placeholder="Condições comerciais, reajuste, exclusões…">${esc(p.obs)}</textarea></div>
    </div>
   </div></div>`;
}


/* ── um posto ─────────────────────────────────────────────────────────────────
   A memória de cálculo fica dentro de um <details>: quem só quer o número não
   vê nada, e quem estranhou o valor tem a conta inteira à mão. Sem isso o
   adicional noturno proporcional e o fator de cobertura viram "o sistema mudou
   meu preço". */
function linhaPosto(p, it, ix, cargos, benefs, congelada, ciPronto){
  /* Vem pronto do cálculo da proposta (com o preço rateado). O calcItem() aqui
     é só a rede: posto recém-criado, antes de o cálculo geral rodar. */
  const ci = ciPronto || calcItem(it, p);
  const trava = congelada ? 'disabled' : '';
  const escalas = DB.list('escalas').filter(e => e.ativo || +e.id === +it.escalaId);
  const turnos = DB.list('turnos').filter(t => t.ativo || +t.id === +it.turnoId);
  /* Cada posto pode vir de uma convenção diferente: portaria pelo asseio,
     vigilância pela CCT dela. Sem escolha, vale a da proposta. Congelada, as
     listas vêm do snapshot e o seletor some. */
  const cctPosto = +it.cctId || +p.cctId;
  if(!congelada){
    cargos = cargosCCT(cctPosto);
    benefs = benefCCT(cctPosto);
  }
  return `<div class="line">
   <div class="line-h"><div class="n">${ix+1}</div>
    <b>${esc(ci?.cargo.nome || 'Cargo')}</b>
    <span class="tag t-blue" title="Preço de venda deste posto">${money0C(ci?.precoC || 0)}/mês</span>
    ${congelada ? '' : `<button class="btn btn-sm btn-icon" data-acao="delPosto" data-ix="${ix}" title="Remover posto">${ico('lixo')}</button>`}</div>
   ${congelada ? '' : `<div class="f" style="margin-bottom:11px"><label>Convenção deste posto</label>
    <select data-mudar="campoPosto" data-ix="${ix}" data-campo="cctId" data-numero="1">
     ${optsReg(DB.list('ccts').filter(x => x.ativo || +x.id === cctPosto), cctPosto, x => x.nome)}
    </select></div>`}
   <div class="mini">
    <div class="f"><label>Cargo</label>
     <select data-mudar="campoPosto" data-ix="${ix}" data-campo="cargoId" data-numero="1" ${trava}>
      ${optsReg(cargos, it.cargoId, x => x.nome)}</select></div>
    <div class="f"><label>Escala</label>
     <select data-mudar="campoPosto" data-ix="${ix}" data-campo="escalaId" data-numero="1" ${trava}>
      ${optsReg(escalas, it.escalaId, x => x.nome)}</select></div>
    <div class="f"><label>Turno</label>
     <select data-mudar="campoPosto" data-ix="${ix}" data-campo="turnoId" data-numero="1" ${trava}>
      ${optsReg(turnos, it.turnoId, x => x.nome + ' (' + x.hora_inicio + '–' + x.hora_fim + ')')}</select></div>
    <div class="f"><label>Qtd. de postos</label>
     <input type="number" min="1" value="${it.qtd}" data-mudar="campoPosto" data-ix="${ix}"
      data-campo="qtd" data-numero="1" ${trava}></div>
   </div>

   <div class="sublabel">Adicionais</div>
   <div class="chips">${Calc.ADICIONAIS.map(a => {
     const on = (it.adicionais || []).includes(a.cod);
     return `<label class="chipbox ${on ? 'on' : ''}">
      <input type="checkbox" ${on ? 'checked' : ''} ${trava}
       data-mudar="alternarAdicional" data-ix="${ix}" data-cod="${esc(a.cod)}">
      ${esc(a.cod)} · ${esc(a.nome)}
      <span class="pv">${a.pct != null ? a.pct + '%' : 'livre'}</span></label>`; }).join('')}
    ${(it.adicionais || []).includes('A20') ? `<span class="pctbox">A20 —
     <input type="number" min="0" max="100" step="0.5" value="${it.a20 ?? 20}" ${trava}
      data-mudar="campoPosto" data-ix="${ix}" data-campo="a20" data-numero="1">%</span>` : ''}
   </div>
   ${ci?.noturno?.aviso ? `<div style="margin-top:8px"><span class="tag t-amber">${esc(ci.noturno.aviso)}</span></div>` : ''}
   ${ci && ci.valorNoturnoC > 0 ? `<div style="margin-top:8px">
     <span class="tag t-purple">noturno · ${num(ci.noturno.horasRelogio)}h entre 22h e 5h
      (${pctTxt(ci.noturno.proporcao * 100, 0)} da jornada)</span></div>` : ''}

   <div class="sublabel">Benefícios da convenção</div>
   <div class="chips">${benefs.length ? benefs.map(b => `
    <label class="chipbox ${(it.beneficios || []).includes(b.id) ? 'on' : ''}"
     ${b.condicional ? 'title="A convenção condiciona este benefício: só marque se o posto se enquadra."' : ''}>
     <input type="checkbox" ${(it.beneficios || []).includes(b.id) ? 'checked' : ''} ${trava}
      data-mudar="alternarBeneficio" data-ix="${ix}" data-bid="${b.id}">${esc(b.nome)}
     ${b.condicional ? '<span class="tag t-amber">se aplicável</span>' : ''}
     <span class="pv">${money0(b.valor)}${b.unid === 'dia' ? '/dia' : ''}</span></label>`).join('')
    : '<span style="font-size:12.5px;color:var(--muted)">Nenhum benefício cadastrado nesta CCT.</span>'}</div>

   <div class="sublabel">Observação deste posto (sai no documento)</div>
   <input value="${esc(it.obs || '')}" placeholder="Ex.: cobertura de recepção nos finais de semana"
     data-mudar="campoPosto" data-ix="${ix}" data-campo="obs" ${trava}
     style="width:100%;height:36px;border:1px solid var(--border-forte);border-radius:var(--r-sm);
      padding:0 12px;background:var(--surface-2);color:var(--text)">

   <div class="linefoot">
    <span>Salário-base: <b>${moneyC(ci?.baseC || 0)}</b></span>
    ${ci?.valorAdicC ? `<span>Adicionais: <b>${moneyC(ci.valorAdicC)}</b></span>` : ''}
    ${ci?.valorNoturnoC ? `<span title="Só sobre as horas entre 22h e 5h — a jornada inteira não ganha adicional">Noturno: <b>${moneyC(ci.valorNoturnoC)}</b></span>` : ''}
    <span>Encargos ${pctTxt(ci?.encargosPct || 0)}: <b>${moneyC(ci?.encargosC || 0)}</b></span>
    <span>Benefícios: <b>${moneyC(ci?.benefC || 0)}</b></span>
    <span>Custo por pessoa: <b style="color:var(--blue)">${moneyC(ci?.unitFuncC || 0)}</b></span>
    <span>Pessoas: <b>${num(ci?.func || 0)}</b> (fator ${num(ci?.fator || 1, 3)}×)</span>
   </div>
   ${ci ? memoriaCalculo(ci) : ''}
  </div>`;
}

function memoriaCalculo(ci){
  const l = (r, v, obs) => `<tr><td>${r}${obs ? `<div class="obs">${obs}</div>` : ''}</td><td>${v}</td></tr>`;
  const f = ci.fatorDetalhe;
  return `<details class="memoria"><summary>Memória de cálculo deste posto</summary>
   <table><tbody>
    ${l('Salário-base da convenção', moneyC(ci.baseC))}
    ${ci.adics.map(a => l(`${esc(a.nome)} (${a.pct}%)`, moneyC(a.valorC),
        `base: ${esc(a.baseNome)} — ${moneyC(a.baseC)}`)).join('')}
    ${ci.valorNoturnoC > 0 ? l(`Adicional noturno (${ci.noturno.pct}%)`, moneyC(ci.valorNoturnoC),
        `${num(ci.noturno.horasRelogio)}h de relógio entre 22h e 5h · hora ficta de 52'30" ·
         ${num(ci.noturno.horasMesFicta)}h/mês · hora-base ${moneyC(ci.noturno.valorHoraC)}`) : ''}
    ${ci.afastados && ci.afastados.length ? ci.afastados.map(a => l(
        `<i>${esc(a.nome)} (${a.pct}%) — não pago</i>`, `<i>${moneyC(a.valorC)}</i>`,
        'Insalubridade e periculosidade não se acumulam (art. 193 §2º da CLT): ' +
        'paga-se a maior das duas.')).join('') : ''}
    ${ci.intervaloC > 0 ? l('Intervalo intrajornada indenizado',
        moneyC(ci.intervaloC), 'Posto sem quem cubra o intervalo: o período é ' +
        'indenizado com adicional de 50% (art. 71 §4º da CLT).') : ''}
    ${l(`<b>MÓDULO 1 — remuneração</b>`, `<b>${moneyC(ci.m1)}</b>`)}
    ${l('2.1 · 13º e terço de férias (11,11%)', moneyC(ci.m2.s21))}
    ${l(`2.2 · Encargos sociais (${pctTxt(ci.encargosPct)})`, moneyC(ci.m2.s22),
        'Incide sobre o módulo 1 MAIS o submódulo 2.1 — a provisão de 13º e ' +
        'terço também é base de INSS, RAT, terceiros e FGTS.')}
    ${l('<b>2.3 · Benefícios</b> (sem encargos)', `<b>${moneyC(ci.m2.s23)}</b>`,
        'Art. 457 §2º e 458 §2º da CLT: VT, VR, cesta, plano e seguro de vida ' +
        'não sofrem encargo previdenciário.')}
    ${ci.beneficios.map(b => l('&nbsp;&nbsp;' + esc(b.nome), moneyC(b.custoC),
        b.descontoC ? `${moneyC(b.valorC)} − ${moneyC(b.descontoC)} de desconto legal do empregado
          (${b.tipo === 'pct_salario' ? b.pct + '% do salário, limitado ao valor'
             : b.pct + '% de coparticipação'})` : '')).join('')}
    ${l(`<b>MÓDULO 3 — provisão para rescisão (${pctTxt(ci.m3.pct)})</b>`,
        `<b>${moneyC(ci.m3.total)}</b>`,
        `sobre M1 + 2.1 · turnover de ${pctTxt(ci.m3.det.turnover,0)} · multa de 40% do FGTS
         ${pctTxt(ci.m3.det.multa)} + aviso indenizado ${pctTxt(ci.m3.det.apInd)}
         + FGTS do aviso ${pctTxt(ci.m3.det.fgtsAp)} + aviso trabalhado ${pctTxt(ci.m3.det.apTrab)}
         + encargos do trabalhado ${pctTxt(ci.m3.det.encAp)}`)}
    ${ci.m4.total > 0
      ? l(`<b>MÓDULO 4 — reposição do ausente (${pctTxt(ci.m4.pct)})</b>`,
          `<b>${moneyC(ci.m4.total)}</b>`,
          `férias 8,33% + ausências legais 0,82% + paternidade, acidente e maternidade
           0,08% + absenteísmo ${pctTxt(ci.m4.det.absenteismo*100)} · com encargos por cima`)
      : l('<i>Módulo 4 — reposição do ausente</i>', '<i>no headcount</i>',
          'A cobertura está no fator de funcionários por posto, logo abaixo. Ela entra ' +
          'UMA vez só: contá-la aqui e lá infla o preço em cerca de 13%.')}
    ${l('<b>Custo por funcionário</b>', `<b>${moneyC(ci.unitFuncC)}</b>`)}
    ${l(`Funcionários por posto`, num(ci.fator, 3) + '×',
        f.modo === 'calculado'
          ? `${num(f.horas_posto_dia)}h/dia × ${num(f.dias_semana)} dias ÷ ${num(f.horas_semanais)}h
             = ${num(f.fator_base,3)}× · absenteísmo ${pctTxt(f.absenteismo_pct)}
             ${f.cobertura_ferias_pct ? '· cobertura de férias ' + pctTxt(f.cobertura_ferias_pct) : ''}`
          : 'informado à mão no cadastro da escala')}
    ${l('<b>Custo do posto</b>', `<b>${moneyC(ci.unitPostoC)}</b>`)}
    ${l('<b>Preço de venda do posto</b>', `<b>${moneyC(ci.precoUnitC)}</b>`,
        'custo com markup e tributos rateados — é este valor que sai no documento')}
   </tbody></table></details>`;
}

/* ── painel lateral ── */
/* Campos do bloco de precificação. Vazio significa "usa o padrão global" — é
   assim que paramsPreco() lê, e é o que evita ter que preencher seis campos
   para orçar uma proposta comum. */
const sel_ = (campo, rotulo, opcoes, valor) => `
 <div class="f" style="margin-bottom:10px"><label>${rotulo}</label>
  <select data-mudar="campoProposta" data-campo="${campo}">
   ${opcoes.map(([v, r]) => `<option value="${esc(v)}"
     ${String(valor || '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`;
const numf = (campo, rotulo, valor) => `
 <div class="f" style="margin-bottom:10px"><label>${rotulo}</label>
  <input type="number" step="0.01" value="${valor ?? ''}" placeholder="padrão"
   data-mudar="campoProposta" data-campo="${campo}" data-numero="1"></div>`;

/* ── Reajuste ────────────────────────────────────────────────────────────────
   O campo que mais vale dinheiro num contrato longo, e o que mais some da
   proposta. Mão de obra se repactua pela DATA-BASE da convenção — 1º de
   janeiro no asseio e na vigilância de SP. Amarrar ao IPCA no aniversário do
   contrato custa de 4 a 8 meses de reajuste de folha por ano: a folha sobe em
   janeiro e o contrato só acompanha meses depois. Em cinco anos, é a margem
   inteira.

   Aqui a proposta mostra a data-base da convenção escolhida e quantos dias
   faltam, para a cláusula ser escrita antes de o contrato ser assinado. */
function blocoReajuste(cct, p){
  if(!cct) return '';
  if(!cct.data_base) return `<div class="faixa aviso" style="margin-top:12px">${ico('aviso')}
    <span class="sp">A convenção <b>${esc(cct.nome)}</b> está sem data-base cadastrada.
     Sem ela não dá para amarrar o reajuste do contrato à repactuação da categoria.</span>
    <button class="btn btn-sm" data-acao="formCCT" data-id="${cct.id}">Cadastrar</button></div>`;

  /* A próxima data-base é o mesmo dia e mês, no primeiro ano que ainda não
     passou. Data-base é anual, mesmo que a vigência da CCT seja de dois. */
  const base = new Date(cct.data_base + 'T12:00');
  const hoje_ = new Date();
  const prox = new Date(base); prox.setFullYear(hoje_.getFullYear());
  if(prox < hoje_) prox.setFullYear(hoje_.getFullYear() + 1);
  const dias = Math.round((prox - hoje_) / 86400000);
  const perto = dias <= 90;

  return `<div class="faixa ${perto ? 'aviso' : ''}" style="margin-top:12px;display:block">
    <div style="font-weight:700;margin-bottom:4px">Reajuste — data-base da convenção</div>
    <div style="font-size:12px;line-height:1.6;color:var(--muted)">
     Repactuação em <b style="color:var(--text)">${dt(prox.toISOString().slice(0,10))}</b>
     (${dias} dia${dias === 1 ? '' : 's'})${cct.reajuste_pct > 0
       ? ` · último reajuste da categoria: <b style="color:var(--text)">${pctTxt(cct.reajuste_pct)}</b>` : ''}.
     <br>Escreva no contrato: <i>repactuação automática na data-base da categoria,
     mediante apresentação da planilha</i> — nunca IPCA no aniversário do contrato,
     que atrasa o reajuste da folha em vários meses por ano.</div></div>`;
}

/* ── aba de precificação ─────────────────────────────────────────────────────
   Os parâmetros saíram do painel lateral. Ali eles ficavam espremidos numa
   coluna de 340px, embaixo de doze linhas de número — e a pessoa tinha que
   rolar o resumo inteiro para achar o desconto. Aqui cada coisa tem largura,
   e o painel lateral voltou a ser o que devia: o resultado. */
function abaPrecificacao(p, c, cct, encSoma){
  const slider = (campo, rotulo, max, passo, valor, casas = 1) => `
   <div class="f" style="margin-bottom:14px">
    <label>${rotulo} — ${(+valor).toFixed(casas).replace('.',',')}%</label>
    <input class="slider" type="range" min="0" max="${max}" step="${passo}" value="${valor}"
     data-digitar="ajustar" data-mudar="ajustarFim"
     data-campo="${campo}" data-casas="${casas}" data-rotulo="${esc(rotulo)}"></div>`;
  return `<div class="grid2">
   <div class="card"><div class="card-h"><div style="flex:1"><h3>Parâmetros desta proposta</h3>
     <p>Campo vazio usa o padrão de Configurações</p></div></div>
    <div class="card-b">
    <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
     <div class="sublabel" style="margin-top:0">Precificação desta proposta</div>
     ${sel_('regime','Regime tributário', [
        ['','padrão do sistema (' + esc(CFG('regime_tributario','presumido')) + ')'],
        ['presumido','Lucro Presumido'], ['real','Lucro Real'],
        ['simples','Simples Nacional — Anexo IV'], ['cprb','CPRB — desoneração 2026']], p.regime)}
     ${sel_('modo_preco','Modo', [
        ['','padrão do sistema'],
        ['privado','Proposta privada — IRPJ e CSLL no T'],
        ['licitacao','Licitação — sem IRPJ e CSLL (TCU)']], p.modo_preco)}
     ${sel_('cobertura_modo','Onde a cobertura entra', [
        ['','padrão do sistema'],
        ['headcount','No headcount — fator da escala'],
        ['modulo4','No Módulo 4 — vira linha da planilha']], p.cobertura_modo)}
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${numf('rat','RAT nominal (%)', p.rat)}
      ${numf('fap','FAP (0,5 a 2,0)', p.fap)}
      ${numf('turnover','Turnover anual (%)', p.turnover)}
      ${numf('absenteismo','Absenteísmo (%)', p.absenteismo)}
      ${numf('ci_pct','Custos indiretos (%)', p.ci_pct)}
      ${numf('iss','ISS (%)', p.iss)}
     </div>
     <div style="font-size:11.5px;color:var(--muted);margin:4px 0 14px">
      Campo vazio usa o padrão de Configurações. Hoje esta proposta calcula com
      <b>${esc(c.par.regime)}</b> · ${esc(c.par.modo)} · cobertura no
      <b>${c.par.coberturaModo === 'modulo4' ? 'Módulo 4' : 'headcount'}</b> ·
      RAT×FAP ${num(c.par.ratEf,2)}% · T de ${pctTxt(c.T*100,2)}.</div>
     ${slider('encargos','Encargos do submódulo 2.2', 120, 0.5, p.encargos)}
     <div style="font-size:11.5px;color:var(--muted);margin:-6px 0 12px">
      Em zero, quem monta é o regime <b>${esc(c.par.regime)}</b>:
      INSS ${num(c.par.encargos.inss)}% + RAT×FAP ${num(c.par.ratEf,2)}%
      ${c.par.encargos.terceiros ? '+ terceiros ' + num(c.par.encargos.terceiros) + '%' : '+ terceiros isento'}
      + FGTS 8% = <b>${num(c.par.encargos.total,2)}%</b></div>
     ${encSoma > 0 ? `<div style="font-size:11.5px;color:var(--muted);margin:-6px 0 12px">
       ${esc(cct?.nome || '')} soma <b>${encSoma.toFixed(2)}%</b>
       ${Math.abs(encSoma - (+p.encargos)) > 0.01
         ? `· <a href="#" style="color:var(--blue);font-weight:700" data-acao="aplicarEncargos"
             data-valor="${encSoma.toFixed(4)}">aplicar</a>` : '· aplicado'}</div>` : ''}
     ${+p.margem_alvo > 0 && !c.par.margemAviso ? `
      <div class="faixa" style="margin:0 0 12px">${ico('ok')}<span class="sp">
       O lucro de planilha está <b>sendo resolvido pela margem alvo</b> de
       ${pctTxt(p.margem_alvo)}, definida no bloco Condições — hoje dá
       <b>${pctTxt(c.par.lucro)}</b>. Mexer no controle abaixo não muda nada
       enquanto houver margem alvo.</span>
       <button class="btn btn-sm" data-acao="campoZero" data-campo="margem_alvo">Voltar a digitar o lucro</button>
      </div>` : ''}
     ${slider('markup','Lucro de planilha', 60, 0.5, p.markup)}
     ${slider('imposto','Tributos (T) — deixe em zero para usar o regime', 30, 0.01, p.imposto, 2)}
     ${slider('desconto','Desconto comercial', 25, 0.5, p.desconto)}

     <details class="memoria" style="margin-top:6px">
      <summary>De onde vem cada número</summary>
      <table><tbody>
       <tr><td>Salário, benefícios, adicionais, data-base e reajuste</td>
        <td><b>convenção coletiva</b><div class="obs">${esc(cct?.nome || 'nenhuma escolhida')}</div></td></tr>
       <tr><td>Encargos do 2.2 — INSS, RAT×FAP, terceiros, FGTS</td>
        <td><b>lei + regime</b><div class="obs">Lei 8.212/91 e Decreto 3.048/99. A convenção
         publica uma tabela de referência, mas quem define é a lei e o regime tributário
         da empresa.</div></td></tr>
       <tr><td>13º, férias, rescisão e cobertura</td>
        <td><b>módulos 2.1, 3 e 4</b><div class="obs">Calculados pelo sistema a partir do
         turnover e do absenteísmo — não vêm da convenção.</div></td></tr>
       <tr><td>PIS, COFINS, IRPJ, CSLL, Simples</td>
        <td><b>regime da empresa</b><div class="obs">Não têm nada a ver com a convenção:
         dependem do regime tributário e do faturamento, não do sindicato.</div></td></tr>
       <tr><td>ISS</td>
        <td><b>município</b><div class="obs">São Paulo: 2% para os itens 7.10, 11.02 e 17.05
         da LC 116/2003.</div></td></tr>
      </tbody></table></details>
    </div>
    </div></div>

   <div>
    <div class="card"><div class="card-h"><h3>Reajuste</h3></div>
     <div class="card-b">${blocoReajuste(cct, p) || '<div class="cell-sub">Sem convenção escolhida.</div>'}</div></div>
    <div class="card mt"><div class="card-h"><h3>Como este preço se forma</h3></div>
     <div class="card-b">
      <div class="sum-row"><span class="lb">Mão de obra — módulos 1 a 4</span><span class="vl">${moneyC(c.custoMoC)}</span></div>
      ${c.insumosC ? `<div class="sum-row"><span class="lb">Módulo 5 — materiais e insumos</span>
        <span class="vl">${moneyC(c.insumosC)}</span></div>` : ''}
      ${c.equipMensalC ? `<div class="sum-row"><span class="lb">Equipamentos mensais</span>
        <span class="vl">${moneyC(c.equipMensalC)}</span></div>` : ''}
      <div class="sum-row"><span class="lb"><b>= custo direto</b></span><span class="vl"><b>${moneyC(c.custoDiretoC)}</b></span></div>
      <div class="sum-row"><span class="lb">+ custos indiretos (${pctTxt(c.par.ci)})</span><span class="vl">${moneyC(c.ciC)}</span></div>
      <div class="sum-row"><span class="lb">+ lucro de planilha (${pctTxt(c.par.lucro)})</span><span class="vl">${moneyC(c.lucroPlanilhaC)}</span></div>
      <div class="sum-row"><span class="lb"><b>= base antes dos tributos</b></span><span class="vl"><b>${moneyC(c.baseC)}</b></span></div>
      <div class="sum-row"><span class="lb">÷ (1 − T), com T de ${pctTxt(c.T*100,2)}</span><span class="vl">${moneyC(c.precoBrutoC)}</span></div>
      ${c.descontoC > 0 ? `<div class="sum-row"><span class="lb">− desconto comercial (${pctTxt(p.desconto)})</span>
        <span class="vl">− ${moneyC(c.descontoC)}</span></div>` : ''}
      <div class="sum-total"><div class="lb">Preço de venda mensal</div>
       <div class="vl">${moneyC(c.mensalC)}</div>
       <small>markup de ${num(c.markup,4)}× sobre o custo direto</small></div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:12px;line-height:1.6">
       O imposto entra <b>por dentro</b>: divide-se por (1 − T) em vez de multiplicar
       por (1 + T). Com T de ${pctTxt(c.T*100,2)}, multiplicar daria
       ${moneyC(arredC(c.baseC * (1 + c.T)))} — ${moneyC(c.precoBrutoC - arredC(c.baseC * (1 + c.T)))}
       a menos, que sairia inteiro do seu lucro.</div>
     </div></div>
   </div>
  </div>`;
}

const arredC = x => Math.round(x);

/* ── O resumo da direita ─────────────────────────────────────────────────────
   Ele tinha virado depósito: doze linhas de cascata, quatro controles
   deslizantes, a origem de cada número, o bloco de reajuste e ainda os avisos.
   Numa coluna de 340px, isso não é resumo — é um segundo formulário.

   Aqui ficou só o que se olha ENQUANTO se monta o posto, na ordem em que a
   pergunta aparece: quanto custa, quanto de imposto, quanto vale, quanto sobra.
   O imposto vem discriminado por nome porque "16,53%" não diz nada a quem
   precisa conferir o ISS com o contador — e ISS é o único que muda de cidade
   para cidade.

   O resto — regime, FAP, turnover, cobertura, reajuste, a memória da conta —
   mora na aba Precificação. São coisas que se define uma vez por proposta, não
   a cada posto. */
/* ── o painel da direita ─────────────────────────────────────────────────────
   Este painel foi reescrito em linguagem de quem vende, não de quem monta
   planilha de licitação. A versão anterior imprimia a cascata da IN SEGES
   05/2017 — "custo direto", "custos indiretos", "lucro de planilha" — e o
   problema não era o rigor: era que as linhas NÃO SOMAVAM o total. Lucro de
   planilha é markup ANTES do gross-up dos tributos, então custo + indiretos +
   lucro de planilha + impostos dá um número que não é o valor mensal, e quem
   conferia com a calculadora achava que o sistema estava errado.

   Aqui a coluna fecha, ao centavo:

     mão de obra + materiais + equipamentos = CUSTO DIRETO
     custo direto + administração + impostos + SEU LUCRO = VALOR MENSAL

   porque `lucroC` é definido exatamente como o que sobra depois de tudo. É a
   mesma conta, dita do jeito que dá para conferir somando a coluna. */
function painelResumo(p, c, encSoma, cct){
  const minima = CFGN('proposta_margem_minima', 8);
  const problemas = Calc.confere(c);
  const rascunho = DB.eRascunho(p.id);
  const linha = (rot, val, forte) => `<div class="sum-row">
    <span class="lb">${forte ? '<b>' + rot + '</b>' : rot}</span>
    <span class="vl">${forte ? '<b>' + val + '</b>' : val}</span></div>`;

  return `<div class="card"><div class="card-h"><h3 style="flex:1">Resumo</h3>
    ${p.snapshot ? '<span class="tag t-blue" title="Valores congelados">🔒</span>' : ''}</div>
   <div class="card-b">

    <div class="sublabel" style="margin-top:0">O que custa</div>
    ${linha('Mão de obra', moneyC(c.custoMoC))}
    ${c.insumosC ? linha('Materiais e insumos', moneyC(c.insumosC)) : ''}
    ${c.equipMensalC ? linha('Equipamentos', moneyC(c.equipMensalC)) : ''}
    ${linha('<b>Custo direto</b>', `<b>${moneyC(c.custoDiretoC)}</b>`)}
    ${linha(`Administração e supervisão
      <span style="color:var(--faint)" title="Custos indiretos: estrutura, supervisão e retaguarda que não estão em nenhum posto">${pctTxt(c.par.ci)}</span>`,
      moneyC(c.ciC))}

    <div class="sublabel">O que sai em imposto</div>
    ${linha(`Impostos sobre o faturamento
      <span style="color:var(--faint)">${pctTxt(c.T * 100, 2)}</span>`, moneyC(c.impostoC))}
    <div style="font-size:11.5px;color:var(--muted);margin:-2px 0 4px;line-height:1.5">
     ${(c.trib?.detalhe || []).map(([nome]) => esc(String(nome).split(' ')[0])).join(' · ')}
    </div>
    <button class="btn btn-sm" style="width:100%;justify-content:center;margin-bottom:6px"
     data-acao="verResumo" data-id="${p.id}">Ver imposto por imposto</button>

    <div class="sublabel">O que sobra</div>
    ${p.desconto > 0 ? linha(`Desconto dado ao cliente
      <span style="color:var(--faint)">${pctTxt(p.desconto)}</span>`, '− ' + moneyC(c.descontoC)) : ''}
    ${linha('<b>Seu lucro</b>', `<b style="color:var(--blue)">${moneyC(c.lucroC)}</b>`)}

    <div class="sum-total"><div class="lb">Valor mensal</div>
     <div class="vl">${moneyC(c.mensalC)}</div>
     <small>${c.postos} posto${c.postos !== 1 ? 's' : ''} · ${num(c.func)} funcionário${c.func !== 1 ? 's' : ''}</small>
     <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.22);
       display:flex;align-items:baseline;gap:8px">
      <span style="font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;
        color:rgba(255,255,255,.74)">Margem</span>
      <b style="margin-left:auto;font-size:20px">${pctTxt(c.margem)}</b></div>
    </div>

    ${c.implantacaoC > 0 ? linha('Implantação (cobrada uma vez)', moneyC(c.implantacaoC)) : ''}
    ${linha('Total do contrato <span style="color:var(--faint)">' + p.prazo + ' meses</span>',
      `<span style="color:var(--blue)">${moneyC(c.contratoC)}</span>`)}

    ${!+p.margem_alvo ? `<div class="faixa aviso" style="margin-top:12px">${ico('aviso')}
      <span class="sp">Margem ainda não definida — este valor está saindo do padrão
       da empresa. Defina a sua no bloco <b>Condições</b>.</span></div>`
     : c.margem < minima ? `<div class="faixa aviso" style="margin-top:12px">${ico('aviso')}
      <span class="sp">Margem abaixo do mínimo de ${pctTxt(minima,0)}.</span></div>` : ''}
    ${c.par.margemAviso ? `<div class="faixa aviso" style="margin-top:12px">${ico('aviso')}
      <span class="sp">${esc(c.par.margemAviso)}</span></div>` : ''}
    ${problemas.length ? `<div class="faixa aviso" style="margin-top:12px">${ico('aviso')}
      <span class="sp">${esc(problemas.join('; '))}</span></div>` : ''}
    ${c.trib?.aviso ? `<div class="faixa aviso" style="margin-top:12px">${ico('aviso')}
      <span class="sp">${esc(c.trib.aviso)}</span></div>` : ''}
    ${c.par.encPct > 50 ? `<div class="faixa aviso" style="margin-top:12px">${ico('aviso')}
      <span class="sp"><b>${pctTxt(c.par.encPct)} de encargos é alto demais.</b>
       Este campo é só o submódulo 2.2 (INSS + RAT×FAP + terceiros + FGTS =
       ${num(c.par.encargos.total,2)}% no regime ${esc(c.par.regime)}). Os ~79% que a
       convenção publica já incluem 13º, férias, rescisão e cobertura — que aqui são
       módulos próprios.</span>
      <button class="btn btn-sm" data-acao="aplicarEncargos" data-valor="0">Corrigir</button></div>` : ''}

    ${rascunho
      ? `<button class="btn btn-primary" style="width:100%;margin-top:14px;justify-content:center"
          data-acao="salvarPropostaAgora">${ico('ok')}Salvar proposta</button>
         <p style="font-size:11.5px;color:var(--muted);margin-top:8px;line-height:1.5">
          O PDF e o envio ficam disponíveis depois de salvar.</p>`
      : `<button class="btn" style="width:100%;margin-top:14px;justify-content:center"
          data-acao="verResumo" data-id="${p.id}">Conferir a proposta inteira</button>
         <button class="btn btn-primary" style="width:100%;margin-top:8px;justify-content:center"
          data-acao="gerarDoc" data-id="${p.id}" data-formato="pdf">${ico('baixar')}Gerar PDF</button>`}
   </div></div>`;
}


/* ── aba de documento e envio (4.5) ── */
function abaDocumento(p, c, lead){
  const modelos = state.modelos || [];
  const slides = p.slides || {};
  /* Os slides opcionais vêm do modelo escolhido, não de uma lista fixa: cada
     .pptx tem os seus, anotados nele. O rótulo é só cosmético — nome que não
     estiver no dicionário aparece capitalizado, e continua funcionando. */
  const ROTULOS = {
    capa:'Capa', missao:'Missão, visão e valores', cliente:'A quem se destina',
    escopo:'Objeto da proposta', postos:'Dimensionamento da equipe',
    equipamentos:'Materiais e equipamentos', resumo:'Resumo do investimento',
    condicoes:'Condições comerciais', final:'Encerramento',
    sobre:'Quem somos', gente:'Nossa gente (precisa das fotos)',
    servicos:'O que entregamos', diferencial:'Nosso diferencial',
    tecnologia:'Tecnologia na operação', beneficios:'Salários e benefícios',
  };
  const modeloAtual = p.modelo_ppt || CFG('ppt_modelo');
  const doModelo = (state.slidesPorModelo || {})[modeloAtual] || [];
  const nomes = doModelo.map(k => [k, ROTULOS[k] || (k.charAt(0).toUpperCase() + k.slice(1))]);
  const docs = state.docs || null;

  return `<div class="grid2">
   <div class="card"><div class="card-h"><div style="flex:1"><h3>Modelo e slides</h3>
     <p>O que entra neste documento</p></div></div>
    <div class="card-b">
     <div class="f" style="margin-bottom:16px"><label>Modelo de apresentação</label>
      <select data-mudar="campoProposta" data-campo="modelo_ppt">
       ${(modelos.length ? modelos : [p.modelo_ppt || CFG('ppt_modelo')]).filter(Boolean).map(m =>
         `<option value="${esc(m)}" ${(p.modelo_ppt || CFG('ppt_modelo')) === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
      </select>
      ${nota('Coloque outros .pptx em modelo_ppt/ para atender condomínio, indústria e shopping com layouts diferentes.')}</div>
     <div class="sublabel">Slides opcionais</div>
     <div class="chips">${nomes.map(([k,r]) => {
       /* Estes padrões são os mesmos do _slide_ligado() no ppt.py. Se os dois
          discordarem, a caixa aparece marcada e o slide não sai no arquivo —
          e ninguém descobre até abrir o PDF. */
       const ligado = k in slides ? !!slides[k]
         : k === 'equipamentos' ? c.equipamentos.length > 0
         : k === 'gente' ? false
         : true;
       return `<label class="chipbox ${ligado ? 'on' : ''}">
        <input type="checkbox" ${ligado ? 'checked' : ''} data-mudar="alternarSlide" data-slide="${esc(k)}">
        ${esc(r)}</label>`; }).join('')}</div>
     ${nota('Capa e resumo podem ser desligados, mas raramente é boa ideia: sem resumo o cliente não encontra o valor.')}
     <div class="sublabel" style="margin-top:18px">Link de aceite</div>
     ${p.aceite_token ? `<div class="readbox">
        <b>Link público</b>
        <span style="word-break:break-all">${esc(CFG('aceite_base_url',''))}/p/${esc(p.aceite_token)}</span>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
         <button class="btn btn-sm" data-acao="copiarLink" data-token="${esc(p.aceite_token)}">Copiar link</button>
         <button class="btn btn-sm" data-acao="abrirLink" data-token="${esc(p.aceite_token)}">Abrir</button></div>
        <div class="cell-sub" style="margin-top:8px">
         Aberturas: <b>${p.aberturas || 0}</b>${p.aberta_em ? ' · primeira em ' + esc(dth(p.aberta_em)) : ''}
         ${p.aceite_em ? ' · aceita em ' + esc(dth(p.aceite_em)) : ''}</div>
       </div>`
      : `<p style="font-size:13px;color:var(--muted)">O link é criado na primeira
          geração de documento ou no primeiro envio por e-mail.</p>`}
    </div></div>

   <div class="card"><div class="card-h"><div style="flex:1"><h3>Documentos gerados</h3>
     <p>Comprovante do que foi entregue ao cliente</p></div>
     <button class="btn btn-sm" data-acao="listarDocs" data-id="${p.id}">Atualizar</button></div>
    <div class="card-b">
     <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn btn-primary" data-acao="gerarDoc" data-id="${p.id}" data-formato="pdf">${ico('baixar')}Gerar PDF</button>
      <button class="btn" data-acao="gerarDoc" data-id="${p.id}" data-formato="pptx">${ico('baixar')}Gerar PPT</button>
      <button class="btn" data-acao="modalEmail" data-id="${p.id}">${ico('email')}Enviar</button>
     </div>
     ${docs === null ? '<p style="color:var(--muted);font-size:13px">Clique em Atualizar para listar as versões guardadas.</p>'
      : docs.length ? docs.map(d => `<div class="anexo">
        ${ico('arquivo')}<span class="nm">${esc(d.caminho.split('/').pop())}</span>
        <span class="sz">v${d.versao} · ${esc(tamanho(d.tamanho))} · ${esc(dth(d.created_at))}
          ${d.enviado_para ? ' · enviado para ' + esc(d.enviado_para) : ''}</span>
        ${d.url ? `<a class="btn btn-sm" href="${esc(d.url)}" target="_blank" rel="noopener">Baixar</a>` : ''}
       </div>`).join('')
      : '<p style="color:var(--muted);font-size:13px">Nenhum documento guardado ainda.</p>'}
    </div></div>
  </div>`;
}

/* ── aba de versões (4.8) ── */
/* Todas as versões da mesma proposta: a raiz e as filhas dela. */
function versoesDe(p){
  const raiz = +(p.propostaPaiId || p.id);
  return DB.list('propostas').filter(x => x.id === raiz || +x.propostaPaiId === raiz)
    .sort((a,b) => (a.versao || 1) - (b.versao || 1));
}

function abaVersoes(p){
  const irmas = versoesDe(p);
  return `<div class="card"><div class="card-h"><div style="flex:1"><h3>Versões desta proposta</h3>
    <p>Cada rodada de negociação vira uma versão, e a anterior fica intacta</p></div>
    <button class="btn" data-acao="novaVersao" data-id="${p.id}">Criar nova versão</button>
    <button class="btn" data-acao="duplicarProposta" data-id="${p.id}">Duplicar para outro lead</button></div>
   <table><thead><tr><th>Versão</th><th>Número</th><th>Mensal</th><th>Desconto</th>
    <th>Status</th><th>Emissão</th><th></th></tr></thead><tbody>
   ${irmas.map(x => { const c = calcProposta(x);
     return `<tr ${x.id === p.id ? 'style="background:var(--blue-50)"' : ''}>
     <td class="cell-main">v${x.versao || 1}${x.id === p.id ? ' <span class="tag t-blue">atual</span>' : ''}</td>
     <td>${esc(x.numero)}${x.snapshot ? ' 🔒' : ''}</td>
     <td style="font-weight:700">${money0C(c.mensalC)}</td>
     <td>${pctTxt(x.desconto)}</td>
     <td>${tagOf(x.status)}</td>
     <td class="cell-sub">${dt(x.emissao)}</td>
     <td style="text-align:right">${x.id === p.id ? ''
       : `<button class="btn btn-sm" data-acao="abrirProposta" data-id="${x.id}">Abrir</button>`}</td>
     </tr>`; }).join('')}
   </tbody></table></div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   AÇÕES DO EDITOR
   ════════════════════════════════════════════════════════════════════════════ */

/* Gravação com debounce (5.3): o slider atualiza a tela na hora e o banco
   depois que o dedo para. Antes cada pixel arrastado era um UPDATE e um render
   da página inteira (P9.2). */
/* O editor salva sozinho, meio segundo depois de a pessoa parar de mexer. O
   rótulo ao lado do botão diz em que pé está — "salvando…" e depois "tudo
   salvo" — porque salvamento invisível deixa quem está fechando um valor de
   R$ 80 mil na dúvida se pode fechar a aba. O botão Salvar força na hora. */
function _estadoSalvo(txt, cor){
  const el = $('#estadoSalvo');
  if(el){ el.textContent = txt; el.style.color = cor || 'var(--faint)'; }
}
const _salvarProposta = debounce(async (id, campos) => {
  _estadoSalvo('salvando…', 'var(--blue)');
  try{
    await DB.upd('propostas', id, campos);
    await sincronizarOportunidade(DB.get('propostas', id));
    _estadoSalvo('tudo salvo');
  }catch(e){ _estadoSalvo('falhou ao salvar', 'var(--blue)'); }
}, 500);

function propostaAtual(){ return DB.get('propostas', state.id); }

/* Tudo o que define o preço de uma proposta. Usado por versão nova e por
   duplicata — as duas precisam sair com o MESMO valor da original, e enquanto
   cada uma listava os campos à mão elas divergiam. */
function paramsDaProposta(p){
  return {
    encargos:p.encargos, markup:p.markup, margem_alvo:p.margem_alvo ?? 0,
    imposto:p.imposto, desconto:p.desconto,
    regime:p.regime ?? null, modo_preco:p.modo_preco ?? null,
    cobertura_modo:p.cobertura_modo ?? null,
    rat:p.rat ?? null, fap:p.fap ?? null, turnover:p.turnover ?? null,
    absenteismo:p.absenteismo ?? null, ci_pct:p.ci_pct ?? null, iss:p.iss ?? null,
    credito_pct:p.credito_pct ?? null, rbt12:p.rbt12 ?? null,
  };
}

function repintarResumo(){
  const p = propostaAtual();
  if(!p) return;
  const el = $('#painelResumo');
  if(!el) return;
  el.innerHTML = painelResumo(p, calcProposta(p), somaEncargosCCT(p.cctId), DB.get('ccts', p.cctId));
}

acoes({
  async novaProposta(d){ await criarProposta({leadId: d?.lead ? +d.lead : undefined}); },

  async propostaDeOp(d){
    const o = DB.get('ops', d.id);
    if(!o) return;
    await criarProposta({leadId:o.leadId, opId:o.id, titulo:o.titulo});
  },

  /* Qualquer campo da proposta: título, prazo, escopo, e também os parâmetros
     de precificação (regime, FAP, ISS…).

     Campo VAZIO grava null, e isso tem significado nos dois grupos: num campo
     de texto é "sem conteúdo", e num parâmetro de precificação é "usa o padrão
     de Configurações" — que é como o motor lê. Por isso não se converte vazio
     para zero: zero de FAP não é a mesma coisa que FAP não informado. */
  async campoProposta(_d, el){
    const v = el.dataset.numero ? (el.value === '' ? null : +el.value)
                                : (el.value === '' ? null : el.value);
    await DB.upd('propostas', state.id, {[el.dataset.campo]: v});
    await sincronizarOportunidade(DB.get('propostas', state.id));
    render();
  },

  /* Slider ARRASTANDO: atualiza o rótulo e o valor mensal na hora e agenda a
     gravação. Não repinta o painel — trocar o HTML debaixo do dedo mataria o
     arrasto no meio do gesto. */
  /* O botão Salvar não é decorativo: ele descarrega na hora o que estava na
     fila do debounce, em vez de esperar o meio segundo. */
  /* Fechar o negócio, de um clique só. Antes era preciso trocar o status na
     mão, entender que isso mexia na oportunidade e depois achar o botão de
     gerar contrato — três passos que ninguém liga sozinho. */
  async marcarGanha(d){
    /* Vem do editor (sem id, é a proposta aberta) ou de uma linha da lista
       (com id). Ler o id do botão é o que faz o mesmo fluxo servir aos dois. */
    const p = d.id ? DB.get('propostas', +d.id) : propostaAtual();
    if(!p) return;
    modal('Marcar proposta como ganha', `
      <p style="font-size:13.5px;line-height:1.6;color:var(--muted)">
       A proposta <b style="color:var(--text)">${esc(p.numero)}</b> passa para
       <b style="color:var(--text)">Aprovada</b>, a oportunidade vai para
       <b style="color:var(--text)">Ganho</b> no funil e o valor entra no painel
       da diretoria.</p>
      ${p.snapshot ? '' : nota('A proposta ainda não está congelada. Ao aprovar, os valores são congelados — é o que garante que o contrato use exatamente o que o cliente aceitou.')}
      <div class="fgrid" style="margin-top:14px">
       ${sel('gn_motivo','Motivo do ganho', OPC('op_motivo_ganho'), '', true)}
       ${txa('gn_obs','Observação (opcional)','')}
      </div>`,
      `<button class="btn" data-acao="fecharModal">Cancelar</button>
       <button class="btn btn-primary" data-acao="confirmarGanha" data-id="${p.id}">Confirmar</button>`);
  },

  async confirmarGanha(d){
    const p = d.id ? DB.get('propostas', +d.id) : propostaAtual();
    if(!p) return;
    const motivo = $('#gn_motivo')?.value || null;
    const obs = $('#gn_obs')?.value?.trim() || null;
    closeModal();
    await DB.upd('propostas', p.id, {status:'Aprovada'});
    if(!p.snapshot){
      try{
        await api(`/api/propostas/${p.id}/congelar`, {method:'POST', body:'{}'});
        await DB.refrescar('propostas', p.id);
      }catch(e){ toast('Aprovada, mas não foi possível congelar: ' + e.message); }
    }
    const atual = DB.get('propostas', p.id);
    await garantirOportunidade(atual, DB.get('leads', atual.leadId));
    await sincronizarOportunidade(DB.get('propostas', p.id));
    if(atual.opId && (motivo || obs))
      await DB.upd('ops', atual.opId, {motivo, motivo_obs:obs});
    Historico.limpar('Proposta', p.id);
    toast('Proposta ganha — oportunidade movida para o funil');
    render();
  },

  async salvarPropostaAgora(){
    const p = propostaAtual();
    if(!p) return;
    /* Rascunho: é este clique que faz a proposta existir. */
    if(DB.eRascunho(p.id)){ await salvarRascunho(); return; }
    _salvarProposta.agora(state.id, {
      titulo:p.titulo, itens:p.itens, equipamentos:p.equipamentos,
      materiais:p.materiais ?? [], margem_alvo:p.margem_alvo ?? 0,
      encargos:p.encargos, markup:p.markup, imposto:p.imposto, desconto:p.desconto,
      prazo:p.prazo, validade:p.validade, escopo:p.escopo, obs:p.obs,
      regime:p.regime ?? null, rat:p.rat ?? null, fap:p.fap ?? null,
      turnover:p.turnover ?? null, absenteismo:p.absenteismo ?? null,
      ci_pct:p.ci_pct ?? null, iss:p.iss ?? null,
      modo_preco:p.modo_preco ?? null, cobertura_modo:p.cobertura_modo ?? null,
    });
    toast('Proposta salva');
  },

  ajustar(d, el){
    const p = propostaAtual();
    if(!p) return;
    p[d.campo] = +el.value;
    const lb = el.previousElementSibling;
    if(lb) lb.textContent = `${d.rotulo} — ${(+el.value).toFixed(+d.casas || 1).replace('.',',')}%`;
    const total = $('#painelResumo .sum-total .vl');
    if(total) total.textContent = moneyC(calcProposta(p).mensalC);
    _salvarProposta(state.id, {[d.campo]: +el.value});
  },
  /* Dedo solto (`change` do range): grava sem esperar o debounce e refaz o
     painel com margem, lucro, impostos e avisos recalculados. */
  ajustarFim(d, el){
    _salvarProposta.agora(state.id, {[d.campo]: +el.value});
    repintarResumo();
  },

  async aplicarEncargos(d){
    await DB.upd('propostas', state.id, {encargos:+d.valor});
    render();
  },

  async trocarStatus(_d, el){
    const p = propostaAtual(), novo = el.value;
    const limite = CFGN('proposta_desconto_limite', 5);
    if(novo !== 'Rascunho' && +p.desconto > limite && p.aprovacao_status !== 'aprovado'){
      toast(`Desconto de ${pctTxt(p.desconto)} precisa de aprovação antes de sair de Rascunho.`);
      render(); return;
    }
    await DB.upd('propostas', state.id, {status:novo});
    await sincronizarOportunidade(DB.get('propostas', state.id));
    /* Sair de Rascunho congela: é o momento em que a proposta deixa de ser um
       rascunho vivo e vira o documento que o cliente vai receber (P3). */
    if(novo !== 'Rascunho' && !p.snapshot){
      try{
        await api(`/api/propostas/${p.id}/congelar`, {method:'POST', body:'{}'});
        await DB.refrescar('propostas', p.id);
        toast('Status alterado e valores congelados');
      }catch(e){ toast('Status alterado, mas não foi possível congelar: ' + e.message); }
    } else {
      toast('Status alterado');
    }
    Historico.limpar('Proposta', p.id);
    render();
  },

  async congelar(d){
    try{
      await api(`/api/propostas/${d.id}/congelar`, {method:'POST', body:'{}'});
      await DB.refrescar('propostas', d.id);
      Historico.limpar('Proposta', d.id);
      toast('Valores congelados'); render();
    }catch(e){ toast(e.message); }
  },
  async recongelar(d){
    modal('Recongelar a proposta?', `<p style="color:var(--muted)">
      Os valores passam a ser os da convenção de <b>hoje</b>. Se esta proposta já
      foi enviada, o novo PDF vai sair diferente do que o cliente recebeu.</p>`,
      `<button class="btn" data-acao="fecharModal">Cancelar</button>
       <button class="btn btn-danger" data-acao="recongelarConfirma" data-id="${esc(d.id)}">Recongelar</button>`);
  },
  async recongelarConfirma(d){
    await api(`/api/propostas/${d.id}/congelar`, {method:'POST', body:JSON.stringify({refazer:true})});
    await DB.refrescar('propostas', d.id);
    closeModal(); toast('Recongelada com os valores de hoje'); render();
  },
  async descongelar(d){
    try{
      await api(`/api/propostas/${d.id}/descongelar`, {method:'POST', body:'{}'});
      await DB.refrescar('propostas', d.id);
      toast('Voltou a acompanhar a convenção'); render();
    }catch(e){ toast(e.message); }
  },

  /* ── postos ── */
  async addPosto(){
    const p = propostaAtual();
    const cargos = cargosCCT(p.cctId), benefs = benefCCT(p.cctId);
    const escala = DB.list('escalas').filter(e => e.ativo)[0];
    const turno = DB.list('turnos').filter(t => t.ativo)[0];
    /* Entra em CIMA, não no fim. Quem acabou de clicar em "adicionar posto"
       quer preencher o posto que acabou de criar — e numa proposta de dez
       postos ele nasceria fora da tela, obrigando a rolar até o fim para
       encontrar o que ainda está vazio. */
    const itens = [{
      cargoId:cargos[0]?.id ?? null, cctId:p.cctId ?? null,
      escalaId:escala?.id ?? null, turnoId:turno?.id ?? null,
      /* Os benefícios da convenção, menos os CONDICIONAIS. Benefício de CCT é
         obrigação, não escolha comercial: quem monta desmarca o que não se
         aplica, em vez de caçar um por um o que a lei já manda pagar.
         A exceção são os que a própria convenção condiciona — o auxílio-creche
         é devido à empregada-mãe, em empresa com 30+ mulheres, por filho de até
         24 meses. Entrando por cabeça ele somava 10,5% ao preço do posto. */
      qtd:1, adicionais:[], a20:20,
      beneficios:benefs.filter(b => !b.condicional).map(b => b.id), obs:''}]
      .concat(p.itens || []);
    await DB.upd('propostas', state.id, {itens});
    render();
  },
  async delPosto(d){
    const p = propostaAtual();
    const itens = p.itens.slice(); itens.splice(+d.ix, 1);
    await DB.upd('propostas', state.id, {itens});
    toast('Posto removido'); render();
  },
  async campoPosto(d, el){
    /* mexer no posto muda o valor: o funil tem que acompanhar */
    const p = propostaAtual();
    const itens = p.itens.map(x => ({...x}));
    const it = itens[+d.ix];
    it[d.campo] = el.dataset.numero ? +el.value : el.value;
    /* Trocar a convenção do posto invalida o cargo e os benefícios: eles são
       de outra CCT, e apontar para o id antigo faria o posto sumir do cálculo
       (o motor devolve null quando o cargo não existe no contexto). Escolhe-se
       o primeiro cargo da nova e limpa-se os benefícios, que o vendedor
       remarca — melhor pedir três cliques do que entregar um custo errado. */
    if(d.campo === 'cctId'){
      const novos = cargosCCT(it.cctId);
      it.cargoId = novos[0]?.id ?? null;
      it.beneficios = [];
    }
    await DB.upd('propostas', state.id, {itens});
    await sincronizarOportunidade(DB.get('propostas', state.id));
    render();
  },
  async alternarAdicional(d){
    const p = propostaAtual();
    const itens = p.itens.map(x => ({...x, adicionais:[...(x.adicionais || [])]}));
    const a = itens[+d.ix].adicionais;
    const i = a.indexOf(d.cod);
    i >= 0 ? a.splice(i,1) : a.push(d.cod);
    if(d.cod === 'A20' && i < 0 && itens[+d.ix].a20 == null) itens[+d.ix].a20 = 20;
    await DB.upd('propostas', state.id, {itens});
    render();
  },
  async alternarBeneficio(d){
    const p = propostaAtual();
    const itens = p.itens.map(x => ({...x, beneficios:[...(x.beneficios || [])]}));
    const b = itens[+d.ix].beneficios;
    const i = b.indexOf(+d.bid);
    i >= 0 ? b.splice(i,1) : b.push(+d.bid);
    await DB.upd('propostas', state.id, {itens});
    render();
  },

  /* ── equipamentos ── */
  async addEquip(){
    const p = propostaAtual();
    const id = +$('#eqSel').value, qtd = Math.max(1, +$('#eqQtd').value || 1);
    if(!id){ toast('Selecione um equipamento'); return; }
    const equipamentos = (p.equipamentos || []).map(x => ({...x}));
    const ja = equipamentos.find(x => +x.id === id);
    ja ? ja.qtd = (+ja.qtd || 0) + qtd : equipamentos.push({id, qtd});
    await DB.upd('propostas', state.id, {equipamentos});
    toast(ja ? 'Quantidade somada ao item existente' : 'Equipamento adicionado');
    render();
  },
  async campoEquip(d, el){
    const p = propostaAtual();
    const equipamentos = p.equipamentos.map(x => ({...x}));
    equipamentos[+d.ix][d.campo] = d.campo === 'qtd' ? Math.max(1, +el.value) : +el.value;
    await DB.upd('propostas', state.id, {equipamentos});
    render();
  },
  async delEquip(d){
    const p = propostaAtual();
    const equipamentos = p.equipamentos.slice(); equipamentos.splice(+d.ix, 1);
    await DB.upd('propostas', state.id, {equipamentos});
    toast('Equipamento removido'); render();
  },

  /* ── materiais (MÓDULO 5) ── */
  async addMaterial(){
    const p = propostaAtual();
    const id = +$('#matSel').value, qtd = Math.max(0, +$('#matQtd').value || 1);
    if(!id){ toast('Selecione um material'); return; }
    const materiais = (p.materiais || []).map(x => ({...x}));
    const ja = materiais.find(x => +x.id === id);
    ja ? ja.qtd = (+ja.qtd || 0) + qtd : materiais.push({id, qtd});
    await DB.upd('propostas', state.id, {materiais});
    toast(ja ? 'Quantidade somada ao item existente' : 'Material adicionado');
    render();
  },
  async campoMaterial(d, el){
    const p = propostaAtual();
    const materiais = (p.materiais || []).map(x => ({...x}));
    /* Quantidade aceita fração — meia cota de produto de limpeza é comum, e
       arredondar para 1 dobraria a linha. Só o id é inteiro. */
    materiais[+d.ix][d.campo] = d.campo === 'qtd' ? Math.max(0, +el.value || 0) : +el.value;
    await DB.upd('propostas', state.id, {materiais});
    render();
  },
  async delMaterial(d){
    const p = propostaAtual();
    const materiais = (p.materiais || []).slice(); materiais.splice(+d.ix, 1);
    await DB.upd('propostas', state.id, {materiais});
    toast('Material removido'); render();
  },

  /* ── gaveta ──────────────────────────────────────────────────────────────
     Clicar na que já está aberta fecha. `state` sobrevive ao render, então a
     gaveta não se fecha sozinha quando o campo de dentro dela é gravado. */
  gaveta(d){
    state.gaveta = state.gaveta === d.g ? null : d.g;
    render();
  },

  descartarRascunho(){
    const p = propostaAtual();
    if(!p || !DB.eRascunho(p.id)) return;
    modal('Descartar esta proposta?', `
      <p style="font-size:13.5px;line-height:1.6;color:var(--muted)">
       Ela nunca foi salva, então não existe no banco: nada some da lista, nenhum
       número de proposta é queimado. O que se perde é só o que você montou
       nesta tela.</p>`,
      `<button class="btn" data-acao="fecharModal">Continuar montando</button>
       <button class="btn btn-primary" data-acao="confirmarDescarte">Descartar</button>`);
  },
  confirmarDescarte(){
    DB.descartar('propostas');
    closeModal();
    toast('Rascunho descartado');
    go('propostas');
  },

  /* Zerar um campo numérico da proposta. Existe por causa da margem alvo: ela
     manda no lucro de planilha, e a única forma de voltar a digitar o lucro à
     mão é apagar o alvo. Um botão diz isso melhor do que uma instrução. */
  async campoZero(d){
    await DB.upd('propostas', state.id, {[d.campo]: 0});
    await sincronizarOportunidade(propostaAtual());
    toast('Voltou a valer o lucro de planilha');
    render();
  },

  /* ── lead e CCT ── */
  async trocarLead(_d, el){
    const leadId = +el.value;
    const cts = contatosLead(leadId);
    const principal = cts.find(c => c.principal) || cts[0];
    await DB.upd('propostas', state.id, {leadId, contatoId: principal ? principal.id : null});
    toast('Dados do lead carregados'); render();
  },
  async trocarCCT(_d, el){
    const cctId = +el.value;
    const p = propostaAtual();
    const cargos = cargosCCT(cctId), benefs = benefCCT(cctId);
    const porNome = (lista, nome) => lista.find(x => x.nome === nome);
    const itens = (p.itens || []).map(it => {
      const cargoAntigo = DB.get('cct_cargos', it.cargoId);
      const novoCargo = (cargoAntigo && porNome(cargos, cargoAntigo.nome)) || cargos[0];
      return {...it,
        cargoId: novoCargo ? novoCargo.id : null,
        beneficios: (it.beneficios || [])
          .map(bid => DB.get('cct_beneficios', bid))
          .map(b => b && porNome(benefs, b.nome))
          .filter(Boolean).map(b => b.id)};
    });
    const soma = somaEncargosCCT(cctId);
    await DB.upd('propostas', state.id, {cctId, itens, ...(soma > 0 ? {encargos:soma} : {})});
    toast('Convenção aplicada'); render();
  },

  /* ── documento (4.1 / 4.7) ── */
  async gerarDoc(d){
    const rotulo = d.formato === 'pdf' ? 'PDF' : 'PPT';
    toast(`${rotulo} entrou na fila — pode continuar trabalhando.`);
    let r;
    try{
      r = await api(`/api/propostas/${d.id}/documento/${d.formato}`,
        {method:'POST', body:JSON.stringify({arquivar:true})});
    }catch(e){ toast('Não foi possível gerar: ' + e.message); return; }

    await Jobs.acompanhar(r.job, r.descricao || rotulo, async () => {
      const resp = await fetch('/api/documento/job/' + r.job + '/arquivo', {
        headers:{'Authorization':'Bearer ' + (await sb.auth.getSession()).data.session?.access_token}});
      if(!resp.ok){ toast('Falha ao baixar o arquivo.'); return; }
      const cd = resp.headers.get('Content-Disposition') || '';
      const nome = (cd.match(/filename="([^"]+)"/) || [])[1] || ('proposta.' + d.formato);
      baixarArquivo(nome, await resp.blob());
      toast(rotulo + ' pronto: ' + nome);
      await DB.refrescar('propostas', d.id);
      Historico.limpar('Proposta', d.id);
    });
  },

  async listarDocs(d){
    try{
      const r = await api(`/api/propostas/${d.id}/documentos`);
      state.docs = r.documentos || [];
      render();
    }catch(e){ toast(e.message); }
  },

  /* ── e-mail (4.3) ── */
  async modalEmail(d){
    let previa;
    try{ previa = await api(`/api/propostas/${d.id}/previa-email`); }
    catch(e){ toast(e.message); return; }
    if(!previa.configurado){
      modal('Envio de e-mail não configurado', `
        <p style="color:var(--muted)">O servidor ainda não sabe por onde mandar
        e-mail. Preencha no arquivo <b>.env</b> e reinicie:</p>
        <div class="readbox mt"><b>Falta</b>${esc(previa.faltando || 'SMTP_HOST, SMTP_FROM')}</div>
        <div class="readbox mt"><b>Exemplo (Microsoft 365)</b>
         SMTP_HOST=smtp.office365.com<br>SMTP_PORT=587<br>
         SMTP_USER=comercial@suaempresa.com.br<br>SMTP_PASS=sua-senha-de-aplicativo<br>
         SMTP_FROM=comercial@suaempresa.com.br</div>`,
        `<button class="btn btn-primary" data-acao="fecharModal">Entendi</button>`);
      return;
    }
    modal('Enviar proposta por e-mail', `<div class="fgrid">
      ${fld('em_para','Para *', previa.para, 'email', true)}
      ${fld('em_copia','Cópia (opcional)','', 'text', true)}
      ${fld('em_assunto','Assunto *', previa.assunto, 'text', true)}
      ${txa('em_corpo','Mensagem', previa.corpo)}
      ${sel('em_formato','Anexo',[['pdf','PDF'],['pptx','PowerPoint']],'pdf')}
      ${previa.link ? `<div class="f full"><label>Link de aceite incluído</label>
        <div class="readbox" style="word-break:break-all">${esc(previa.link)}</div></div>` : ''}
     </div>`,
     `<button class="btn" data-acao="fecharModal">Cancelar</button>
      <button class="btn btn-primary" data-acao="enviarEmail" data-id="${esc(d.id)}">Enviar</button>`, 'wide');
  },
  async enviarEmail(d){
    if(!valid(['em_para','em_assunto'])) return;
    const corpo = {
      para: $('#em_para').value.trim(), copia: $('#em_copia').value.trim(),
      assunto: $('#em_assunto').value, corpo: $('#em_corpo').value,
      formato: $('#em_formato').value,
    };
    let r;
    try{ r = await api(`/api/propostas/${d.id}/email`, {method:'POST', body:JSON.stringify(corpo)}); }
    catch(e){ toast(e.message); return; }
    closeModal();
    toast('Gerando o anexo e enviando…');
    await Jobs.acompanhar(r.job, `E-mail para ${r.para}`, async () => {
      toast('Proposta enviada para ' + r.para);
      Historico.limpar('Proposta', d.id);
      await DB.refrescar('propostas', d.id);
      render();
    });
  },

  /* ── slides e link ── */
  async alternarSlide(d, el){
    const p = propostaAtual();
    const slides = {...(p.slides || {})};
    slides[d.slide] = el.checked;
    await DB.upd('propostas', state.id, {slides});
    render();
  },
  copiarLink(d){
    const url = `${CFG('aceite_base_url','')}/p/${d.token}`;
    navigator.clipboard?.writeText(url)
      .then(() => toast('Link copiado'))
      .catch(() => toast(url));
  },
  abrirLink(d){ window.open(`${CFG('aceite_base_url','')}/p/${d.token}`, '_blank'); },

  /* ── aprovação de desconto (4.8) ── */
  async pedirAprovacao(d){
    await DB.upd('propostas', d.id, {aprovacao_status:'pendente'});
    await Historico.registrar('Proposta', d.id, {tipo:'aprovacao',
      titulo:'Aprovação de desconto solicitada',
      detalhe:`Desconto de ${pctTxt(DB.get('propostas', d.id).desconto)}`});
    toast('Pedido enviado aos gestores'); render();
  },
  decidirAprovacao(d){
    const aprovar = d.decisao === 'aprovado';
    modal(aprovar ? 'Aprovar o desconto?' : 'Recusar o desconto',
      `<div class="fgrid">${txa('ap_obs', aprovar ? 'Observação (opcional)' : 'Motivo da recusa','')}</div>`,
      `<button class="btn" data-acao="fecharModal">Cancelar</button>
       <button class="btn btn-primary" data-acao="salvarAprovacao" data-id="${esc(d.id)}"
        data-decisao="${esc(d.decisao)}">${aprovar ? 'Aprovar' : 'Recusar'}</button>`);
  },
  async salvarAprovacao(d){
    await DB.upd('propostas', d.id, {
      aprovacao_status:d.decisao, aprovacao_em:agoraISO(),
      aprovacao_por:Sessao.usuario?.id || null, aprovacao_obs:$('#ap_obs').value.trim()});
    await Historico.registrar('Proposta', d.id, {tipo:'aprovacao',
      titulo:`Desconto ${d.decisao === 'aprovado' ? 'aprovado' : 'recusado'} por ${Sessao.nome()}`,
      detalhe:$('#ap_obs').value.trim()});
    closeModal(); toast('Decisão registrada'); render();
  },

  /* ── versões e duplicação (4.8) ── */
  /* Os campos que definem o preço, num lugar só. Antes cada cópia listava o
     seu subconjunto e ia perdendo coisa: duplicar uma proposta de licitação
     com FAP 1,7 devolvia uma proposta privada com FAP padrão, e o preço mudava
     sem que ninguém tivesse mexido em nada. */
  async novaVersao(d){
    const p = DB.get('propostas', d.id);
    const raiz = +(p.propostaPaiId || p.id);
    const versao = Math.max(...versoesDe(p).map(x => x.versao || 1)) + 1;
    const nova = await DB.add('propostas', {
      /* Tira o sufixo antes de pôr o novo: senão a v4 vira PRP-2026-0001-v3-v4. */
      numero: String(p.numero).replace(/-v\d+$/, '') + '-v' + versao,
      leadId:p.leadId, contatoId:p.contatoId, opId:p.opId, cctId:p.cctId,
      titulo:p.titulo, status:'Rascunho', emissao:hoje(),
      validade:p.validade, prazo:p.prazo,
      ...paramsDaProposta(p),
      itens:p.itens, equipamentos:p.equipamentos, materiais:p.materiais ?? [],
      escopo:p.escopo, obs:p.obs,
      modelo_ppt:p.modelo_ppt, slides:p.slides,
      versao, propostaPaiId:+raiz, owner:Sessao.nome(),
    });
    toast('Versão ' + versao + ' criada — a anterior ficou intacta');
    go('propostaEditor', {id:nova.id});
  },
  duplicarProposta(d){
    const p = DB.get('propostas', d.id);
    modal('Duplicar proposta', `<div class="fgrid">
      ${sel('dup_lead','Lead de destino', DB.list('leads').map(l => [l.id, l.empresa]), p.leadId, true)}
      ${fld('dup_titulo','Título', p.titulo, 'text', true)}
      ${nota('Copia postos, materiais, equipamentos, escopo e todos os parâmetros de preço. Nasce em Rascunho, com número novo e sem congelamento.')}
     </div>`,
     `<button class="btn" data-acao="fecharModal">Cancelar</button>
      <button class="btn btn-primary" data-acao="salvarDuplicata" data-id="${esc(d.id)}">Duplicar</button>`);
  },
  async salvarDuplicata(d){
    const p = DB.get('propostas', d.id);
    const leadId = +$('#dup_lead').value;
    const cts = contatosLead(leadId);
    const principal = cts.find(c => c.principal) || cts[0];
    const nova = await DB.add('propostas', {
      numero: await proximoNumero(), leadId, contatoId:principal?.id ?? null,
      opId:null, cctId:p.cctId, titulo:$('#dup_titulo').value.trim() || p.titulo,
      status:'Rascunho', emissao:hoje(), validade:p.validade, prazo:p.prazo,
      ...paramsDaProposta(p),
      itens:p.itens, equipamentos:p.equipamentos, materiais:p.materiais ?? [],
      escopo:p.escopo, obs:p.obs,
      modelo_ppt:p.modelo_ppt, slides:p.slides, owner:Sessao.nome(),
    });
    closeModal(); toast('Proposta duplicada');
    go('propostaEditor', {id:nova.id});
  },

  /* ── conferência com o servidor (2.6) ─────────────────────────────────────
     Dois motores, um em JS e outro em Python, têm que dar o mesmo número. Este
     botão é a prova — e o lugar onde a divergência aparece antes do cliente. */
  async conferirServidor(d){
    let r;
    try{ r = await api(`/api/propostas/${d.id}/calculo`); }
    catch(e){ toast(e.message); return; }
    const c = calcProposta(DB.get('propostas', d.id));
    const pares = [
      ['Mão de obra (venda)', c.precoMoC, r.totais.preco_mao_de_obra],
      ['Equipamentos (venda)', c.precoEquipC, r.totais.preco_equipamentos],
      ['Subtotal', c.precoBrutoC, r.totais.subtotal],
      ['Desconto', c.descontoC, r.totais.desconto],
      ['Valor mensal', c.mensalC, r.totais.mensal],
      ['Implantação', c.implantacaoC, r.totais.implantacao],
      ['Total do contrato', c.contratoC, r.totais.contrato],
    ];
    const divergem = pares.filter(([,a,b]) => a !== b);
    modal('Conferência do cálculo', `
      <p style="color:var(--muted);font-size:13px;margin-bottom:14px">
        Esta tela calcula em JavaScript; o PDF, em Python. Os dois têm que
        chegar ao mesmo centavo.</p>
      <table><thead><tr><th>Linha</th><th>Esta tela</th><th>Servidor</th><th></th></tr></thead><tbody>
      ${pares.map(([r_, a, b]) => `<tr><td>${esc(r_)}</td><td>${moneyC(a)}</td><td>${moneyC(b)}</td>
        <td>${a === b ? '<span class="tag t-green">ok</span>' : '<span class="tag t-red">difere</span>'}</td></tr>`).join('')}
      </tbody></table>
      <div class="faixa ${divergem.length ? 'aviso' : ''}" style="margin-top:16px">
        ${divergem.length ? ico('aviso') : ico('ok')}
        <span class="sp">${divergem.length
          ? 'Há divergência — não envie este documento antes de conferir.'
          : 'Tudo confere. O PDF vai sair com estes valores.'}</span></div>
      ${r.congelada ? `<p style="font-size:12.5px;color:var(--muted);margin-top:10px">
        Cálculo feito sobre o snapshot congelado em ${esc(dth(r.congelada_em))}.</p>` : ''}
      ${r.problemas?.length ? `<p style="margin-top:10px"><b>${esc(r.problemas.join('; '))}</b></p>` : ''}`,
      `<button class="btn btn-primary" data-acao="fecharModal">Fechar</button>`, 'wide');
  },
});
