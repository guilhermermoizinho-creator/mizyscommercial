"""
Tarefas de manutenção pela linha de comando.

    python ferramentas.py congelar          # congela as propostas já enviadas
    python ferramentas.py congelar --seco   # só lista, não grava
    python ferramentas.py gerar 12 pdf      # gera o documento de uma proposta
    python ferramentas.py conferir          # confere o cálculo de todas

Usa a SUPABASE_SERVICE_KEY porque roda sem usuário logado. É a mesma razão de
ela existir para o link público — e o mesmo motivo de não sair da máquina do
servidor.

O `congelar` é o que fecha o P3 para a base que já existe: propostas enviadas
antes desta versão continuam lendo a CCT viva, e o próximo reajuste mudaria o
valor delas. Rode uma vez, depois da migração.
"""
from __future__ import annotations

import sys

from dotenv import load_dotenv

import calculo
import documentos
from supa import ErroSupabase, Supabase, service_key

load_dotenv()


def _sessao():
    if not service_key():
        print("SUPABASE_SERVICE_KEY não configurada no .env — sem ela estas "
              "tarefas não conseguem ler o banco sem usuário logado.")
        sys.exit(2)
    return Supabase(servico=True)


def congelar(seco=False):
    sb = _sessao()
    pendentes = [p for p in sb.select("propostas", "id,numero,status,snapshot",
                                      ordem="id")
                 if not p.get("snapshot") and p.get("status") != documentos.STATUS_RASCUNHO]
    if not pendentes:
        print("Nada a congelar: toda proposta fora de rascunho já tem snapshot.")
        return
    print("%d proposta(s) fora de rascunho ainda acompanham a CCT viva:" % len(pendentes))
    for p in pendentes:
        print("  %-18s %s" % (p["numero"], p["status"]))
    if seco:
        print("\n(--seco: nada foi gravado)")
        return
    print()
    ok = falhas = 0
    for p in pendentes:
        try:
            documentos.congelar(sb, p["id"])
            print("  congelada: %s" % p["numero"])
            ok += 1
        except (documentos.ErroProposta, ErroSupabase) as exc:
            print("  FALHOU %s: %s" % (p["numero"], exc))
            falhas += 1
    print("\n%d congeladas, %d falhas." % (ok, falhas))


def gerar(proposta_id, formato="pdf"):
    sb = _sessao()
    conteudo, nome, _ = documentos.gerar(sb, proposta_id, formato)
    with open(nome, "wb") as fh:
        fh.write(conteudo)
    print("Gravado: %s (%d bytes)" % (nome, len(conteudo)))


def conferir():
    """Passa o motor em todas as propostas e aponta as que não fecham a conta.

    É a rede de segurança contra o P1 voltar em silêncio: se alguma proposta
    imprimir uma coluna que não soma, aparece aqui antes de chegar ao cliente.
    """
    sb = _sessao()
    props = sb.select("propostas", "id,numero", ordem="id")
    problemas = 0
    for p in props:
        try:
            _, _, c = documentos.carregar(sb, p["id"])
        except (documentos.ErroProposta, ErroSupabase) as exc:
            print("  %-18s ERRO: %s" % (p["numero"], exc))
            problemas += 1
            continue
        erros = calculo.confere(c)
        marca = "ok " if not erros else "!! "
        print("  %s%-18s mensal %s  margem %.1f%%  %s"
              % (marca, p["numero"], calculo.money(c["mensal_c"]), c["margem"],
                 "; ".join(erros)))
        if erros:
            problemas += 1
    print("\n%d proposta(s) conferidas, %d com problema." % (len(props), problemas))


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    cmd = argv[1]
    if cmd == "congelar":
        congelar(seco="--seco" in argv)
    elif cmd == "gerar":
        if len(argv) < 3:
            print("Uso: python ferramentas.py gerar <id> [pdf|pptx]")
            return 1
        gerar(argv[2], argv[3] if len(argv) > 3 else "pdf")
    elif cmd == "conferir":
        conferir()
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
