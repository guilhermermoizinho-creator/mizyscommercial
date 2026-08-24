/* ════════════════════════════════════════════════════════════════════════════
   PEÇAS DE INTERFACE REUTILIZÁVEIS
   Modal, campos de formulário, paginação, linha do tempo, notas e anexos.
   ════════════════════════════════════════════════════════════════════════════ */

/* ── modal ── */
function modal(t, b, f, cls){
  const m = $('#modal');
  m.className = 'modal' + (cls ? ' ' + cls : '');
  m.innerHTML = `<div class="modal-h"><h3>${t}</h3>
    <button class="x" data-acao="fecharModal" aria-label="Fechar">×</button></div>
   <div class="modal-b">${b}</div>${f ? `<div class="modal-f">${f}</div>` : ''}`;
  $('#overlay').classList.add('show');
  /* Foca o primeiro campo: quem abriu o modal quer digitar, não caçar o campo. */
  setTimeout(() => m.querySelector('input:not([disabled]),textarea,select')?.focus(), 60);
}
function closeModal(){ $('#overlay').classList.remove('show'); }

/* ── campos ── */
function fld(id, l, v = '', t = 'text', full, extra = ''){
  return `<div class="f ${full ? 'full' : ''}" data-f="${id}">
   <label for="${id}">${l}</label>
   <input id="${id}" type="${t}" value="${esc(v)}" ${extra}>
   <span class="err">Campo obrigatório</span></div>`;
}
function txa(id, l, v = '', dica = ''){
  return `<div class="f full" data-f="${id}"><label for="${id}">${l}</label>
   <textarea id="${id}" placeholder="${esc(dica)}">${esc(v)}</textarea>
   <span class="err">Campo obrigatório</span></div>`;
}
function sel(id, l, o, v, full){
  return `<div class="f ${full ? 'full' : ''}" data-f="${id}"><label for="${id}">${l}</label>
   <select id="${id}">${o.map(x => { const [a,b] = Array.isArray(x) ? x : [x,x];
     return `<option value="${esc(a)}" ${String(v) === String(a) ? 'selected' : ''}>${esc(b)}</option>`;
   }).join('')}</select><span class="err">Campo obrigatório</span></div>`;
}
const selLista = (id, l, grupo, v, full) =>
  sel(id, l, LISTA(grupo).map(o => [o.valor, o.rotulo]), v, full);
function chk(id, l, v){
  return `<div class="f full"><label class="check">
   <input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${l}</label></div>`;
}
function nota(txt){ return `<p style="font-size:12px;color:var(--muted);grid-column:1/-1">${txt}</p>`; }

function valid(ids){
  let ok = true;
  ids.forEach(i => {
    const e = $('#' + i), w = e.closest('.f');
    const ruim = !String(e.value).trim();
    w.classList.toggle('invalid', ruim);
    if(ruim && ok) e.focus();
    if(ruim) ok = false;
  });
  if(!ok) toast('Preencha os campos obrigatórios.');
  return ok;
}
function acoesModal(acaoSalvar, id, rotulo = 'Salvar'){
  return `<button class="btn" data-acao="fecharModal">Cancelar</button>
   <button class="btn btn-primary" data-acao="${acaoSalvar}" data-id="${id ?? ''}">${rotulo}</button>`;
}

/* ── selects a partir do banco ── */
const optsLista = (grupo, sel) => LISTA(grupo).map(o =>
  `<option value="${esc(o.valor)}" ${String(sel) === String(o.valor) ? 'selected' : ''}>${esc(o.rotulo)}</option>`).join('');
const optsReg = (linhas, sel, rotulo) => linhas.map(x =>
  `<option value="${x.id}" ${+sel === x.id ? 'selected' : ''}>${esc(rotulo(x))}</option>`).join('');

function emptyState(t, s){
  return `<div class="empty">
   <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
   <b>${esc(t)}</b>${s || ''}</div>`;
}

/* ── paginação (5.2) ─────────────────────────────────────────────────────────
   Aparece só quando existe mais coisa no banco do que na memória. Diz quantas
   linhas estão à vista de quantas existem — sem isso o usuário lê a tabela como
   se fosse a base inteira e tira conclusão de meia amostra. */
function pager(entidade, visiveis){
  const total = DB.total[entidade] ?? visiveis;
  const carregado = DB.carregado[entidade] ?? visiveis;
  if(carregado >= total) return '';
  return `<div class="pager">
    <span>Mostrando <b>${visiveis}</b> de <b>${total}</b> ${entidade}</span>
    <span class="sp"></span>
    <button data-acao="carregarMais" data-e="${esc(entidade)}">Carregar mais ${PAGINA}</button>
    <button data-acao="carregarTudo" data-e="${esc(entidade)}">Carregar tudo</button>
  </div>`;
}
acoes({
  async carregarMais(d){
    const n = await DB.mais(d.e);
    toast(n ? `+${n} registros carregados` : 'Nada mais a carregar');
    render();
  },
  async carregarTudo(d){
    toast('Carregando a base completa…');
    await DB.carregarTudo(d.e);
    render();
  },
});

/* ── barra de ferramentas com busca (com debounce, sem re-render total) ──────
   A busca antiga fazia `render()` a cada tecla e depois devolvia o foco no
   grito (`$('#q').focus()`). Redesenhar a tela inteira a cada letra é o que
   fazia o cursor pular e a digitação engasgar. Agora a lista espera 220 ms. */
const _buscaDebounce = debounce(() => render(), 220);
acoes({
  digitarBusca(d, el){
    state[d.campo || 'q'] = el.value;
    state._focoBusca = true;
    _buscaDebounce();
  },
  filtrar(d, el){ state[d.campo] = el.value; render(); },
});
function barraBusca(dica, extra = ''){
  return `<input class="grow" id="q" placeholder="${esc(dica)}" value="${esc(state.q || '')}"
    data-digitar="digitarBusca" data-campo="q" autocomplete="off">${extra}`;
}
/* Chamado depois de cada render: devolve o cursor a quem estava digitando.
   A marca é consumida na hora — senão qualquer render posterior (um clique em
   outro botão, por exemplo) roubaria o foco para o campo de busca. */
function restaurarFoco(){
  if(!state._focoBusca) return;
  state._focoBusca = false;
  const e = $('#q');
  if(e){ e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
}

/* ── linha do tempo, notas e anexos (3.1 / 3.2) ── */
const TL_FORTE = new Set(['status','fase','aceite','email','congelada','ganho','perda','documento']);
function blocoHistorico(tipo, id, leadId){
  const h = Historico.cache[Historico.chave(tipo, id)];
  if(!h) return `<div class="card-b tl-vazio">Carregando histórico…</div>`;
  const evs = h.timeline;
  return `<div class="card-b">
    <div class="nota-add">
      <textarea id="notaTexto" placeholder="Escreva uma nota — fica no histórico, com autor e data."></textarea>
      <button class="btn btn-primary" data-acao="salvarNota" data-tipo="${esc(tipo)}"
        data-id="${esc(id)}" data-lead="${esc(leadId ?? '')}">Anotar</button>
    </div>
    ${h.notas.length ? h.notas.map(n => `<div class="nota">
      <div class="h">${av(n.autor_nome)}<b>${esc(n.autor_nome || 'Alguém')}</b>
        <span>${esc(dth(n.created_at))}</span>
        ${n.autor === Sessao.usuario?.id || Sessao.podeGerir()
          ? `<button class="btn btn-sm btn-icon" title="Excluir nota" data-acao="apagarNota"
              data-tipo="${esc(tipo)}" data-id="${esc(id)}" data-nota="${n.id}">${ico('lixo')}</button>` : ''}
      </div><p>${esc(n.texto)}</p></div>`).join('') : ''}
    <div class="sublabel" style="margin-top:18px">Histórico</div>
    ${evs.length ? `<div class="tl">${evs.map(e => `
      <div class="tl-it ${TL_FORTE.has(e.tipo) ? 'forte' : ''}">
        <div class="h"><b>${esc(e.titulo)}</b>
          <span class="q">${esc(desde(e.created_at))}${e.autor_nome ? ' · ' + esc(e.autor_nome) : ''}</span></div>
        ${e.detalhe ? `<p>${esc(e.detalhe)}</p>` : ''}
      </div>`).join('')}</div>`
    : `<div class="tl-vazio">Nada registrado ainda. Toda mudança de status, envio
        de proposta e nota escrita a partir de agora aparece aqui.</div>`}
    <div class="sublabel" style="margin-top:20px">Anexos</div>
    <div class="dropzone" data-acao="escolherAnexo" data-tipo="${esc(tipo)}"
      data-id="${esc(id)}" data-lead="${esc(leadId ?? '')}">
      Clique para anexar um arquivo (contrato assinado, planta, e-mail salvo…)
    </div>
    <div style="margin-top:10px">${h.anexos.map(a => `<div class="anexo">
      ${ico('arquivo')}<span class="nm">${esc(a.nome)}</span>
      <span class="sz">${esc(tamanho(a.tamanho || 0))}</span>
      <button class="btn btn-sm" data-acao="baixarAnexo" data-caminho="${esc(a.caminho)}">Abrir</button>
      ${a.autor === Sessao.usuario?.id || Sessao.podeGerir()
        ? `<button class="btn btn-sm btn-icon" data-acao="apagarAnexo" data-tipo="${esc(tipo)}"
            data-id="${esc(id)}" data-anexo="${a.id}" title="Excluir">${ico('lixo')}</button>` : ''}
    </div>`).join('')}</div>
  </div>`;
}

/* O histórico é buscado depois do render e a tela se atualiza sozinha — ele não
   pode segurar a abertura do lead. */
async function carregarHistorico(tipo, id){
  await Historico.carregar(tipo, id);
  if(state.id == id) render();
}

acoes({
  async salvarNota(d){
    const t = $('#notaTexto').value.trim();
    if(!t){ toast('Escreva alguma coisa antes de anotar.'); return; }
    await Historico.anotar(d.tipo, d.id, t, d.lead ? +d.lead : null);
    await Historico.carregar(d.tipo, d.id, true);
    toast('Nota registrada'); render();
  },
  async apagarNota(d){
    await Historico.apagarNota(d.tipo, d.id, +d.nota);
    await Historico.carregar(d.tipo, d.id, true);
    toast('Nota excluída'); render();
  },
  escolherAnexo(d){
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = async () => {
      const f = inp.files[0];
      if(!f) return;
      if(f.size > 25 * 1024 * 1024){ toast('Arquivo acima de 25 MB.'); return; }
      toast('Enviando ' + f.name + '…');
      try{
        await Historico.anexar(d.tipo, d.id, f, d.lead ? +d.lead : null);
        await Historico.carregar(d.tipo, d.id, true);
        toast('Anexo enviado'); render();
      }catch(e){ toast(e.message); }
    };
    inp.click();
  },
  async baixarAnexo(d){
    try{ window.open(await Historico.urlAnexo(d.caminho), '_blank'); }
    catch(e){ toast('Não foi possível abrir: ' + e.message); }
  },
  async apagarAnexo(d){
    const h = Historico.cache[Historico.chave(d.tipo, d.id)];
    const a = h?.anexos.find(x => x.id === +d.anexo);
    if(!a) return;
    await Historico.apagarAnexo(d.tipo, d.id, a);
    await Historico.carregar(d.tipo, d.id, true);
    toast('Anexo excluído'); render();
  },
});

/* ── exclusão com confirmação ── */
acoes({
  confirmarExclusao(d){
    modal('Excluir ' + (d.rotulo || 'registro').toLowerCase(),
      `<p style="color:var(--muted)">Esta ação não pode ser desfeita.
        ${d.aviso ? '<br><br><b>' + esc(d.aviso) + '</b>' : ''}</p>`,
      `<button class="btn" data-acao="fecharModal">Cancelar</button>
       <button class="btn btn-danger" data-acao="excluir" data-e="${esc(d.e)}"
        data-id="${esc(d.id)}" data-rotulo="${esc(d.rotulo || '')}">Excluir</button>`);
  },
  async excluir(d){
    try{ await DB.del(d.e, d.id); }catch(e){ return; }
    closeModal(); toast((d.rotulo || 'Registro') + ' excluído'); render();
  },
  fecharModal(){ closeModal(); },
});
/* Atalho usado por todas as tabelas. */
const btnExcluir = (e, id, rotulo, aviso = '') =>
  `<button class="btn btn-sm btn-icon" title="Excluir" data-acao="confirmarExclusao"
    data-e="${esc(e)}" data-id="${esc(id)}" data-rotulo="${esc(rotulo)}"
    data-aviso="${esc(aviso)}">${ico('lixo')}</button>`;

/* ── importação e exportação CSV (3.7) ── */
function exportarCSV(nome, linhas, colunas){
  if(!linhas.length){ toast('Nada para exportar.'); return; }
  baixarArquivo(nome, paraCSV(linhas, colunas));
  toast(`${linhas.length} registros exportados`);
}

function modalImportar(titulo, exemplo, acaoImportar){
  modal(titulo, `
    <p style="color:var(--muted);font-size:13px;margin-bottom:14px">
      Arquivo CSV com cabeçalho na primeira linha. Separador ponto e vírgula ou
      vírgula — os dois funcionam. Colunas reconhecidas:</p>
    <div class="readbox" style="margin-bottom:16px"><b>Colunas</b>${esc(exemplo)}</div>
    <div class="dropzone" data-acao="${esc(acaoImportar)}">Clique para escolher o arquivo CSV</div>
    <div id="previaImport" style="margin-top:14px"></div>`,
    `<button class="btn" data-acao="fecharModal">Fechar</button>`, 'wide');
}

/* ── acompanhamento da fila de documentos (4.7) ──────────────────────────────
   Gerar um PDF leva de 5 a 20 segundos. Antes isso era uma requisição pendurada
   com o botão desabilitado; agora é um trabalho na fila do servidor, e este
   canto da tela mostra em que pé está — dá para continuar trabalhando. */
const Jobs = {
  ativos:{},
  render(){
    const cx = $('#jobs');
    const l = Object.values(this.ativos);
    cx.innerHTML = l.map(j => `<div class="job ${j.estado === 'concluido' ? 'pronto'
        : j.estado === 'erro' ? 'falhou' : ''}">
      <span class="dot"></span><span class="sp">${esc(j.rotulo)}</span>
      <b>${j.estado === 'concluido' ? 'pronto' : j.estado === 'erro' ? 'falhou' : 'gerando…'}</b>
    </div>`).join('');
  },
  async acompanhar(jid, rotulo, aoConcluir){
    this.ativos[jid] = {id:jid, rotulo, estado:'aguardando'};
    this.render();
    const limite = Date.now() + 5 * 60 * 1000;   /* 5 min é mais que o suficiente */
    while(Date.now() < limite){
      await new Promise(r => setTimeout(r, 1200));
      let est;
      try{ est = await api('/api/documento/job/' + jid); }
      catch(e){ this.falhar(jid, e.message); return null; }
      this.ativos[jid].estado = est.estado;
      this.render();
      if(est.estado === 'concluido'){
        setTimeout(() => { delete this.ativos[jid]; this.render(); }, 2500);
        if(aoConcluir) await aoConcluir(est);
        return est;
      }
      if(est.estado === 'erro'){ this.falhar(jid, est.erro); return null; }
    }
    this.falhar(jid, 'demorou demais');
    return null;
  },
  falhar(jid, msg){
    if(this.ativos[jid]) this.ativos[jid].estado = 'erro';
    this.render();
    setTimeout(() => { delete this.ativos[jid]; this.render(); }, 5000);
    toast('Falhou: ' + (msg || 'erro desconhecido'));
  },
};
