"""
Envio da proposta por e-mail, direto do CRM (item 4.3).

SMTP puro, da biblioteca padrão. Não há SDK de Sendgrid/Resend aqui porque o
cliente típico deste CRM já tem uma caixa corporativa (Microsoft 365, Google
Workspace, um servidor próprio) e quer que a proposta saia DO endereço
comercial dele — não de um domínio de terceiro que cai em spam.

Configuração no .env (veja .env.example):
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TLS
Sem isso, a rota de envio responde com uma mensagem explicando o que falta em
vez de estourar um traceback.
"""
from __future__ import annotations

import os
import re
import smtplib
from email.message import EmailMessage

RE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ErroEmail(Exception):
    """Falha explicável no envio."""


def configurado() -> bool:
    return not config_faltando()


def remetente() -> str:
    return (os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER") or "").strip()


def config_faltando() -> str:
    faltam = [k for k in ("SMTP_HOST",) if not os.environ.get(k)]
    if not remetente():
        faltam.append("SMTP_FROM (ou SMTP_USER)")
    # Usuário sem senha é o caso que o /api/saude dizia estar pronto e que
    # falhava na hora de enviar, com erro de autenticação do servidor. Quase
    # todo SMTP com usuário exige senha; quem não exige (relay interno na porta
    # 25) também não preenche SMTP_USER, então a checagem não incomoda ninguém.
    if os.environ.get("SMTP_USER") and not os.environ.get("SMTP_PASS"):
        faltam.append("SMTP_PASS")
    return ", ".join(faltam)


def valido(endereco) -> bool:
    return bool(endereco and RE_EMAIL.match(str(endereco).strip()))


def enviar(para, assunto, corpo, anexos=None, copia=None, responder_para=None):
    """Manda a mensagem. `anexos` é uma lista de (nome, bytes, mimetype)."""
    if not configurado():
        raise ErroEmail(
            "Envio de e-mail não configurado. Preencha %s no .env do servidor."
            % (config_faltando() or "SMTP_HOST e SMTP_FROM"))

    destinos = [e.strip() for e in (para if isinstance(para, (list, tuple))
                                    else str(para).split(",")) if e.strip()]
    if not destinos:
        raise ErroEmail("Nenhum destinatário informado.")
    invalidos = [e for e in destinos if not valido(e)]
    if invalidos:
        raise ErroEmail("Endereço inválido: " + ", ".join(invalidos))

    msg = EmailMessage()
    msg["From"] = remetente()
    msg["To"] = ", ".join(destinos)
    if copia:
        copias = [e.strip() for e in (copia if isinstance(copia, (list, tuple))
                                      else str(copia).split(",")) if e.strip()]
        if copias:
            msg["Cc"] = ", ".join(copias)
            destinos += copias
    if responder_para and valido(responder_para):
        msg["Reply-To"] = responder_para
    msg["Subject"] = assunto or "(sem assunto)"
    msg.set_content(corpo or "")

    for nome, conteudo, mime in (anexos or []):
        tipo, _, sub = (mime or "application/octet-stream").partition("/")
        msg.add_attachment(conteudo, maintype=tipo, subtype=sub or "octet-stream",
                           filename=nome)

    host = os.environ.get("SMTP_HOST")
    porta = int(os.environ.get("SMTP_PORT") or 587)
    usuario = os.environ.get("SMTP_USER") or ""
    senha = os.environ.get("SMTP_PASS") or ""
    usar_tls = (os.environ.get("SMTP_TLS", "1").lower() not in ("0", "false", "nao", "não"))

    try:
        if porta == 465:
            servidor = smtplib.SMTP_SSL(host, porta, timeout=45)
        else:
            servidor = smtplib.SMTP(host, porta, timeout=45)
        with servidor:
            servidor.ehlo()
            if porta != 465 and usar_tls:
                servidor.starttls()
                servidor.ehlo()
            if usuario:
                servidor.login(usuario, senha)
            servidor.send_message(msg, to_addrs=destinos)
    except smtplib.SMTPAuthenticationError:
        raise ErroEmail("O servidor de e-mail recusou o usuário ou a senha "
                        "(confira SMTP_USER/SMTP_PASS).")
    except smtplib.SMTPException as exc:
        raise ErroEmail("Falha no envio: %s" % exc)
    except OSError as exc:
        raise ErroEmail("Não foi possível falar com %s:%s — %s" % (host, porta, exc))
    return destinos


def preencher(texto: str, campos: dict) -> str:
    """Troca {CHAVE} pelos mesmos campos que o PPT usa — assunto e corpo do
    e-mail são configuráveis pela tela de parâmetros, sem tocar em código."""
    saida = texto or ""
    for chave, valor in (campos or {}).items():
        saida = saida.replace("{%s}" % chave, "" if valor is None else str(valor))
    return saida
