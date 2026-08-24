/* ════════════════════════════════════════════════════════════════════════════
   TELA INICIAL — o nome e a fileira de módulos.

   Duas versões atrás isto era o Dashboard: quatro KPIs, funil, metas e listas.
   Quem abre o CRM de manhã não abriu para ler gráfico — abriu para ir a algum
   lugar, e em base nova o painel abria zerado, o que fazia o sistema parecer
   falso logo no primeiro contato.

   A versão seguinte virou o oposto: catorze cartões empilhados numa grade, o
   sistema inteiro explicado de uma vez. Também não servia — tela de abertura
   dura três segundos, e catorze parágrafos ali é texto que ninguém lê.

   O desenho de agora: o nome no meio da tela com o traço de luz por baixo — a
   mesma cena da tela de login, para a porta e a casa serem o mesmo lugar — e
   os destinos numa fileira de quatro que anda pela seta. Quem escolhe quais
   destinos entram nessa fileira é o usuário, pelo botão Gerenciar.

   A topbar não aparece nesta tela; quem cuida disso é o app.js, ligando
   `body.na-inicio`. Ela repetia "Início" logo acima de um nome de 116px, e a
   busca fixa cortava a abertura em duas.
   ════════════════════════════════════════════════════════════════════════════ */

/* Contagens vivas. Cada uma devolve null quando não há o que contar, e o
   cartão simplesmente não mostra o número — melhor do que um "0" que parece
   erro de carregamento. */
const _n = v => (v > 0 ? v : null);
const CONTA = {
  pipeline:  () => _n(DB.list('ops').filter(o => !['Ganho','Perdido'].includes(o.fase)).length),
  leads:     () => _n(DB.list('leads').filter(l => l.status !== 'Desqualificado').length),
  contatos:  () => _n(DB.list('contatos').length),
  propostas: () => _n(DB.list('propostas').length),
  contratos: () => _n(DB.list('contratos').filter(c => c.status === 'Ativo').length),
  ativs:     () => _n(DB.list('ativs').filter(a => !a.feito).length),
  ccts:      () => _n(DB.list('ccts').length),
  equips:    () => _n(DB.list('equipamentos').length),
  materiais: () => _n(DB.list('materiais').length),
};

/* Os ícones desta tela são próprios: traço de 1.6, mesma família do trilho,
   desenhados para viver soltos no cartão — sem ladrilho colorido atrás, que é
   o que fazia a grade antiga parecer menu de aplicativo de celular. */
const IC = {
  funil:    '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  lead:     '<path d="M3 20a6 6 0 0 1 12 0"/><circle cx="9" cy="8" r="4"/><path d="M17 11h5M19.5 8.5v5"/>',
  contato:  '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9.5" cy="10.5" r="2.5"/><path d="M5.5 17a4 4 0 0 1 8 0M16 9h4M16 13h4"/>',
  negocio:  '<path d="M12 2v20"/><path d="M17 6H9.8a3.2 3.2 0 0 0 0 6.4h4.4a3.2 3.2 0 0 1 0 6.4H6"/>',
  proposta: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  enviar:   '<path d="M21 3 3 10.5l7 3 3 7z"/><path d="m10 13.5 4.5-4.5"/>',
  contrato: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m8.5 14.5 2 2 4.5-4.5"/>',
  agenda:   '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h3M8 17.5h6"/>',
  livro:    '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M4 17h15"/><path d="M8 7.5h7M8 11h5"/>',
  relogio:  '<circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l3.5 2.2"/>',
  caixa:    '<path d="m12 2.5 8.5 4.6v9.8L12 21.5 3.5 16.9V7.1z"/><path d="m3.5 7.1 8.5 4.6 8.5-4.6M12 11.7v9.8"/>',
  grafico:  '<path d="M3 3v18h18"/><path d="M7.5 16.5v-4M12 16.5V8M16.5 16.5v-6"/>',
  bussola:  '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  engrenagem:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>',
};

/* O catálogo de destinos, na ordem em que o trabalho acontece: a venda, a
   proposta, o que vem depois da assinatura, as tabelas que alimentam o
   cálculo, os números e por último o sistema.

   `k` é a chave gravada na escolha do usuário e por isso não pode mudar de
   nome — os rótulos podem. `d` é uma linha, não um parágrafo: se não couber em
   duas linhas do cartão, está longa demais para uma tela que dura três
   segundos. `area` só agrupa a lista do Gerenciar. */
const DESTINOS = [
  {k:'pipeline',      area:'Comercial', v:'pipeline',      ic:IC.funil,     t:'Pipeline',      d:'Arraste as oportunidades entre as fases da venda.',  c:CONTA.pipeline,  r:'abertas'},
  {k:'leads',         area:'Comercial', v:'leads',         ic:IC.lead,      t:'Leads',         d:'As empresas prospectadas, com origem e situação.',   c:CONTA.leads,     r:'ativos'},
  {k:'contatos',      area:'Comercial', v:'contatos',      ic:IC.contato,   t:'Contatos',      d:'As pessoas de cada lead: cargo, e-mail e telefone.', c:CONTA.contatos,  r:'cadastrados'},
  {k:'oportunidades', area:'Comercial', v:'oportunidades', ic:IC.negocio,   t:'Oportunidades', d:'O funil em lista, com valor, chance e dono.',        c:CONTA.pipeline,  r:'em aberto'},
  {k:'propostas',     area:'Propostas', v:'propostas',     ic:IC.proposta,  t:'Propostas',     d:'Número, cliente, valor mensal e situação.',          c:CONTA.propostas, r:'no total'},
  {k:'novaProposta',  area:'Propostas', v:'propostas',     ic:IC.enviar,    t:'Nova proposta', d:'Monte posto a posto, congele e gere o PDF.',         acao:'novaProposta'},
  {k:'contratos',     area:'Contratos',  v:'contratos',     ic:IC.contrato,  t:'Contratos',     d:'Vigência, valor, reajuste e a proposta de origem.',  c:CONTA.contratos, r:'ativos'},
  {k:'atividades',    area:'Comercial',  v:'atividades',    ic:IC.agenda,    t:'Atividades',    d:'Ligações, reuniões e visitas — e o que atrasou.',    c:CONTA.ativs,     r:'pendentes'},
  {k:'ccts',          area:'Bases de cálculo', v:'ccts',          ic:IC.livro,     t:'Convenções',    d:'Salários, benefícios, encargos, escalas e turnos.',  c:CONTA.ccts,      r:'cadastradas'},
  {k:'equipamentos',  area:'Bases de cálculo', v:'equipamentos',  ic:IC.caixa,     t:'Equipamentos',  d:'Itens reutilizáveis, mensais ou de implantação.',    c:CONTA.equips,    r:'no catálogo'},
  {k:'materiais',     area:'Bases de cálculo', v:'materiais',     ic:IC.caixa,     t:'Materiais',     d:'Uniforme, EPI e insumos — o custo pelo prazo de troca.', c:CONTA.materiais, r:'no catálogo'},
  {k:'dashboard',     area:'Dashboard', v:'dashboard',     ic:IC.grafico,   t:'Dashboard',     d:'Pipeline, funil, receita e margem — em uma tela.',   c:null},
  {k:'configuracoes', area:'Sistema',   v:'configuracoes', ic:IC.engrenagem,t:'Configurações', d:'Empresa, listas, permissões e estado do servidor.',  c:null},
];
const destino = k => DESTINOS.find(d => d.k === k);

/* A escolha vive no navegador, não no banco: é preferência de tela, muda sem
   confirmação e não vale uma ida ao servidor. Sem escolha gravada, a fileira
   traz tudo — é o comportamento que não esconde nada de quem nunca abriu o
   Gerenciar. Chave desconhecida (destino renomeado numa versão futura) é
   descartada em silêncio. */
const ATALHOS_CHAVE = 'mizys.atalhos';
function lerAtalhos(){
  try{
    const a = JSON.parse(localStorage.getItem(ATALHOS_CHAVE));
    const ok = Array.isArray(a) ? a.filter(destino) : [];
    return ok.length ? ok : DESTINOS.map(d => d.k);
  }catch(e){ return DESTINOS.map(d => d.k); }
}

/* O vão entre os cartões. Vive aqui e no CSS (.trilha{gap}) — as duas contas
   precisam bater, porque é ele que entra no passo do carrossel. */
const VAO = 14;

/* A madrugada é noite, não manhã. `h < 12` mandava "bom dia" à meia-noite e
   quinze — quem abre o sistema nessa hora está virando a noite, e a tela
   dizendo bom dia é o sistema mostrando que não sabe que horas são.
   A faixa da manhã começa às 5h; antes disso, ainda é a noite anterior. */
const _saudacao = () => { const h = new Date().getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

VIEWS.inicio = function(){
  const nome = String(Sessao.nome() || '').trim().split(/\s+/)[0] || '';

  const cartao = k => {
    const d = destino(k);
    if(!d) return '';
    const n = d.c ? d.c() : null;
    return `<button class="mod" data-acao="${d.acao ? 'atalhoAcao' : 'irPara'}"
      data-v="${esc(d.v)}" ${d.acao ? `data-fn="${esc(d.acao)}"` : ''}>
      <span class="curva" aria-hidden="true"></span>
      <span class="mic"><svg viewBox="0 0 24 24" aria-hidden="true">${d.ic}</svg></span>
      <span class="mt">${esc(d.t)}</span>
      <span class="md">${esc(d.d)}</span>
      <span class="mpe">
        <span class="seta" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg></span>
        ${n ? `<span class="mn"><b>${n}</b>${esc(d.r || '')}</span>` : ''}
      </span></button>`;
  };

  /* O arco. Dois traços no mesmo caminho — o fio e o halo desfocado — porque é
     o par que o olho lê como luz. preserveAspectRatio="none" deixa a curva
     acompanhar a largura da janela; o vector-effect no CSS é o que impede que
     a espessura do traço estique junto. O mesmo desenho está na tela de login,
     escrito à mão no template. */
  const arco = `<svg class="arco" viewBox="0 0 1200 420" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="gArco" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#8B5CF6" stop-opacity="0"/>
      <stop offset=".34" stop-color="#8B5CF6" stop-opacity=".50"/>
      <stop offset=".70" stop-color="#C9A6FF" stop-opacity=".95"/>
      <stop offset="1" stop-color="#EFE4FF" stop-opacity="1"/>
    </linearGradient></defs>
    <path class="a-halo" d="M-40 400 C 300 235 700 75 1240 30"/>
    <path class="a-fio"  d="M-40 400 C 300 235 700 75 1240 30"/>
  </svg>`;

  return `<div class="inicio">
    ${arco}
    <header class="hero">
      <h1>Mizys</h1>
      <div class="brilho" aria-hidden="true">
        <i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i>
      </div>
      <p class="ola">${esc(_saudacao())}${nome ? ', ' : ''}<b>${esc(nome)}</b>.
        Escolha por onde começar.</p>
    </header>

    <section class="modulos">
      <div class="mod-h">
        <span class="lb">Módulos</span>
        <span class="sp"></span>
        <button class="btn btn-sm" data-acao="gerenciarAtalhos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h9M19 18h1"/><circle cx="16" cy="6" r="2.4"/><circle cx="10" cy="12" r="2.4"/><circle cx="16" cy="18" r="2.4"/></svg>
          Gerenciar</button>
        <div class="mod-nav">
          <button data-acao="modAnt" aria-label="Módulos anteriores" disabled>
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
          <button data-acao="modProx" aria-label="Mais módulos">
            <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
        </div>
      </div>
      <div class="trilha" id="trilha">${lerAtalhos().map(cartao).join('')}</div>
      <div class="pontos" id="pontos"></div>
    </section>
  </div>`;
};

/* ── O carrossel ─────────────────────────────────────────────────────────────
   Quantos cartões cabem não é decidido aqui: quem decide é a media query, que
   passa de quatro para três, dois e um conforme a janela aperta. O JS mede a
   largura do primeiro cartão e deduz o resto — assim o passo da seta continua
   certo em qualquer largura, sem uma lista de breakpoints repetida em dois
   arquivos.
   ────────────────────────────────────────────────────────────────────────── */
function _carrossel(){
  const t = document.getElementById('trilha');
  if(!t || !t.firstElementChild) return null;
  const larg = t.firstElementChild.getBoundingClientRect().width;
  if(!larg) return null;
  const passo = Math.max(1, Math.round(larg + VAO));
  const porPag = Math.max(1, Math.round((t.clientWidth + VAO) / passo));
  const pag = porPag * passo;
  return {t, pag,
          paginas: Math.max(1, Math.ceil(t.children.length / porPag)),
          atual:   Math.round(t.scrollLeft / pag)};
}

function pintarCarrossel(){
  const c = _carrossel();
  if(!c) return;
  const {t, pag, paginas} = c;
  const atual = Math.min(paginas - 1, c.atual);
  const pontos = document.getElementById('pontos');
  if(pontos){
    if(pontos.children.length !== paginas)
      pontos.innerHTML = Array.from({length:paginas}, (_, k) =>
        `<button data-acao="modPagina" data-p="${k}" aria-label="Fileira ${k + 1}"></button>`).join('');
    [...pontos.children].forEach((b, k) => b.classList.toggle('on', k === atual));
    pontos.style.visibility = paginas > 1 ? '' : 'hidden';
  }
  /* A seta apagada é a resposta para "acabou?". O respiro de 4px existe porque
     scrollLeft vira fracionário em tela com zoom ou DPI não inteiro. */
  const ant = document.querySelector('.mod-nav [data-acao="modAnt"]');
  const prox = document.querySelector('.mod-nav [data-acao="modProx"]');
  const fim = t.scrollWidth - t.clientWidth;
  if(ant) ant.disabled = t.scrollLeft < 4;
  if(prox) prox.disabled = t.scrollLeft >= fim - 4;
}

/* Chamado pelo render() quando a tela aberta é a inicial. O listener de scroll
   é do elemento, que morre junto com o innerHTML; o de resize é registrado uma
   vez só e procura a trilha toda vez — se ela não estiver na tela, não faz
   nada. */
function bindCarrossel(){
  const t = document.getElementById('trilha');
  if(!t) return;
  let esperando = false;
  t.addEventListener('scroll', () => {
    if(esperando) return;
    esperando = true;
    requestAnimationFrame(() => { esperando = false; pintarCarrossel(); });
  });
  if(!bindCarrossel._janela){
    bindCarrossel._janela = true;
    window.addEventListener('resize', debounce(pintarCarrossel, 140));
  }
  pintarCarrossel();
}

/* Rolar para uma página. Alvo absoluto e não scrollBy: com o snap ligado, dois
   cliques rápidos em scrollBy podem partir da posição intermediária de uma
   animação ainda em curso e andar meia fileira. */
function _rolarPara(x){
  const t = document.getElementById('trilha');
  if(!t) return;
  const alvo = Math.max(0, Math.min(x, t.scrollWidth - t.clientWidth));
  if(t.scrollTo) t.scrollTo({left:alvo, behavior:'smooth'});
  else t.scrollLeft = alvo;
}

/* ── Gerenciar: quais destinos entram na fileira ─────────────────────────────
   Lista com caixa de seleção, agrupada pela área do sistema — escolher item de
   menu é trabalho de lista, não de mais uma grade de cartõezinhos com prévia.
   ────────────────────────────────────────────────────────────────────────── */
function _marcadas(){
  return $$('#modal .escolha-it input:checked').map(i => i.dataset.k);
}
function _pintarEscolha(){
  const conta = $('#escolhaConta');
  if(conta) conta.innerHTML = `<b>${_marcadas().length}</b> de ${DESTINOS.length} na tela inicial`;
}

acoes({
  /* Um cartão pode abrir uma tela (irPara, que já existe) ou disparar um
     formulário. Este segundo caso passa por aqui para não espalhar chamadas
     diretas a ACOES pelo HTML. */
  atalhoAcao(d){
    const fn = ACOES[d.fn];
    if(fn) fn({});
    else if(d.v) go(d.v);
  },

  modProx(){ const c = _carrossel(); if(c) _rolarPara((c.atual + 1) * c.pag); },
  modAnt(){  const c = _carrossel(); if(c) _rolarPara((c.atual - 1) * c.pag); },
  modPagina(d){ const c = _carrossel(); if(c) _rolarPara((+d.p) * c.pag); },

  gerenciarAtalhos(){
    const sel = new Set(lerAtalhos());
    const areas = [...new Set(DESTINOS.map(d => d.area))];
    const lista = areas.map(a => `<div class="escolha-g">${esc(a)}</div>` +
      DESTINOS.filter(d => d.area === a).map(d => {
        const n = d.c ? d.c() : null;
        return `<label class="escolha-it">
          <input type="checkbox" data-k="${esc(d.k)}" data-mudar="contarAtalhos"
            ${sel.has(d.k) ? 'checked' : ''}>
          <span>${esc(d.t)}</span>
          <span class="dd">${n ? `${n} ${esc(d.r || '')}` : ''}</span></label>`;
      }).join('')).join('');

    modal('Módulos da tela inicial',
      `<p class="escolha-conta" id="escolhaConta"></p>
       <div class="escolha">${lista}</div>`,
      `<button class="btn" data-acao="restaurarAtalhos">Restaurar padrão</button>
       <button class="btn" data-acao="fecharModal">Cancelar</button>
       <button class="btn btn-primary" data-acao="salvarAtalhos">Salvar</button>`);
    _pintarEscolha();
  },

  contarAtalhos(){ _pintarEscolha(); },

  salvarAtalhos(){
    const ks = _marcadas();
    if(!ks.length) return toast('Escolha ao menos um módulo.');
    localStorage.setItem(ATALHOS_CHAVE, JSON.stringify(ks));
    closeModal();
    render();
    toast('Tela inicial atualizada.');
  },

  restaurarAtalhos(){
    localStorage.removeItem(ATALHOS_CHAVE);
    closeModal();
    render();
    toast('Módulos de volta ao padrão.');
  },
});
