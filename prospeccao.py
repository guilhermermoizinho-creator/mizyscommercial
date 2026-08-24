"""
Prospecção de empresas de facilities — descoberta, checagem e triagem.

O trabalho que isto substitui é o de abrir o Maps, procurar "empresa de
limpeza terceirizada", clicar em cada resultado, entrar no site, achar o CNPJ
no rodapé, consultar a situação cadastral e anotar tudo numa planilha. São uns
quatro minutos por empresa, e metade delas é grande demais ou está baixada.

A cadeia tem três elos, e cada um responde uma pergunta diferente:

1. **Google Places** — quem existe e onde. Devolve nome, endereço, telefone,
   site e volume de avaliações. É a única fonte prática para varrer uma região
   por atividade; exige chave e faturamento habilitado no Google Cloud.
2. **O site da própria empresa** — o CNPJ, que quase sempre está no rodapé, e
   os e-mails comerciais. Sem o CNPJ o passo 3 não acontece.
3. **Receita Federal**, via BrasilAPI com ReceitaWS de reserva — situação
   cadastral, porte, capital social, CNAE e data de abertura. É aqui que
   "não está falida" deixa de ser palpite.

Sobre o tamanho da empresa: **número de empregados não é dado público**. O que
dá para usar são indícios — porte, capital social, idade, quantidade de sócios
e volume de avaliações no Maps. A triagem por tamanho é aproximada por
limitação da fonte, não do código, e a tela mostra os indícios em vez de
esconder atrás de uma nota só.

Uso: são dados cadastrais de PESSOA JURÍDICA, públicos, para contato
comercial B2B. Quem pedir para não ser mais procurado entra na lista de
bloqueio e não volta nas buscas seguintes.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

import supa

# ── rede ─────────────────────────────────────────────────────────────────────
# Mesma história do supa.py: proxy que reassina o HTTPS derruba toda
# chamada de fora. Aqui dói mais, porque são muitos hosts diferentes.
_CTX = False


def _contexto():
    """O mesmo contexto TLS do supa.py, e de proposito: duas buscas do mesmo
    certificado divergem no dia em que alguem mexe numa e esquece a outra."""
    global _CTX
    if _CTX is False:
        bundle = supa._ca_bundle()
        if not bundle:
            _CTX = None
        else:
            ctx = ssl.create_default_context(cafile=bundle)
            ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
            _CTX = ctx
    return _CTX


UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MizysCRM/1.0"


class ErroProspeccao(Exception):
    """Falha explicável — chega na tela como texto, não como traceback."""


def _http(url, dados=None, headers=None, timeout=30, limite=600000):
    req = urllib.request.Request(
        url, data=dados, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout, context=_contexto()) as r:
        return r.status, r.read(limite)


def _abrir_site(url, timeout=20, limite=500000):
    """Abre a pagina do jeito que um navegador abriria.

    Quatro coisas derrubavam sites que estao no ar, e cada uma custou uma
    empresa na primeira rodada:

      · redirecao 302 que o urllib devolve como erro em vez de seguir;
      · `www.` num dominio que so responde sem ele — e vice-versa;
      · http quando o https nao sobe;
      · Cloudflare devolvendo 525 no primeiro toque e 200 no segundo.

    Devolve (html, erro, url_que_funcionou). Nunca levanta: site fora do ar
    nao pode derrubar a rodada inteira.
    """
    bruto = (url or "").strip()
    if not bruto:
        return "", "sem endereco", ""
    sem_esquema = re.sub(r"^https?://", "", bruto).rstrip("/")
    sem_www = sem_esquema[4:] if sem_esquema.lower().startswith("www.") else sem_esquema
    com_www = sem_esquema if sem_esquema.lower().startswith("www.") else "www." + sem_esquema

    tentativas = []
    for host in dict.fromkeys((sem_esquema, sem_www, com_www)):
        tentativas += ["https://" + host, "http://" + host]

    ultimo = ""
    for tentativa in tentativas:
        for _ in range(4):          # ate 4 saltos de redirecao
            try:
                _, corpo = _http(tentativa, timeout=timeout, limite=limite)
                return corpo.decode("utf-8", "replace"), "", tentativa
            except urllib.error.HTTPError as exc:
                destino = exc.headers.get("Location") if exc.headers else None
                if exc.code in (301, 302, 303, 307, 308) and destino:
                    tentativa = urllib.parse.urljoin(tentativa, destino)
                    continue
                ultimo = "HTTP %s" % exc.code
                break
            except Exception as exc:  # noqa: BLE001 — DNS, TLS, timeout
                ultimo = "%s: %s" % (type(exc).__name__, str(exc)[:60])
                break
    return "", ultimo or "nao abriu", ""


def _json(url, dados=None, headers=None, timeout=30):
    st, corpo = _http(url, dados, headers, timeout)
    return st, json.loads(corpo.decode("utf-8", "replace") or "{}")


# ── 1. descoberta: Google Places ─────────────────────────────────────────────

def chave_google() -> str:
    return (os.environ.get("GOOGLE_MAPS_API_KEY") or "").strip()


# Consultas que trazem empresa de facilities sem trazer produto de limpeza,
# material de construção e afins. Cada uma é uma chamada à API.
TERMOS = [
    "empresa de facilities",
    "terceirização de mão de obra limpeza e portaria",
    "empresa de limpeza e conservação predial",
    "empresa de portaria e zeladoria para condomínios",
    "empresa de asseio e conservação",
]

# Campos pedidos ao Places. A API cobra por campo, então nada de asterisco.
CAMPOS = ("places.id,places.displayName,places.formattedAddress,"
          "places.websiteUri,places.nationalPhoneNumber,places.rating,"
          "places.userRatingCount,places.businessStatus,places.location")


def buscar_places(termo: str, regiao: str, maximo: int = 20) -> list[dict]:
    """Uma consulta de texto no Places. Devolve candidatos crus."""
    chave = chave_google()
    if not chave:
        raise ErroProspeccao(
            "GOOGLE_MAPS_API_KEY não está no .env do servidor. Sem ela não há "
            "como varrer o Maps — o resto da tela funciona com lista manual.")
    corpo = json.dumps({
        "textQuery": "%s em %s" % (termo, regiao),
        "languageCode": "pt-BR", "regionCode": "BR",
        "maxResultCount": max(1, min(int(maximo or 20), 20)),
    }).encode("utf-8")
    try:
        _, d = _json("https://places.googleapis.com/v1/places:searchText", corpo,
                     {"Content-Type": "application/json", "X-Goog-Api-Key": chave,
                      "X-Goog-FieldMask": CAMPOS})
    except urllib.error.HTTPError as exc:
        detalhe = exc.read().decode("utf-8", "replace")[:400]
        if exc.code in (401, 403):
            raise ErroProspeccao(
                "O Google recusou a chave (%s). As duas causas de sempre: o "
                "FATURAMENTO não está habilitado no projeto do Google Cloud, ou "
                "a chave é de JavaScript e está restrita a referenciador — "
                "chamada de servidor precisa de chave sem essa restrição, com a "
                "Places API (New) ativada. Detalhe: %s" % (exc.code, detalhe))
        raise ErroProspeccao("Google Places respondeu %s: %s" % (exc.code, detalhe))
    except OSError as exc:
        raise ErroProspeccao("Não foi possível falar com o Google Places: %s" % exc)

    saida = []
    for p in d.get("places") or []:
        saida.append({
            "place_id": p.get("id"),
            "nome": (p.get("displayName") or {}).get("text") or "",
            "endereco": p.get("formattedAddress") or "",
            "site": p.get("websiteUri") or "",
            "telefone": p.get("nationalPhoneNumber") or "",
            "nota": p.get("rating"),
            "avaliacoes": p.get("userRatingCount") or 0,
            "situacao_maps": p.get("businessStatus") or "",
            "origem": "places",
        })
    return saida


# ── 2. o site da empresa: CNPJ e e-mails ─────────────────────────────────────

RE_CNPJ = re.compile(r"\b(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[-\s]?(\d{2})\b")
RE_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# E-mail de quem fez o site, de banco de imagem e de rastreador não é contato
# comercial — e é o que mais aparece em rodapé.
EMAIL_LIXO = ("sentry", "wixpress", "example.", "godaddy", "@2x", "cloudflare",
              "sentry.io", "wordpress", "elementor", ".png", ".jpg", "@sentry",
              # Placeholder que a propria empresa deixa no formulario. Aparece
              # tanto quanto e-mail de verdade, e vai direto para o lead.
              "naoinformado", "nao-informado", "exemplo@", "seuemail",
              "seunome", "email@email", "teste@", "dominio.com")


def _digitos(s):
    return re.sub(r"\D", "", s or "")


def cnpj_valido(cnpj: str) -> bool:
    """Dígito verificador. Rodapé de site tem CNPJ digitado errado com uma
    frequência que surpreende, e CNPJ errado queima uma consulta à Receita."""
    n = _digitos(cnpj)
    if len(n) != 14 or n == n[0] * 14:
        return False
    for tam, pesos in ((12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
                       (13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])):
        soma = sum(int(n[i]) * pesos[i] for i in range(tam))
        resto = soma % 11
        if int(n[tam]) != (0 if resto < 2 else 11 - resto):
            return False
    return True


# Telefone brasileiro escrito como gente escreve: (11) 4002-8922, 11 98765-4321,
# +55 11 3000 0000.
RE_TEL = re.compile(r"(?:\+?55[\s.-]?)?\(?([1-9][0-9])\)?[\s.-]?(9?[0-9]{4})[\s.-]?([0-9]{4})(?!\d)")

# Os DDDs que existem de verdade. Sem esta lista, o CNPJ 57.559.387/0001-38 do
# rodapé virava o telefone "(57) 6789-0004" — a Anatel não usa 20, 23, 25, 26,
# 29, 30, 36 (existe), 39, 40, 50, 52, 56, 57, 58, 59, 60, 70, 72, 76, 78, 80 e 90.
DDDS = {11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
        31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
        51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
        71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
        91, 92, 93, 94, 95, 96, 97, 98, 99}

# Corridas longas de dígito — CNPJ, CPF, código de barras, id de rastreador —
# são apagadas ANTES da busca por telefone. Telefone tem 10 ou 11 dígitos; o
# que tem 12 ou mais nunca é telefone, mas contém um por dentro.
RE_DIGITADA_LONGA = re.compile(r"\d[\d.\-/]{11,}\d")

# Perfis de rede social. `company/` e `in/` do LinkedIn são coisas diferentes:
# o primeiro é a empresa, o segundo é uma pessoa — e pessoa não entra aqui.
REDES = {
    "instagram": re.compile(r"https?://(?:www\.)?instagram\.com/([A-Za-z0-9_.]{2,30})", re.I),
    "facebook": re.compile(r"https?://(?:www\.)?facebook\.com/([A-Za-z0-9_.-]{3,60})", re.I),
    "linkedin": re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/company/([A-Za-z0-9_.-]{2,80})", re.I),
    "youtube": re.compile(r"https?://(?:www\.)?youtube\.com/(?:c/|@|channel/|user/)([A-Za-z0-9_.-]{2,60})", re.I),
    "whatsapp": re.compile(r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=)(\+?\d{10,15})", re.I),
}
# Caminhos que não são perfil de ninguém: são o botão de compartilhar.
REDE_LIXO = ("sharer", "share.php", "intent", "plugins", "tr?id", "login",
             "profile.php", "dialog", "p", "explore", "hashtag")


def _telefone_plausivel(meio: str) -> bool:
    """O plano de numeração brasileiro, aplicado ao bloco depois do DDD.

    Celular tem 9 dígitos e começa com 9. Fixo tem 8 e começa de 2 a 5. Sem
    isto entrava "(17) 8654-7485" e "(71) 1536-3924", que são pedaços de outros
    números com um DDD válido por acaso na frente.
    """
    if len(meio) == 5:
        return meio[0] == "9"
    if len(meio) == 4:
        return meio[0] in "2345"
    return False


# A LGPD obriga a informar quem e o controlador dos dados, com CNPJ. Por isso
# a pagina de privacidade acha CNPJ que a home e a de contato nao tem.
# Quatro caminhos, nao treze: cada um custa uma requisicao, e treze vezes 34
# sites com timeout de 15 s passa de nove minutos numa rodada. Estes quatro
# cobrem quase todo CNPJ e e-mail que existe para achar — a pagina de
# privacidade entra porque a LGPD obriga a publicar o CNPJ do controlador.
PAGINAS = ("/contato", "/politica-de-privacidade", "/quem-somos", "/sobre")


def _pegar(url, timeout=8, limite=400000):
    """Uma URL so, mas seguindo redirecao. Devolve o HTML ou string vazia.

    Subpagina que redireciona (/contato -> /contato/) e a regra, nao a
    excecao, e sem seguir o salto a pagina de contato — onde moram o e-mail
    comercial e, por causa da LGPD, o CNPJ — nunca era lida.
    """
    for _ in range(3):
        try:
            _, corpo = _http(url, timeout=timeout, limite=limite)
            return corpo.decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            destino = exc.headers.get("Location") if exc.headers else None
            if exc.code in (301, 302, 303, 307, 308) and destino:
                url = urllib.parse.urljoin(url, destino)
                continue
            return ""
        except Exception:  # noqa: BLE001
            return ""
    return ""


def ler_site(url: str, paginas_extras=PAGINAS) -> dict:
    """Puxa CNPJ, e-mails, telefones e redes sociais do site da empresa.

    Falha em silêncio: site fora do ar não pode derrubar a rodada inteira. A
    página inicial quase nunca tem tudo — o CNPJ mora no rodapé, o e-mail e o
    telefone na página de contato — por isso a varredura tenta as duas.
    """
    achado = {"cnpjs": [], "emails": [], "telefones": [], "redes": {}, "erro": ""}
    if not url:
        return achado
    # O endereco bom e descoberto UMA vez, na home. Repetir a descoberta em
    # cada subpagina multiplicava por seis o numero de requisicoes e fazia uma
    # rodada de 34 sites passar de dez minutos.
    home, erro, url_boa = _abrir_site(url.rstrip("/"))
    if not home:
        achado["erro"] = erro
        return achado
    raiz = re.match(r"^(https?://[^/]+)", url_boa)
    base = raiz.group(1) if raiz else url.rstrip("/")

    vistos_c, vistos_e, vistos_t = [], [], []
    for sufixo in ("",) + tuple(paginas_extras):
        if sufixo:
            html = _pegar(base + sufixo)
            if not html:
                continue
        else:
            html = home
        for m in RE_CNPJ.finditer(html):
            c = "".join(m.groups())
            if cnpj_valido(c) and c not in vistos_c:
                vistos_c.append(c)
        for e in RE_EMAIL.findall(html):
            e = e.lower()
            if any(x in e for x in EMAIL_LIXO) or e in vistos_e:
                continue
            vistos_e.append(e)
        limpo = RE_DIGITADA_LONGA.sub(" ", html)
        for ddd, meio, fim in RE_TEL.findall(limpo):
            if int(ddd) not in DDDS or not _telefone_plausivel(meio):
                continue
            # Mascara de formulario e o numero INTEIRO repetindo um digito:
            # (99) 99999-9999, (00) 0000-0000. Prefixo repetido sozinho nao
            # basta — (11) 99999-1234 e celular de verdade.
            if len(set(meio + fim)) == 1:
                continue
            t = "(%s) %s-%s" % (ddd, meio, fim)
            if t not in vistos_t:
                vistos_t.append(t)
        for rede, regex in REDES.items():
            if rede in achado["redes"]:
                continue
            for alvo in regex.findall(html):
                if alvo.lower() in REDE_LIXO or len(alvo) < 2:
                    continue
                achado["redes"][rede] = alvo
                break
        # Só para com CNPJ E e-mail nas mãos. Parar no telefone seria parar na
        # home, e o e-mail comercial quase sempre mora na página de contato —
        # foi assim que os três primeiros testes voltaram sem e-mail nenhum.
        if vistos_c and vistos_e:
            break
    achado["cnpjs"] = vistos_c[:3]
    # E-mail comercial primeiro: comercial@, vendas@, contato@ valem mais que
    # o financeiro@ e o rh@ que costumam vir junto no rodapé.
    ordem = ("comercial", "vendas", "contato", "atendimento", "sac", "faleconosco")
    vistos_e.sort(key=lambda e: next((i for i, p in enumerate(ordem) if e.startswith(p)), 99))
    achado["emails"] = vistos_e[:5]
    achado["telefones"] = vistos_t[:4]
    return achado


# ── 3. Receita Federal ───────────────────────────────────────────────────────

_ULTIMA_CONSULTA = [0.0]
INTERVALO_MIN = 2.5     # BrasilAPI devolve 403 em rajada; ReceitaWS, 3 por minuto


def _esperar_a_vez():
    espera = INTERVALO_MIN - (time.time() - _ULTIMA_CONSULTA[0])
    if espera > 0:
        time.sleep(espera)
    _ULTIMA_CONSULTA[0] = time.time()


def consultar_cnpj(cnpj: str) -> dict:
    """Situação cadastral e porte. BrasilAPI primeiro, ReceitaWS de reserva."""
    n = _digitos(cnpj)
    if not cnpj_valido(n):
        return {"erro": "CNPJ inválido"}
    _esperar_a_vez()
    try:
        _, d = _json("https://brasilapi.com.br/api/cnpj/v1/" + n, timeout=25)
        return {
            "cnpj": n,
            "razao_social": d.get("razao_social") or "",
            "nome_fantasia": d.get("nome_fantasia") or "",
            "situacao": (d.get("descricao_situacao_cadastral") or "").upper(),
            "data_situacao": d.get("data_situacao_cadastral") or "",
            "porte": (d.get("porte") or "").upper(),
            "capital_social": d.get("capital_social") or 0,
            "cnae": str(d.get("cnae_fiscal") or ""),
            "cnae_desc": d.get("cnae_fiscal_descricao") or "",
            "abertura": d.get("data_inicio_atividade") or "",
            "municipio": d.get("municipio") or "",
            "uf": d.get("uf") or "",
            "telefone_rf": d.get("ddd_telefone_1") or "",
            "email_rf": (d.get("email") or "").lower(),
            "socios": len(d.get("qsa") or []),
            "matriz": (d.get("identificador_matriz_filial") == 1),
            "fonte": "brasilapi",
        }
    except Exception:  # noqa: BLE001 — cai para a reserva
        pass
    try:
        _esperar_a_vez()
        _, d = _json("https://receitaws.com.br/v1/cnpj/" + n, timeout=25)
        if (d.get("status") or "").upper() == "ERROR":
            return {"erro": d.get("message") or "CNPJ não encontrado"}
        cap = str(d.get("capital_social") or "0").replace(".", "").replace(",", ".")
        return {
            "cnpj": n,
            "razao_social": d.get("nome") or "",
            "nome_fantasia": d.get("fantasia") or "",
            "situacao": (d.get("situacao") or "").upper(),
            "data_situacao": d.get("data_situacao") or "",
            "porte": (d.get("porte") or "").upper(),
            "capital_social": float(cap or 0),
            "cnae": (d.get("atividade_principal") or [{}])[0].get("code", "").replace("-", "").replace(".", ""),
            "cnae_desc": (d.get("atividade_principal") or [{}])[0].get("text", ""),
            "abertura": d.get("abertura") or "",
            "municipio": d.get("municipio") or "",
            "uf": d.get("uf") or "",
            "telefone_rf": d.get("telefone") or "",
            "email_rf": (d.get("email") or "").lower(),
            "socios": len(d.get("qsa") or []),
            "matriz": (d.get("tipo") or "").upper() == "MATRIZ",
            "fonte": "receitaws",
        }
    except Exception as exc:  # noqa: BLE001
        return {"erro": "Receita não respondeu: %s" % str(exc)[:80]}


# ── 4. triagem ───────────────────────────────────────────────────────────────

# CNAEs de facilities. O primeiro é o da CCT do SIEMACO-SP.
CNAES_ALVO = {
    "8121400": "Limpeza em prédios e domicílios",
    "8129000": "Outras atividades de limpeza",
    "8122200": "Imunização e controle de pragas",
    "8130300": "Paisagismo",
    "8111700": "Condomínios prediais",
    "8112500": "Condomínios prediais",
    "8011101": "Vigilância e segurança privada",
    "8020000": "Monitoramento de sistemas de segurança",
    "7820500": "Locação de mão de obra temporária",
    "7830200": "Fornecimento e gestão de recursos humanos",
    "5620104": "Fornecimento de alimentação (copa)",
}

# Os grandes que o Guilherme não quer ver. A comparação é sem acento e sem
# caixa, e por PALAVRA inteira — "gps" casaria dentro de outra razão social.
GRANDES = ["hagana", "gps", "souza lima", "verzani", "verzani e sandrini",
           "gocil", "orsegups", "prosegur", "brinks", "graber", "servnac",
           "esparta", "protege", "grupo gr", "iss", "sodexo", "atento",
           "juiz de fora", "liderança", "lideranca", "conservo", "planservice"]


def _sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s or ""))
                   if unicodedata.category(c) != "Mn").lower()


def e_grande(nome: str, extras=None) -> str:
    """Devolve o termo que casou, ou string vazia."""
    alvo = " %s " % re.sub(r"[^a-z0-9 ]+", " ", _sem_acento(nome))
    alvo = re.sub(r"\s+", " ", alvo)
    for termo in list(GRANDES) + list(extras or []):
        t = _sem_acento(termo).strip()
        if t and (" %s " % t) in alvo:
            return termo
    return ""


def _anos(data_iso):
    try:
        ano, mes = int(str(data_iso)[:4]), int(str(data_iso)[5:7] or 1)
        import datetime as dt
        hoje = dt.date.today()
        return round((hoje.year - ano) + (hoje.month - mes) / 12.0, 1)
    except (ValueError, TypeError):
        return None


def triar(cand: dict, bloqueio=None) -> dict:
    """Marca o candidato: motivo de descarte, indícios de porte e nota.

    Nada é apagado — o descartado fica na lista com o motivo à vista. Filtro
    que some com o resultado é filtro que ninguém confere.
    """
    rf = cand.get("rf") or {}
    motivos, sinais = [], []

    casou = e_grande(cand.get("nome", ""), bloqueio)
    if not casou and rf.get("razao_social"):
        casou = e_grande(rf["razao_social"], bloqueio)
    if casou:
        motivos.append("grande/bloqueada: %s" % casou)

    situacao = rf.get("situacao") or ""
    if situacao and situacao != "ATIVA":
        motivos.append("Receita: %s" % situacao.lower())
    if (cand.get("situacao_maps") or "OPERATIONAL") != "OPERATIONAL":
        motivos.append("Maps: fechada em definitivo")

    cnae = rf.get("cnae") or ""
    if cnae and cnae not in CNAES_ALVO:
        sinais.append("CNAE fora da lista (%s)" % (rf.get("cnae_desc") or cnae)[:38])

    cap = float(rf.get("capital_social") or 0)
    if cap:
        sinais.append("capital %s" % ("R$ %.0f mil" % (cap / 1000) if cap < 1e6
                                      else "R$ %.1f mi" % (cap / 1e6)))
        # Capital muito alto é sinal de porte grande; muito baixo, de empresa
        # que não sustenta 100 funcionários. Nenhum dos dois é prova.
        if cap >= 5e6:
            motivos.append("capital alto (R$ %.1f mi) — provável empresa grande" % (cap / 1e6))
    idade = _anos(rf.get("abertura"))
    if idade is not None:
        sinais.append("%.0f anos" % idade)
        if idade < 2:
            sinais.append("recém-aberta")
    if rf.get("porte"):
        sinais.append("porte %s" % rf["porte"].lower())
    if cand.get("avaliacoes"):
        sinais.append("%d avaliações no Maps" % cand["avaliacoes"])
    if cand.get("redes"):
        sinais.append("redes: " + ", ".join(sorted(cand["redes"])))
    if rf.get("socios"):
        sinais.append("%d sócio(s)" % rf["socios"])

    # A nota ordena a fila de ligação; não decide nada sozinha.
    nota = 0
    if not motivos:
        nota += 40
    if cnae in CNAES_ALVO:
        nota += 20
    if cand.get("site"):
        nota += 10
    if cand.get("emails"):
        nota += 10
    if cand.get("telefone") or cand.get("telefones") or rf.get("telefone_rf"):
        nota += 10
    # Empresa com LinkedIn de empresa costuma ter quadro formal e RH — sinal
    # fraco de porte, mas o único de graça, e ajuda a ordenar a fila.
    if (cand.get("redes") or {}).get("linkedin"):
        nota += 5
    if idade is not None and idade >= 3:
        nota += 5
    if 200000 <= cap < 5e6:
        nota += 5

    cand["motivos"] = motivos
    cand["sinais"] = sinais
    cand["nota_triagem"] = nota if not motivos else 0
    cand["descartado"] = bool(motivos)
    return cand


# ── a rodada inteira ─────────────────────────────────────────────────────────

RE_URL = re.compile(r"^(https?://)?([a-z0-9-]+\.)+[a-z]{2,}(/.*)?$", re.I)


def rodar_lote(linhas, bloqueio=None, limite=60, log=None) -> dict:
    """A mesma triagem, a partir de uma lista colada à mão.

    Existe porque a varredura do Maps depende de uma API paga, e a triagem —
    que é o trabalho chato — não depende de nada. Quem já tem a lista (achou no
    Maps na mão, pegou num sindicato, exportou de uma feira) cola aqui e recebe
    situação cadastral, porte, capital, CNAE e contato.

    Cada linha pode ser um CNPJ, um site ou "Nome da empresa; site ou CNPJ".
    """
    def aviso(msg):
        if log:
            log(msg)

    candidatos = []
    for bruta in (linhas or [])[:limite]:
        linha = str(bruta).strip()
        if not linha:
            continue
        nome, dado = "", linha
        if ";" in linha:
            nome, _, dado = linha.partition(";")
            nome, dado = nome.strip(), dado.strip()

        cand = {"nome": nome or dado, "endereco": "", "site": "", "telefone": "",
                "emails": [], "avaliacoes": 0, "situacao_maps": "OPERATIONAL",
                "origem": "lote"}
        so_digitos = _digitos(dado)
        if len(so_digitos) == 14:
            cand["cnpj_site"] = so_digitos
        elif RE_URL.match(dado):
            cand["site"] = dado if dado.lower().startswith("http") else "https://" + dado
            achado = ler_site(cand["site"])
            cand["emails"] = achado["emails"]
            cand["redes"] = achado["redes"]
            cand["telefones"] = achado["telefones"]
            if achado["telefones"]:
                cand["telefone"] = achado["telefones"][0]
            cand["cnpj_site"] = achado["cnpjs"][0] if achado["cnpjs"] else ""
            if achado["erro"]:
                cand["erro_site"] = achado["erro"]
        else:
            # Só o nome: dá para triar pela lista de bloqueio, e nada mais.
            cand["cnpj_site"] = ""

        if cand.get("cnpj_site"):
            cand["rf"] = consultar_cnpj(cand["cnpj_site"])
            if not cand["nome"] or cand["nome"] == dado:
                cand["nome"] = cand["rf"].get("razao_social") or cand["nome"]
            aviso("%-44s %s" % (cand["nome"][:44],
                  cand["rf"].get("situacao") or cand["rf"].get("erro") or "?"))
        candidatos.append(cand)

    for c in candidatos:
        triar(c, bloqueio)
    candidatos.sort(key=lambda x: (-x["nota_triagem"], x["nome"]))
    return {
        "regiao": "lista colada",
        "candidatos": candidatos,
        "total": len(candidatos),
        "aproveitados": sum(1 for c in candidatos if not c["descartado"]),
        "erros": [],
    }


def rodar(regiao: str, termos=None, maximo_por_termo=20, enriquecer=True,
          bloqueio=None, limite_receita=40, log=None) -> dict:
    """Varre, enriquece e tria. `log` recebe mensagens de progresso."""
    def aviso(msg):
        if log:
            log(msg)

    vistos, candidatos, erros = {}, [], []
    for termo in (termos or TERMOS):
        try:
            achados = buscar_places(termo, regiao, maximo_por_termo)
            aviso("%-52s %d resultado(s)" % (termo[:52], len(achados)))
        except ErroProspeccao as exc:
            erros.append(str(exc))
            aviso("falhou: %s" % str(exc)[:90])
            break                      # chave ruim não melhora no termo seguinte
        for a in achados:
            chave = a.get("place_id") or a.get("nome")
            if chave and chave not in vistos:
                vistos[chave] = a
                candidatos.append(a)

    if enriquecer:
        gastos = 0
        for c in candidatos:
            achado = ler_site(c.get("site"))
            c["emails"] = achado["emails"]
            c["redes"] = achado["redes"]
            # O telefone do Maps vem primeiro: é o que a empresa escolheu
            # publicar como principal. Os do site entram como alternativa.
            c["telefones"] = [x for x in achado["telefones"] if x != c.get("telefone")]
            c["cnpj_site"] = achado["cnpjs"][0] if achado["cnpjs"] else ""
            if achado["erro"]:
                c["erro_site"] = achado["erro"]
            if c["cnpj_site"] and gastos < limite_receita:
                c["rf"] = consultar_cnpj(c["cnpj_site"])
                gastos += 1
                aviso("Receita: %-38s %s" % (c["nome"][:38],
                      (c["rf"].get("situacao") or c["rf"].get("erro") or "?")))

    for c in candidatos:
        triar(c, bloqueio)
    candidatos.sort(key=lambda x: (-x["nota_triagem"], x["nome"]))
    return {
        "regiao": regiao,
        "candidatos": candidatos,
        "total": len(candidatos),
        "aproveitados": sum(1 for c in candidatos if not c["descartado"]),
        "erros": erros,
    }
