/* ════════════════════════════════════════════════════════════════════════════
   UTILITÁRIOS E DESPACHO DE EVENTOS
   ════════════════════════════════════════════════════════════════════════════

   Duas coisas moram aqui e as duas são de segurança.

   1. `esc()` agora escapa TAMBÉM a aspa simples. Antes ela passava direto, e
      handlers eram montados como onclick="formLista(null,'${esc(g)}')" — um
      grupo de lista chamado "it's" quebrava a tela, e um valor malicioso
      executava JavaScript (P7).

   2. Nenhum handler é mais montado por interpolação de string. O HTML declara
      a INTENÇÃO (data-acao="abrirProposta" data-id="12") e um despachante
      único no document resolve. Valor de data-* nunca vira código: mesmo que
      alguém cadastre um lead chamado ');alert(1);//, ele chega no handler como
      texto. É o item 1.6 do plano, feito na raiz e não com mais escapes.
   ════════════════════════════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* Estado da navegação. Vive aqui, e não no app.js, porque os arquivos de tela
   registram `VIEWS.x = …` no momento em que são carregados — e eles carregam
   antes do app.js, que é quem roteia. */
const VIEWS = {};
let view = 'inicio';
let state = {};

/* ── texto ── */
const ESC_MAPA = {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;','`':'&#96;'};
const esc = s => String(s ?? '').replace(/[<>&"'`]/g, c => ESC_MAPA[c]);

/* ── dinheiro (espelho de calculo.py: money/money0) ── */
const money  = n => 'R$ ' + (+n || 0).toLocaleString('pt-BR',
                    {minimumFractionDigits:2, maximumFractionDigits:2});
const money0 = n => 'R$ ' + (+n || 0).toLocaleString('pt-BR', {maximumFractionDigits:0});
/* Centavos → texto. Toda tela lê o motor, e o motor trabalha em centavos. */
const moneyC  = c => money((c || 0) / 100);
const money0C = c => money0(Math.round((c || 0) / 100));

const pctTxt = (v, casas = 1) => (+v || 0).toFixed(casas).replace('.', ',') + '%';
const num = (v, casas = 2) => (+v || 0).toLocaleString('pt-BR',
                    {minimumFractionDigits:0, maximumFractionDigits:casas});

/* ── datas ───────────────────────────────────────────────────────────────────
   `hoje()` era new Date().toISOString().slice(0,10) — que é UTC. No Brasil
   (UTC−3), tudo criado depois das 21h ficava datado do dia SEGUINTE: emissão de
   proposta, criação de lead, data de atividade e a marcação de "atrasada"
   (P6). Agora a data sai do relógio local, que é o relógio de quem digita. */
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const agoraISO = () => new Date().toISOString();
/* O par do `hoje()`: carimbo do servidor → dia do relógio de quem lê.
   `created_at` volta do Postgres em UTC. Cortar os 10 primeiros caracteres
   parece inofensivo e não é: uma oportunidade criada às 22h de 18/08 no Brasil
   chega como "2026-08-19T01:00Z" e some do dashboard, porque o filtro de
   período termina em `hoje()`, que é local. Some sem erro, sem aviso — o
   negócio simplesmente não conta. Coluna só de data (`2026-09-17`) passa
   direto: ali não há fuso nenhum para converter. */
const diaDe = v => {
  const t = String(v || '');
  if(!t) return '';
  if(!t.includes('T')) return t.slice(0,10);
  const d = new Date(t);
  return isNaN(d) ? t.slice(0,10)
    : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const somaDias = (iso, dias) => {
  const d = new Date((iso || hoje()) + 'T12:00');   /* meio-dia: imune a DST */
  d.setDate(d.getDate() + (+dias || 0));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const dt  = d => d ? new Date(String(d).slice(0,10) + 'T00:00').toLocaleDateString('pt-BR') : '—';
const dth = d => d ? new Date(d).toLocaleString('pt-BR',
              {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
/* "há 3 dias" — a timeline lê melhor em distância do que em data absoluta. */
function desde(iso){
  if(!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s/60)} min`;
  if (s < 86400) return `há ${Math.floor(s/3600)} h`;
  if (s < 2592000) return `há ${Math.floor(s/86400)} d`;
  return dt(String(iso).slice(0,10));
}
/* ── identidade visual de listas ── */
const ini = s => String(s || '?').split(' ').filter(Boolean).slice(0,2)
                 .map(w => w[0]).join('').toUpperCase();
/* Cinco degraus da mesma escada de violeta, alternando tinto-com-luz e
   cheio-com-branco. Não é para identificar ninguém — é só para a lista não
   virar uma coluna de quadrados iguais. */
const AV = ['#2A2140|#CDB8FF','#8B5CF6|#FFFFFF','#231C36|#B79CFF','#6D28D9|#FFFFFF','#352A52|#E7D8FF'];
const av = s => {
  const [b,c] = AV[((s||'X').charCodeAt(0) + (s||'X').length) % AV.length].split('|');
  return `<div class="avatar" style="background:${b};color:${c}">${esc(ini(s))}</div>`;
};

const CORES = {'Ganho':'t-green','Perdido':'t-red','Negociação':'t-amber','Proposta':'t-blue',
 'Qualificação':'t-purple','Prospecção':'t-gray','Novo':'t-blue','Contatado':'t-amber',
 'Qualificado':'t-green','Em negociação':'t-amber','Desqualificado':'t-red','Rascunho':'t-gray',
 'Enviada':'t-blue','Em análise':'t-amber','Aprovada':'t-green','Recusada':'t-red',
 'Ativo':'t-green','Em implantação':'t-blue','Suspenso':'t-amber','Encerrado':'t-red',
 'admin':'t-green','gestor':'t-blue','vendedor':'t-gray'};
const tagOf = v => `<span class="tag ${CORES[v] || 't-gray'}">${esc(v || '—')}</span>`;

/* ── avisos ── */
function toast(m){
  const t = $('#toast');
  $('#toastMsg').textContent = m;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3600);
}

/* ── despachante de ações (1.6 / P7) ─────────────────────────────────────────
   Registre com acao('nome', fn). No HTML: data-acao="nome" data-id="7".
   O handler recebe (dataset, elemento, evento). */
const ACOES = {};
const acao = (nome, fn) => { ACOES[nome] = fn; };
const acoes = mapa => Object.assign(ACOES, mapa);

function _despachar(tipo, e){
  const attr = {click:'acao', change:'mudar', input:'digitar', submit:'enviar'}[tipo];
  const el = e.target.closest(`[data-${attr}]`);
  if(!el) return;
  const fn = ACOES[el.dataset[attr]];
  if(!fn){ console.warn('Ação não registrada:', el.dataset[attr]); return; }
  if(tipo === 'click' || tipo === 'submit') e.preventDefault();
  Promise.resolve(fn(el.dataset, el, e)).catch(err => {
    console.error(err);
    toast('Falha: ' + (err && err.message ? err.message : err));
  });
}
['click','change','input','submit'].forEach(t =>
  document.addEventListener(t, e => _despachar(t, e)));

/* ── debounce (5.3) ──────────────────────────────────────────────────────────
   Cada arrastada num slider gravava no banco E redesenhava a página inteira
   (P9.2): uma varrida de 0 a 60 disparava dezenas de UPDATE e dezenas de
   renders completos. Agora o slider atualiza o texto na hora, e a gravação
   espera o dedo parar. */
function debounce(fn, ms = 400){
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.agora = (...a) => { clearTimeout(t); fn(...a); };
  d.cancelar = () => clearTimeout(t);
  return d;
}

/* ── CSV (3.7) ───────────────────────────────────────────────────────────────
   Excel em pt-BR abre CSV separado por PONTO E VÍRGULA; com vírgula ele joga a
   linha inteira na primeira coluna. E o BOM é o que evita "Ã§" no lugar de "ç". */
function paraCSV(linhas, colunas){
  const cel = v => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const cab = colunas.map(c => cel(c.rotulo || c.campo)).join(';');
  const corpo = linhas.map(l => colunas.map(c =>
    cel(typeof c.valor === 'function' ? c.valor(l) : l[c.campo])).join(';'));
  return '﻿' + [cab, ...corpo].join('\r\n');
}

function lerCSV(texto){
  const t = texto.replace(/^﻿/, '');
  /* Detecta o separador pela primeira linha: aceita tanto o CSV do Excel
     brasileiro (;) quanto o internacional (,). */
  const primeira = t.split(/\r?\n/)[0] || '';
  const sep = (primeira.split(';').length > primeira.split(',').length) ? ';' : ',';
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for(let i = 0; i < t.length; i++){
    const c = t[i];
    if(aspas){
      if(c === '"' && t[i+1] === '"'){ campo += '"'; i++; }
      else if(c === '"') aspas = false;
      else campo += c;
    } else if(c === '"') aspas = true;
    else if(c === sep){ linha.push(campo); campo = ''; }
    else if(c === '\n'){ linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if(c !== '\r') campo += c;
  }
  if(campo !== '' || linha.length){ linha.push(campo); linhas.push(linha); }
  if(!linhas.length) return [];
  const cab = linhas.shift().map(h => h.trim());
  return linhas.filter(l => l.some(v => String(v).trim() !== ''))
               .map(l => Object.fromEntries(cab.map((h,i) => [h, (l[i] ?? '').trim()])));
}

function baixarArquivo(nome, conteudo, mime = 'text/csv;charset=utf-8'){
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* Só dígitos — a comparação de CNPJ e telefone tem que ignorar pontuação. */
const soDigitos = s => String(s || '').replace(/\D+/g, '');
/* Busca sem acento: quem digita "sao paulo" tem que achar "São Paulo". */
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const tamanho = b => b < 1024 ? b + ' B'
  : b < 1048576 ? (b/1024).toFixed(1).replace('.',',') + ' kB'
  : (b/1048576).toFixed(1).replace('.',',') + ' MB';

const SVG = {
  lixo:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  mais:'<path d="M12 5v14M5 12h14"/>',
  baixar:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  cadeado:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  email:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  arquivo:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  aviso:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  ok:'<path d="M20 6 9 17l-5-5"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  /* Entraram para tirar emoji da interface. Emoji e desenho de outra pessoa:
     muda de forma a cada sistema operacional, nao herda a cor do texto, nao
     acompanha o peso da fonte e sai borrado no PDF. Estes seguem a mesma
     regra dos outros — traco de 24x24, sem preenchimento, cor do texto. */
  voltar:'<path d="M19 12H5M12 19l-7-7 7-7"/>',
  busca:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  paleta:'<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1a4 4 0 0 0 4-4 10 10 0 0 0-9-11z"/>',
  usuarios:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
  engrenagem:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>',
};
const ico = (k, extra='') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ${extra}>${SVG[k]}</svg>`;
