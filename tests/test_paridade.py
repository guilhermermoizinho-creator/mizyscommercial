"""
Paridade entre os dois motores de cálculo.

    python -m unittest tests.test_paridade -v

O motor existe duas vezes — `calculo.py` no servidor e `static/js/calculo.js`
no navegador — e os dois precisam devolver o MESMO CENTAVO. A tela mostra um
valor, o PDF mostra outro, e quem descobre a diferença é o cliente no meio da
reunião.

Até a versão anterior isso era garantido "por construção" (centavos inteiros,
arredondamento meio-para-cima, rateio pelo maior resto) e conferido a olho pelo
botão "Conferir com o cálculo do servidor". Com o Node disponível na máquina,
passou a ser teste: `tests/paridade.js` roda o motor do navegador e devolve os
números com os nomes do lado Python.

Sem Node instalado o teste é PULADO, não quebra — a máquina de quem só mexe no
backend não precisa de runtime de JavaScript para rodar a suíte.
"""
import json
import os
import shutil
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import calculo  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PONTE = os.path.join(RAIZ, "tests", "paridade.js")
NODE = shutil.which("node")


def ctx_base(**over):
    ctx = {
        "cargos": {
            "1": {"id": 1, "nome": "Auxiliar de Limpeza", "salario": 1780},
            "2": {"id": 2, "nome": "Porteiro", "salario": 1920},
        },
        "beneficios": {
            "1": {"id": 1, "nome": "Vale-transporte", "valor": 352, "unid": "mês",
                  "desconto_tipo": "pct_salario", "desconto_pct": 6},
            "2": {"id": 2, "nome": "Vale-refeição", "valor": 30, "unid": "dia",
                  "dias_mes": 22, "desconto_tipo": "pct_valor", "desconto_pct": 20},
            "3": {"id": 3, "nome": "Cesta básica", "valor": 240, "unid": "mês",
                  "desconto_tipo": "nenhum", "desconto_pct": 0},
        },
        "escalas": {
            "1": {"id": 1, "nome": "44h", "horas_semanais": 44,
                  "fator_modo": "manual", "fator_func": 1},
            "2": {"id": 2, "nome": "12x36", "horas_semanais": 44,
                  "fator_modo": "calculado", "dias_semana": 7,
                  "horas_posto_dia": 12, "absenteismo_pct": 4,
                  "cobertura_ferias": True},
        },
        "turnos": {
            "1": {"id": 1, "nome": "Diurno", "hora_inicio": "07:00",
                  "hora_fim": "19:00", "intervalo_min": 60, "noturno": False},
            "2": {"id": 2, "nome": "Noturno", "hora_inicio": "19:00",
                  "hora_fim": "07:00", "intervalo_min": 60, "noturno": True},
        },
        "equipamentos": {
            "1": {"id": 1, "nome": "Enceradeira", "valor": 186, "tipo": "Mensal"},
            "2": {"id": 2, "nome": "Instalação", "valor": 2400, "tipo": "Único"},
        },
        # MÓDULO 5 — as três bases, porque é nelas que um motor pode divergir
        # do outro sem ninguém notar: multiplicador errado não gera erro, gera
        # preço errado.
        "materiais": {
            "1": {"id": 1, "nome": "Uniforme", "valor": 190, "meses": 6,
                  "base": "funcionario"},
            "2": {"id": 2, "nome": "Rádio", "valor": 240, "meses": 24,
                  "base": "posto"},
            "3": {"id": 3, "nome": "Material de limpeza", "valor": 320, "meses": 1,
                  "base": "contrato"},
            "4": {"id": 4, "nome": "Kit EPI", "valor": 48, "meses": 3,
                  "base": "funcionario"},
        },
        "cct": {"id": 1, "insalubridade_base": "minimo", "salario_minimo": 1518,
                "piso_categoria": 1780, "horas_mensais": 220},
        "config": {"adicional_noturno": "20", "salario_minimo": "1518",
                   "noturno_hora_inicio": "22:00", "noturno_hora_fim": "05:00",
                   "noturno_hora_reduzida": "52.5", "vt_desconto_pct": "6",
                   "cobertura_ferias_pct": "9.0909"},
    }
    ctx.update(over)
    return ctx


def proposta_base(**over):
    p = {
        "itens": [
            {"cargoId": 1, "escalaId": 1, "turnoId": 1, "qtd": 3,
             "adicionais": [], "beneficios": [1, 2, 3], "obs": ""},
            {"cargoId": 2, "escalaId": 2, "turnoId": 2, "qtd": 2,
             "adicionais": ["P30"], "beneficios": [1, 2], "obs": ""},
        ],
        "materiais": [{"id": 1, "qtd": 2}, {"id": 2, "qtd": 1},
                      {"id": 3, "qtd": 1}, {"id": 4, "qtd": 1}],
        "equipamentos": [{"id": 1, "qtd": 2}, {"id": 2, "qtd": 1}],
        "encargos": 0, "markup": 18, "imposto": 0, "desconto": 0,
        "margem_alvo": 0, "prazo": 12, "validade": 30,
    }
    p.update(over)
    return p


def pelo_js(proposta, ctx):
    entrada = json.dumps({"proposta": proposta, "ctx": ctx}).encode("utf-8")
    r = subprocess.run([NODE, PONTE], input=entrada,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise AssertionError("paridade.js falhou:\n" + r.stderr.decode("utf-8", "replace"))
    return json.loads(r.stdout.decode("utf-8"))


def pelo_py(proposta, ctx):
    c = calculo.calc_proposta(proposta, ctx)
    return {
        "custo_mo_c": c["custo_mo_c"], "insumos_c": c["insumos_c"],
        "equip_mensal_c": c["equip_mensal_c"], "equip_unico_c": c["equip_unico_c"],
        "custo_direto_c": c["custo_direto_c"], "ci_c": c["ci_c"],
        "subtotal_c": c["subtotal_c"], "lucro_planilha_c": c["lucro_planilha_c"],
        "base_c": c["base_c"], "T": c["T"], "preco_bruto_c": c["preco_bruto_c"],
        "desconto_c": c["desconto_c"], "mensal_c": c["mensal_c"],
        "imposto_c": c["imposto_c"], "lucro_c": c["lucro_c"], "margem": c["margem"],
        "implantacao_c": c["implantacao_c"], "contrato_c": c["contrato_c"],
        "preco_mo_c": c["preco_mo_c"], "preco_mat_c": c["preco_mat_c"],
        "preco_equip_c": c["preco_equip_c"],
        "postos": c["postos"], "func": c["func"],
        "par_lucro": c["par"]["lucro"], "par_enc_pct": c["par"]["enc_pct"],
        "margem_aviso": c["par"]["margem_aviso"],
        "itens": [{
            "ix": i["ix"],
            "custo_c": i["custo_c"], "preco_c": i["preco_c"],
            "unit_func_c": i["unit_func_c"], "unit_posto_c": i["unit_posto_c"],
            "func": i["func"], "fator": i["fator"],
            "m1": i["m1"], "s21": i["m2"]["s21"], "s22": i["m2"]["s22"],
            "s23": i["m2"]["s23"], "m3": i["m3"]["total"], "m4": i["m4"]["total"],
        } for i in c["itens"]],
        "materiais": [{
            "custo_c": m["custo_c"], "preco_c": m["preco_c"],
            "unit_mes_c": m["unit_mes_c"], "mult": m["mult"], "base": m["base"],
        } for m in c["materiais"]],
        "equipamentos": [{"custo_c": e["custo_c"], "preco_c": e["preco_c"]}
                         for e in c["equipamentos"]],
        "problemas": calculo.confere(c),
    }


@unittest.skipIf(NODE is None, "Node não instalado — paridade conferida só em produção")
class Paridade(unittest.TestCase):
    """Os dois motores, o mesmo centavo."""

    def compara(self, proposta, ctx, rotulo):
        js, py = pelo_js(proposta, ctx), pelo_py(proposta, ctx)

        # Dinheiro é centavo INTEIRO: qualquer diferença é bug, não tolerância.
        for k, v in py.items():
            if isinstance(v, int):
                self.assertEqual(js[k], v, f"{rotulo}: {k} — js {js[k]} × py {v}")

        # Percentual e fator são float nos dois lados; a diferença aceitável é
        # de ponto flutuante, não de fórmula.
        for k in ("T", "margem", "func", "par_lucro", "par_enc_pct"):
            self.assertAlmostEqual(js[k], py[k], places=9,
                                   msg=f"{rotulo}: {k} — js {js[k]} × py {py[k]}")

        self.assertEqual(js["margem_aviso"], py["margem_aviso"], rotulo)
        self.assertEqual(js["problemas"], py["problemas"], rotulo)
        self.assertEqual([], py["problemas"], f"{rotulo}: invariante quebrada")

        for lista in ("itens", "materiais", "equipamentos"):
            self.assertEqual(len(js[lista]), len(py[lista]), f"{rotulo}: {lista}")
            for ix, (a, b) in enumerate(zip(js[lista], py[lista])):
                for k, v in b.items():
                    if isinstance(v, float):
                        self.assertAlmostEqual(a[k], v, places=9,
                                               msg=f"{rotulo}: {lista}[{ix}].{k}")
                    else:
                        self.assertEqual(a[k], v, f"{rotulo}: {lista}[{ix}].{k}")

    def test_proposta_completa(self):
        """Postos, materiais nas três bases e equipamentos, tudo junto."""
        self.compara(proposta_base(), ctx_base(), "completa")

    def test_regimes(self):
        """Cada regime monta encargos e tributos diferentes."""
        for regime in ("presumido", "real", "simples", "cprb"):
            with self.subTest(regime=regime):
                p = proposta_base(regime=regime, rbt12=2_400_000)
                self.compara(p, ctx_base(), "regime " + regime)

    def test_margem_alvo(self):
        """A conta invertida: margem alvo → lucro de planilha.

        O Lucro Real é o caso que separa os motores, porque lá o IRPJ incide
        sobre o lucro e o ponto fixo tem que convergir igual nos dois lados.
        """
        for regime in ("presumido", "real", "simples"):
            for alvo in (5, 12, 15.5, 22):
                with self.subTest(regime=regime, alvo=alvo):
                    p = proposta_base(regime=regime, margem_alvo=alvo,
                                      rbt12=2_400_000)
                    self.compara(p, ctx_base(), f"alvo {alvo}% no {regime}")

    def test_margem_alvo_entrega_a_margem_pedida(self):
        """Não basta os dois concordarem: o número tem que estar certo."""
        for alvo in (8, 15, 25):
            p = proposta_base(margem_alvo=alvo)
            c = calculo.calc_proposta(p, ctx_base())
            self.assertAlmostEqual(c["margem"], alvo, places=1,
                                   msg=f"pediu {alvo}%, entregou {c['margem']:.4f}%")

    def test_margem_alvo_com_desconto(self):
        """O desconto entra na fórmula: sem isso a margem sai furada."""
        p = proposta_base(margem_alvo=15, desconto=8)
        c = calculo.calc_proposta(p, ctx_base())
        self.assertAlmostEqual(c["margem"], 15, places=1)
        self.compara(p, ctx_base(), "alvo com desconto")

    def test_margem_impossivel_avisa_nos_dois(self):
        """Margem acima de (1−T) não existe — e os dois têm que dizer isso."""
        p = proposta_base(margem_alvo=95)
        c = calculo.calc_proposta(p, ctx_base())
        self.assertTrue(c["par"]["margem_aviso"], "deveria avisar")
        self.assertEqual(c["par"]["lucro_fonte"], "informado")
        self.compara(p, ctx_base(), "margem impossível")

    def test_sem_material(self):
        """Proposta sem Módulo 5 tem que dar exatamente o que dava antes."""
        self.compara(proposta_base(materiais=[]), ctx_base(), "sem material")

    def test_so_material(self):
        """Nenhum posto: as bases por funcionário e por posto zeram."""
        p = proposta_base(itens=[], equipamentos=[])
        self.compara(p, ctx_base(), "só material")

    def test_desconto_e_licitacao(self):
        p = proposta_base(desconto=7.5, modo_preco="licitacao", regime="real")
        self.compara(p, ctx_base(), "licitação com desconto")


@unittest.skipIf(NODE is None, "Node não instalado")
class Modulo5(unittest.TestCase):
    """O que o Módulo 5 tem que fazer, independente de paridade."""

    def test_prazo_de_troca_divide_o_custo(self):
        """Uniforme de R$ 190 a cada 6 meses é R$ 31,67/mês, não R$ 190."""
        ctx = ctx_base()
        p = proposta_base(itens=[{"cargoId": 1, "escalaId": 1, "turnoId": 1,
                                  "qtd": 1, "adicionais": [], "beneficios": []}],
                          materiais=[{"id": 1, "qtd": 1}], equipamentos=[])
        c = calculo.calc_proposta(p, ctx)
        # 1 posto na escala 44h com fator 1 → 1 funcionário
        self.assertEqual(c["func"], 1)
        self.assertEqual(c["insumos_c"], calculo.arred(19000 / 6))

    def test_base_funcionario_usa_headcount_nao_postos(self):
        """Num 12x36 são ~2 pessoas por posto: o uniforme segue a pessoa."""
        ctx = ctx_base()
        p = proposta_base(itens=[{"cargoId": 2, "escalaId": 2, "turnoId": 2,
                                  "qtd": 1, "adicionais": [], "beneficios": []}],
                          materiais=[{"id": 1, "qtd": 1}], equipamentos=[])
        c = calculo.calc_proposta(p, ctx)
        self.assertGreater(c["func"], 1.9, "12x36 tem que passar de 1,9 funcionários")
        self.assertEqual(c["materiais"][0]["mult"], c["func"])
        self.assertEqual(c["materiais"][0]["custo_c"],
                         calculo.arred(calculo.arred(19000 / 6) * c["func"]))

    def test_base_contrato_nao_multiplica(self):
        ctx = ctx_base()
        p = proposta_base(materiais=[{"id": 3, "qtd": 1}], equipamentos=[])
        c = calculo.calc_proposta(p, ctx)
        self.assertEqual(c["materiais"][0]["mult"], 1)
        self.assertEqual(c["materiais"][0]["custo_c"], 32000)

    def test_material_entra_no_custo_direto(self):
        """Sem isso o material seria de graça: apareceria na tela e não no preço."""
        ctx = ctx_base()
        sem = calculo.calc_proposta(proposta_base(materiais=[]), ctx)
        com = calculo.calc_proposta(proposta_base(), ctx)
        self.assertGreater(com["custo_direto_c"], sem["custo_direto_c"])
        self.assertGreater(com["mensal_c"], sem["mensal_c"])
        self.assertEqual(com["custo_direto_c"] - sem["custo_direto_c"],
                         com["insumos_c"])


if __name__ == "__main__":
    unittest.main()


@unittest.skipIf(NODE is None, "Node não instalado")
class Telas(unittest.TestCase):
    """As telas pintam sem exceção.

    `tests/telas.js` carrega os arquivos de tela num Node com o mínimo de
    navegador fingido e manda cada VIEW montar o HTML, com um banco de mentira.
    Pega o erro que nenhum outro teste via: função que não existe. As telas
    montam HTML por template string — helper renomeado não aparece no
    `node --check` nem na suíte em Python, e só estoura na cara de quem abriu a
    proposta.
    """

    def test_todas_as_telas(self):
        r = subprocess.run([NODE, os.path.join(RAIZ, "tests", "telas.js")],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        saida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, "\n" + saida)
