"""
Cliente REST do Supabase — só o que este CRM usa.

Por que não a lib oficial: ela arrasta httpx, gotrue, storage3, realtime e
postgrest como dependências, e daqui usamos quatro verbos HTTP. urllib é da
biblioteca padrão e não envelhece.

Regra de ouro: o servidor fala com o Postgres usando o **token do usuário
logado**, nunca a chave de serviço. Assim a RLS continua valendo do lado de cá
— um vendedor não gera o PPT de uma proposta que ele não pode nem abrir.
A chave de serviço só entra onde não existe usuário: o link público de aceite.
"""
from __future__ import annotations

import json
import mimetypes
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request


# ── TLS atrás de proxy com inspeção de HTTPS ───────────────────────────────
# Algumas redes reassinam o HTTPS no caminho. Quando isso acontece,
# o Python não conhece a CA do proxy e toda chamada ao Supabase morre com
# CERTIFICATE_VERIFY_FAILED — de forma intermitente, porque depende da rede em
# que a máquina está no momento. Do lado do usuário isso aparece como "o CRM
# parou", sem pista nenhuma.
#
# A saída é apontar para o pacote de CAs do proxy. Só apontar não basta: é
# comum uma das CAs do pacote ter `Basic Constraints` sem a marca `critical`,
# que o modo estrito do Python 3.13+ rejeita. Daí o VERIFY_X509_STRICT desligado
# — a verificação de cadeia e de nome continua valendo, que é o que protege.
#
# Sem bundle configurado, nada muda: o Python usa os certificados de sempre.
_CTX_TLS = False


def _ca_bundle() -> str:
    for var in ("SUPABASE_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "SSL_CERT_FILE"):
        caminho = (os.environ.get(var) or "").strip().strip('"')
        if caminho and os.path.isfile(caminho):
            return caminho
    padrao = os.path.join(os.path.expanduser("~"), ".certs", "ca-bundle.pem")
    return padrao if os.path.isfile(padrao) else ""


def _contexto():
    """O contexto TLS a usar, ou None para o comportamento padrão."""
    global _CTX_TLS
    if _CTX_TLS is False:                      # ainda não resolvido
        bundle = _ca_bundle()
        if not bundle:
            _CTX_TLS = None
        else:
            ctx = ssl.create_default_context(cafile=bundle)
            ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
            _CTX_TLS = ctx
    return _CTX_TLS


class ErroSupabase(Exception):
    """Falha vinda do Supabase, já com a mensagem legível."""

    def __init__(self, mensagem, status=0):
        super().__init__(mensagem)
        self.status = status


def _url_base() -> str:
    return (os.environ.get("SUPABASE_URL") or "").rstrip("/")


def anon_key() -> str:
    return os.environ.get("SUPABASE_ANON_KEY") or ""


def service_key() -> str:
    return os.environ.get("SUPABASE_SERVICE_KEY") or ""


def _requisitar(metodo, url, token, dados=None, headers=None, bruto=None,
                content_type="application/json", timeout=30):
    base = _url_base()
    if not base:
        raise ErroSupabase("SUPABASE_URL não configurado no .env.")
    cabecalho = {
        "apikey": anon_key() or token or "",
        "Authorization": "Bearer %s" % (token or anon_key()),
        "Accept": "application/json",
    }
    corpo = bruto
    if dados is not None:
        corpo = json.dumps(dados).encode("utf-8")
    if corpo is not None:
        cabecalho["Content-Type"] = content_type
    cabecalho.update(headers or {})

    req = urllib.request.Request(url, data=corpo, method=metodo, headers=cabecalho)
    try:
        with urllib.request.urlopen(req, timeout=timeout,
                                    context=_contexto()) as resp:
            texto = resp.read().decode("utf-8", "replace")
            if not texto:
                return None
            try:
                return json.loads(texto)
            except json.JSONDecodeError:
                return texto
    except urllib.error.HTTPError as exc:
        detalhe = exc.read().decode("utf-8", "replace")
        try:
            j = json.loads(detalhe)
            detalhe = j.get("message") or j.get("error_description") or \
                j.get("error") or j.get("msg") or detalhe
        except (json.JSONDecodeError, AttributeError):
            pass
        raise ErroSupabase("Supabase %s: %s" % (exc.code, detalhe[:500]), exc.code)
    except urllib.error.URLError as exc:
        if isinstance(getattr(exc, "reason", None), ssl.SSLCertVerificationError):
            raise ErroSupabase(
                "O certificado do Supabase não pôde ser verificado — quase sempre é "
                "um proxy que inspeciona o HTTPS. Aponte SUPABASE_CA_BUNDLE no "
                ".env para o pacote de CAs do proxy (.pem). Detalhe: %s"
                % exc.reason)
        raise ErroSupabase("Não foi possível falar com o Supabase: %s" % exc.reason)


class Supabase:
    """Sessão de acesso. `token` é o JWT do usuário; sem ele usa a anon key."""

    def __init__(self, token=None, servico=False):
        self.token = service_key() if servico else (token or anon_key())
        self.servico = servico

    # ── PostgREST ──

    def select(self, tabela, colunas="*", ordem=None, limite=None, **filtros):
        params = {"select": colunas}
        for k, v in filtros.items():
            params[k] = v
        if ordem:
            params["order"] = ordem
        if limite:
            params["limit"] = str(limite)
        url = "%s/rest/v1/%s?%s" % (_url_base(), tabela, urllib.parse.urlencode(params))
        return _requisitar("GET", url, self.token) or []

    def um(self, tabela, id_):
        linhas = self.select(tabela, id="eq.%s" % id_, limite=1)
        return linhas[0] if linhas else None

    def insert(self, tabela, dados, retornar=True):
        url = "%s/rest/v1/%s" % (_url_base(), tabela)
        headers = {"Prefer": "return=representation" if retornar else "return=minimal"}
        r = _requisitar("POST", url, self.token, dados=dados, headers=headers)
        if isinstance(r, list):
            return r[0] if r else None
        return r

    def update(self, tabela, dados, retornar=True, **filtros):
        params = {k: v for k, v in filtros.items()}
        url = "%s/rest/v1/%s?%s" % (_url_base(), tabela, urllib.parse.urlencode(params))
        headers = {"Prefer": "return=representation" if retornar else "return=minimal"}
        r = _requisitar("PATCH", url, self.token, dados=dados, headers=headers)
        if isinstance(r, list):
            return r[0] if r else None
        return r

    def rpc(self, funcao, args=None):
        url = "%s/rest/v1/rpc/%s" % (_url_base(), funcao)
        return _requisitar("POST", url, self.token, dados=args or {})

    # ── Auth ──

    def usuario(self):
        url = "%s/auth/v1/user" % _url_base()
        return _requisitar("GET", url, self.token)

    # ── Storage ──

    def storage_upload(self, bucket, caminho, conteudo: bytes, mime=None, substituir=True):
        mime = mime or mimetypes.guess_type(caminho)[0] or "application/octet-stream"
        url = "%s/storage/v1/object/%s/%s" % (
            _url_base(), bucket, urllib.parse.quote(caminho))
        metodo = "PUT" if substituir else "POST"
        _requisitar(metodo, url, self.token, bruto=conteudo, content_type=mime,
                    headers={"x-upsert": "true" if substituir else "false"},
                    timeout=120)
        return caminho

    def storage_url_assinada(self, bucket, caminho, segundos=3600):
        url = "%s/storage/v1/object/sign/%s/%s" % (
            _url_base(), bucket, urllib.parse.quote(caminho))
        r = _requisitar("POST", url, self.token, dados={"expiresIn": int(segundos)})
        assinado = (r or {}).get("signedURL") or (r or {}).get("signedUrl") or ""
        if assinado.startswith("/"):
            return _url_base() + "/storage/v1" + assinado
        return assinado

    def storage_baixar(self, bucket, caminho) -> bytes:
        url = "%s/storage/v1/object/%s/%s" % (
            _url_base(), bucket, urllib.parse.quote(caminho))
        req = urllib.request.Request(url, headers={
            "apikey": anon_key(), "Authorization": "Bearer %s" % self.token})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            raise ErroSupabase("Não foi possível baixar %s: %s" % (caminho, exc.code),
                               exc.code)
