/* ════════════════════════════════════════════════════════════════════════════
   CAMADA DE DADOS
   ════════════════════════════════════════════════════════════════════════════

   Tudo — inclusive listas de opções e parâmetros de cálculo — vem do Supabase.
   Nenhuma lista de negócio é declarada aqui dentro.

   Duas mudanças de fundo em relação à v1:

   · **Carregamento sob demanda (5.2).** `loadAll()` trazia TODAS as linhas das
     14 tabelas a cada login (P9.1). Com mil leads e três mil propostas isso é
     um login de quinze segundos e um navegador com o banco inteiro na memória.
     Agora os catálogos (que são pequenos e usados em todo select) vêm inteiros;
     o movimento (leads, oportunidades, propostas, atividades, timeline) vem em
     páginas, com contagem total e um botão de carregar mais.

   · **Papéis (3.3).** O front sabe quem é o usuário e o que ele pode. Isso é
     conveniência de interface — quem realmente barra é a RLS no Postgres. Botão
     escondido não é permissão; permissão é a policy.
   ════════════════════════════════════════════════════════════════════════════ */

const sb = window.supabase.createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__);

/* `pk` só difere de "id" em configuracoes, indexada pela chave.
   `pagina` marca as tabelas de movimento — as que crescem sem teto. */
const ENTIDADES = [
 {n:'configuracoes', pk:'chave', ord:'chave'},
 {n:'listas',   ord:'ordem'},
 {n:'perfis',   pk:'id', ord:'email'},
 {n:'ccts'}, {n:'cct_cargos'}, {n:'cct_beneficios'}, {n:'cct_encargos'},
 {n:'escalas'}, {n:'turnos'}, {n:'equipamentos'}, {n:'materiais'},
 {n:'leads',     pagina:true, ord:'id', desc:true},
 {n:'contatos'},
 {n:'ops',       pagina:true, ord:'id', desc:true},
 {n:'propostas', pagina:true, ord:'id', desc:true},
 {n:'ativs',     pagina:true, ord:'data', desc:true},
 {n:'contratos', pagina:true, ord:'id', desc:true},
 {n:'contrato_reajustes'},
 {n:'metas'},
];
const META = Object.fromEntries(ENTIDADES.map(e => [e.n, {
  pk: e.pk || 'id', ord: e.ord || 'id', desc: !!e.desc, pagina: !!e.pagina}]));

const PAGINA = 300;      /* linhas por lote nas tabelas de movimento */

const DB = {
 d: Object.fromEntries(ENTIDADES.map(e => [e.n, []])),
 total: {},              /* quantas linhas existem no banco, por tabela */
 carregado: {},          /* quantas já estão na memória */

 list(e){ return this.d[e] || []; },
 /* Comparação por texto, não por número: `perfis` é indexada por UUID e
    `configuracoes` por chave. Converter para número transformaria o UUID em
    NaN e a linha nunca seria encontrada. */
 get(e, id){
   if(id === null || id === undefined || id === '') return undefined;
   const pk = META[e].pk;
   return this.d[e].find(x => String(x[pk]) === String(id));
 },
 /* O valor que vai no .eq() do PostgREST: número quando a chave é um id
    numérico, texto nos demais casos. */
 _chave(e, id){
   return (META[e].pk === 'id' && /^\d+$/.test(String(id))) ? +id : id;
 },
 completo(e){ return !META[e].pagina || (this.carregado[e] ?? 0) >= (this.total[e] ?? 0); },

 /* ── rascunho local ─────────────────────────────────────────────────────────
    Uma proposta nova nasce SÓ NA MEMÓRIA, com id negativo, e nada disso vai
    para o banco enquanto o botão Salvar não for clicado.

    Antes, clicar em "Nova proposta" já gravava a linha: quem abria por
    curiosidade e desistia deixava uma proposta vazia na lista, com número
    queimado da sequência — e a sequência não volta atrás. Em uma semana a
    lista tinha mais rascunho abandonado do que proposta de verdade.

    O id negativo é a chave de tudo: `upd` e `del` reconhecem e mexem só no
    array em memória, então TODAS as ações do editor (adicionar posto, trocar
    escala, mexer na margem) funcionam sem uma linha de código diferente.
    Quem sabe que é rascunho é o DB, não cada tela. */
 eRascunho(id){ return +id < 0; },

 /* Só existe um por vez: dois rascunhos abertos ao mesmo tempo seriam dois
    botões Salvar disputando a mesma sequência de numeração. */
 rascunho(e, o){
  this.d[e] = this.d[e].filter(x => !this.eRascunho(x.id));
  const linha = {...o, id: -1};
  this.d[e].unshift(linha);
  return linha;
 },
 temRascunho(e){ return this.d[e].some(x => this.eRascunho(x.id)); },
 descartar(e){
  this.d[e] = this.d[e].filter(x => !this.eRascunho(x.id));
 },

 async add(e, o){
  const {data, error} = await sb.from(e).insert(o).select().single();
  if(error){ toast(traduzErro(error)); throw error; }
  this.d[e].unshift(data);
  this.total[e] = (this.total[e] || 0) + 1;
  this.carregado[e] = (this.carregado[e] || 0) + 1;
  return data;
 },

 async upd(e, id, o){
  /* Rascunho não tem linha no banco: gravar é mudar o objeto em memória. */
  if(this.eRascunho(id)){
   const atual = this.get(e, id);
   if(atual) Object.assign(atual, o);
   return atual;
  }
  const pk = META[e].pk;
  const {data, error} = await sb.from(e).update(o)
    .eq(pk, this._chave(e, id)).select().single();
  if(error){ toast(traduzErro(error)); throw error; }
  const atual = this.get(e, id);
  if(atual) Object.assign(atual, data); else this.d[e].unshift(data);
  return data;
 },

 async del(e, id){
  if(this.eRascunho(id)){ this.descartar(e); return; }
  const pk = META[e].pk;
  const {error} = await sb.from(e).delete().eq(pk, this._chave(e, id));
  if(error){ toast(traduzErro(error)); throw error; }
  this.d[e] = this.d[e].filter(x => String(x[pk]) !== String(id));
  this.total[e] = Math.max((this.total[e] || 1) - 1, 0);
  this.carregado[e] = Math.max((this.carregado[e] || 1) - 1, 0);
 },

 /* Recarrega uma linha só — mais barato que render tudo de novo depois de uma
    operação do servidor (congelar, aceitar, enviar). */
 async refrescar(e, id){
  const pk = META[e].pk;
  const {data} = await sb.from(e).select('*').eq(pk, this._chave(e, id)).single();
  if(!data) return null;
  const atual = this.get(e, id);
  if(atual) Object.assign(atual, data); else this.d[e].unshift(data);
  return data;
 },

 async _pagina(e, de, ate){
  const m = META[e];
  const q = sb.from(e).select('*', {count:'exact'})
              .order(m.ord, {ascending: !m.desc}).range(de, ate);
  const {data, error, count} = await q;
  if(error) throw error;
  if(count !== null && count !== undefined) this.total[e] = count;
  return data || [];
 },

 async loadAll(){
  const resultados = await Promise.allSettled(ENTIDADES.map(async e => {
    const m = META[e.n];
    if(m.pagina){
      const linhas = await this._pagina(e.n, 0, PAGINA - 1);
      this.d[e.n] = linhas;
      this.carregado[e.n] = linhas.length;
    } else {
      const {data, error, count} = await sb.from(e.n)
        .select('*', {count:'exact'}).order(m.ord);
      if(error) throw error;
      this.d[e.n] = data || [];
      this.total[e.n] = count ?? (data || []).length;
      this.carregado[e.n] = this.d[e.n].length;
    }
  }));
  resultados.forEach((r, i) => {
    if(r.status === 'rejected'){
      const nome = ENTIDADES[i].n;
      console.error(nome, r.reason);
      this.d[nome] = this.d[nome] || [];
      /* `perfis` falha em base antiga (a tabela é da v2). Não vale assustar. */
      if(nome === 'perfis') return;
      /* `materiais` falha em base que ainda não rodou a migração do Módulo 5.
         O sistema inteiro continua de pé — só o bloco de materiais fica vazio
         — então a mensagem diz o que fazer em vez de só dizer que falhou. */
      if(nome === 'materiais'){
        toast('Materiais indisponíveis: rode supabase/migracao_materiais.sql no Supabase.');
        return;
      }
      toast('Erro ao carregar ' + nome);
    }
  });
 },

 /* Próximo lote de uma tabela de movimento. */
 async mais(e){
  if(this.completo(e)) return 0;
  const de = this.carregado[e] || 0;
  const linhas = await this._pagina(e, de, de + PAGINA - 1);
  const jaTem = new Set(this.d[e].map(x => x.id));
  const novas = linhas.filter(x => !jaTem.has(x.id));
  this.d[e] = this.d[e].concat(novas);
  this.carregado[e] = this.d[e].length;
  return novas.length;
 },

 /* Traz TUDO de uma tabela paginada — usado por exportação e relatório, que
    não podem responder sobre meia base. */
 async carregarTudo(e){
  let voltas = 0;
  while(!this.completo(e) && voltas++ < 200) await this.mais(e);
  return this.d[e];
 },
};

/* Mensagem de erro do Postgres é para o desenvolvedor. Isto é para o usuário. */
function traduzErro(error){
  const m = String(error?.message || error || '');
  if(/duplicate key.*leads_cnpj/i.test(m)) return 'Já existe um lead com este CNPJ.';
  if(/duplicate key.*propostas_numero/i.test(m)) return 'Este número de proposta já existe. Tente de novo.';
  if(/duplicate key/i.test(m)) return 'Já existe um registro com estes dados.';
  if(/violates foreign key.*propostas/i.test(m))
    return 'Não dá para excluir: existe proposta ligada a este registro.';
  if(/violates foreign key.*contratos/i.test(m))
    return 'Não dá para excluir: existe contrato ligado a este registro.';
  if(/violates foreign key/i.test(m)) return 'Não dá para excluir: há registros dependentes.';
  if(/row-level security|permission denied/i.test(m))
    return 'Você não tem permissão para esta operação.';
  if(/JWT|expired/i.test(m)) return 'Sessão expirada. Entre de novo.';
  /* Coluna ou tabela que não existe é quase sempre migração não rodada — e a
     mensagem crua do Postgres ("column propostas.materiais does not exist")
     manda a pessoa procurar bug no código em vez de rodar o SQL. */
  if(/column .*(materiais|margem_alvo).* does not exist|relation .*materiais.* does not exist/i.test(m))
    return 'O banco ainda não tem o Módulo 5. Rode supabase/migracao_materiais.sql '
         + 'no SQL Editor do Supabase e recarregue a página.';
  if(/does not exist/i.test(m))
    return 'O banco está desatualizado para esta versão do sistema. Rode os arquivos '
         + 'de supabase/ no SQL Editor. Detalhe: ' + m;
  return 'Erro: ' + m;
}

/* ── parâmetros e listas ── */
const CFG = (chave, padrao = '') => {
  const c = DB.get('configuracoes', chave);
  return c && c.valor !== '' && c.valor != null ? c.valor : padrao;
};
const CFGN = (chave, padrao = 0) => {
  const v = parseFloat(String(CFG(chave, '')).replace(',', '.'));
  return isNaN(v) ? padrao : v;
};
const LISTA = g => DB.list('listas').filter(l => l.grupo === g && l.ativo)
  .sort((a,b) => (a.ordem - b.ordem) || String(a.rotulo).localeCompare(String(b.rotulo)));
const OPC = g => LISTA(g).map(o => o.valor);
const OPC_NUM = (g, valor) => { const o = LISTA(g).find(x => x.valor === valor);
  return o && o.num != null ? +o.num : 0; };
/* Config como objeto simples — é o formato que o motor de cálculo espera. */
const cfgObj = () => Object.fromEntries(DB.list('configuracoes').map(c => [c.chave, c.valor]));

/* ── recortes de CCT ── */
const cargosCCT = id => DB.list('cct_cargos').filter(c => +c.cctId === +id);
const benefCCT  = id => DB.list('cct_beneficios').filter(b => +b.cctId === +id);
const encCCT    = id => DB.list('cct_encargos').filter(e => +e.cctId === +id);
const somaEncargosCCT = id => encCCT(id).reduce((s,e) => s + (+e.percentual || 0), 0);
const contatosLead = id => DB.list('contatos').filter(c => +c.leadId === +id);
const leadNome = id => DB.get('leads', id)?.empresa || '—';

/* ── contexto do cálculo ─────────────────────────────────────────────────────
   Congelada lê o snapshot; em rascunho lê a CCT viva. É esta função — e só ela
   — que decide de onde vem o salário, e por isso o P3 fica resolvido em um
   lugar só, para tela, PDF, e-mail e link público. */
function ctxProposta(p){
  const s = p && p.snapshot;
  if(s && s.cargos){
    return {cargos:s.cargos||{}, beneficios:s.beneficios||{}, escalas:s.escalas||{},
            turnos:s.turnos||{}, equipamentos:s.equipamentos||{},
            materiais:s.materiais||{},
            cct:s.cct||{}, config:s.config||{}, congelado:true, congeladoEm:s.em};
  }
  const porId = l => Object.fromEntries(l.map(x => [String(x.id), x]));
  /* Cargos e benefícios de TODAS as convenções, não só a da proposta. Um
     contrato de facilities costuma misturar categorias — portaria pelo asseio,
     vigilância pela CCT da vigilância — e cada posto aponta para a sua em
     `item.cctId`. A convenção da proposta continua sendo o padrão de quem não
     escolheu nada. */
  return {
    cargos: porId(DB.list('cct_cargos')),
    beneficios: porId(DB.list('cct_beneficios')),
    escalas: porId(DB.list('escalas')),
    turnos: porId(DB.list('turnos')),
    equipamentos: porId(DB.list('equipamentos')),
    materiais: porId(DB.list('materiais')),
    ccts: porId(DB.list('ccts')),
    cct: DB.get('ccts', p?.cctId) || {},
    config: cfgObj(), congelado:false, congeladoEm:null,
  };
}
const calcProposta = p => Calc.calcProposta(p, ctxProposta(p));
const calcItem = (item, p) => Calc.calcItem(item, p, ctxProposta(p));

/* ── numeração sem corrida (1.4 / P5) ────────────────────────────────────────
   MAX+1 lido da lista do navegador dava número repetido quando dois vendedores
   criavam ao mesmo tempo — e `numero` é unique, então o segundo tomava um erro
   cru do Postgres. Agora quem decide é uma sequence, do lado do banco. */
async function proximoNumero(){
  const {data, error} = await sb.rpc('proximo_numero_proposta', {
    prefixo: CFG('proposta_prefixo','PRP'), ano: new Date().getFullYear()});
  if(!error && data) return data;
  /* Base ainda sem a função (instalação antiga): não trava o vendedor, mas
     avisa, porque aqui a corrida volta a existir. */
  console.warn('proximo_numero_proposta indisponível, usando MAX+1', error);
  toast('Numeração local: rode supabase/migracao_v2.sql para eliminar duplicidade.');
  const nums = DB.list('propostas').map(p => +((String(p.numero||'').match(/(\d+)$/)||[])[1] || 0));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${CFG('proposta_prefixo','PRP')}-${new Date().getFullYear()}-${String(n).padStart(4,'0')}`;
}

/* ── sessão e papéis (3.3) ── */
const Sessao = {
  usuario:null, perfil:null, token:null,
  /* 'pendente' é o padrão, igual ao app_papel() do banco. Enquanto isto caía
     em 'vendedor', quem não tinha perfil — ou tinha um desativado — passava
     pela tela como vendedor. A tranca de verdade é a RLS; esta linha só evita
     que a tela mostre menus que o banco vai recusar. */
  papel(){ return this.perfil?.papel || 'pendente'; },
  liberado(){ return this.papel() !== 'pendente'; },
  podeGerir(){ return ['admin','gestor'].includes(this.papel()); },
  eAdmin(){ return this.papel() === 'admin'; },
  nome(){ return this.perfil?.nome || this.usuario?.email?.split('@')[0] || 'Usuário'; },
  /* Dono do registro: gestor edita tudo; vendedor, só o dele (e o sem dono,
     que é o legado de antes de existir owner_id). */
  meu(reg){ return !reg?.owner_id || reg.owner_id === this.usuario?.id || this.podeGerir(); },
  async carregar(){
    const {data:{session}} = await sb.auth.getSession();
    if(!session) return null;
    this.usuario = session.user;
    this.token = session.access_token;
    const {data} = await sb.from('perfis').select('*').eq('id', session.user.id).maybeSingle();
    this.perfil = data || {id:session.user.id, email:session.user.email,
                           nome:session.user.email?.split('@')[0], papel:'pendente'};
    return session;
  },
};

/* ── chamadas ao servidor (documentos, e-mail, cálculo autoritativo) ───────── */
async function api(caminho, opcoes = {}){
  const {data:{session}} = await sb.auth.getSession();
  const r = await fetch(caminho, {
    ...opcoes,
    headers: {
      'Content-Type':'application/json',
      'Authorization':'Bearer ' + (session?.access_token || ''),
      ...(opcoes.headers || {}),
    },
  });
  if(r.status === 204) return null;
  const tipo = r.headers.get('Content-Type') || '';
  if(!tipo.includes('application/json')){
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  }
  const corpo = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(corpo.erro || ('HTTP ' + r.status));
  return corpo;
}

/* ── timeline, notas e anexos (3.1 / 3.2) ── */
const Historico = {
  cache:{},
  chave(tipo, id){ return `${tipo}:${id}`; },
  async carregar(tipo, id, forcar){
    const k = this.chave(tipo, id);
    if(this.cache[k] && !forcar) return this.cache[k];
    const [tl, nt, ax] = await Promise.all([
      sb.from('timeline').select('*').eq('refTipo', tipo).eq('refId', id)
        .order('created_at', {ascending:false}).limit(200),
      sb.from('notas').select('*').eq('refTipo', tipo).eq('refId', id)
        .order('created_at', {ascending:false}).limit(100),
      sb.from('anexos').select('*').eq('refTipo', tipo).eq('refId', id)
        .order('created_at', {ascending:false}).limit(100),
    ]);
    this.cache[k] = {timeline: tl.data || [], notas: nt.data || [], anexos: ax.data || []};
    return this.cache[k];
  },
  limpar(tipo, id){ delete this.cache[this.chave(tipo, id)]; },
  async registrar(tipo, id, ev){
    const {error} = await sb.from('timeline').insert({
      refTipo:tipo, refId:+id, leadId:ev.leadId ?? null, tipo:ev.tipo,
      titulo:ev.titulo, detalhe:ev.detalhe || null, dados:ev.dados || null,
      autor:Sessao.usuario?.id || null, autor_nome:Sessao.nome()});
    if(error) console.warn('timeline', error);
    this.limpar(tipo, id);
  },
  async anotar(tipo, id, texto, leadId){
    await sb.from('notas').insert({refTipo:tipo, refId:+id, leadId:leadId ?? null,
      texto, autor:Sessao.usuario?.id || null, autor_nome:Sessao.nome()});
    await this.registrar(tipo, id, {tipo:'nota', titulo:'Nota adicionada',
      detalhe:texto.slice(0,180), leadId});
    this.limpar(tipo, id);
  },
  async apagarNota(tipo, id, notaId){
    await sb.from('notas').delete().eq('id', notaId);
    this.limpar(tipo, id);
  },
  async anexar(tipo, id, arquivo, leadId){
    const caminho = `${tipo.toLowerCase()}/${id}/${Date.now()}_${arquivo.name}`
      .replace(/[^\w./-]+/g, '_');
    const {error} = await sb.storage.from('anexos')
      .upload(caminho, arquivo, {upsert:false, contentType:arquivo.type || undefined});
    if(error) throw new Error('Falha ao enviar o arquivo: ' + error.message);
    await sb.from('anexos').insert({refTipo:tipo, refId:+id, leadId:leadId ?? null,
      nome:arquivo.name, caminho, mime:arquivo.type || null, tamanho:arquivo.size,
      autor:Sessao.usuario?.id || null, autor_nome:Sessao.nome()});
    await this.registrar(tipo, id, {tipo:'anexo', titulo:'Anexo: ' + arquivo.name, leadId});
    this.limpar(tipo, id);
  },
  async urlAnexo(caminho){
    const {data, error} = await sb.storage.from('anexos').createSignedUrl(caminho, 900);
    if(error) throw new Error(error.message);
    return data.signedUrl;
  },
  async apagarAnexo(tipo, id, anexo){
    await sb.storage.from('anexos').remove([anexo.caminho]);
    await sb.from('anexos').delete().eq('id', anexo.id);
    this.limpar(tipo, id);
  },
};

/* ── busca global de verdade (3.6) ───────────────────────────────────────────
   A busca antiga não buscava: ela mudava o `state.q` e jogava o usuário para a
   tela de propostas (P9.3). Agora consulta as tabelas no servidor — inclusive
   as linhas que ainda não foram paginadas para o navegador — e devolve
   resultados agrupados, cada um levando ao seu registro. */
async function buscarGlobal(q){
  const t = q.trim();
  if(t.length < 2) return [];
  const like = `%${t}%`;
  const [leads, props, ops, contatos, contratos] = await Promise.all([
    sb.from('leads').select('id,empresa,cidade,uf,contato_nome,status')
      .or(`empresa.ilike.${like},contato_nome.ilike.${like},cnpj.ilike.${like},contato_email.ilike.${like}`).limit(8),
    sb.from('propostas').select('id,numero,titulo,status,leadId')
      .or(`numero.ilike.${like},titulo.ilike.${like}`).limit(8),
    sb.from('ops').select('id,titulo,fase,valor,leadId').ilike('titulo', like).limit(6),
    sb.from('contatos').select('id,nome,cargo,email,leadId')
      .or(`nome.ilike.${like},email.ilike.${like}`).limit(6),
    sb.from('contratos').select('id,numero,titulo,status,leadId')
      .or(`numero.ilike.${like},titulo.ilike.${like}`).limit(6),
  ]);
  const g = [];
  const bloco = (rotulo, linhas, monta) => {
    if(linhas?.data?.length) g.push({rotulo, itens: linhas.data.map(monta)});
  };
  bloco('Leads', leads, l => ({titulo:l.empresa,
    sub:[l.contato_nome, [l.cidade, l.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '),
    view:'leadDetalhe', id:l.id, icone:av(l.empresa)}));
  bloco('Propostas', props, p => ({titulo:p.numero, sub:p.titulo || '',
    view:'propostaEditor', id:p.id, icone:ico('arquivo')}));
  bloco('Oportunidades', ops, o => ({titulo:o.titulo, sub:o.fase,
    view:'oportunidades', id:o.id, icone:ico('mais')}));
  bloco('Contatos', contatos, c => ({titulo:c.nome, sub:c.cargo || c.email || '',
    view:'leadDetalhe', id:c.leadId, icone:av(c.nome)}));
  bloco('Contratos', contratos, c => ({titulo:c.numero, sub:c.titulo || '',
    view:'contratoDetalhe', id:c.id, icone:ico('ok')}));
  return g;
}

/* ── duplicados (3.7) ────────────────────────────────────────────────────────
   CNPJ igual é duplicata certa (e o banco agora tem índice único que impede).
   Nome parecido é suspeita, e suspeita se mostra ao usuário — não se bloqueia. */
function duplicadosDeLead({empresa, cnpj, id}){
  const dig = soDigitos(cnpj), nome = semAcento(empresa);
  return DB.list('leads').filter(l => {
    if(id && l.id === +id) return false;
    if(dig && soDigitos(l.cnpj) === dig) return true;
    if(!nome || nome.length < 4) return false;
    const outro = semAcento(l.empresa);
    return outro === nome || outro.includes(nome) || nome.includes(outro);
  });
}
