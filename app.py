"""
MY CRM — servidor.

O que mudou em relação à primeira versão, e por quê:

1. **Nada de endpoint aberto.** `/api/documento` aceitava POST de qualquer
   origem, sem token, e confiava 100% no JSON do navegador (P4). Agora toda
   rota de API exige o JWT do Supabase, o servidor valida esse token contra o
   `/auth/v1/user` e usa o MESMO token para falar com o Postgres — a RLS
   continua valendo do lado de cá.

2. **O documento nasce do id, não do JSON.** O navegador manda
   `POST /api/propostas/12/documento/pdf` e pronto. Quem lê a proposta, calcula
   e preenche o modelo é o servidor (documentos.py + calculo.py). Isso é o que
   permite gerar por e-mail, em lote ou por link público, sem navegador — e é o
   que garante que a tela e o PDF mostrem o mesmo número.

3. **A geração não trava mais a aplicação.** Ela vai para uma fila e a rota
   devolve um id de acompanhamento (P9.10).

4. **`debug=True` saiu.** O console interativo do Werkzeug é execução remota de
   código para quem alcançar a porta. Para depurar, `FLASK_DEBUG=1` no .env,
   conscientemente.
"""
from __future__ import annotations

import datetime as _dt
import functools
import hashlib
import html
import os
import threading
import time

from dotenv import load_dotenv
from flask import Flask, Response, g, jsonify, render_template, request

import calculo
import correio
import documentos
import fila
import ppt
import prospeccao
from supa import ErroSupabase, Supabase, service_key

load_dotenv()

app = Flask(__name__)


@app.template_global()
def versao_estatica() -> str:
    """Carimbo de versão dos arquivos estáticos, para o navegador não servir CSS
    e JS velhos depois de um deploy.

    Sem isso, quem já abriu o sistema continua com o app.js de ontem no cache —
    e aí "a tela não mudou" vira um bug que não existe, caçado no lugar errado.
    O carimbo é a data de modificação mais recente dentro de static/js e
    static/css: qualquer arquivo que muda troca a URL de todos, e o navegador
    baixa a leva inteira de uma vez (que é o que se quer, porque os arquivos
    dependem uns dos outros).
    """
    recente = 0.0
    for pasta in ("js", "css"):
        caminho = os.path.join(app.static_folder, pasta)
        if not os.path.isdir(caminho):
            continue
        for nome in os.listdir(caminho):
            try:
                recente = max(recente, os.path.getmtime(os.path.join(caminho, nome)))
            except OSError:
                pass
    return str(int(recente))
app.config["JSON_SORT_KEYS"] = False
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024   # nada de upload gigante

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
DEBUG = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "sim")
PORTA = int(os.environ.get("PORT") or 5050)


# ════════════════════════════════════════════════════════════════════════════
# AUTENTICAÇÃO (1.7 / P4)
# ════════════════════════════════════════════════════════════════════════════

# Validar o token é uma ida ao Supabase. Sem cache, cada clique em "gerar PDF"
# viraria duas viagens de rede antes de começar o trabalho.
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_SEG = 60
_cache_trava = threading.Lock()


def _token_da_requisicao():
    cab = request.headers.get("Authorization") or ""
    if cab.lower().startswith("bearer "):
        return cab[7:].strip()
    return None


def _usuario_do_token(token):
    chave = hashlib.sha256(token.encode()).hexdigest()
    agora = time.time()
    with _cache_trava:
        guardado = _CACHE.get(chave)
        if guardado and guardado[0] > agora:
            return guardado[1]
    usuario = Supabase(token).usuario()
    if not usuario or not usuario.get("id"):
        return None
    with _cache_trava:
        _CACHE[chave] = (agora + _CACHE_SEG, usuario)
        # Poda simples: o cache não pode virar um vazamento em servidor longo.
        if len(_CACHE) > 500:
            for k in [k for k, v in _CACHE.items() if v[0] <= agora]:
                _CACHE.pop(k, None)
    return usuario


def so_admin(fn):
    """Só admin ou gestor. Vem SEMPRE depois de @autenticado, que é quem enche
    o `g.usuario` — invertido, a checagem lê um `g` vazio e libera geral.

    O papel é lido de `perfis`, a mesma tabela que a RLS consulta: a tela
    esconder o botão não é proteção nenhuma, porque a rota continua aberta a
    quem souber o endereço.
    """
    @functools.wraps(fn)
    def envelope(*args, **kwargs):
        try:
            perfil = g.sb.select("perfis", "papel,ativo",
                                 id="eq.%s" % g.usuario.get("id"), limite=1)
        except ErroSupabase as exc:
            return jsonify(erro=str(exc)), 502
        linha = (perfil or [{}])[0]
        if not linha.get("ativo") or linha.get("papel") not in ("admin", "gestor"):
            return jsonify(erro="Esta tela é de administrador."), 403
        return fn(*args, **kwargs)
    return envelope


def autenticado(fn):
    """Exige um JWT válido do Supabase e prepara `g.sb` já com esse token."""
    @functools.wraps(fn)
    def envelope(*args, **kwargs):
        token = _token_da_requisicao()
        if not token:
            return jsonify(erro="Não autenticado. Faça login novamente."), 401
        try:
            usuario = _usuario_do_token(token)
        except ErroSupabase as exc:
            if exc.status in (401, 403):
                return jsonify(erro="Sessão expirada. Entre de novo."), 401
            return jsonify(erro=str(exc)), 502
        if not usuario:
            return jsonify(erro="Sessão inválida. Entre de novo."), 401
        g.token = token
        g.usuario = usuario
        g.sb = Supabase(token)
        return fn(*args, **kwargs)
    return envelope


def _sb_publico():
    """Sessão sem usuário, para o link de aceite. Precisa da chave de serviço:
    é o único lugar do sistema em que alguém sem login lê uma proposta, e por
    isso a rota só existe se a chave estiver configurada."""
    if not service_key():
        return None
    return Supabase(servico=True)


# ════════════════════════════════════════════════════════════════════════════
# PÁGINA
# ════════════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return (
            "SUPABASE_URL e/ou SUPABASE_ANON_KEY não configurados. "
            "Copie o .env.example para .env, preencha e reinicie o servidor.",
            500,
        )
    return render_template(
        "my_crm.html",
        supabase_url=SUPABASE_URL,
        supabase_anon_key=SUPABASE_ANON_KEY,
    )


@app.route("/favicon.ico")
def favicon():
    return ("", 204)


@app.route("/api/saude")
def saude():
    """O que está de pé e o que falta configurar. A tela de Configurações
    mostra isto, para ninguém descobrir que o SMTP não estava preenchido só na
    hora de mandar a proposta para o cliente."""
    return jsonify(
        supabase=bool(SUPABASE_URL and SUPABASE_ANON_KEY),
        email=correio.configurado(),
        email_faltando=correio.config_faltando(),
        link_publico=bool(service_key()),
        modelos=documentos.modelos_disponiveis(),
        logo=bool(ppt.caminho_logo()),
        pdf=ppt.pdf_disponivel(),
        pdf_motor=" → ".join(n for n, _ in ppt.motores_pdf()),
        libreoffice=ppt._binario_libreoffice() or "",
        versao_motor=2,
    )


# ════════════════════════════════════════════════════════════════════════════
# PROPOSTA — cálculo, congelamento e documentos (1.3, 2.6, 4.1, 4.2, 4.7)
# ════════════════════════════════════════════════════════════════════════════

# ════════════════════════════════════════════════════════════════════════════
# ACESSO — aviso aos administradores de que alguém está na fila
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/acesso/solicitado", methods=["POST"])
@autenticado
def acesso_solicitado():
    """Avisa os admins por e-mail que uma conta nova está esperando liberação.

    Quem chama é o próprio recém-cadastrado, logo depois do signUp — e ele está
    PENDENTE, o que significa que a RLS não deixa ele ler a tabela de perfis
    para descobrir quem é admin. Por isso a leitura aqui usa a chave de serviço.

    A liberação em si NÃO acontece por link nenhum: ela é um clique em
    Configurações → Usuários, feito por um admin logado. Um link de aprovação
    por e-mail seria uma segunda porta de entrada no sistema, com a chave
    trafegando na caixa postal de alguém — este e-mail é só um aviso.
    """
    if not service_key():
        return jsonify(ok=False, motivo="sem chave de serviço"), 200
    if not correio.configurado():
        return jsonify(ok=False, motivo="e-mail não configurado"), 200

    try:
        sb = Supabase(servico=True)
        admins = sb.select("perfis", "email,papel,ativo")
    except ErroSupabase as exc:
        app.logger.warning("aviso de acesso: %s", exc)
        return jsonify(ok=False, motivo="não foi possível listar admins"), 200

    destinos = [a["email"] for a in (admins or [])
                if a.get("papel") == "admin" and a.get("ativo") and a.get("email")]
    if not destinos:
        return jsonify(ok=False, motivo="nenhum admin com e-mail"), 200

    quem = (g.usuario or {}).get("email") or "alguém"
    # O endereço do CRM mora em `configuracoes`, não no .env — é o mesmo campo
    # que monta o link de aceite do cliente. Ler de os.environ devolveria vazio
    # sempre, e o e-mail sairia sem dizer onde clicar.
    try:
        base = next((c["valor"] for c in sb.select("configuracoes", "chave,valor")
                     if c.get("chave") == "aceite_base_url"), "") or ""
    except ErroSupabase:
        base = ""
    base = base.rstrip("/")
    try:
        corpo = "\n".join([
            "%s criou uma conta no Mizys CRM e está aguardando liberação." % quem,
            "",
            "Enquanto não for liberada, essa conta não enxerga nada: nem",
            "convenção, nem salário, nem proposta.",
            "",
            "Para liberar, entre no CRM%s e vá em Configurações > Usuários."
            % ((" (%s)" % base) if base else ""),
            "O pedido aparece no topo da tela.",
            "",
            "Se você não conhece esta pessoa, recuse o pedido na mesma tela.",
        ])
        correio.enviar(destinos,
                       "Pedido de acesso ao Mizys CRM — %s" % quem, corpo)
    except correio.ErroEmail as exc:
        app.logger.warning("aviso de acesso não enviado: %s", exc)
        return jsonify(ok=False, motivo=str(exc)), 200
    return jsonify(ok=True, avisados=len(destinos))


@app.route("/api/propostas/<int:pid>/calculo")
@autenticado
def calculo_proposta(pid):
    """O cálculo do servidor, para a tela conferir contra o dela.

    Se os dois divergirem em um centavo, é bug — e é melhor descobrir aqui do
    que num PDF já enviado."""
    try:
        p, ctx, c = documentos.carregar(g.sb, pid)
    except documentos.ErroProposta as exc:
        return jsonify(erro=str(exc)), 404
    except ErroSupabase as exc:
        return jsonify(erro=str(exc)), 502
    return jsonify(
        congelada=bool(ctx.get("congelado")),
        congelada_em=ctx.get("congelado_em"),
        problemas=calculo.confere(c),
        totais={
            "custo_direto": c["custo_direto_c"], "preco_mao_de_obra": c["preco_mo_c"],
            "preco_equipamentos": c["preco_equip_c"], "subtotal": c["preco_bruto_c"],
            "desconto": c["desconto_c"], "mensal": c["mensal_c"],
            "implantacao": c["implantacao_c"], "contrato": c["contrato_c"],
            "lucro": c["lucro_c"], "margem": round(c["margem"], 4),
            "postos": c["postos"], "funcionarios": round(c["func"], 3),
        },
        itens=[{"cargo": i["cargo"].get("nome"), "postos": i["postos"],
                "fator": i["fator"], "custo": i["custo_c"], "preco": i["preco_c"]}
               for i in c["itens"]],
    )


@app.route("/api/propostas/<int:pid>/congelar", methods=["POST"])
@autenticado
def congelar_proposta(pid):
    """(1.3 / P3) Fotografa a CCT. Depois disto o valor não muda mais sozinho."""
    corpo = request.get_json(silent=True) or {}
    try:
        p = documentos.congelar(g.sb, pid, refazer=bool(corpo.get("refazer")))
    except documentos.ErroProposta as exc:
        return jsonify(erro=str(exc)), 404
    except ErroSupabase as exc:
        return jsonify(erro=str(exc)), 502
    documentos.registrar_timeline(
        g.sb, "Proposta", pid, "congelada",
        "Valores congelados", "Salários, benefícios e encargos desta proposta "
        "não acompanham mais reajustes da convenção.", lead_id=p.get("leadId"))
    return jsonify(ok=True, congelada_em=p.get("congelada_em"))


@app.route("/api/propostas/<int:pid>/descongelar", methods=["POST"])
@autenticado
def descongelar_proposta(pid):
    try:
        p = g.sb.um("propostas", pid)
        if not p:
            return jsonify(erro="Proposta não encontrada."), 404
        if p.get("status") != documentos.STATUS_RASCUNHO:
            return jsonify(erro="Só uma proposta em Rascunho pode voltar a "
                                "acompanhar a convenção."), 409
        documentos.descongelar(g.sb, pid)
    except ErroSupabase as exc:
        return jsonify(erro=str(exc)), 502
    return jsonify(ok=True)


def _gerar_e_arquivar(token, pid, formato, guardar=True):
    """Roda dentro da fila. Recria a sessão porque a thread não tem `g`."""
    sb = Supabase(token)
    conteudo, nome, mime = documentos.gerar(sb, pid, formato)
    if guardar:
        try:
            documentos.arquivar(sb, pid, formato, conteudo, nome)
        except ErroSupabase:
            # Storage indisponível não pode impedir o download: o arquivo já
            # existe, só não ficou guardado. O aviso aparece em /api/saude.
            pass
    return conteudo, nome, mime


@app.route("/api/propostas/<int:pid>/documento/<formato>", methods=["POST"])
@autenticado
def gerar_documento(pid, formato):
    """(4.1) Enfileira a geração e devolve o id do trabalho."""
    if formato not in ("pptx", "pdf"):
        return jsonify(erro="Formato inválido: %s" % formato), 400
    try:
        p = g.sb.um("propostas", pid)
    except ErroSupabase as exc:
        return jsonify(erro=str(exc)), 502
    if not p:
        return jsonify(erro="Proposta não encontrada (ou sem permissão)."), 404
    if not (p.get("itens") or []):
        return jsonify(erro="Adicione ao menos um posto antes de gerar o "
                            "documento."), 400

    guardar = (request.get_json(silent=True) or {}).get("arquivar", True)
    jid = fila.enfileirar("%s de %s" % (formato.upper(), p.get("numero")),
                          _gerar_e_arquivar, g.token, pid, formato, bool(guardar),
                          dono=g.usuario.get("id"))
    return jsonify(job=jid, descricao="%s de %s" % (formato.upper(), p.get("numero"))), 202


@app.route("/api/documento/job/<jid>")
@autenticado
def estado_job(jid):
    est = fila.estado(jid, dono=g.usuario.get("id"))
    if not est:
        return jsonify(erro="Trabalho não encontrado (ou já expirado)."), 404
    return jsonify(est)


@app.route("/api/documento/job/<jid>/arquivo")
@autenticado
def baixar_job(jid):
    dono = g.usuario.get("id")
    saida = fila.resultado(jid, dono=dono)
    if not saida:
        est = fila.estado(jid, dono=dono) or {}
        return jsonify(erro=est.get("erro") or "Documento ainda não está pronto."), 409
    conteudo, nome, mime = saida
    return Response(conteudo, mimetype=mime, headers={
        "Content-Disposition": 'attachment; filename="%s"' % nome,
        "Content-Length": str(len(conteudo)),
    })


@app.route("/api/propostas/<int:pid>/documentos")
@autenticado
def documentos_arquivados(pid):
    """(4.2) O histórico do que já foi gerado, com link temporário para baixar
    de novo exatamente o arquivo que o cliente recebeu."""
    try:
        regs = g.sb.select("proposta_documentos", propostaId="eq.%s" % pid,
                           ordem="created_at.desc")
        for r in regs:
            try:
                r["url"] = g.sb.storage_url_assinada("propostas", r["caminho"], 900)
            except ErroSupabase:
                r["url"] = None
    except ErroSupabase as exc:
        return jsonify(erro=str(exc)), 502
    return jsonify(documentos=regs)


@app.route("/api/modelos")
@autenticado
def modelos():
    """Os modelos da pasta e, para cada um, os slides que ele deixa desligar.

    `slides` continua saindo porque a tela antiga o consumia; hoje ele é só a
    lista do modelo padrão. Quem manda é `slides_por_modelo`, porque cada
    arquivo tem os seus — trocar de modelo tem que trocar os interruptores.
    """
    disponiveis = documentos.modelos_disponiveis()
    por_modelo = {m: documentos.slides_do_modelo(m) for m in disponiveis}
    padrao = next((m for m in disponiveis if m in por_modelo), "")
    return jsonify(modelos=disponiveis,
                   slides_por_modelo=por_modelo,
                   slides=por_modelo.get(padrao, []))


# ════════════════════════════════════════════════════════════════════════════
# E-MAIL (4.3)
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/propostas/<int:pid>/email", methods=["POST"])
@autenticado
def enviar_proposta(pid):
    corpo_req = request.get_json(silent=True) or {}
    formato = corpo_req.get("formato") or "pdf"
    if formato not in ("pptx", "pdf"):
        return jsonify(erro="Formato inválido."), 400
    if not correio.configurado():
        return jsonify(erro="Envio de e-mail não configurado no servidor "
                            "(falta %s no .env)." % correio.config_faltando()), 503

    try:
        p, ctx, c = documentos.carregar(g.sb, pid)
        p = documentos.garantir_token_aceite(g.sb, p, ctx.get("config"))
        dados = documentos.dados_documento(g.sb, p, ctx, c)
    except documentos.ErroProposta as exc:
        return jsonify(erro=str(exc)), 400
    except ErroSupabase as exc:
        return jsonify(erro=str(exc)), 502

    campos = dados["campos"]
    para = corpo_req.get("para") or campos.get("CONTATO_EMAIL")
    if not correio.valido(para):
        return jsonify(erro="A proposta não tem e-mail de contato. Informe o "
                            "destinatário ou preencha o contato do lead."), 400

    cfg = ctx.get("config") or {}
    assunto = corpo_req.get("assunto") or correio.preencher(
        cfg.get("email_assunto", "Proposta {NUMERO}"), campos)
    texto = corpo_req.get("corpo") or correio.preencher(
        cfg.get("email_corpo", ""), campos)
    if campos.get("LINK_ACEITE") and campos["LINK_ACEITE"] not in texto:
        texto += "\n\nAcompanhe e aceite a proposta em:\n%s\n" % campos["LINK_ACEITE"]

    # Capturado AQUI, e não lá dentro: `g` pertence ao contexto da requisição,
    # e o trabalho roda numa thread da fila, onde `g` já não existe.
    quem_pediu = (g.usuario or {}).get("email")
    lead_id = p.get("leadId")

    def trabalho(token):
        sb = Supabase(token)
        conteudo, nome, mime = documentos.gerar(sb, pid, formato)
        correio.enviar(para, assunto, texto, anexos=[(nome, conteudo, mime)],
                       copia=corpo_req.get("copia"), responder_para=quem_pediu)
        try:
            documentos.arquivar(sb, pid, formato, conteudo, nome, enviado_para=para)
        except ErroSupabase:
            pass
        documentos.registrar_timeline(sb, "Proposta", pid, "email",
                                      "Proposta enviada para %s" % para, assunto,
                                      lead_id=lead_id)
        return conteudo, nome, mime

    jid = fila.enfileirar("E-mail de %s para %s" % (p.get("numero"), para),
                          trabalho, g.token, dono=g.usuario.get("id"))
    return jsonify(job=jid, para=para, assunto=assunto), 202


@app.route("/api/propostas/<int:pid>/previa-email")
@autenticado
def previa_email(pid):
    """Assunto e corpo já preenchidos, para o usuário revisar antes de mandar."""
    try:
        p, ctx, c = documentos.carregar(g.sb, pid)
        dados = documentos.dados_documento(g.sb, p, ctx, c)
    except documentos.ErroProposta as exc:
        return jsonify(erro=str(exc)), 404
    except ErroSupabase as exc:
        return jsonify(erro=str(exc)), 502
    cfg = ctx.get("config") or {}
    campos = dados["campos"]
    return jsonify(
        para=campos.get("CONTATO_EMAIL") or "",
        assunto=correio.preencher(cfg.get("email_assunto", ""), campos),
        corpo=correio.preencher(cfg.get("email_corpo", ""), campos),
        link=campos.get("LINK_ACEITE") or "",
        configurado=correio.configurado(),
        faltando=correio.config_faltando(),
    )


# ════════════════════════════════════════════════════════════════════════════
# PROSPECÇÃO — varrer o Maps, checar na Receita, virar lead
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/prospeccao/estado")
@autenticado
@so_admin
def prospeccao_estado():
    """O que está pronto e o que falta, antes de a pessoa clicar em buscar."""
    return jsonify(
        google=bool(prospeccao.chave_google()),
        termos=prospeccao.TERMOS,
        bloqueio=prospeccao.GRANDES,
        cnaes=prospeccao.CNAES_ALVO,
    )


@app.route("/api/prospeccao/buscar", methods=["POST"])
@autenticado
@so_admin
def prospeccao_buscar():
    """A rodada. Roda na fila porque leva minutos: a Receita é limitada a uma
    consulta a cada 2,5 s, e trinta empresas passam de um minuto só nisso —
    tempo de sobra para o navegador desistir da requisição."""
    corpo = request.get_json(silent=True) or {}
    regiao = (corpo.get("regiao") or "").strip()
    if not regiao:
        return jsonify(erro="Informe a cidade ou região."), 400
    termos = [t for t in (corpo.get("termos") or prospeccao.TERMOS) if str(t).strip()]
    maximo = max(1, min(int(corpo.get("maximo") or 20), 20))
    enriquecer = corpo.get("enriquecer", True)
    bloqueio = corpo.get("bloqueio") or []

    def trabalho(_token):
        return prospeccao.rodar(regiao, termos, maximo, enriquecer, bloqueio)

    jid = fila.enfileirar("Prospecção em %s" % regiao, trabalho, g.token,
                          dono=g.usuario.get("id"))
    return jsonify(job=jid, regiao=regiao, termos=len(termos)), 202


@app.route("/api/prospeccao/lote", methods=["POST"])
@autenticado
@so_admin
def prospeccao_lote():
    """Triagem de uma lista colada. Não depende de API paga nenhuma."""
    corpo = request.get_json(silent=True) or {}
    linhas = [l for l in (corpo.get("linhas") or []) if str(l).strip()]
    if not linhas:
        return jsonify(erro="Cole ao menos uma linha."), 400
    bloqueio = corpo.get("bloqueio") or []

    def trabalho(_token):
        return prospeccao.rodar_lote(linhas, bloqueio)

    jid = fila.enfileirar("Triagem de %d empresa(s)" % len(linhas), trabalho,
                          g.token, dono=g.usuario.get("id"))
    return jsonify(job=jid, linhas=len(linhas)), 202


@app.route("/api/prospeccao/cnpj/<cnpj>")
@autenticado
@so_admin
def prospeccao_cnpj(cnpj):
    """Consulta avulsa — serve para a lista manual, sem depender do Google."""
    return jsonify(prospeccao.consultar_cnpj(cnpj))


@app.route("/api/prospeccao/importar", methods=["POST"])
@autenticado
@so_admin
def prospeccao_importar():
    """Vira lead. Deduplica por CNPJ e, sem CNPJ, por nome — importar a mesma
    empresa duas vezes é o jeito mais rápido de dois vendedores ligarem para o
    mesmo cliente na mesma semana."""
    corpo = request.get_json(silent=True) or {}
    escolhidos = corpo.get("candidatos") or []
    if not escolhidos:
        return jsonify(erro="Nenhuma empresa selecionada."), 400
    try:
        existentes = g.sb.select("leads", "id,empresa,cnpj")
    except ErroSupabase as exc:
        return jsonify(erro=str(exc)), 502
    por_cnpj = {prospeccao._digitos(l.get("cnpj")): l for l in existentes if l.get("cnpj")}
    por_nome = {prospeccao._sem_acento(l.get("empresa")): l for l in existentes}

    criados, repetidos, falhas = [], [], []
    for c in escolhidos:
        rf = c.get("rf") or {}
        cnpj = prospeccao._digitos(c.get("cnpj_site") or rf.get("cnpj") or "")
        nome = rf.get("razao_social") or c.get("nome") or ""
        if (cnpj and cnpj in por_cnpj) or prospeccao._sem_acento(nome) in por_nome:
            repetidos.append(nome)
            continue
        emails = c.get("emails") or []
        telefones = c.get("telefones") or []
        # As redes viram texto na observação: o schema de leads não tem coluna
        # para elas, e criar cinco colunas para um dado que ninguém filtra
        # seria pior do que a linha de texto que o vendedor lê antes de ligar.
        redes = c.get("redes") or {}
        extra = []
        if redes:
            extra.append("redes: " + ", ".join("%s/%s" % kv for kv in sorted(redes.items())))
        if len(emails) > 1:
            extra.append("outros e-mails: " + ", ".join(emails[1:4]))
        if telefones:
            extra.append("outros telefones: " + ", ".join(telefones[:3]))
        novo = {
            "empresa": nome,
            "cnpj": cnpj or None,
            "endereco": c.get("endereco") or rf.get("municipio") or "",
            "cidade": rf.get("municipio") or "",
            "uf": rf.get("uf") or "",
            "site": c.get("site") or "",
            "contato_email": (emails[0] if emails else rf.get("email_rf") or ""),
            "contato_telefone": (c.get("telefone") or (telefones[0] if telefones else "")
                                 or rf.get("telefone_rf") or ""),
            "contato_telefone2": (telefones[1] if len(telefones) > 1 else ""),
            "origem": "Prospecção",
            "obs": " · ".join((c.get("sinais") or []) + extra),
            "owner_id": g.usuario.get("id"),
        }
        try:
            # A linha gravada volta inteira porque a tela a empurra direto na
            # memória: a lista de leads é paginada, e recarregar a tabela
            # perderia as páginas que o usuário já trouxe.
            linha = g.sb.insert("leads", novo)
            criados.append(linha or novo)
            if cnpj:
                por_cnpj[cnpj] = novo
            por_nome[prospeccao._sem_acento(nome)] = novo
        except ErroSupabase as exc:
            falhas.append("%s: %s" % (nome, str(exc)[:90]))
    return jsonify(criados=criados, repetidos=repetidos, falhas=falhas)


# ════════════════════════════════════════════════════════════════════════════
# LINK PÚBLICO DE ACEITE (4.4)
# ════════════════════════════════════════════════════════════════════════════

def _ip():
    return (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip()


def _proposta_por_token(sb, token):
    linhas = sb.select("propostas", aceite_token="eq.%s" % token, limite=1)
    return linhas[0] if linhas else None


@app.route("/p/<token>")
def pagina_aceite(token):
    sb = _sb_publico()
    if not sb:
        return _pagina("Link indisponível",
                       "<p>O link público não está habilitado neste servidor.</p>"), 503
    # Desligado em Configurações, a rota fecha junto. Esconder o link na tela e
    # deixar a porta aberta não desliga nada: o token está no banco e a URL é
    # adivinhável por quem já recebeu uma proposta antes.
    try:
        cfg = {c["chave"]: c["valor"] for c in sb.select("configuracoes", "chave,valor")}
    except ErroSupabase:
        cfg = {}
    if not documentos.aceite_ligado(cfg):
        return _pagina("Link indisponível",
                       "<p>O aceite pelo link está desligado neste sistema. "
                       "Fale com quem enviou a proposta.</p>"), 503
    try:
        p = _proposta_por_token(sb, token)
    except ErroSupabase:
        p = None
    if not p:
        return _pagina("Proposta não encontrada",
                       "<p>Este link não é válido ou foi revogado.</p>"), 404

    # Rastreio de abertura: primeira vez marca a data, as demais só contam.
    try:
        sb.update("propostas", {
            "aberturas": (p.get("aberturas") or 0) + 1,
            "aberta_em": p.get("aberta_em") or _dt.datetime.now(_dt.timezone.utc).isoformat(),
        }, retornar=False, id="eq.%s" % p["id"])
        if not p.get("aberta_em"):
            documentos.registrar_timeline(sb, "Proposta", p["id"], "abertura",
                                          "Cliente abriu a proposta pelo link",
                                          _ip(), lead_id=p.get("leadId"))
    except ErroSupabase:
        pass

    try:
        ctx = documentos.montar_contexto(sb, p)
        c = calculo.calc_proposta(p, ctx)
        dados = documentos.dados_documento(sb, p, ctx, c)
    except (documentos.ErroProposta, ErroSupabase) as exc:
        return _pagina("Proposta indisponível", "<p>%s</p>" % html.escape(str(exc))), 500

    campos = dados["campos"]
    e = html.escape
    ja = p.get("aceite_em")
    linhas = "".join(
        "<tr><td>%s</td><td>%s</td><td class='n'>%s</td></tr>"
        % (e(x["qtd"]), e(x["cargo"].replace("\n", " — ")), e(x["valor_mensal"]))
        for x in dados["postos"])

    corpo = """
      <p class="lead">%(cliente)s</p>
      <h1>Proposta %(numero)s</h1>
      <p class="sub">Emitida por %(empresa)s · válida até %(validade)s</p>
      <div class="box">
        <div class="k">Valor mensal</div><div class="v">%(mensal)s</div>
        <div class="k2">Implantação: %(implantacao)s · Contrato de %(prazo)s meses:
          %(contrato)s</div>
      </div>
      <h2>Equipe dimensionada</h2>
      <table><thead><tr><th>Qtd</th><th>Cargo</th><th class="n">Mensal</th></tr></thead>
      <tbody>%(linhas)s</tbody>
      <tfoot><tr><th></th><th>Total mensal</th><th class="n">%(mensal)s</th></tr></tfoot>
      </table>
      <h2>Escopo</h2><p class="just">%(escopo)s</p>
      <p><a class="btn2" href="/p/%(token)s/documento.pdf">Baixar a proposta em PDF</a></p>
      %(aceite)s
    """ % {
        "cliente": e(campos["CLIENTE"]), "numero": e(campos["NUMERO"]),
        "empresa": e(campos["EMPRESA_NOME"]), "validade": e(str(campos["VALIDA_ATE"])),
        "mensal": e(campos["VALOR_MENSAL_TOTAL"]),
        "implantacao": e(campos["VALOR_IMPLANTACAO"]),
        "prazo": e(str(campos["PRAZO"])), "contrato": e(campos["VALOR_CONTRATO"]),
        "linhas": linhas, "escopo": e(campos["ESCOPO"]), "token": e(token),
        "aceite": ("<div class='ok'>Proposta aceita em %s por %s.</div>"
                   % (e(documentos._data(ja[:10])), e(p.get("aceite_nome") or "—")))
        if ja else """
      <form class="aceite" method="post" action="/p/%s/aceitar">
        <h2>Aceitar esta proposta</h2>
        <label>Seu nome completo</label>
        <input name="nome" required maxlength="120" placeholder="Nome de quem aprova">
        <button type="submit">Aceito esta proposta</button>
        <p class="fine">O aceite registra data, hora e o nome informado, e avisa
          a equipe comercial. Não substitui a assinatura do contrato.</p>
      </form>""" % e(token),
    }
    return _pagina("Proposta %s" % campos["NUMERO"], corpo)


@app.route("/p/<token>/aceitar", methods=["POST"])
def aceitar(token):
    sb = _sb_publico()
    if not sb:
        return _pagina("Link indisponível", "<p>Recurso não habilitado.</p>"), 503
    p = _proposta_por_token(sb, token)
    if not p:
        return _pagina("Proposta não encontrada", "<p>Link inválido.</p>"), 404
    if p.get("aceite_em"):
        return _pagina("Já registrado",
                       "<p>Esta proposta já constava como aceita.</p>")

    nome = (request.form.get("nome") or "").strip()[:120]
    if not nome:
        return _pagina("Falta o nome",
                       "<p>Informe o nome de quem está aprovando e tente de novo.</p>"), 400
    agora = _dt.datetime.now(_dt.timezone.utc).isoformat()
    try:
        sb.update("propostas", {"aceite_em": agora, "aceite_nome": nome,
                                "aceite_ip": _ip(), "status": "Aprovada"},
                  retornar=False, id="eq.%s" % p["id"])
        documentos.registrar_timeline(sb, "Proposta", p["id"], "aceite",
                                      "Proposta aceita por %s" % nome, _ip(),
                                      lead_id=p.get("leadId"))
    except ErroSupabase as exc:
        return _pagina("Não foi possível registrar",
                       "<p>%s</p>" % html.escape(str(exc))), 502
    return _pagina("Aceite registrado", """
      <h1>Obrigado!</h1>
      <p>O aceite da proposta %s foi registrado em nome de <b>%s</b>.</p>
      <p>A equipe comercial foi avisada e entrará em contato para os próximos
         passos.</p>""" % (html.escape(p.get("numero") or ""), html.escape(nome)))


@app.route("/p/<token>/documento.pdf")
def pdf_publico(token):
    sb = _sb_publico()
    if not sb:
        return ("Recurso não habilitado.", 503)
    p = _proposta_por_token(sb, token)
    if not p:
        return ("Link inválido.", 404)
    try:
        conteudo, nome, mime = documentos.gerar(sb, p["id"], "pdf")
    except (documentos.ErroProposta, ErroSupabase) as exc:
        return (str(exc), 500)
    return Response(conteudo, mimetype=mime, headers={
        "Content-Disposition": 'inline; filename="%s"' % nome})


def _pagina(titulo, corpo):
    """Página pública mínima. Ela é vista por gente de fora, então não carrega
    o app: é HTML e um bloco de CSS, na mesma paleta do CRM."""
    return Response("""<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title><style>
:root{--bg:#04032A;--card:#0A0838;--b:#252271;--t:#F7F3FF;--m:#A9A4DA;--a:#0A4AC9}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--t);font:15px/1.6 'Segoe UI',system-ui,sans-serif;
 padding:40px 20px;display:flex;justify-content:center}
.w{width:100%%;max-width:720px}
h1{font-size:30px;letter-spacing:-.02em;margin:2px 0 6px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.09em;color:var(--m);
 margin:28px 0 10px;font-weight:600}
.lead{color:var(--m);font-size:13px;text-transform:uppercase;letter-spacing:.09em}
.sub{color:var(--m);font-size:13.5px}
.box{background:linear-gradient(180deg,#0A4AC9,#02006F);border-radius:12px;
 padding:20px 22px;margin:22px 0}
.box .k{font-size:11px;text-transform:uppercase;letter-spacing:.09em;opacity:.75}
.box .v{font-size:34px;font-weight:700;letter-spacing:-.03em}
.box .k2{font-size:13px;opacity:.8;margin-top:6px}
table{width:100%%;border-collapse:collapse;background:var(--card);border-radius:10px;
 overflow:hidden}
th,td{padding:10px 14px;border-bottom:1px solid var(--b);text-align:left;font-size:14px}
th{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--m)}
.n{text-align:right;font-variant-numeric:tabular-nums}
tfoot th{color:var(--t);font-size:14px;text-transform:none;letter-spacing:0}
.just{text-align:justify;color:var(--m)}
.aceite{background:var(--card);border:1px solid var(--b);border-radius:12px;
 padding:22px;margin-top:28px}
label{display:block;font-size:12px;color:var(--m);margin-bottom:6px}
input{width:100%%;height:44px;border-radius:9px;border:1px solid var(--b);
 background:#111048;color:var(--t);padding:0 12px;font-size:15px}
button{margin-top:14px;width:100%%;height:46px;border:none;border-radius:9px;
 background:linear-gradient(180deg,#0A4AC9,#052A88);color:#F7F3FF;font-size:15px;
 font-weight:700;cursor:pointer}
.btn2{display:inline-block;margin-top:8px;padding:11px 18px;border-radius:9px;
 border:1px solid var(--b);color:var(--t);text-decoration:none;font-weight:600}
.fine{font-size:12px;color:var(--m);margin-top:12px}
.ok{background:#171566;border:1px solid #2E2B8C;border-radius:10px;padding:16px;
 margin-top:26px;font-weight:600}
</style></head><body><div class="w">%s</div></body></html>""" % (html.escape(titulo), corpo),
                    mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════════════════════════════════════════

@app.errorhandler(404)
def nao_encontrado(_):
    if request.path.startswith("/api/"):
        return jsonify(erro="Rota não encontrada."), 404
    return _pagina("Não encontrado", "<h1>404</h1><p>Página não encontrada.</p>"), 404


@app.errorhandler(500)
def erro_interno(exc):
    app.logger.exception("Erro não tratado")
    if request.path.startswith("/api/"):
        return jsonify(erro="Erro interno do servidor."), 500
    return _pagina("Erro", "<h1>500</h1><p>Erro interno.</p>"), 500


def _servir():
    """Waitress quando existir (5.5), o servidor do Flask como último recurso.

    O servidor embutido do Werkzeug avisa em toda inicialização que não é para
    produção — e ele está certo: uma requisição por vez, sem limite de fila,
    sem timeout. Waitress é WSGI puro, funciona no Windows e resolve isso com
    uma linha.
    """
    if DEBUG:
        app.logger.warning("FLASK_DEBUG ligado — não use assim em rede.")
        app.run(debug=True, port=PORTA, threaded=True)
        return
    try:
        from waitress import serve
    except ImportError:
        app.logger.warning(
            "Waitress não instalado (pip install waitress). Subindo com o "
            "servidor de desenvolvimento do Flask.")
        app.run(debug=False, port=PORTA, threaded=True)
        return
    endereco = os.environ.get("HOST", "127.0.0.1")
    # O log dizia 127.0.0.1 mesmo escutando em 0.0.0.0 — e é justamente em
    # produção, atrás de proxy, que ler "só esta máquina" faz alguém procurar
    # defeito onde não há.
    print("Mizys CRM escutando em %s:%d%s" % (endereco, PORTA,
          "" if endereco != "0.0.0.0" else "  (todas as interfaces)"))
    serve(app, host=endereco, port=PORTA, threads=8)


if __name__ == "__main__":
    _servir()
