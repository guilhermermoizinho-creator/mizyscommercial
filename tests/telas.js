/* ════════════════════════════════════════════════════════════════════════════
   TESTE DE FUMAÇA DAS TELAS

   Carrega os arquivos de tela num contexto de Node com o mínimo de navegador
   fingido e MANDA CADA VIEW PINTAR, com um banco de mentira em memória.

   O que ele pega é o erro que mais dói e que nenhum outro teste via: função
   que não existe. As telas montam HTML por interpolação de template string —
   um `precoMatC` digitado errado ou um helper que mudou de nome não aparece no
   `node --check`, não aparece na suíte em Python, e só estoura na cara de quem
   abriu a proposta. Aqui estoura no terminal.

   Não valida layout nem CSS: valida que a tela pinta sem exceção e devolve
   HTML. É pouco, e é exatamente o que faltava.

     node tests/telas.js
   ════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.dirname(__dirname);
const js = f => fs.readFileSync(path.join(raiz, 'static', 'js', f), 'utf8');

/* ── o banco de mentira ───────────────────────────────────────────────────── */
const DADOS = {
  configuracoes: [
    {chave:'proposta_margem_minima', valor:'8'}, {chave:'proposta_desconto_limite', valor:'5'},
    {chave:'proposta_markup', valor:'18'}, {chave:'empresa_cidade', valor:'São Paulo'},
    {chave:'regime_tributario', valor:'presumido'}, {chave:'rat_nominal', valor:'3'},
    {chave:'fap', valor:'1'}, {chave:'turnover_pct', valor:'60'},
    {chave:'absenteismo_pct', valor:'3.5'}, {chave:'custos_indiretos_pct', valor:'8'},
    {chave:'iss_pct', valor:'2'}, {chave:'modo_preco', valor:'privado'},
    {chave:'cobertura_modo', valor:'headcount'}, {chave:'salario_minimo', valor:'1518'},
    {chave:'adicional_noturno', valor:'20'}, {chave:'segmento', valor:'Facilities'},
    {chave:'ppt_modelo', valor:'mizys_proposta.pptx'}, {chave:'aceite_base_url', valor:'http://x'},
  ],
  /* `ativo` não é enfeite: LISTA() filtra por ele, e sem isso todo <select> de
     lista sai VAZIO — que foi como o seletor de Situação apareceu na primeira
     prévia desta tela. Banco de mentira também precisa ser fiel. */
  listas: [
    {grupo:'proposta_status', valor:'Rascunho', rotulo:'Rascunho', ordem:1, ativo:true},
    {grupo:'proposta_status', valor:'Enviada', rotulo:'Enviada', ordem:2, ativo:true},
    {grupo:'op_fase', valor:'Prospecção', rotulo:'Prospecção', num:15, ordem:1, ativo:true},
    {grupo:'equipamento_tipo', valor:'Mensal', rotulo:'Mensal', ordem:1, ativo:true},
    {grupo:'uf', valor:'SP', rotulo:'SP', ordem:1, ativo:true},
  ],
  /* Um pendente e um liberado: a tela de Usuarios tem que separar os dois, e
     a fila de pedidos so aparece quando ha alguem nela. */
  perfis: [
    {id:'u-admin', email:'guilherme@mizys.com.br', nome:'Guilherme', papel:'admin', ativo:true},
    {id:'u-novo', email:'novo@empresa.com', nome:'Novo', papel:'pendente', ativo:true,
     solicitado_em:'2026-08-20T10:00:00Z'},
  ], ccts: [{id:1, nome:'Asseio SP 2026', ativo:true, data_base:'2026-01-01',
                      horas_mensais:220, piso_categoria:1780, insalubridade_base:'minimo'}],
  cct_cargos: [{id:1, cctId:1, nome:'Auxiliar de Limpeza', salario:1780},
               {id:2, cctId:1, nome:'Porteiro', salario:1920}],
  cct_beneficios: [{id:1, cctId:1, nome:'Vale-transporte', valor:352, unid:'mês',
                    desconto_tipo:'pct_salario', desconto_pct:6},
                   {id:2, cctId:1, nome:'Vale-refeição', valor:30, unid:'dia',
                    dias_mes:22, desconto_tipo:'pct_valor', desconto_pct:20}],
  cct_encargos: [],
  escalas: [{id:1, nome:'44h', horas_semanais:44, fator_modo:'manual', fator_func:1, ativo:true},
            {id:2, nome:'12x36', horas_semanais:44, fator_modo:'calculado', dias_semana:7,
             horas_posto_dia:12, absenteismo_pct:4, cobertura_ferias:true, ativo:true}],
  turnos: [{id:1, nome:'Diurno', hora_inicio:'07:00', hora_fim:'19:00',
            intervalo_min:60, noturno:false, ativo:true},
           {id:2, nome:'Noturno', hora_inicio:'19:00', hora_fim:'07:00',
            intervalo_min:60, noturno:true, ativo:true}],
  equipamentos: [{id:1, nome:'Enceradeira', marca_modelo:'CL350', valor:186,
                  tipo:'Mensal', ativo:true}],
  materiais: [
    {id:1, nome:'Conjunto de uniforme', categoria:'Uniforme', unidade:'conj',
     valor:190, meses:6, base:'funcionario', ativo:true, obs:'2 por ano'},
    {id:2, nome:'Rádio comunicador', categoria:'Equipagem', unidade:'un',
     valor:240, meses:24, base:'posto', ativo:true},
    {id:3, nome:'Material de limpeza', categoria:'Material', unidade:'cota',
     valor:320, meses:1, base:'contrato', ativo:true},
  ],
  leads: [{id:1, empresa:'Condomínio Alfa', cnpj:'11222333000181', cidade:'São Paulo',
           uf:'SP', status:'Novo', contato_nome:'Ana', contato_email:'ana@x.com',
           valor:0, criado:'2026-08-01'}],
  contatos: [{id:1, leadId:1, nome:'Ana', cargo:'Síndica', principal:true}],
  ops: [{id:1, titulo:'Alfa', leadId:1, valor:1000, fase:'Prospecção', prob:15,
         fase_desde:'2026-08-01T12:00:00Z'}],
  propostas: [{
    id:1, numero:'PRP-2026-0001', leadId:1, contatoId:1, opId:1, cctId:1,
    titulo:'Proposta Facilities — Condomínio Alfa', status:'Rascunho',
    emissao:'2026-08-01', validade:30, prazo:12, versao:1,
    encargos:0, markup:18, margem_alvo:15, imposto:0, desconto:0,
    itens:[{cargoId:1, escalaId:1, turnoId:1, qtd:3, adicionais:[], beneficios:[1,2], obs:''}],
    materiais:[{id:1, qtd:2}, {id:2, qtd:1}, {id:3, qtd:1}],
    equipamentos:[{id:1, qtd:2}],
    escopo:'Limpeza e portaria', obs:'', slides:{}, aprovacao_status:'nao_requer',
  },{
    /* A mesma proposta SEM margem definida: é o estado em que toda proposta
       nova nasce agora, e o que a tela diz nele é o texto que mais gente vai
       ler. Sem este caso o teste passaria e a frase estaria quebrada. */
    id:2, numero:'PRP-2026-0002', leadId:1, contatoId:1, opId:1, cctId:1,
    titulo:'Proposta sem margem definida', status:'Rascunho',
    emissao:'2026-08-01', validade:30, prazo:12, versao:1,
    encargos:0, markup:18, margem_alvo:0, imposto:0, desconto:0,
    itens:[{cargoId:2, escalaId:1, turnoId:1, qtd:1, adicionais:['P30'], beneficios:[1], obs:''}],
    materiais:[], equipamentos:[],
    escopo:'', obs:'', slides:{}, aprovacao_status:'nao_requer',
  },{
    /* Posto NOTURNO num 12x36, que é o caso que a tela de conferência precisa
       explicar: 7 das 11h de jornada líquida caem entre 22h e 5h, e as outras
       4 são hora normal. Sem este caso no teste, a linha que diz "ganham
       adicional / não ganham" nunca é executada. */
    id:3, numero:'PRP-2026-0003', leadId:1, contatoId:1, opId:1, cctId:1,
    titulo:'Portaria noturna 12x36', status:'Rascunho',
    emissao:'2026-08-01', validade:30, prazo:12, versao:1,
    encargos:0, markup:18, margem_alvo:14, imposto:0, desconto:0,
    itens:[{cargoId:2, escalaId:2, turnoId:2, qtd:2,
            adicionais:['P30','I20'], a20:20, beneficios:[1,2], obs:'Portaria 24h'}],
    materiais:[{id:1, qtd:2}], equipamentos:[],
    escopo:'Portaria', obs:'', slides:{}, aprovacao_status:'nao_requer',
  }],
  ativs: [], contratos: [], contrato_reajustes: [], metas: [],
};

/* ── navegador de mentira ─────────────────────────────────────────────────── */
const noop = () => {};
const elemento = () => new Proxy({
  value:'', checked:false, textContent:'', innerHTML:'', style:{}, dataset:{},
  classList:{add:noop, remove:noop, toggle:noop, contains:() => false},
  closest:() => elemento(), focus:noop, addEventListener:noop, appendChild:noop,
  querySelectorAll:() => [], querySelector:() => elemento(), remove:noop,
}, {get:(o, k) => (k in o ? o[k] : noop), set:(o, k, v) => (o[k] = v, true)});

const sandbox = {
  console, setTimeout, clearTimeout, JSON, Math, Date, Number, String, Object,
  Array, Boolean, RegExp, Error, isNaN, parseFloat, parseInt, encodeURIComponent,
  decodeURIComponent, Intl, Promise, Set, Map, fetch: () => Promise.resolve({}),
  localStorage: {getItem: () => null, setItem: noop, removeItem: noop},
  location: {hash:'', href:'http://localhost/'},
  navigator: {clipboard:{writeText: () => Promise.resolve()}, userAgent:'node'},
  document: new Proxy({
    body: elemento(), documentElement: elemento(),
    getElementById: () => elemento(), querySelector: () => elemento(),
    querySelectorAll: () => [], createElement: () => elemento(),
    addEventListener: noop, readyState:'complete',
  }, {get:(o, k) => (k in o ? o[k] : noop)}),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
/* O cliente do Supabase de mentira ANOTA cada tabela tocada. É o que permite
   provar que "Nova proposta" não escreve nada: sem esse registro um insert
   acidental passaria batido, porque o proxy devolve função para tudo e nunca
   levanta erro. */
const chamadasSb = [];
sandbox.window.supabase = {createClient: () => ({
  from(tabela){
    chamadasSb.push(tabela);
    const encadeia = new Proxy({}, {get: (o, k) => {
      if(k === 'then') return undefined;                 /* não é promise */
      if(k === 'single' || k === 'maybeSingle')
        return () => Promise.resolve({data:null, error:null});
      return () => encadeia;
    }});
    return encadeia;
  },
  rpc: () => Promise.resolve({data:'PRP-2026-9999', error:null}),
  auth: new Proxy({}, {get: () => () => Promise.resolve({data:{}, error:null})}),
})};
sandbox.window.__SUPABASE_URL__ = 'http://x';
sandbox.window.__SUPABASE_ANON_KEY__ = 'x';

const ctx = vm.createContext(sandbox);

/* util.js e ui.js declaram os helpers; db.js o DB; calculo.js o motor. A ordem
   é a mesma do <script> no template — trocar aqui esconderia um erro real. */
const ARQUIVOS = ['util.js', 'calculo.js', 'ui.js', 'db.js', 'forms.js',
                  'views-inicio.js', 'views-crm.js', 'views-proposta.js',
                  'views-contratos.js', 'views-cadastros.js', 'views-prospeccao.js',
                  'views-admin.js',
                  'graficos.js'];

for(const f of ARQUIVOS){
  try{ vm.runInContext(js(f), ctx, {filename: f}); }
  catch(e){ falhar(f + ' não carregou', e); }
}

/* O DB de mentira entra por cima do real: as telas só precisam de list/get. */
vm.runInContext(`
  DB.d = ${JSON.stringify(DADOS)};
  DB.total = {}; DB.carregado = {};
  /* As telas rodam como admin. Mas os metodos REAIS ficam guardados em
     Sessao._real: sem isso, um teste sobre papel testaria este stub, e o stub
     passa sempre. */
  Sessao._real = {papel:Sessao.papel, liberado:Sessao.liberado,
                  podeGerir:Sessao.podeGerir, eAdmin:Sessao.eAdmin};
  Sessao.nome = () => 'Teste';
  Sessao.podeGerir = () => true;
  Sessao.eAdmin = () => true;
  Sessao.papel = () => 'admin';
`, ctx);

/* ── as telas ─────────────────────────────────────────────────────────────── */
const TELAS = [
  ['inicio', {}], ['pipeline', {}], ['leads', {}], ['contatos', {}],
  ['oportunidades', {}], ['atividades', {}], ['propostas', {}],
  ['propostaEditor', {id:1}],
  ['propostaEditor', {id:2}],
  ['propostaResumo', {id:1}],
  ['propostaResumo', {id:2}],
  ['propostaResumo', {id:3}],
  ['propostaEditor', {id:3}],
  ['propostaEditor', {id:1, gaveta:'avancado'}],
  ['propostaEditor', {id:1, gaveta:'documento'}],
  ['propostaEditor', {id:1, gaveta:'versoes'}],
  ['propostaEditor', {id:1, gaveta:'historico'}],
  ['contratos', {}], ['ccts', {}], ['equipamentos', {}], ['materiais', {}],
  ['configuracoes', {}], ['configuracoes', {tab:'usuarios'}], ['dashboard', {}],
  /* Prospecção em tres estados: antes de perguntar ao servidor, com a busca
     desligada por falta de chave, e com resultado na mao — inclusive uma
     descartada, que e o caminho onde os motivos sao pintados. */
  ['admin', {}], ['admin', {tab:'sistema'}],
  ['admin', {tab:'sistema', saude:{supabase:true, link_publico:false, pdf:true,
    pdf_motor:'LibreOffice', email:false, email_faltando:'SMTP_HOST', logo:true,
    modelos:['proposta_facilities.pptx']}}],
  ['prospeccao', {}],
  ['prospeccao', {prosp:{google:false, bloqueio:['hagana','gps']}}],
  ['prospeccao', {prosp:{google:true, regiao:'São Paulo', total:2, aproveitados:1,
    candidatos:[
      {place_id:'a', nome:'Limpadora Bandeirantes', endereco:'Rua X, 10 - São Paulo',
       site:'https://exemplo.com.br', telefone:'(11) 4002-8922',
       emails:['comercial@exemplo.com.br'], cnpj_site:'57559387000138',
       sinais:['porte demais','12 anos'], motivos:[], nota_triagem:95, descartado:false,
       rf:{cnpj:'57559387000138', razao_social:'LIMPADORA BANDEIRANTES LTDA',
           situacao:'ATIVA', porte:'DEMAIS', capital_social:800000,
           cnae_desc:'Limpeza em prédios e em domicílios', municipio:'SÃO PAULO', uf:'SP'}},
      {place_id:'b', nome:'Hagana Serviços', endereco:'Av. Y, 200',
       site:'', telefone:'', emails:[], sinais:['capital R$ 279.2 mi'],
       motivos:['grande/bloqueada: hagana'], nota_triagem:0, descartado:true, rf:{}},
    ], erros:[]}, prospDescartadas:true}],
];

let falhas = 0;
function falhar(rotulo, e){
  falhas++;
  console.error('  ✗ ' + rotulo + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0,3).join('\n    ') : e));
}

for(const [tela, st] of TELAS){
  const nome = tela + (st.gaveta ? ' [' + st.gaveta + ']' : '');
  try{
    const html = vm.runInContext(
      `state = ${JSON.stringify(st)}; view = ${JSON.stringify(tela)};
       (VIEWS[${JSON.stringify(tela)}] || (() => null))()`, ctx);
    if(typeof html !== 'string' || !html.trim()) falhar(nome, 'não devolveu HTML');
    else if(/undefined|\[object Object\]|NaN/.test(html)) {
      const m = html.match(/.{0,60}(undefined|\[object Object\]|NaN).{0,60}/);
      falhar(nome, 'HTML com buraco: …' + m[0] + '…');
    }
    else console.log('  ✓ ' + nome + ' (' + html.length + ' bytes)');
  }catch(e){ falhar(nome, e); }
}

/* Os formulários também montam HTML e também quebram calados. */
for(const f of ['formMaterial', 'formEquipCad', 'formLead']){
  try{
    vm.runInContext(`ACOES[${JSON.stringify(f)}]({})`, ctx);
    console.log('  ✓ ' + f);
  }catch(e){ falhar(f, e); }
}

/* ── cliente novo sem sair da proposta ───────────────────────────────────────
   A corrente tem três elos e o do meio é o que quebra calado: o botão abre o
   formulário de lead, o formulário precisa carregar o "de onde vim" até o
   botão Salvar do modal, e só então o saveLead sabe que tem de amarrar o
   cliente novo à proposta aberta. Perdido o elo do meio, o cliente é criado e
   a proposta continua apontando para o cliente antigo — que é o jeito mais
   rápido de mandar uma proposta para a empresa errada. */
try{
  const ed = vm.runInContext("state={id:1};view='propostaEditor';VIEWS.propostaEditor()", ctx);
  if(!/data-acao="formLead"[^>]*data-vincular="proposta"/.test(ed))
    falhar('novo cliente', 'sem o botão "+ Novo" no seletor de cliente');
  else if(!/data-acao="formContato"[^>]*data-lead="1"/.test(ed))
    falhar('novo contato', 'sem o botão "+ Novo" no seletor de contato');
  else {
    /* Intercepta o modal para ler o rodapé que o formulário monta. */
    vm.runInContext("modal = (t, corpo, acoes) => { globalThis.__acoes = acoes; };", ctx);
    vm.runInContext("ACOES.formLead({vincular:'proposta'})", ctx);
    const rodape = vm.runInContext('__acoes', ctx);
    if(!/data-acao="saveLead"[^>]*data-vincular="proposta"/.test(rodape))
      falhar('novo cliente', 'o Salvar do modal perdeu o vínculo com a proposta');
    else console.log('  ✓ cliente e contato novos sem sair da proposta');
  }
}catch(e){ falhar('novo cliente', e); }

/* ── o adicional noturno tem que dizer o que NÃO é ─────────────────────────
   O valor sozinho não responde "por que R$ 279 e não R$ 384?". A tela precisa
   dizer quantas horas ganham adicional e quantas não — é a conta que o cliente
   pede na reunião. */
try{
  const conf = vm.runInContext("state={id:3};view='propostaResumo';VIEWS.propostaResumo()", ctx);
  const faltando = ['Ganham adicional', 'Não ganham', 'hora cheia', 'de jornada']
    .filter(t => !conf.includes(t));
  if(faltando.length) falhar('noturno', 'sem explicar: ' + faltando.join(', '));
  else if(!conf.includes('não se acumulam'))
    falhar('noturno', 'não explica a insalubridade afastada pela periculosidade');
  else console.log('  ✓ noturno diz o que ganha e o que não ganha adicional');
}catch(e){ falhar('noturno', e); }

/* ── o salário aberto, pessoa a pessoa ── */
try{
  const conf = vm.runInContext("state={id:1};view='propostaResumo';VIEWS.propostaResumo()", ctx);
  const faltando = ['Salário-base da convenção', 'Salário bruto na folha',
                    'Custo por pessoa', 'Total de benefícios']
    .filter(t => !conf.includes(t));
  if(faltando.length) falhar('salários', 'faltou: ' + faltando.join(', '));
  else console.log('  ✓ folha aberta com salário, adicionais e benefícios');
}catch(e){ falhar('salários', e); }

/* ── a fila de liberação de acesso ─────────────────────────────────────────
   Conta nova nasce pendente e nao pode ver nada. A tela de Usuarios precisa
   separar quem esta esperando de quem ja entrou — fila que se mistura com a
   lista do time e pedido que ninguem ve. */
try{
  const tela = vm.runInContext(
    "state={tab:'usuarios'};view='configuracoes';VIEWS.configuracoes()", ctx);
  if(!tela.includes('Pedidos de acesso'))
    falhar('acesso', 'a fila de pedidos nao apareceu');
  else if(!/data-acao="liberarAcesso"[^>]*data-papel="vendedor"/.test(tela))
    falhar('acesso', 'sem o botao de liberar como vendedor');
  else if(!tela.includes('novo@empresa.com'))
    falhar('acesso', 'o pendente nao aparece na fila');
  else if(!tela.includes('esperando há'))
    falhar('acesso', 'nao diz ha quanto tempo a pessoa espera');
  else console.log('  ✓ fila de acesso com liberar e recusar');
}catch(e){ falhar('acesso', e); }

/* E o pendente nao pode ser tratado como vendedor pelo front.
   Chama os metodos REAIS com um `this` controlado — o Sessao vivo esta com o
   stub de admin por cima, para as telas pintarem. */
try{
  const r = vm.runInContext(`(() => {
    const real = Sessao._real;
    /* liberado() e podeGerir() chamam this.papel(): o objeto de teste precisa
       carregar os tres metodos juntos, senao o this fica sem papel(). */
    const como = perfil => {
      const o = Object.assign({}, real, {perfil});
      return {papel:o.papel(), liberado:o.liberado(), gere:o.podeGerir()};
    };
    return {pendente: como({papel:'pendente'}), semPerfil: como(null),
            vendedor: como({papel:'vendedor'})};
  })()`, ctx);
  if(r.pendente.papel !== 'pendente' || r.pendente.liberado !== false)
    falhar('acesso', 'pendente nao foi tratado como pendente: ' + JSON.stringify(r.pendente));
  else if(r.semPerfil.papel !== 'pendente' || r.semPerfil.liberado !== false)
    falhar('acesso', 'sem perfil deveria cair em pendente, caiu em ' + r.semPerfil.papel);
  else if(r.vendedor.liberado !== true)
    falhar('acesso', 'vendedor deveria estar liberado');
  else console.log('  ✓ pendente e sem-perfil nao viram vendedor');
}catch(e){ falhar('acesso', e); }

/* ── o rascunho não pode tocar o banco ──────────────────────────────────────
   Este é o teste que dá nome ao recurso. "Nova proposta" abre um rascunho em
   memória; se ele escrever em `propostas` ou em `ops`, a lista volta a encher
   de proposta vazia e a sequence de numeração volta a ficar furada — e ela não
   anda para trás. */
const fim = () => {
  console.log(falhas ? falhas + ' falha(s)' : 'Tudo certo.');
  process.exit(falhas ? 1 : 0);
};

vm.runInContext('go = (v, st) => { view = v; state = st || {}; };', ctx);

vm.runInContext('criarProposta({leadId:1})', ctx).then(pr => {
  const tocou = chamadasSb.filter(t => t === 'propostas' || t === 'ops');
  if(!pr) falhar('rascunho', 'criarProposta não devolveu nada');
  else if(!vm.runInContext('DB.eRascunho(' + pr.id + ')', ctx))
    falhar('rascunho', 'id ' + pr.id + ' não é rascunho');
  else if(tocou.length)
    falhar('rascunho', 'gravou no banco: ' + tocou.join(', '));
  else if(!vm.runInContext("DB.list('propostas').some(x => DB.eRascunho(x.id))", ctx))
    falhar('rascunho', 'o rascunho sumiu da memória');
  else console.log('  ✓ nova proposta não escreve no banco');

  /* A tela do rascunho tem que pintar, e tem que esconder o que ainda não
     existe: não há PDF de uma proposta que o servidor nunca viu. */
  try{
    const html = vm.runInContext(
      "state = {id:-1}; view = 'propostaEditor'; VIEWS.propostaEditor()", ctx);
    if(!html.includes('Salvar proposta')) falhar('rascunho [tela]', 'sem botão de salvar');
    else if(html.includes('Gerar PDF')) falhar('rascunho [tela]', 'ofereceu PDF antes de salvar');
    else console.log('  ✓ tela do rascunho (' + html.length + ' bytes)');
  }catch(e){ falhar('rascunho [tela]', e); }

  /* E o rascunho não pode aparecer na lista: ele sumiria ao recarregar. */
  try{
    const lista = vm.runInContext("state = {}; view = 'propostas'; VIEWS.propostas()", ctx);
    if(!lista.includes('montada mas não salva'))
      falhar('rascunho [lista]', 'sem a faixa de volta ao rascunho');
    else console.log('  ✓ lista avisa do rascunho sem listá-lo');
  }catch(e){ falhar('rascunho [lista]', e); }

  fim();
}).catch(e => { falhar('rascunho', e); fim(); });
