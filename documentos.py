"""
Da proposta gravada ao arquivo entregue.

Aqui mora a virada do item 4.1 do plano: o servidor NÃO recebe mais o cálculo
pronto do navegador. Ele recebe um id, lê a proposta do Supabase com o token de
quem pediu (a RLS continua valendo), calcula com calculo.py e preenche o modelo.

Consequências diretas:
  · o documento não depende do que o navegador mandou (P4);
  · a mesma conta serve para a tela, o PDF, o e-mail e o link de aceite;
  · dá para gerar em lote, agendado ou por um link público, sem navegador nenhum.

E o congelamento (P3): assim que a proposta sai de Rascunho, `snapshot` guarda
salários, benefícios, encargos, escalas e turnos como estavam naquele instante.
Reajuste de CCT em janeiro não muda mais o valor de uma proposta enviada em
julho — ela vira um documento, não uma consulta.
"""
from __future__ import annotations

import copy
import datetime as _dt
import os
import re
import secrets
import unicodedata as _ud

import calculo
import ppt
from supa import ErroSupabase, Supabase

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]

# Enquanto está aqui, ainda dá para mexer à vontade. Fora daqui, congela.
STATUS_RASCUNHO = "Rascunho"

# A redação que o modelo de facilities traz de fábrica. Ela só aparece enquanto
# Configurações → Empresa estiver em branco: qualquer texto lá substitui esta.
# Existe porque um slide de missão vazio é pior do que um genérico — e porque a
# substituição de {CHAVE} é cega, ela apagaria o texto do modelo.
MISSAO_PADRAO = ("Tornar ambientes e rotinas mais seguros, agradáveis e "
                 "eficientes, para que as pessoas possam viver e trabalhar "
                 "com mais qualidade.")
VISAO_PADRAO = ("Buscar continuamente a excelência na capacitação das equipes, "
                "na gestão de processos e no uso de novas tecnologias.")


class ErroProposta(Exception):
    """Falha explicável ao montar ou gerar o documento de uma proposta."""


# ── datas e textos ───────────────────────────────────────────────────────────

def _data(iso, padrao="—"):
    if not iso:
        return padrao
    try:
        d = _dt.date.fromisoformat(str(iso)[:10])
        return d.strftime("%d/%m/%Y")
    except ValueError:
        return padrao


def _data_extenso(iso, cidade=""):
    try:
        d = _dt.date.fromisoformat(str(iso)[:10])
    except (ValueError, TypeError):
        d = _dt.date.today()
    txt = "%d de %s de %d" % (d.day, MESES[d.month - 1], d.year)
    return ("%s, %s" % (cidade, txt)) if cidade else txt


def _mais_dias(iso, dias):
    try:
        d = _dt.date.fromisoformat(str(iso)[:10])
    except (ValueError, TypeError):
        d = _dt.date.today()
    return (d + _dt.timedelta(days=int(dias or 0))).strftime("%d/%m/%Y")


def _por_id(linhas):
    return {str(x["id"]): x for x in (linhas or [])}


# ── contexto: ou a CCT viva, ou o snapshot ───────────────────────────────────

def montar_contexto(sb: Supabase, proposta: dict) -> dict:
    """Tudo o que o cálculo precisa, na versão certa.

    Proposta congelada lê o snapshot. Proposta em rascunho lê o banco.
    """
    snap = proposta.get("snapshot")
    if snap and snap.get("cargos") is not None:
        return {
            "cargos": snap.get("cargos") or {},
            "beneficios": snap.get("beneficios") or {},
            "escalas": snap.get("escalas") or {},
            "turnos": snap.get("turnos") or {},
            "equipamentos": snap.get("equipamentos") or {},
            "materiais": snap.get("materiais") or {},
            "cct": snap.get("cct") or {},
            "config": snap.get("config") or {},
            "congelado": True,
            "congelado_em": snap.get("em"),
        }

    cct_id = proposta.get("cctId")
    cfg = {c["chave"]: c["valor"] for c in sb.select("configuracoes", "chave,valor")}
    cct = sb.um("ccts", cct_id) if cct_id else None
    # Cargos e benefícios de TODAS as convenções: um contrato de facilities
    # mistura categorias (portaria pelo asseio, vigilância pela CCT dela), e
    # cada posto aponta para a sua em `item["cctId"]`. A convenção da proposta
    # é só o padrão de quem não escolheu.
    return {
        "cargos": _por_id(sb.select("cct_cargos")),
        "beneficios": _por_id(sb.select("cct_beneficios")),
        "escalas": _por_id(sb.select("escalas")),
        "turnos": _por_id(sb.select("turnos")),
        "equipamentos": _por_id(sb.select("equipamentos")),
        "materiais": _por_id(sb.select("materiais")),
        "ccts": _por_id(sb.select("ccts")),
        "cct": cct or {},
        "config": cfg,
        "congelado": False,
        "congelado_em": None,
    }


def montar_snapshot(sb: Supabase, proposta: dict) -> dict:
    """Fotografa só o que esta proposta usa — nada de copiar a CCT inteira."""
    ctx = montar_contexto(sb, dict(proposta, snapshot=None))
    itens = proposta.get("itens") or []
    equips = proposta.get("equipamentos") or []
    mats = proposta.get("materiais") or []

    ids_cargo = {str(i.get("cargoId")) for i in itens}
    ids_esc = {str(i.get("escalaId")) for i in itens}
    ids_tur = {str(i.get("turnoId")) for i in itens}
    ids_ben = {str(b) for i in itens for b in (i.get("beneficios") or [])}
    ids_eq = {str(e.get("id")) for e in equips}
    ids_mat = {str(m.get("id")) for m in mats}

    def recorte(d, ids):
        # deepcopy porque snapshot é FOTOGRAFIA: se guardasse a referência, um
        # reajuste na CCT alteraria o próprio congelamento — que é exatamente o
        # que ele existe para impedir. No banco isso é resolvido pelo jsonb;
        # aqui em memória, não seria.
        return {k: copy.deepcopy(v) for k, v in d.items() if k in ids}

    return {
        "em": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "versao_motor": 2,
        "cct": copy.deepcopy(ctx["cct"]),
        "cargos": recorte(ctx["cargos"], ids_cargo),
        "beneficios": recorte(ctx["beneficios"], ids_ben),
        "escalas": recorte(ctx["escalas"], ids_esc),
        "turnos": recorte(ctx["turnos"], ids_tur),
        "equipamentos": recorte(ctx["equipamentos"], ids_eq),
        "materiais": recorte(ctx["materiais"], ids_mat),
        "config": copy.deepcopy(ctx["config"]),
        "parametros": {k: proposta.get(k) for k in
                       ("encargos", "markup", "margem_alvo", "imposto",
                        "desconto", "prazo", "validade")},
    }


def congelar(sb: Supabase, proposta_id, refazer=False) -> dict:
    """Grava o snapshot. Idempotente: já congelada, não mexe (salvo `refazer`)."""
    p = sb.um("propostas", proposta_id)
    if not p:
        raise ErroProposta("Proposta %s não encontrada." % proposta_id)
    if p.get("snapshot") and not refazer:
        return p
    snap = montar_snapshot(sb, p)
    return sb.update("propostas", {
        "snapshot": snap,
        "congelada_em": snap["em"],
    }, id="eq.%s" % proposta_id)


def descongelar(sb: Supabase, proposta_id) -> dict:
    """Volta a proposta a acompanhar a CCT viva. Só faz sentido em rascunho."""
    return sb.update("propostas", {"snapshot": None, "congelada_em": None},
                     id="eq.%s" % proposta_id)


def carregar(sb: Supabase, proposta_id):
    """(proposta, contexto, cálculo) — o trio que todo mundo aqui precisa."""
    p = sb.um("propostas", proposta_id)
    if not p:
        raise ErroProposta("Proposta %s não encontrada (ou sem permissão)." % proposta_id)
    ctx = montar_contexto(sb, p)
    c = calculo.calc_proposta(p, ctx)
    return p, ctx, c


# ── o dicionário que o modelo de PPT consome ─────────────────────────────────

def dados_documento(sb: Supabase, proposta: dict, ctx: dict, c: dict) -> dict:
    cfg = ctx.get("config") or {}
    cct = ctx.get("cct") or {}
    lead = sb.um("leads", proposta["leadId"]) if proposta.get("leadId") else None
    contato = sb.um("contatos", proposta["contatoId"]) if proposta.get("contatoId") else None

    money = calculo.money
    vig = " a ".join(x for x in (_data(cct.get("vigencia_inicio"), ""),
                                 _data(cct.get("vigencia_fim"), "")) if x) or "—"

    def rot_adic(ci):
        partes = ["%s %s%%" % (a["cod"], _n(a["pct"])) for a in ci["adics"]]
        if ci["valor_noturno_c"] > 0:
            partes.append("Noturno %s%%" % _n(ci["pct_noturno"]))
        return " + ".join(partes) or "—"

    campos = {
        "EMPRESA_FANTASIA": cfg.get("empresa_fantasia", ""),
        "EMPRESA_NOME": cfg.get("empresa_nome", ""),
        "EMPRESA_CNPJ": cfg.get("empresa_cnpj", ""),
        "EMPRESA_TELEFONE": cfg.get("empresa_telefone", ""),
        "EMPRESA_EMAIL": cfg.get("empresa_email", ""),
        "EMPRESA_SITE": cfg.get("empresa_site", ""),
        "EMPRESA_ENDERECO": cfg.get("empresa_endereco", ""),
        "EMPRESA_WHATSAPP": cfg.get("empresa_whatsapp") or cfg.get("empresa_telefone", ""),
        # Institucionais do modelo de facilities. Vazios, o slide "Quem somos"
        # imprimiria "Desde  , atuamos..." — por isso caem num travessão.
        "EMPRESA_ANO": cfg.get("empresa_ano") or "—",
        "EMPRESA_COLABORADORES": cfg.get("empresa_colaboradores") or "—",
        "EMPRESA_CLIENTES": cfg.get("empresa_clientes") or "—",
        "EMPRESA_CERTIFICACOES": cfg.get("empresa_certificacoes") or "—",
        # Missão, visão e valores em branco NÃO viram texto vazio: o modelo já
        # traz uma redação padrão, e apagá-la deixaria o slide oco. Quem
        # preenche Configurações → Empresa manda; quem não preenche fica com a
        # do modelo (veja modelo_ppt/preparar_modelo.py).
        "MISSAO": cfg.get("empresa_missao") or MISSAO_PADRAO,
        "VISAO": cfg.get("empresa_visao") or VISAO_PADRAO,
        "VALORES": "\n".join(s.strip() for s in
                             (cfg.get("empresa_valores", "") or "").split(";") if s.strip()),
        "SEGMENTO": cfg.get("segmento", ""),
        "NUMERO": proposta.get("numero", ""),
        "VERSAO": proposta.get("versao", 1),
        # O responsável pela proposta, que assina a carta de apresentação.
        "VENDEDOR": proposta.get("owner") or cfg.get("empresa_fantasia", ""),
        "VENDEDOR_CARGO": cfg.get("vendedor_cargo") or "Consultor comercial",
        "DATA": _data(proposta.get("emissao")),
        "DATA_EXTENSO": _data_extenso(proposta.get("emissao"), cfg.get("empresa_cidade", "")),
        "CLIENTE": (lead or {}).get("empresa") or "—",
        "CNPJ": (lead or {}).get("cnpj") or "—",
        "ENDERECO": (lead or {}).get("endereco") or "—",
        "CIDADE_UF": "/".join(x for x in ((lead or {}).get("cidade"),
                                          (lead or {}).get("uf")) if x) or "—",
        "CONTATO": (contato or {}).get("nome") or (lead or {}).get("contato_nome") or "A definir",
        "CONTATO_CARGO": (contato or {}).get("cargo") or (lead or {}).get("contato_cargo") or "",
        "CONTATO_EMAIL": (contato or {}).get("email") or (lead or {}).get("contato_email") or "",
        "CONTATO_TELEFONE": (contato or {}).get("telefone") or (lead or {}).get("contato_telefone") or "",
        "CCT": cct.get("nome") or "—",
        "CCT_SINDICATO": cct.get("sindicato") or "—",
        "CCT_VIGENCIA": vig,
        "ESCOPO": proposta.get("escopo") or "—",
        "OBS": proposta.get("obs") or "—",
        "VALIDADE": proposta.get("validade"),
        "VALIDA_ATE": _mais_dias(proposta.get("emissao"), proposta.get("validade")),
        "PRAZO": proposta.get("prazo"),
        # O efetivo, não o campo cru: `encargos` nasce vazio na proposta e quem
        # monta o submódulo 2.2 é o regime tributário. Lendo o campo, o
        # documento saía dizendo "encargos de 0%" para o cliente.
        "ENCARGOS": _n((c.get("par") or {}).get("enc_pct", proposta.get("encargos"))),
        "DESCONTO": _n(proposta.get("desconto")),
        "TOTAL_POSTOS": c["postos"],
        "TOTAL_FUNCIONARIOS": _n(round(c["func"], 2)),
        # Preço de venda — o custo não sai daqui (P2).
        "TOTAL_MAO_DE_OBRA": money(c["preco_mo_c"]),
        "TOTAL_EQUIPAMENTOS": money(c["preco_equip_c"]),
        "SUBTOTAL_MENSAL": money(c["preco_bruto_c"]),
        "VALOR_DESCONTO": money(c["desconto_c"]),
        "VALOR_MENSAL_TOTAL": money(c["mensal_c"]),
        "VALOR_IMPLANTACAO": money(c["implantacao_c"]),
        "TOTAL_IMPLANTACAO": money(c["implantacao_c"]),
        "VALOR_CONTRATO": money(c["contrato_c"]),
        "PRIMEIRO_PAGAMENTO": money(c["total_primeiro_c"]),
        # Mantido por compatibilidade com modelos antigos; não é mais impresso
        # no resumo, porque o markup não aparecia em linha nenhuma (P1).
        "VALOR_IMPOSTOS": money(c["imposto_c"]),
        "LINK_ACEITE": link_aceite(proposta, cfg),
    }

    postos = [{
        "qtd": str(ci["postos"]),
        # Postos e funcionários não são a mesma conta: um posto 12x36 precisa
        # de mais de um funcionário para cobrir a escala, e é essa diferença
        # que explica o preço unitário para o cliente.
        "qtd_func": _n(round(ci["func"], 2)),
        # A observação do posto entra como segunda linha da célula do cargo —
        # o campo existia no schema desde sempre e não aparecia em lugar
        # nenhum (P9.8). Sem observação, a célula continua com uma linha só.
        "cargo": ci["cargo"].get("nome", "") + ("\n" + ci["obs"] if ci.get("obs") else ""),
        "escala_turno": " · ".join(x for x in (
            (ci["escala"] or {}).get("nome"), (ci["turno"] or {}).get("nome")) if x) or "—",
        "adicionais": rot_adic(ci),
        "obs": ci.get("obs") or "",
        "valor_unitario": money(ci["preco_unit_c"]),
        "valor_mensal": money(ci["preco_c"]),
    } for ci in c["itens"]]

    equipamentos = [{
        "qtd": str(e["qtd"]),
        "nome": e["eq"].get("nome", ""),
        "marca": e["eq"].get("marca_modelo") or "—",
        "tipo": "Implantação" if e["unico"] else "Mensal",
        "valor": money(e["preco_unit_c"]),
        "total": money(e["preco_c"]),
    } for e in c["equipamentos"]]

    # ── MÓDULO 5 no documento ───────────────────────────────────────────────
    # Os insumos entram na MESMA tabela dos equipamentos, e não numa coluna
    # própria, por um motivo aritmético: o slide de resumo imprime
    #
    #     TOTAL_MAO_DE_OBRA + TOTAL_EQUIPAMENTOS = SUBTOTAL_MENSAL
    #
    # Uma terceira fatia de preço sem uma terceira linha no slide faria a
    # coluna parar de fechar — que é exatamente o P1 que já foi corrigido uma
    # vez. Aqui o material soma dentro de TOTAL_EQUIPAMENTOS e a conta continua
    # exata. Quem quiser separar no modelo tem TOTAL_MATERIAIS pronto.
    #
    # O rótulo do tipo diz o prazo de troca porque "uniforme R$ 31,67" sem o
    # "a cada 6 meses" parece barato demais e vira pergunta na reunião.
    def _prazo(m):
        if m["meses"] <= 1:
            return "Mensal"
        if m["meses"] == 12:
            return "Insumo · anual"
        return "Insumo · a cada %d meses" % m["meses"]

    materiais = [{
        "qtd": _n(m["qtd"]),
        "nome": m["mat"].get("nome", ""),
        "marca": calculo.MAT_BASES.get(m["base"], ""),
        "tipo": _prazo(m),
        "valor": money(m["preco_unit_c"]),
        "total": money(m["preco_c"]),
    } for m in c["materiais"]]

    equipamentos = equipamentos + materiais
    campos["TOTAL_MATERIAIS"] = money(c["preco_mat_c"])
    campos["TOTAL_EQUIPAMENTOS"] = money(c["preco_equip_c"] + c["preco_mat_c"])

    # ── Benefícios da convenção, um a um ────────────────────────────────────
    # Eles saíam escondidos dentro do valor do posto, que é justamente onde o
    # cliente desconfia: "por que um servente custa isso?". Vale-refeição,
    # cesta e assistência são obrigação da CCT, não margem — e mostrar linha a
    # linha muda a conversa de preço para conformidade.
    #
    # A lista é a UNIÃO dos benefícios de todos os postos, sem repetir: o mesmo
    # vale-refeição aparece uma vez, ainda que esteja em cinco postos.
    # Quando a proposta mistura convenções, o nome do benefício sozinho engana:
    # "cesta básica" aparece duas vezes com valores diferentes e o cliente não
    # sabe qual é qual. Com mais de uma CCT, cada linha diz de onde vem.
    ccts_usadas = {(ci.get("cct") or {}).get("nome") for ci in c["itens"]}
    ccts_usadas.discard(None)
    varias = len(ccts_usadas) > 1

    vistos, beneficios, total_ben_c = set(), [], 0
    for ci in c["itens"]:
        origem = (ci.get("cct") or {}).get("nome") or ""
        for b in ci.get("beneficios") or []:
            chave = (b["nome"], origem)
            if chave in vistos:
                continue
            vistos.add(chave)
            if b.get("unid") == "dia" and b.get("dias"):
                por_dia = calculo.arred(b["valor_c"] / b["dias"])
                dias_txt = ("%g" % round(b["dias"], 1)).replace(".", ",")
                base = "%s × %s dias" % (money(por_dia), dias_txt)
            else:
                base = "por mês"
            nome = b["nome"]
            if varias and origem:
                # só a sigla do sindicato, senão a célula estoura
                partes = origem.split()
                if len(partes) > 1:
                    nome = "%s · %s" % (nome, partes[1])
            beneficios.append({
                "nome": nome, "base": base,
                "valor": money(b["valor_c"]),
                "desconto": money(b["desconto_c"]) if b["desconto_c"] else "—",
                "custo": money(b["custo_c"]),
            })
            total_ben_c += b["custo_c"]
    campos["TOTAL_BENEFICIOS"] = money(total_ben_c)

    # ── Salários e benefícios, uma linha por cargo ──────────────────────────
    # O modelo de facilities pede este quadro com colunas fixas: salário,
    # adicionais, vale-refeição, cesta, assistência e sindicato. Os benefícios
    # da CCT têm nome livre, então o encaixe é por palavra-chave.
    #
    # Benefício que não cai em nenhuma coluna (vale-transporte é o caso comum)
    # **continua somando no preço** — ele entra pelo custo do posto, como
    # sempre. Só não ganha coluna própria neste quadro, porque quem decidiu as
    # colunas foi o desenho do modelo. Se algum dia precisar aparecer, é
    # acrescentar a coluna no modelo e uma chave aqui.
    def _casa(nome, *palavras):
        n = _sem_acento(nome).lower()
        return any(p in n for p in palavras)

    salarios = []
    for ci in c["itens"]:
        baldes = {"refeicao": 0, "cesta": 0, "saude": 0, "sindicato": 0}
        for b in ci.get("beneficios") or []:
            nome = b.get("nome") or ""
            if _casa(nome, "refeic", "aliment"):
                baldes["refeicao"] += b["valor_c"]
            elif _casa(nome, "cesta"):
                baldes["cesta"] += b["valor_c"]
            elif _casa(nome, "medic", "odont", "saude", "farmac"):
                baldes["saude"] += b["valor_c"]
            elif _casa(nome, "sindic", "assistencial", "confederativ"):
                baldes["sindicato"] += b["valor_c"]
        salarios.append({
            "cargo": ci["cargo"].get("nome", ""),
            "salario": money(ci["base_c"]),
            "adicionais": money(ci["valor_adic_c"] + ci["valor_noturno_c"])
                          if (ci["valor_adic_c"] + ci["valor_noturno_c"]) else "—",
            "refeicao": money(baldes["refeicao"]) if baldes["refeicao"] else "—",
            "cesta": money(baldes["cesta"]) if baldes["cesta"] else "—",
            "saude": money(baldes["saude"]) if baldes["saude"] else "—",
            "sindicato": money(baldes["sindicato"]) if baldes["sindicato"] else "—",
        })

    return {
        "arquivo": _nome_arquivo(proposta, lead),
        "modelo": proposta.get("modelo_ppt") or cfg.get("ppt_modelo") or "mizys_proposta.pptx",
        "slides": proposta.get("slides") or {},
        "campos": campos,
        "postos": postos,
        "equipamentos": equipamentos,
        "materiais": materiais,
        "beneficios": beneficios,
        "salarios": salarios,
        "tem_equipamentos": bool(equipamentos),
        "tem_materiais": bool(materiais),
        "tem_beneficios": bool(beneficios),
    }


def _sem_acento(texto):
    """"Vale-refeição" e "Vale-refeicao" têm que casar com a mesma coluna."""
    return "".join(ch for ch in _ud.normalize("NFD", str(texto or ""))
                   if _ud.category(ch) != "Mn")


def _n(v):
    """Número curto: 18 em vez de 18.0, 14,33 em vez de 14.33."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v if v is not None else ""
    txt = ("%.2f" % f).rstrip("0").rstrip(".")
    return txt.replace(".", ",")


def _nome_arquivo(proposta, lead):
    base = "%s_%s" % (proposta.get("numero") or "proposta",
                      (lead or {}).get("empresa") or "cliente")
    if (proposta.get("versao") or 1) > 1:
        base += "_v%d" % proposta["versao"]
    return re.sub(r"[^A-Za-z0-9_-]+", "_", base).strip("_") or "proposta"


def aceite_ligado(cfg) -> bool:
    """O link público de aceite está valendo?

    Desligado enquanto o CRM roda em `localhost`: o link que o cliente receberia
    só abre na máquina de quem enviou, e um link quebrado numa proposta é pior
    do que proposta sem link. Liga em Configurações quando o sistema tiver
    endereço público — e aí o `aceite_base_url` também precisa apontar para ele.
    """
    v = str((cfg or {}).get("aceite_ativo", "")).strip().lower()
    return v not in ("", "0", "nao", "não", "false", "off")


def link_aceite(proposta, cfg) -> str:
    if not aceite_ligado(cfg):
        return ""
    token = proposta.get("aceite_token")
    if not token:
        return ""
    base = (cfg.get("aceite_base_url") or "").rstrip("/")
    return "%s/p/%s" % (base, token)


def garantir_token_aceite(sb: Supabase, proposta: dict, cfg=None) -> dict:
    """Sem o aceite ligado não se cria token: token guardado no banco é uma
    porta pública esperando alguém achar o endereço."""
    if cfg is not None and not aceite_ligado(cfg):
        return proposta
    if proposta.get("aceite_token"):
        return proposta
    token = secrets.token_urlsafe(24)
    return sb.update("propostas", {"aceite_token": token}, id="eq.%s" % proposta["id"]) \
        or dict(proposta, aceite_token=token)


# ── geração ──────────────────────────────────────────────────────────────────

def gerar(sb: Supabase, proposta_id, formato) -> tuple[bytes, str, str]:
    """Gera o arquivo a partir do ID. É o caminho único — front, e-mail, fila
    e link público entram todos por aqui."""
    if formato not in ("pptx", "pdf"):
        raise ErroProposta("Formato inválido: %s" % formato)
    p, ctx, c = carregar(sb, proposta_id)
    if not (p.get("itens") or []):
        raise ErroProposta("A proposta não tem nenhum posto de trabalho.")
    problemas = calculo.confere(c)
    if problemas:
        raise ErroProposta("Cálculo inconsistente: " + "; ".join(problemas))
    p = garantir_token_aceite(sb, p)
    dados = dados_documento(sb, p, ctx, c)
    return ppt.gerar(dados, formato)


def arquivar(sb: Supabase, proposta_id, formato, conteudo: bytes, nome: str,
             enviado_para=None):
    """Guarda o gerado no Storage e registra a versão (4.2).

    Sem isso não existe comprovante: o que o cliente recebeu vira memória de
    quem clicou em baixar.
    """
    versoes = sb.select("proposta_documentos", "versao",
                        propostaId="eq.%s" % proposta_id,
                        formato="eq.%s" % formato, ordem="versao.desc", limite=1)
    versao = (versoes[0]["versao"] + 1) if versoes else 1
    caminho = "%s/v%02d_%s" % (proposta_id, versao, nome)
    sb.storage_upload("propostas", caminho, conteudo)
    reg = sb.insert("proposta_documentos", {
        "propostaId": int(proposta_id), "formato": formato, "versao": versao,
        "caminho": caminho, "tamanho": len(conteudo),
        "enviado_para": enviado_para,
        "enviado_em": _dt.datetime.now(_dt.timezone.utc).isoformat() if enviado_para else None,
    })
    registrar_timeline(sb, "Proposta", proposta_id, "documento",
                       "%s gerado (v%d)" % (formato.upper(), versao), nome)
    return reg


def registrar_timeline(sb: Supabase, ref_tipo, ref_id, tipo, titulo,
                       detalhe=None, dados=None, lead_id=None):
    """Grava um evento. Falha aqui nunca derruba a operação principal — um
    histórico incompleto é ruim, uma proposta que não gera é pior."""
    try:
        sb.insert("timeline", {
            "refTipo": ref_tipo, "refId": int(ref_id), "leadId": lead_id,
            "tipo": tipo, "titulo": titulo, "detalhe": detalhe, "dados": dados,
        }, retornar=False)
    except ErroSupabase:
        pass


# ── modelos disponíveis (4.5) ────────────────────────────────────────────────

def modelos_disponiveis() -> list[str]:
    if not os.path.isdir(ppt.MODELOS_DIR):
        return []
    return sorted(f for f in os.listdir(ppt.MODELOS_DIR)
                  if f.lower().endswith(".pptx") and not f.startswith("~$"))


def slides_do_modelo(nome: str) -> list[str]:
    """Os slides que este modelo deixa ligar e desligar, na ordem em que saem.

    Vem das anotações `SLIDE:<nome>` do próprio arquivo. A lista já esteve
    fixa no JavaScript, com os nomes do primeiro modelo — e ao trocar de
    modelo a tela passou a oferecer interruptor para slide que não existia
    mais, escondendo os que existiam. Quem sabe quais slides um modelo tem é
    o modelo.
    """
    try:
        from pptx import Presentation
        prs = Presentation(ppt.caminho_modelo(nome))
    except Exception:  # noqa: BLE001 — modelo ausente ou ilegível
        return []
    vistos = []
    for slide in prs.slides:
        marca = ppt.marcador_do_slide(slide)
        if marca and marca not in vistos:
            vistos.append(marca)
    return vistos
