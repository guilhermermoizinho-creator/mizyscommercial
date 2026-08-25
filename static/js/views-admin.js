/* ════════════════════════════════════════════════════════════════════════════
   ADMINISTRAÇÃO — acesso e saúde do sistema.

   Por que uma tela separada de Configurações: lá dentro está a mesa de
   trabalho de quem MONTA proposta — parâmetros de cálculo, listas, modelos.
   Aqui está o que governa o sistema para todo mundo: quem entra e se o
   servidor está inteiro. São dois públicos e dois ritmos — um se mexe toda
   semana, o outro quase nunca.

   A tela inteira é de admin/gestor. Esconder o item do menu não é permissão:
   quem barra de verdade é a RLS no banco e o @so_admin nas rotas. O aviso
   aqui existe para explicar, não para proteger.
   ════════════════════════════════════════════════════════════════════════════ */

VIEWS.admin = function(){
  if(!Sessao.podeGerir()) return `<div class="faixa">${ico('cadeado')}
    <span class="sp">Esta tela é de administrador.</span></div>`;

  const t = state.tab || 'acesso';
  const fila = DB.list('perfis').filter(p => p.papel === 'pendente');
  const aba = (k, r, n) => `<button class="${t === k ? 'active' : ''}" data-acao="trocarAba"
    data-tab="${k}">${r}${n !== undefined && n !== 0
      ? ` <span class="tag ${k === 'acesso' ? 't-amber' : 't-gray'}">${n}</span>` : ''}</button>`;

  return `<div class="tabs">
   ${aba('acesso', 'Acesso', fila.length)}
   ${aba('sistema', 'Sistema')}</div>
  ${t === 'sistema' ? _admSistema() : _admAcesso(fila)}`;
};


/* ── Acesso ──────────────────────────────────────────────────────────────── */

function _admAcesso(fila){
  const time = DB.list('perfis').filter(p => p.papel !== 'pendente');
  const linhaPessoa = p => `<tr>
    <td><div class="cell-main">${esc(p.nome || '—')}</div>
     <div class="cell-sub">${esc(p.email || '')}</div></td>
    <td><span class="tag ${p.papel === 'admin' ? 't-blue' : p.papel === 'pendente' ? 't-amber' : 't-gray'}">
     ${esc(p.papel)}</span></td>
    <td><span class="tag ${p.ativo ? 't-green' : 't-red'}">${p.ativo ? 'ativo' : 'bloqueado'}</span></td>
    <td class="cell-sub">${esc(dt(p.solicitado_em || p.created_at) || '')}</td></tr>`;

  return `${fila.length ? `<div class="card mt"><div class="card-h">
    <div style="flex:1"><h3>${fila.length} pedido(s) de acesso</h3>
     <p>Ninguém entra sem liberação — até lá a conta não enxerga uma linha do sistema</p></div></div>
   <div class="card-b"><table><thead><tr><th>Pessoa</th><th>Papel</th><th>Situação</th>
     <th>Pediu em</th></tr></thead><tbody>${fila.map(linhaPessoa).join('')}</tbody></table>
    ${nota('Liberar e recusar continuam em Configurações → Usuários, que é onde os '
         + 'botões já vivem. Aqui a fila aparece para ninguém precisar procurar.')}
    <button class="btn btn-primary mt" data-acao="irPara" data-v="configuracoes"
     data-tab="usuarios">${ico('usuarios')}Abrir a fila</button></div></div>`
  : `<div class="card mt"><div class="card-b">
     <div class="faixa">${ico('ok')}<span class="sp">Nenhum pedido de acesso na fila.</span></div>
     </div></div>`}

  <div class="card mt"><div class="card-h"><div style="flex:1"><h3>Quem tem acesso</h3>
    <p>${time.length} pessoa(s) com o sistema liberado</p></div></div>
   <div class="card-b"><table><thead><tr><th>Pessoa</th><th>Papel</th><th>Situação</th>
    <th>Desde</th></tr></thead><tbody>${time.map(linhaPessoa).join('')}</tbody></table></div></div>`;
}


/* ── Sistema ─────────────────────────────────────────────────────────────── */

function _admSistema(){
  const s = state.saude;
  const linha = (r, ok, det) => `<div class="sum-row">
    <span class="lb">${esc(r)}</span>
    <span class="vl"><span class="tag ${ok ? 't-green' : 't-amber'}">${ok ? 'ok' : 'pendente'}</span></span>
   </div>${det ? `<div class="cell-sub" style="margin:-4px 0 6px">${esc(det)}</div>` : ''}`;

  return `<div class="card mt"><div class="card-h"><div style="flex:1"><h3>Saúde do servidor</h3>
    <p>O que está de pé e o que falta configurar</p></div>
    <button class="btn" data-acao="verificarSaude">${ico('busca')}Verificar</button></div>
   <div class="card-b">
    ${s ? `
     ${linha('Banco de dados (Supabase)', s.supabase)}
     ${linha('Chave de serviço — link público de aceite', s.link_publico,
        s.link_publico ? '' : 'sem ela o cliente não abre o link de aceite')}
     ${linha('Geração de PDF', s.pdf, s.pdf_motor || s.libreoffice)}
     ${linha('Envio de e-mail (SMTP)', s.email,
        s.email ? '' : 'falta ' + (s.email_faltando || 'configurar o .env'))}
     ${linha('Logo na capa do PPT', s.logo, s.logo ? '' : 'coloque modelo_ppt/logo.png')}
     ${nota('Modelos de apresentação: ' + esc((s.modelos || []).join(', ') || 'nenhum'))}`
    : `<div class="faixa">${ico('aviso')}<span class="sp">
        Clique em <b>Verificar</b> para consultar o servidor.</span></div>`}
   </div></div>`;
}

acao('verificarSaude', async () => {
  try{
    state.saude = await api('/api/saude');
  }catch(e){
    state.saude = null;
    toast(e.message);
  }
  render();
});
