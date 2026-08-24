/* ════════════════════════════════════════════════════════════════════════════
   ROTEAMENTO, BUSCA GLOBAL, AUTENTICAÇÃO E PARTIDA
   ════════════════════════════════════════════════════════════════════════════ */

const TITLES = {
  inicio:'Início', dashboard:'Dashboard', pipeline:'Pipeline de vendas',
  leads:'Leads', leadDetalhe:'Detalhe do lead', contatos:'Contatos',
  oportunidades:'Oportunidades', atividades:'Atividades',
  propostas:'Propostas comerciais',
  propostaEditor:'Montagem da proposta', propostaResumo:'Conferir proposta',
  contratos:'Contratos',
  contratoDetalhe:'Contrato', ccts:'Convenções, escalas e turnos',
  cctDetalhe:'Convenção coletiva',
  equipamentos:'Equipamentos', configuracoes:'Configurações',
};

/* A tela que abre o sistema. Era o dashboard; virou o mapa de atalhos, pelo
   motivo explicado no cabeçalho do views-inicio.js. Está numa constante porque
   quatro pontos do roteamento precisam concordar sobre qual é ela. */
const VIEW_INICIAL = 'inicio';

/* ── Os grupos do trilho ─────────────────────────────────────────────────────
   O mesmo mapa serve para duas coisas: acender o ícone certo quando a tela
   aberta pertence ao grupo. As telas de
   detalhe (leadDetalhe, propostaEditor…) entram junto das suas listas — quem
   está editando uma proposta continua em Propostas.
   Se uma view nova não aparecer aqui, o sistema não quebra: o trilho fica sem
   ícone aceso e a migalha some. Vale a pena lembrar de incluí-la.

   A ordem é a do ciclo da venda: Comercial → Propostas → Contratos, e depois
   da linha o que não é o dia a dia da venda. Três decisões que valem explicar:

   · Proposta é grupo próprio, e não um item no fim do Comercial. Pipeline é a
     régua do vendedor — arrastar cartão, olhar fase, mexer em probabilidade —
     e proposta é um documento que se monta posto a posto, congela, gera PDF e
     vai por e-mail. Dois trabalhos, dois ritmos.
   · Atividades voltou para o Comercial. Ligação, reunião e visita são o
     trabalho de mover um lead adiante, não a operação depois da assinatura.
   · "Cadastros" virou "Bases de cálculo". Cadastro é qualquer coisa que se
     digita uma vez; convenção, escala e equipamento entram na CONTA — a
     convenção dá salário e benefício, a escala dá o fator de cobertura, o
     equipamento entra como custo mensal ou de implantação. O nome novo diz
     por que as três moram juntas. */
const GRUPOS = {
  inicio:    {rotulo:'Início',           views:['inicio']},
  comercial: {rotulo:'Comercial',        views:['pipeline','leads','leadDetalhe','contatos',
                                                'oportunidades','atividades']},
  propostas: {rotulo:'Propostas',        views:['propostas','propostaEditor','propostaResumo']},
  contratos: {rotulo:'Contratos',        views:['contratos','contratoDetalhe']},
  bases:     {rotulo:'Bases de cálculo', views:['ccts','cctDetalhe','equipamentos']},
  analise:   {rotulo:'Dashboard',        views:['dashboard']},
  sistema:   {rotulo:'Sistema',          views:['configuracoes']},
};
const grupoDa = v => Object.keys(GRUPOS).find(g => GRUPOS[g].views.includes(v));

/* Acende o item aberto no painel e o ícone do grupo no trilho. Os dois usam o
   mesmo tratamento cheio de Lapis: com o menu fechado, o ícone é a única
   resposta visível para "onde eu estou". */
function marcarNav(v){
  const g = grupoDa(v);
  $$('#rail button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  $$('#rail .rail-item').forEach(it => it.classList.toggle('active', it.dataset.g === g));
  /* Migalha e título moravam na barra do topo, que saiu. O que sobrou é o
     item aceso no trilho — e o <title> da aba, que continua sendo o único
     lugar onde o nome da tela ainda serve para alguma coisa. */
  document.title = (TITLES[v] ? TITLES[v] + ' · ' : '') + 'Mizys CRM';
}

/* Telas que zeram os filtros ao entrar: manter o `q` de uma tela em outra faz o
   usuário achar que a lista está vazia. */
function go(v, st = {}){
  /* Escalas e turnos deixaram de ter tela própria — viraram abas da tela de
     convenções, que é onde a conta do posto mora. O desvio fica aqui e não em
     cada botão: link antigo, favorito e #escalas na barra do navegador
     continuam abrindo a coisa certa. */
  if(v === 'escalas'){ v = 'ccts'; st = Object.assign({}, st, {tab:'escalas'}); }
  if(v === 'turnos'){  v = 'ccts'; st = Object.assign({}, st, {tab:'turnos'}); }
  /* Relatórios e painel de indicadores viraram uma tela só. Link antigo cai
     nela em vez de dar em nada. */
  if(v === 'relatorios') v = 'dashboard';
  view = v; state = st;
  marcarNav(v);
  /* A tela inicial não tem o respiro de 22px no alto: o nome de 116px é a
     abertura e precisa começar colado. Ver body.na-inicio no app.css. */
  document.body.classList.toggle('na-inicio', v === VIEW_INICIAL);
  location.hash = st.id ? `${v}/${st.id}` : v;
  render();
}

function render(){
  contadores();
  $('#page').innerHTML = (VIEWS[view] || VIEWS[VIEW_INICIAL])();
  if(view === 'pipeline') bindKanban();
  /* O carrossel da tela inicial precisa medir o cartão depois de pintado: a
     largura vem da media query, não de um número guardado no JS. */
  if(view === VIEW_INICIAL) bindCarrossel();
  restaurarFoco();
  depoisDoRender();
}

/* Carregamentos que não podem segurar a pintura da tela. */
function depoisDoRender(){
  if(view === 'leadDetalhe' && state.tab === 'historico'
     && !Historico.cache[Historico.chave('Lead', state.id)])
    carregarHistorico('Lead', state.id);
  /* As abas da proposta viraram GAVETAS: quem diz o que está aberto agora é
     `state.gaveta`, não `state.tab`. Enquanto isto lia `state.tab`, a gaveta
     de Histórico abria sempre vazia e a de Documento nunca listava os modelos
     de PPT — sem erro nenhum no console, porque a condição simplesmente nunca
     era verdadeira. */
  if(view === 'propostaEditor' && state.gaveta === 'historico'
     && !Historico.cache[Historico.chave('Proposta', state.id)])
    carregarHistorico('Proposta', state.id);
  if(view === 'contratoDetalhe' && state.tab === 'historico'
     && !Historico.cache[Historico.chave('Contrato', state.id)])
    carregarHistorico('Contrato', state.id);
  if(view === 'propostaEditor' && state.gaveta === 'documento' && !state.modelos)
    api('/api/modelos').then(r => { state.modelos = r.modelos; render(); }).catch(() => {});
}

function contadores(){
  $('#brandSeg').textContent = CFG('segmento','CRM');
  const n = (id, v) => { const e = $(id); if(e) e.textContent = v; };
  n('#nLeads', DB.list('leads').filter(l => l.status !== 'Desqualificado').length);
  n('#nContatos', DB.list('contatos').length);
  n('#nOps', DB.list('ops').filter(o => !['Ganho','Perdido'].includes(o.fase)).length);
  n('#nAtiv', DB.list('ativs').filter(a => !a.feito).length);
  n('#nProp', DB.list('propostas').length);
  n('#nCct', DB.list('ccts').length);
  n('#nEquip', DB.list('equipamentos').length);
  n('#nMat', DB.list('materiais').length);
  n('#nContratos', DB.list('contratos').filter(c => c.status === 'Ativo').length);
  pontosDoTrilho();
}

/* O grupo fechado não pode esconder que há coisa lá dentro. Número no ícone
   seria mentira — somar leads com propostas não significa nada —, então o que
   aparece é um ponto: "tem algo aqui". */
function pontosDoTrilho(){
  $$('#rail .rail-item.has-menu').forEach(it => {
    const soma = [...it.querySelectorAll('.badge')]
      .reduce((s, b) => s + (parseInt(b.textContent, 10) || 0), 0);
    it.classList.toggle('tem', soma > 0);
  });
}

/* Voltar do navegador funciona: a tela vive na hash. */
window.addEventListener('hashchange', () => {
  const [v, id] = location.hash.replace(/^#/, '').split('/');
  if(v && v !== view || (id && +id !== state.id)){
    view = v || VIEW_INICIAL;
    state = id ? {id:+id} : {};
    marcarNav(view);
    document.body.classList.toggle('na-inicio', view === VIEW_INICIAL);
    document.title = (TITLES[view] ? TITLES[view] + ' · ' : '') + 'Mizys CRM';
    render();
  }
});

/* A busca global foi removida da barra do topo (ver o comentário no
   my_crm.html). O que sobrou é a busca de cada lista, que mora na própria
   tela e filtra o que está sendo mostrado. `buscarGlobal()` continua no
   db.js: é uma consulta pronta, sem custo por estar lá, para o dia em que a
   busca voltar num lugar melhor — uma paleta de comandos, por exemplo. */

/* ── criação rápida ──────────────────────────────────────────────────────────
   Não tem mais botão: o "+" saiu do trilho porque criar coisa é sempre o botão
   da tela que já está aberta, ao lado do que se está olhando. O que sobrou é o
   atalho de teclado — quem usa o sistema o dia inteiro digita mais rápido do
   que navega, e para esse a lista completa vale a tecla. */
document.addEventListener('keydown', e => {
  if(e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
  const alvo = e.target;
  if(alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA'
     || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
  if(document.getElementById('overlay')?.classList.contains('show')) return;
  if(!document.getElementById('appRoot')?.classList.contains('show')) return;
  e.preventDefault();
  ACOES.criacaoRapida();
});

acoes({
  criacaoRapida(){
    const itens = [
      ['Proposta comercial','novaProposta','Postos, adicionais e equipamentos'],
      ['Lead','formLead','Empresa e contato principal'],
      ['Contato','formContato','Pessoa vinculada a um lead'],
      ['Oportunidade','formOp','Negócio em andamento'],
      ['Atividade','formAtiv','Ligação, reunião ou visita'],
      ['Contrato','formContrato','Vigência, valor e reajuste'],
      ['Convenção coletiva','formCCT','Cargos, salários, benefícios e encargos'],
      ['Equipamento','formEquipCad','Item reutilizável nas propostas'],
      ['Escala','formEscala','Regime de trabalho'],
      ['Turno','formTurno','Faixa de horário'],
    ].filter(([,fn]) => soGestor() || !['formCCT','formEquipCad','formEscala','formTurno'].includes(fn));
    modal('O que deseja criar?', `<div style="display:grid;gap:10px">
     ${itens.map(([t,fn,d]) => `
      <button class="btn" style="height:auto;padding:13px 15px;justify-content:flex-start;text-align:left"
       data-acao="criarRapido" data-fn="${esc(fn)}"><div><div style="font-weight:700">${esc(t)}</div>
       <div style="font-size:12px;color:var(--muted);font-weight:400">${esc(d)}</div></div></button>`).join('')}
    </div>`, `<button class="btn" data-acao="fecharModal">Cancelar</button>`);
  },
  criarRapido(d){
    closeModal();
    const fn = ACOES[d.fn];
    if(fn) fn({});
  },
});

/* ════════════════════════════════════════════════════════════════════════════
   AS FAÍSCAS DA TELA DE LOGIN
   O efeito é o do tsparticles, sem o tsparticles: a biblioteca chega a ~100 kB
   de ESM em CDN e traz um motor de física do qual isto usa nada. Trinta linhas
   à mão, sem depender da rede para a tela de login abrir.
   ════════════════════════════════════════════════════════════════════════════ */
let sparks = null;
function startSparks(){
  const cv = $('#authSparks');
  if(!cv || sparks) return;
  const box = cv.parentElement, ctx = cv.getContext && cv.getContext('2d');
  if(!ctx || !box.clientWidth || !box.clientHeight) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, ps = [];
  function size(){
    w = box.clientWidth; h = box.clientHeight;
    if(!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(60, Math.min(230, Math.round(w * h / 5200)));
    ps = Array.from({length:n}, () => ({
      x:Math.random()*w, y:Math.random()*h, r:.4 + Math.random()*1.1,
      a:Math.random(), up:.05 + Math.random()*.22,
      tw:.004 + Math.random()*.013, dir:Math.random() < .5 ? -1 : 1}));
  }
  function draw(){
    ctx.fillStyle = '#EADDFF';
    ctx.clearRect(0, 0, w, h);
    for(const p of ps){
      if(!still){
        p.y -= p.up; if(p.y < -2) p.y = h + 2;
        p.a += p.tw * p.dir;
        if(p.a > 1){ p.a = 1; p.dir = -1; } else if(p.a < .06){ p.a = .06; p.dir = 1; }
      }
      ctx.globalAlpha = p.a;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function frame(){ draw(); if(sparks) sparks.id = requestAnimationFrame(frame); }
  size();
  const ro = window.ResizeObserver ? new ResizeObserver(() => { size(); if(still) draw(); }) : null;
  if(ro) ro.observe(box);
  sparks = {ro, id:0};
  still ? draw() : frame();
}
function stopSparks(){
  if(!sparks) return;
  cancelAnimationFrame(sparks.id);
  if(sparks.ro) sparks.ro.disconnect();
  sparks = null;
}
function replayMark(){
  const art = $('.auth-art-in');
  if(!art) return;
  art.querySelectorAll('h1,.auth-beam').forEach(el => {
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  });
}

/* ════════ AUTENTICAÇÃO ════════ */
let authMode = 'login';
function showAuth(msg){
  const vindoDoApp = $('#appRoot').classList.contains('show');
  $('#appRoot').classList.remove('show');
  $('#authScreen').style.display = 'flex';
  startSparks();
  if(vindoDoApp) replayMark();
  const err = $('#authErr');
  if(msg){ err.textContent = msg; err.style.display = 'block'; }
  else err.style.display = 'none';
}
function setAuthMode(mode){
  authMode = mode;
  const su = mode === 'signup';
  $('#authTitle').textContent = su ? 'Criar conta no Mizys CRM' : 'Entrar no Mizys CRM';
  $('#authSub').textContent = su
    ? 'Primeiro acesso: crie sua conta para entrar no sistema'
    : 'Acesso restrito aos usuários cadastrados';
  $('#authConfirmWrap').style.display = su ? 'flex' : 'none';
  $('#authPass').setAttribute('autocomplete', su ? 'new-password' : 'current-password');
  $('#authBtn').textContent = su ? 'Criar conta' : 'Entrar';
  $('#authToggleBtn').textContent = su ? 'Já tem conta? Entrar' : 'Primeiro acesso? Criar conta';
  showAuth();
}
function showApp(){
  $('#authScreen').style.display = 'none';
  stopSparks();
  $('#appRoot').classList.add('show');
}
async function doLogin(){
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value;
  if(!email || !pass){ showAuth('Informe e-mail e senha.'); return; }
  const btn = $('#authBtn'); btn.disabled = true; btn.textContent = 'Entrando…';
  const {error} = await sb.auth.signInWithPassword({email, password:pass});
  btn.disabled = false; btn.textContent = 'Entrar';
  if(error){ showAuth('E-mail ou senha inválidos.'); return; }
  await boot();
}
async function doSignup(){
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value;
  const conf = $('#authPassConfirm').value;
  if(!email || !pass){ showAuth('Informe e-mail e senha.'); return; }
  if(pass.length < 6){ showAuth('A senha precisa ter pelo menos 6 caracteres.'); return; }
  if(pass !== conf){ showAuth('As senhas não coincidem.'); return; }
  const btn = $('#authBtn'); btn.disabled = true; btn.textContent = 'Criando…';
  const {data, error} = await sb.auth.signUp({email, password:pass});
  btn.disabled = false; btn.textContent = 'Criar conta';
  if(error){
    showAuth(/registered/i.test(error.message)
      ? 'Este e-mail já tem conta cadastrada.' : 'Não foi possível criar a conta.');
    return;
  }
  if(!data.session){ showAuth('Conta criada! Confirme o e-mail que enviamos para poder entrar.'); return; }
  /* Avisa os administradores que tem gente na fila. Se o e-mail não estiver
     configurado, o pedido continua valendo — ele aparece em Configurações →
     Usuários do mesmo jeito. Por isso o erro aqui é engolido: falha de aviso
     não pode virar falha de cadastro. */
  try{ await api('/api/acesso/solicitado', {method:'POST', body:'{}'}); }catch(e){}
  await boot();
}
async function doAuth(){ authMode === 'signup' ? await doSignup() : await doLogin(); }
async function doLogout(){ await sb.auth.signOut(); location.reload(); }

async function boot(){
  const sessao = await Sessao.carregar();
  if(!sessao){ showAuth(); return; }
  /* Conta criada mas ainda não liberada. A porta de verdade é a RLS — sem
     liberação o banco não devolve uma linha sequer —, mas deixar a pessoa
     entrar num CRM vazio faz parecer defeito. Aqui ela sabe o que está
     acontecendo, e sai da sessão para não ficar num app meio carregado. */
  if(!Sessao.liberado()){
    await sb.auth.signOut();
    showAuth('Sua conta foi criada e está aguardando liberação de um '
           + 'administrador. Você poderá entrar assim que ele autorizar.');
    return;
  }
  $('#meEmail').textContent = Sessao.usuario.email || '';
  $('#meName').textContent = Sessao.nome();
  $('#mePapel').textContent = Sessao.papel();
  $('#meAvatar').textContent = ini(Sessao.nome());
  showApp();
  await DB.loadAll();
  const [v, id] = location.hash.replace(/^#/, '').split('/');
  go(TITLES[v] ? v : VIEW_INICIAL, id ? {id:+id} : {});
}

$('#authBtn').onclick = doAuth;
$('#authToggleBtn').onclick = () => setAuthMode(authMode === 'signup' ? 'login' : 'signup');
$('#authPass').addEventListener('keydown', e => { if(e.key === 'Enter')
  (authMode === 'signup' ? $('#authPassConfirm').focus() : doAuth()); });
$('#authPassConfirm').addEventListener('keydown', e => { if(e.key === 'Enter') doAuth(); });
$('#authEmail').addEventListener('keydown', e => { if(e.key === 'Enter') $('#authPass').focus(); });
sb.auth.onAuthStateChange((_ev, session) => { if(!session) showAuth(); });

acoes({ sair(){ doLogout(); } });

$('#overlay').onclick = e => { if(e.target === $('#overlay')) closeModal(); };
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

/* ════════════════════════════════════════════════════════════════════════════
   O TRILHO
   O painel abre sozinho no hover e no foco de teclado — isso é CSS, e é o
   caminho normal no desktop. O JS existe por causa do que o CSS não alcança:
   · tela de toque não tem hover. Sem o clique que FIXA o painel, o menu seria
     inutilizável no tablet do vendedor em visita;
   · painel fixo tem que fechar ao clicar fora e no Esc, senão fica preso na
     tela por cima do conteúdo.
   ════════════════════════════════════════════════════════════════════════════ */
const fecharTrilho = () => $$('#rail .rail-item.pin').forEach(it => {
  it.classList.remove('pin');
  it.querySelector('.rail-btn')?.setAttribute('aria-expanded', 'false');
});

$$('#rail .rail-item.has-menu > .rail-btn').forEach(btn => {
  btn.onclick = e => {
    e.stopPropagation();
    const item = btn.parentElement, abrir = !item.classList.contains('pin');
    fecharTrilho();
    item.classList.toggle('pin', abrir);
    btn.setAttribute('aria-expanded', String(abrir));
  };
});
/* Ir para a tela fecha o painel: deixá-lo aberto cobriria justamente o começo
   do conteúdo que o clique acabou de pedir. */
$$('#rail button[data-v]').forEach(b => b.onclick = () => { go(b.dataset.v); fecharTrilho(); });
/* Botão de ação dentro do painel (o "Nova proposta"): quem despacha a ação é o
   listener global do util.js; aqui só fechamos o painel, senão ele fica aberto
   por cima do modal que a ação acabou de abrir. */
$$('#rail .fly button[data-acao]').forEach(b => b.addEventListener('click', fecharTrilho));
document.addEventListener('click', e => { if(!e.target.closest('.rail-item')) fecharTrilho(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape') fecharTrilho(); });

/* As faíscas antes do boot(): getSession() é uma ida à rede, e a cena não pode
   chegar em duas partes. Se houver sessão salva, showApp() apaga tudo logo. */
startSparks();
boot();
