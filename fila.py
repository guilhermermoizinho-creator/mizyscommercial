"""
Fila de geração de documentos (item 4.7).

Antes, gerar um PDF prendia a requisição inteira: o Flask rodava com
`threaded=False` e a conversão pelo PowerPoint leva de 5 a 20 segundos. Enquanto
um PDF era gerado, o CRM inteiro ficava parado para todo mundo (P9.10).

Agora a rota só enfileira e devolve um id. O navegador pergunta o andamento e
baixa quando estiver pronto — ou envia por e-mail sem baixar nada.

É uma fila em processo, não um Celery. Para um servidor interno com meia dúzia
de usuários, subir Redis + worker seria construir uma estação de trem para uma
travessia de rua. O que importava era não travar a aplicação, e isso a fila
resolve. Os trabalhos vivem em memória: reiniciar o servidor perde a fila, e o
usuário simplesmente pede de novo.
"""
from __future__ import annotations

import datetime as _dt
import queue
import threading
import uuid

# Duas linhas de trabalho. A conversão para PDF já é serializada pelo lock do
# ppt.py (o PowerPoint é single-instance); mais threads só encheriam a memória.
N_TRABALHADORES = 2

# Um documento gerado é lembrado por este tempo, para dar tempo de baixar.
TTL_SEGUNDOS = 30 * 60

_fila: "queue.Queue[str]" = queue.Queue()
_trabalhos: dict[str, dict] = {}
_trava = threading.Lock()
_iniciada = False


def _agora():
    return _dt.datetime.now(_dt.timezone.utc)


def enfileirar(descricao: str, funcao, *args, dono=None, **kwargs) -> str:
    """Põe o trabalho na fila e devolve o id para acompanhar.

    `dono` é o id de quem pediu. O id do trabalho é aleatório, mas documento de
    proposta é dado comercial: quem consulta e baixa tem que ser quem pediu.
    """
    _garantir_trabalhadores()
    jid = uuid.uuid4().hex[:12]
    with _trava:
        _trabalhos[jid] = {
            "id": jid, "descricao": descricao, "estado": "aguardando",
            "criado": _agora(), "iniciado": None, "concluido": None,
            "resultado": None, "erro": None,
            "_dono": dono, "_fn": (funcao, args, kwargs),
        }
    _fila.put(jid)
    return jid


def estado(jid: str, dono=None) -> dict | None:
    """Situação do trabalho, sem o conteúdo binário.

    Com `dono` informado, o trabalho de outra pessoa responde como inexistente —
    e não como "sem permissão", que já entregaria que ele existe.
    """
    _limpar_antigos()
    with _trava:
        t = _trabalhos.get(jid)
        if not t:
            return None
        if dono is not None and t.get("_dono") not in (None, dono):
            return None
        publico = {k: v for k, v in t.items() if not k.startswith("_")}
    r = publico.get("resultado")
    if isinstance(r, tuple):
        conteudo, nome, mime = r
        publico["resultado"] = {"nome": nome, "mimetype": mime,
                                "tamanho": len(conteudo)}
    for k in ("criado", "iniciado", "concluido"):
        if publico.get(k):
            publico[k] = publico[k].isoformat(timespec="seconds")
    return publico


def resultado(jid: str, dono=None):
    """(bytes, nome, mimetype) de um trabalho concluído, ou None."""
    with _trava:
        t = _trabalhos.get(jid)
        if not t or t["estado"] != "concluido":
            return None
        if dono is not None and t.get("_dono") not in (None, dono):
            return None
        return t["resultado"]


def listar(dono=None) -> list[dict]:
    with _trava:
        ids = list(_trabalhos)
    return [e for e in (estado(i, dono) for i in ids) if e]


def _limpar_antigos():
    corte = _agora() - _dt.timedelta(seconds=TTL_SEGUNDOS)
    with _trava:
        for jid in [k for k, v in _trabalhos.items()
                    if v["estado"] in ("concluido", "erro")
                    and (v["concluido"] or v["criado"]) < corte]:
            _trabalhos.pop(jid, None)


def _trabalhar():
    while True:
        jid = _fila.get()
        try:
            with _trava:
                t = _trabalhos.get(jid)
                if not t:
                    continue
                t["estado"] = "processando"
                t["iniciado"] = _agora()
                fn, args, kwargs = t["_fn"]
            try:
                saida = fn(*args, **kwargs)
                with _trava:
                    t = _trabalhos.get(jid)
                    if t:
                        t["resultado"] = saida
                        t["estado"] = "concluido"
                        t["concluido"] = _agora()
            except Exception as exc:  # noqa: BLE001 — o erro é o resultado
                with _trava:
                    t = _trabalhos.get(jid)
                    if t:
                        t["erro"] = str(exc)
                        t["estado"] = "erro"
                        t["concluido"] = _agora()
        finally:
            _fila.task_done()


def _garantir_trabalhadores():
    """Sobe as threads na primeira necessidade — não no import, para o
    `python -m unittest` não deixar thread pendurada."""
    global _iniciada
    with _trava:
        if _iniciada:
            return
        _iniciada = True
    for i in range(N_TRABALHADORES):
        threading.Thread(target=_trabalhar, daemon=True,
                         name="documento-%d" % (i + 1)).start()
