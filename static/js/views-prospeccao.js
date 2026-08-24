/* ════════════════════════════════════════════════════════════════════════════
   PROSPECÇÃO — varrer o Maps, checar na Receita, virar lead.

   O trabalho que esta tela substitui: abrir o Maps, procurar "empresa de
   limpeza terceirizada", clicar em cada resultado, entrar no site, achar o
   CNPJ no rodapé, consultar a situação cadastral e anotar numa planilha. São
   uns quatro minutos por empresa, e metade é grande demais ou está baixada.

   Duas decisões de desenho que valem explicar:

   · A DESCARTADA CONTINUA NA LISTA, com o motivo à vista. Filtro que faz o
     resultado sumir é filtro que ninguém confere — e a primeira coisa que se
     quer saber, ao ver 8 resultados numa busca que prometia 40, é o que
     aconteceu com os outros 32.
   · Nada é gravado sozinho. A rodada devolve candidatos; virar lead é um
     clique explícito, porque lead duplicado é dois vendedores ligando para o
     mesmo cliente na mesma semana.

   O `data-mudar` cai no MESMO registro do `data-acao` (veja _despachar no
   util.js), então tudo aqui se registra com acao().
   ════════════════════════════════════════════════════════════════════════════ */

VIEWS.prospeccao = function(){
  if(!Sessao.podeGerir()) return `<div class="faixa">${ico('cadeado')}
    <span class="sp">Esta tela é de administrador.</span></div>`;

  const st = state.prosp || {};
  const cands = st.candidatos || [];
  const verDescartadas = !!state.prospDescartadas;
  const visiveis = verDescartadas ? cands : cands.filter(c => !c.descartado);
  const marcadas = state.prospMarcadas || {};
  const nMarcadas = Object.values(marcadas).filter(Boolean).length;

  return `
  ${st.google === false ? `<div class="faixa">${ico('aviso')}<span class="sp">
    <b>A busca no Maps está desligada.</b> Falta <code>GOOGLE_MAPS_API_KEY</code>
    no <code>.env</code> do servidor — com faturamento habilitado no Google Cloud
    e a <b>Places API (New)</b> ativada no projeto. A consulta por CNPJ ao lado
    funciona sem isso.</span></div>` : ''}

  <div class="grid2">
   <div class="card"><div class="card-h"><div style="flex:1"><h3>Varrer uma região</h3>
     <p>Empresas de facilities no Maps, já checadas na Receita</p></div></div>
    <div class="card-b">
     <div class="f"><label>Cidade ou região</label>
      <input id="prospRegiao" value="${esc(st.regiao || 'Estado de São Paulo')}"
       placeholder="Ex.: São Paulo, SP  ·  Campinas e região"></div>

     <div class="f"><label>Resultados por termo</label>
      <input id="prospMaximo" type="number" min="1" max="20" value="${+(st.maximo || 20)}">
      ${nota('São 5 termos por rodada. Com 20, a busca devolve até 100 empresas e gasta 5 consultas na Places API.')}</div>

     <div class="sublabel">Checagem</div>
     <div class="chips"><label class="chipbox ${state.prospEnriquecer === false ? '' : 'on'}">
      <input type="checkbox" ${state.prospEnriquecer === false ? '' : 'checked'}
       data-mudar="prospAlternarChecagem">
      Abrir o site e consultar a Receita</label></div>
     ${nota('É o que descobre CNPJ, e-mail e se a empresa está ativa. Custa tempo: a Receita aceita uma consulta a cada 2,5 s.')}

     <div class="f"><label>Não trazer (uma por linha)</label>
      <textarea id="prospBloqueio" rows="3"
       placeholder="minha concorrente&#10;outra que não interessa">${esc(st.bloqueioExtra || '')}</textarea>
      ${nota('Já saem de fábrica: ' + esc((st.bloqueio || []).slice(0, 8).join(', ')) + '…')}</div>

     <button class="btn btn-primary" style="width:100%;justify-content:center"
      data-acao="prospBuscar" ${st.google === false ? 'disabled' : ''}>
      Buscar empresas</button>
    </div></div>

   <div class="card"><div class="card-h"><div style="flex:1"><h3>Triar uma lista</h3>
     <p>Cole o que já tem — não depende do Google</p></div></div>
    <div class="card-b">
     <div class="f"><label>Uma empresa por linha</label>
      <textarea id="prospLote" rows="7" placeholder="12.345.678/0001-90
www.empresadelimpeza.com.br
Conservadora Aurora; 98.765.432/0001-10
Zeladoria Norte Ltda">${esc(state.prospLoteTexto || '')}</textarea>
      ${nota('Cada linha pode ser um CNPJ, um site, ou "Nome; CNPJ ou site". Do site o sistema tira o CNPJ e os e-mails; do CNPJ, a situação cadastral e o porte. Só o nome dá para conferir contra a lista de bloqueio, e nada mais.')}</div>
     <button class="btn btn-primary" style="width:100%;justify-content:center"
      data-acao="prospTriarLote">Consultar e triar</button>

     <div class="sublabel" style="margin-top:18px">Ou um CNPJ avulso</div>
     <div class="f"><input id="prospCnpj" placeholder="00.000.000/0001-00"></div>
     <button class="btn" style="width:100%;justify-content:center"
      data-acao="prospConsultarCnpj">Consultar na Receita</button>
     ${st.cnpjResultado ? _fichaCnpj(st.cnpjResultado) : ''}
    </div></div>
  </div>

  ${cands.length ? `
  <div class="card mt"><div class="card-h">
    <div style="flex:1"><h3>${visiveis.length} empresa(s)</h3>
     <p>${st.aproveitados} aproveitada(s) de ${st.total} encontrada(s) em ${esc(st.regiao || '')}</p></div>
    <label class="chipbox ${verDescartadas ? 'on' : ''}">
     <input type="checkbox" ${verDescartadas ? 'checked' : ''}
      data-mudar="prospAlternarDescartadas">Ver descartadas</label>
    <button class="btn btn-primary" data-acao="prospImportar" ${nMarcadas ? '' : 'disabled'}>
     Criar ${nMarcadas || ''} lead(s)</button></div>
   <div class="card-b" style="overflow-x:auto">
    <table><thead><tr>
      <th style="width:34px"></th><th>Empresa</th><th>Contato</th>
      <th>Receita Federal</th><th>Indícios</th><th style="width:56px">Nota</th>
     </tr></thead><tbody>
     ${visiveis.map(c => _linha(c, marcadas)).join('')}
    </tbody></table>
    ${visiveis.length ? '' : `<p class="cell-sub">As ${cands.length} foram todas
      descartadas. Marque "ver descartadas" para conferir o motivo de cada uma.</p>`}
   </div></div>` : ''}

  ${(st.erros || []).length ? `<div class="card mt"><div class="card-b">
    ${st.erros.map(e => `<div class="faixa">${ico('aviso')}
      <span class="sp">${esc(e)}</span></div>`).join('')}</div></div>` : ''}`;
};


function _linha(c, marcadas){
  const rf = c.rf || {};
  const chave = c.place_id || c.nome;
  const emails = c.emails || [];
  const site = (c.site || '').replace(/^https?:\/\//, '');
  return `<tr style="${c.descartado ? 'opacity:.55' : ''}">
   <td>${c.descartado ? '' : `<input type="checkbox" data-mudar="prospMarcar"
     data-chave="${esc(chave)}" ${marcadas[chave] ? 'checked' : ''}>`}</td>
   <td><div class="cell-main">${esc(rf.razao_social || c.nome)}</div>
    ${rf.nome_fantasia && rf.nome_fantasia !== rf.razao_social
      ? `<div class="cell-sub">${esc(rf.nome_fantasia)}</div>` : ''}
    <div class="cell-sub">${esc(c.endereco || '')}</div>
    ${site ? `<div class="cell-sub"><a href="${esc(c.site)}" target="_blank"
      rel="noopener noreferrer">${esc(site.slice(0, 42))}</a></div>` : ''}
    ${c.erro_site ? '<div class="cell-sub">o site não abriu</div>' : ''}</td>
   <td>${c.telefone ? `<div class="cell-main">${esc(c.telefone)}</div>` : ''}
    ${rf.telefone_rf && rf.telefone_rf !== c.telefone
      ? `<div class="cell-sub">${esc(rf.telefone_rf)} · Receita</div>` : ''}
    ${emails.map(e => `<div class="cell-sub">${esc(e)}</div>`).join('')}
    ${!emails.length && rf.email_rf
      ? `<div class="cell-sub">${esc(rf.email_rf)} · Receita</div>` : ''}</td>
   <td>${rf.cnpj ? `<span class="tag ${rf.situacao === 'ATIVA' ? 't-green' : 't-red'}">
      ${esc(rf.situacao || '?')}</span>
     <div class="cell-sub">${esc(_cnpjFmt(rf.cnpj))}</div>
     <div class="cell-sub">${esc((rf.cnae_desc || '').slice(0, 34))}</div>`
    : `<span class="cell-sub">${esc(rf.erro
        || (c.cnpj_site ? 'não consultado' : 'CNPJ não encontrado no site'))}</span>`}</td>
   <td>${(c.sinais || []).map(s => `<span class="tag t-gray">${esc(s)}</span> `).join('')}
    ${(c.motivos || []).map(m => `<span class="tag t-red">${esc(m)}</span> `).join('')}</td>
   <td><b>${c.nota_triagem}</b></td></tr>`;
}


function _fichaCnpj(d){
  if(d.erro) return `<div class="faixa mt">${ico('aviso')}
    <span class="sp">${esc(d.erro)}</span></div>`;
  const l = (r, v) => v ? `<div>${esc(r)}: <b>${esc(v)}</b></div>` : '';
  return `<div class="readbox mt">
   <b>${esc(d.razao_social || '')}</b>
   ${l('Situação', d.situacao)}
   ${l('Porte', (d.porte || '').toLowerCase())}
   ${l('Capital social', d.capital_social ? money0(d.capital_social) : '')}
   ${l('CNAE', d.cnae_desc)}
   ${l('Abertura', d.abertura)}
   ${l('Município', [d.municipio, d.uf].filter(Boolean).join('/'))}
   ${l('Telefone', d.telefone_rf)}
   ${l('E-mail', d.email_rf)}
   ${l('Sócios', d.socios)}</div>`;
}

const _cnpjFmt = n => String(n || '').replace(
  /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');


/* ── ações ───────────────────────────────────────────────────────────────── */

acao('prospBuscar', async () => {
  const regiao = ($('#prospRegiao').value || '').trim();
  if(!regiao) return toast('Informe a cidade ou região.');
  const maximo = +($('#prospMaximo').value || 20);
  const bloqueioExtra = ($('#prospBloqueio').value || '').trim();
  const bloqueio = bloqueioExtra.split('\n').map(s => s.trim()).filter(Boolean);

  state.prosp = {...(state.prosp || {}), regiao, maximo, bloqueioExtra};
  const r = await api('/api/prospeccao/buscar', {
    method:'POST',
    body: JSON.stringify({regiao, maximo, bloqueio,
                          enriquecer: state.prospEnriquecer !== false}),
  });

  const est = await Jobs.acompanhar(r.job, `Prospecção em ${regiao}`);
  if(!est || !est.resultado) return;
  state.prosp = {...state.prosp, ...est.resultado};
  state.prospMarcadas = {};
  render();
  toast(`${est.resultado.aproveitados} de ${est.resultado.total} aproveitadas.`);
});

acao('prospTriarLote', async () => {
  const texto = ($('#prospLote').value || '').trim();
  if(!texto) return toast('Cole ao menos uma linha.');
  const linhas = texto.split('\n').map(s => s.trim()).filter(Boolean);
  const bloqueio = (($('#prospBloqueio') || {}).value || '')
    .split('\n').map(s => s.trim()).filter(Boolean);
  state.prospLoteTexto = texto;

  const r = await api('/api/prospeccao/lote', {
    method:'POST', body: JSON.stringify({linhas, bloqueio}),
  });
  const est = await Jobs.acompanhar(r.job, `Triando ${linhas.length} empresa(s)`);
  if(!est || !est.resultado) return;
  state.prosp = {...(state.prosp || {}), ...est.resultado};
  state.prospMarcadas = {};
  render();
  toast(`${est.resultado.aproveitados} de ${est.resultado.total} aproveitadas.`);
});

acao('prospConsultarCnpj', async () => {
  const cnpj = ($('#prospCnpj').value || '').replace(/\D/g, '');
  if(cnpj.length !== 14) return toast('CNPJ precisa de 14 dígitos.');
  const d = await api('/api/prospeccao/cnpj/' + cnpj);
  state.prosp = {...(state.prosp || {}), cnpjResultado:d};
  render();
});

acao('prospImportar', async () => {
  const marcadas = state.prospMarcadas || {};
  const cands = (state.prosp || {}).candidatos || [];
  const escolha = cands.filter(c => marcadas[c.place_id || c.nome]);
  if(!escolha.length) return toast('Marque ao menos uma empresa.');

  const r = await api('/api/prospeccao/importar', {
    method:'POST', body: JSON.stringify({candidatos: escolha}),
  });
  /* Empurra na memória em vez de recarregar a tabela inteira: a lista de leads
     é paginada, e um recarregamento perderia as páginas já trazidas. */
  (r.criados || []).forEach(l => { if(l && l.id) DB.d.leads.unshift(l); });
  DB.carregado.leads = (DB.carregado.leads || 0) + (r.criados || []).length;
  DB.total.leads = (DB.total.leads || 0) + (r.criados || []).length;

  state.prospMarcadas = {};
  render();
  const partes = [`${(r.criados || []).length} lead(s) criado(s)`];
  if((r.repetidos || []).length) partes.push(`${r.repetidos.length} já existia(m)`);
  if((r.falhas || []).length) partes.push(`${r.falhas.length} falhou`);
  toast(partes.join(' · '));
});

acao('prospMarcar', (d, el) => {
  state.prospMarcadas = {...(state.prospMarcadas || {}), [d.chave]: el.checked};
  render();
});
acao('prospAlternarDescartadas', (d, el) => {
  state.prospDescartadas = el.checked;
  render();
});
acao('prospAlternarChecagem', (d, el) => { state.prospEnriquecer = el.checked; });
