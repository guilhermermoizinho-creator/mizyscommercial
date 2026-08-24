"""
As telas são montadas com template string em JavaScript, e o navegador não
reclama de `<div>` sem fechar: ele conserta sozinho, aninhando o resto do
documento lá dentro. O sintoma nunca aponta para a causa — foi assim que o
painel de resumo da proposta sumiu da direita e ninguém entendeu por quê. A
`<div>` do primeiro cartão ficou aberta, engoliu tudo o que vinha depois, e a
segunda coluna da grade ficou vazia.

Este teste conta as tags de cada função dos arquivos de tela. Não é um parser de
HTML, e não precisa ser: o que se quer pegar é a tag esquecida, e para isso
contar abre contra fecha resolve.

Se uma função nova abrir uma tag de propósito para a chamadora fechar, ela entra
em SEM_BALANCO com o motivo escrito — mas pense duas vezes antes, porque HTML
partido em duas funções é exatamente o que torna esse defeito difícil de achar.
"""
from __future__ import annotations

import glob
import io
import os
import re
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQUIVOS = sorted(glob.glob(os.path.join(RAIZ, "static", "js", "views-*.js"))) + [
    os.path.join(RAIZ, "static", "js", "ui.js"),
    os.path.join(RAIZ, "static", "js", "graficos.js"),
]

# Tags que se fecham sozinhas não entram na conta.
TAGS = ("div", "table", "tbody", "thead", "tr", "td", "th", "select", "details", "svg")

SEM_BALANCO: dict[str, str] = {
    # "nomeDaFuncao": "por que abre sem fechar"
}

INICIO_DE_BLOCO = re.compile(
    r"^(?:function\s+(\w+)|VIEWS\.(\w+)\s*=\s*function|const\s+(\w+)\s*=)", re.M)


def _sem_comentarios(fonte: str) -> str:
    """Tira os comentários antes de contar. Sem isso, um `<details>` citado num
    comentário — como o que explica a memória de cálculo — entra na conta e
    acusa desequilíbrio onde não há. Só bloco /* */ e linha que COMEÇA com //
    ou *: `//` no meio de uma linha pode ser uma URL dentro de string."""
    fonte = re.sub(r"/\*.*?\*/", "", fonte, flags=re.S)
    linhas = fonte.split(chr(10))
    limpas = ["" if l.lstrip().startswith(("//", "*")) else l for l in linhas]
    return chr(10).join(limpas)


def _blocos(fonte: str):
    """Cada função de nível zero do arquivo, com o nome e a linha."""
    marcas = [(m.start(), m.group(1) or m.group(2) or m.group(3) or "?")
              for m in INICIO_DE_BLOCO.finditer(fonte)]
    for i, (ini, nome) in enumerate(marcas):
        fim = marcas[i + 1][0] if i + 1 < len(marcas) else len(fonte)
        yield nome, fonte[:ini].count("\n") + 1, fonte[ini:fim]


class TagsBalanceadas(unittest.TestCase):
    def test_toda_tag_aberta_e_fechada(self):
        problemas = []
        for caminho in ARQUIVOS:
            fonte = _sem_comentarios(io.open(caminho, encoding="utf-8").read())
            arquivo = os.path.basename(caminho)
            for nome, linha, bloco in _blocos(fonte):
                if nome in SEM_BALANCO:
                    continue
                for tag in TAGS:
                    abre = len(re.findall(r"<%s\b" % tag, bloco))
                    fecha = len(re.findall(r"</%s>" % tag, bloco))
                    if abre != fecha:
                        problemas.append(
                            "%s:%d  %s() — <%s> aberta %d vez(es), fechada %d"
                            % (arquivo, linha, nome, tag, abre, fecha))
        self.assertEqual(problemas, [], "\n" + "\n".join(problemas))


if __name__ == "__main__":
    unittest.main()


class FusoDoCarimbo(unittest.TestCase):
    """
    `created_at` volta do Postgres em UTC. Cortar os 10 primeiros caracteres
    faz sumir do dashboard tudo que foi criado depois das 21h no Brasil.
    """

    def test_dia_de_converte_carimbo_utc(self):
        js = os.path.join(RAIZ, "static", "js")
        util = open(os.path.join(js, "util.js"), encoding="utf-8").read()
        self.assertIn("const diaDe =", util, "helper de fuso sumiu do util.js")
        crm = open(os.path.join(js, "views-crm.js"), encoding="utf-8").read()
        self.assertNotIn("String(o.created_at || '').slice(0,10)", crm,
                         "dataDaOp voltou a cortar o carimbo UTC na mão")
        self.assertIn("diaDe(", crm)
