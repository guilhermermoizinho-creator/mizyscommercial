"""
Os arquivos de JavaScript do sistema são `<script>` comuns, não módulos — e por
isso TODOS compartilham o mesmo escopo global. Declarar `const somaDias` num
arquivo quando ela já existe em outro não dá conflito de merge, não dá erro de
lint e passa liso no `node --check`, que valida um arquivo por vez.

No navegador, porém, o arquivo inteiro é rejeitado:

    SyntaxError: Identifier 'somaDias' has already been declared

E aí some uma tela inteira do sistema — sem erro visível, sem pista. Foi
exatamente o que aconteceu com o editor de proposta: abrir a proposta mostrava
a tela inicial, porque `VIEWS.propostaEditor` nunca chegou a ser registrado.

Este teste junta todos os arquivos na ordem em que o template os carrega e
verifica se o conjunto compila — que é o que o navegador faz de verdade.
Precisa do node instalado; sem ele, o teste é pulado em vez de falhar.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(RAIZ, "templates", "my_crm.html")
JS = os.path.join(RAIZ, "static", "js")


def _ordem_do_template() -> list[str]:
    """A ordem importa: é a mesma em que o navegador avalia os arquivos."""
    html = open(TEMPLATE, encoding="utf-8").read()
    return re.findall(r"filename='js/([\w.-]+)'", html)


class EscopoGlobal(unittest.TestCase):
    def setUp(self):
        if not shutil.which("node"):
            self.skipTest("node não encontrado")

    def test_arquivos_convivem_no_mesmo_escopo(self):
        arquivos = _ordem_do_template()
        self.assertTrue(arquivos, "nenhum script encontrado no template")
        faltando = [a for a in arquivos if not os.path.isfile(os.path.join(JS, a))]
        self.assertEqual(faltando, [], "o template carrega arquivo que não existe")

        script = (
            "const fs=require('fs');"
            "const arqs=%s;"
            "const junto=arqs.map(a=>fs.readFileSync(%s+'/'+a,'utf8')).join('\\n;\\n');"
            "try{ new Function(junto); console.log('OK'); }"
            "catch(e){ console.log('ERRO: '+e.message); }"
        ) % (json.dumps(arquivos), json.dumps(JS.replace("\\", "/")))

        saida = subprocess.run(["node", "-e", script], capture_output=True,
                               text=True, timeout=60).stdout.strip()
        self.assertEqual(saida, "OK", saida)


if __name__ == "__main__":
    unittest.main()
