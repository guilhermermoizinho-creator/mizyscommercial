"""
Testes do motor de cálculo.

    python -m unittest discover -s tests -v

O que está aqui não é cobertura por cobertura: cada teste prende um dos
problemas que o plano de melhorias listou, para ele não voltar em silêncio.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import calculo  # noqa: E402


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
            "3": {"id": 3, "nome": "Madrugada", "hora_inicio": "22:00",
                  "hora_fim": "06:00", "intervalo_min": 0, "noturno": True},
        },
        "equipamentos": {
            "1": {"id": 1, "nome": "Uniforme", "valor": 186, "tipo": "Mensal"},
            "2": {"id": 2, "nome": "Instalação", "valor": 2400, "tipo": "Único"},
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
        "id": 1, "numero": "PRP-2026-0001", "encargos": 72, "markup": 18,
        "imposto": 14.33, "desconto": 0, "prazo": 12,
        "itens": [{"cargoId": 1, "escalaId": 1, "turnoId": 1, "qtd": 4,
                   "adicionais": [], "beneficios": [1, 2, 3]}],
        "equipamentos": [{"id": 1, "qtd": 7}],
    }
    p.update(over)
    return p


class TestCentavos(unittest.TestCase):
    """2.5 — aritmética inteira: a soma das linhas bate com o total."""

    def test_conversao(self):
        self.assertEqual(calculo.cents(1780), 178000)
        self.assertEqual(calculo.cents("14.33"), 1433)
        self.assertEqual(calculo.cents(None), 0)

    def test_formato_ptbr(self):
        self.assertEqual(calculo.money(178050), "R$ 1.780,50")
        self.assertEqual(calculo.money(-500), "R$ -5,00")
        self.assertEqual(calculo.money0(178050), "R$ 1.781")

    def test_rateio_nao_perde_centavo(self):
        for total in (100, 10007, 999999, 1):
            partes = calculo.ratear(total, [3, 3, 3])
            self.assertEqual(sum(partes), total, "rateio de %d" % total)

    def test_rateio_sem_peso(self):
        self.assertEqual(calculo.ratear(100, []), [])
        self.assertEqual(calculo.ratear(100, [0, 0]), [0, 0])


class TestFechamentoDoResumo(unittest.TestCase):
    """P1 — o slide de resumo tem que fechar a coluna, sempre."""

    def test_coluna_fecha(self):
        for desconto in (0, 2, 5, 12.5, 25):
            c = calculo.calc_proposta(proposta_base(desconto=desconto), ctx_base())
            self.assertEqual(calculo.confere(c), [], "desconto %s" % desconto)
            self.assertEqual(c["preco_mo_c"] + c["preco_equip_c"], c["preco_bruto_c"])
            self.assertEqual(c["preco_bruto_c"] - c["desconto_c"], c["mensal_c"])

    def test_soma_das_linhas_impressas(self):
        """A soma exata do que sai impresso na tabela de postos."""
        p = proposta_base(itens=[
            {"cargoId": 1, "escalaId": 1, "turnoId": 1, "qtd": 4,
             "adicionais": [], "beneficios": [1, 2, 3]},
            {"cargoId": 2, "escalaId": 2, "turnoId": 2, "qtd": 2,
             "adicionais": ["P30"], "beneficios": [1, 2]},
            {"cargoId": 1, "escalaId": 1, "turnoId": 1, "qtd": 1,
             "adicionais": ["I20"], "beneficios": [1]},
        ])
        c = calculo.calc_proposta(p, ctx_base())
        self.assertEqual(sum(i["preco_c"] for i in c["itens"]), c["preco_mo_c"])
        self.assertEqual(calculo.confere(c), [])

    def test_implantacao_tambem_e_preco(self):
        p = proposta_base(equipamentos=[{"id": 1, "qtd": 7}, {"id": 2, "qtd": 1}])
        c = calculo.calc_proposta(p, ctx_base())
        # 2400 de custo não pode sair como 2400 de venda: implantação vendida
        # a preço de custo é margem entregue de graça.
        self.assertGreater(c["implantacao_c"], calculo.cents(2400))
        self.assertEqual(sum(e["preco_c"] for e in c["equipamentos"] if e["unico"]),
                         c["implantacao_c"])


class TestPrecoNaoEhCusto(unittest.TestCase):
    """P2 — o que vai para o documento é preço de venda."""

    def test_preco_maior_que_custo(self):
        c = calculo.calc_proposta(proposta_base(), ctx_base())
        for i in c["itens"]:
            self.assertGreater(i["preco_c"], i["custo_c"])
        self.assertGreater(c["preco_bruto_c"], c["custo_direto_c"])

    def test_margem_positiva_com_markup(self):
        c = calculo.calc_proposta(proposta_base(), ctx_base())
        self.assertGreater(c["margem"], 0)


class TestAdicionalNoturno(unittest.TestCase):
    """2.1 — só as horas entre 22h e 5h, com hora ficta."""

    def test_horas_noturnas_do_turno(self):
        ctx = ctx_base()
        self.assertEqual(calculo.horas_noturnas_h(ctx["turnos"]["1"]), 0.0)
        self.assertEqual(calculo.horas_noturnas_h(ctx["turnos"]["2"]), 7.0)
        self.assertEqual(calculo.horas_noturnas_h(ctx["turnos"]["3"]), 7.0)

    def test_diurno_nao_paga_noturno(self):
        c = calculo.calc_proposta(proposta_base(), ctx_base())
        self.assertEqual(c["itens"][0]["valor_noturno_c"], 0)

    def test_noturno_e_proporcional_e_nao_integral(self):
        p = proposta_base(itens=[{"cargoId": 2, "escalaId": 1, "turnoId": 2,
                                  "qtd": 1, "adicionais": [], "beneficios": []}])
        c = calculo.calc_proposta(p, ctx_base())
        item = c["itens"][0]
        integral = calculo.cents(1920 * 0.20)     # a conta antiga
        self.assertGreater(item["valor_noturno_c"], 0)
        self.assertLess(item["valor_noturno_c"], integral)
        # 7h noturnas em 11h de jornada, com hora ficta de 52'30"
        self.assertAlmostEqual(item["noturno"]["proporcao"], 7 / 11, places=3)

    def test_turno_marcado_sem_hora_noturna_avisa(self):
        ctx = ctx_base()
        ctx["turnos"]["1"]["noturno"] = True     # marcado à toa
        p = proposta_base(itens=[{"cargoId": 1, "escalaId": 1, "turnoId": 1,
                                  "qtd": 1, "adicionais": [], "beneficios": []}])
        c = calculo.calc_proposta(p, ctx)
        self.assertEqual(c["itens"][0]["valor_noturno_c"], 0)
        self.assertTrue(c["itens"][0]["noturno"]["aviso"])


class TestInsalubridade(unittest.TestCase):
    """2.2 — a base é a que a convenção manda."""

    def _valor(self, base):
        ctx = ctx_base()
        ctx["cct"]["insalubridade_base"] = base
        p = proposta_base(itens=[{"cargoId": 2, "escalaId": 1, "turnoId": 1,
                                  "qtd": 1, "adicionais": ["I20"], "beneficios": []}])
        return calculo.calc_proposta(p, ctx)["itens"][0]["adics"][0]

    def test_base_salario_minimo(self):
        a = self._valor("minimo")
        self.assertEqual(a["base_c"], calculo.cents(1518))
        self.assertEqual(a["valor_c"], calculo.cents(1518 * 0.20))

    def test_base_piso(self):
        self.assertEqual(self._valor("piso")["base_c"], calculo.cents(1780))

    def test_base_salario_do_cargo(self):
        self.assertEqual(self._valor("salario")["base_c"], calculo.cents(1920))

    def test_periculosidade_e_sempre_sobre_o_salario(self):
        ctx = ctx_base()
        ctx["cct"]["insalubridade_base"] = "minimo"
        p = proposta_base(itens=[{"cargoId": 2, "escalaId": 1, "turnoId": 1,
                                  "qtd": 1, "adicionais": ["P30"], "beneficios": []}])
        a = calculo.calc_proposta(p, ctx)["itens"][0]["adics"][0]
        self.assertEqual(a["base_c"], calculo.cents(1920))


class TestFatorCobertura(unittest.TestCase):
    """2.3 — 12x36 não é 2 funcionários por posto."""

    def test_manual_nao_muda(self):
        ctx = ctx_base()
        f, det = calculo.fator_escala(ctx["escalas"]["1"], ctx["turnos"]["1"],
                                      ctx["config"])
        self.assertEqual(f, 1.0)
        self.assertEqual(det["modo"], "manual")

    def test_calculado_12x36(self):
        ctx = ctx_base()
        f, det = calculo.fator_escala(ctx["escalas"]["2"], ctx["turnos"]["2"],
                                      ctx["config"])
        # 12h × 7 dias ÷ 44h = 1,909 → ×1,04 (absenteísmo) ×1,0909 (férias)
        self.assertGreater(f, 2.1)
        self.assertLess(f, 2.3)
        self.assertEqual(det["horas_posto_semana"], 84.0)

    def test_duracao_liquida_vira_o_dia(self):
        ctx = ctx_base()
        self.assertEqual(calculo.duracao_turno_h(ctx["turnos"]["2"]), 11.0)
        self.assertEqual(calculo.duracao_turno_h(ctx["turnos"]["1"]), 11.0)


class TestBeneficios(unittest.TestCase):
    """2.4 — o desconto legal sai do custo da empresa."""

    def test_vt_desconta_6_pct_do_salario(self):
        ctx = ctx_base()
        b = calculo.calc_beneficio(ctx["beneficios"]["1"], calculo.cents(1780),
                                   ctx["config"])
        self.assertEqual(b["desconto_c"], calculo.cents(1780 * 0.06))
        self.assertEqual(b["custo_c"], b["valor_c"] - b["desconto_c"])

    def test_vt_nunca_desconta_mais_que_o_proprio_vale(self):
        ctx = ctx_base()
        b = calculo.calc_beneficio(dict(ctx["beneficios"]["1"], valor=50),
                                   calculo.cents(9000), ctx["config"])
        self.assertEqual(b["desconto_c"], calculo.cents(50))
        self.assertEqual(b["custo_c"], 0)

    def test_beneficio_por_dia_vira_mensal(self):
        ctx = ctx_base()
        b = calculo.calc_beneficio(ctx["beneficios"]["2"], calculo.cents(1780),
                                   ctx["config"])
        self.assertEqual(b["valor_c"], calculo.cents(30 * 22))
        self.assertEqual(b["desconto_c"], calculo.cents(30 * 22 * 0.20))

    def test_sem_desconto(self):
        ctx = ctx_base()
        b = calculo.calc_beneficio(ctx["beneficios"]["3"], calculo.cents(1780),
                                   ctx["config"])
        self.assertEqual(b["desconto_c"], 0)


class TestRobustez(unittest.TestCase):
    """Proposta capenga não pode derrubar a geração."""

    def test_sem_itens(self):
        c = calculo.calc_proposta(proposta_base(itens=[], equipamentos=[]), ctx_base())
        self.assertEqual(c["mensal_c"], 0)
        self.assertEqual(calculo.confere(c), [])

    def test_cargo_removido_e_ignorado(self):
        p = proposta_base(itens=[{"cargoId": 999, "escalaId": 1, "turnoId": 1,
                                  "qtd": 1, "adicionais": [], "beneficios": []}])
        c = calculo.calc_proposta(p, ctx_base())
        self.assertEqual(c["itens"], [])

    def test_markup_absurdo_nao_divide_por_zero(self):
        c = calculo.calc_proposta(proposta_base(markup=90, imposto=30), ctx_base())
        self.assertGreater(c["mensal_c"], 0)
        self.assertEqual(calculo.confere(c), [])


class TestTiqueteRefeicaoPorPlantao(unittest.TestCase):
    """O tíquete é por dia trabalhado — e o posto não pode pagar mais do que
    tem plantões.

    CCT SIEMACO-SP, cláusula décima quinta: o benefício é devido "por dia
    efetivamente trabalhado" e NÃO é devido em falta, afastamento médico ou
    férias. Quem sai de férias não recebe; quem cobre, recebe. O total do posto
    é um tíquete por plantão coberto, qualquer que seja o tamanho da equipe.

    O erro que este teste tranca: o custo é por funcionário e depois
    multiplicado pelo fator, que embute férias e absenteísmo. Usando os
    plantões do titular, um posto 12x36 pagava 34,51 tíquetes para cobrir 30,41
    plantões — 13,5% a mais, todo mês, num benefício que a convenção diz não
    ser devido justamente nesses dias.
    """

    def _item(self, escala_id):
        p = proposta_base(itens=[{"cargoId": 2, "escalaId": escala_id, "turnoId": 1,
                                  "qtd": 1, "adicionais": [], "beneficios": [2]}])
        c = calculo.calc_proposta(p, ctx_base())
        return c["itens"][0]

    def test_12x36_paga_um_tiquete_por_plantao_do_posto(self):
        it = self._item(2)
        vr = it["beneficios"][0]
        dias_posto = 7 * 4.345                      # posto aberto todo dia
        self.assertAlmostEqual(vr["dias"] * it["fator_aplicado"], dias_posto, places=2)

    def test_escala_de_fator_manual_nao_muda(self):
        """44h tem fator 1: o titular é o posto, e a conta é a de sempre."""
        it = self._item(1)
        vr = it["beneficios"][0]
        self.assertEqual(it["fator_aplicado"], 1.0)
        self.assertAlmostEqual(vr["dias"], 5 * 4.345, places=2)

    def test_o_fator_de_cobertura_nao_multiplica_o_tiquete(self):
        """Fator maior é mais gente para o mesmo posto, não mais refeições."""
        doze = self._item(2)
        vr = doze["beneficios"][0]
        self.assertGreater(doze["fator_aplicado"], 2.0)
        # Se o fator multiplicasse, seriam mais de 32 tíquetes.
        self.assertLess(vr["dias"] * doze["fator_aplicado"], 31)

    def test_beneficio_mensal_continua_por_cabeca(self):
        """Cesta e assistência são por empregado, inclusive em férias — a CCT
        manda entregar a cesta durante o gozo de férias. Só o que é POR DIA
        muda."""
        p = proposta_base(itens=[{"cargoId": 2, "escalaId": 2, "turnoId": 1,
                                  "qtd": 1, "adicionais": [], "beneficios": [3]}])
        c = calculo.calc_proposta(p, ctx_base())
        cesta = c["itens"][0]["beneficios"][0]
        self.assertEqual(cesta["valor_c"], calculo.cents(240))
        self.assertEqual(cesta["dias"], 0)


class TestEncargosContraACCT(unittest.TestCase):
    """Amarra o motor à TABELA DE ENCARGOS SOCIAIS MÍNIMO da CCT do SIEMACO-SP
    (cláusula septagésima segunda, CCT 2026/2027, MTE SP003552/2026).

    A convenção publica 79,5243% e esse número engana: é o TOTAL de seis
    grupos, e quatro deles o sistema já cobra em módulos próprios. Quem digitar
    79,5243 no campo de encargos paga 13º duas vezes, rescisão duas vezes e
    férias duas vezes — o preço sobe uns 40% e continua parecendo legítimo,
    porque o número veio da convenção.

    O campo de encargos é só o **submódulo 2.2**, que corresponde ao GRUPO A.
    """

    # Os seis grupos, exatamente como estão impressos na convenção.
    GRUPO_A = 36.8000    # Previdência 20 + SESI 1,5 + SENAI 1 + INCRA 0,2
    #                      + SEBRAE 0,6 + sal.-educação 2,5 + RAT 3 + FGTS 8
    GRUPO_B = 12.8737    # tempo remunerado e não trabalhado
    GRUPO_C = 12.4345    # adicional de férias e 13º
    GRUPO_D = 7.0477     # obrigações rescisórias
    GRUPO_E = 1.4904     # aprovisionamento de casos especiais
    GRUPO_F = 8.8780     # incidências cumulativas
    TOTAL_CCT = 79.5243

    def test_os_grupos_somam_o_total_publicado(self):
        soma = (self.GRUPO_A + self.GRUPO_B + self.GRUPO_C
                + self.GRUPO_D + self.GRUPO_E + self.GRUPO_F)
        self.assertAlmostEqual(soma, self.TOTAL_CCT, places=4)

    def test_submodulo_2_2_e_o_grupo_a(self):
        """RAT 3% (limpeza é grau de risco 3) e FAP 1,0."""
        enc = calculo.encargos_regime("presumido", 3.0)
        self.assertAlmostEqual(enc["total"], self.GRUPO_A, places=4)

    def test_simples_anexo_iv_e_isento_de_terceiros(self):
        """5,80 p.p. sobre toda a folha — costuma valer mais que a margem."""
        presumido = calculo.encargos_regime("presumido", 3.0)
        simples = calculo.encargos_regime("simples", 3.0)
        self.assertAlmostEqual(presumido["total"] - simples["total"], 5.80, places=4)
        self.assertTrue(simples["terceiros_isento"])

    def test_modulo_3_fica_na_ordem_do_grupo_d(self):
        """A rescisão é calibrada pelo turnover, mas não pode fugir da CCT."""
        m3 = calculo.modulo3(60.0, self.GRUPO_A)
        self.assertLess(m3["pct"], self.GRUPO_D * 1.5)
        self.assertGreater(m3["pct"], self.GRUPO_D * 0.5)

    def test_nao_ha_dupla_contagem_com_o_total_da_cct(self):
        """Somados, os módulos que replicam os grupos B..F não passam do que a
        própria convenção considera mínimo. Passar significaria cobrar duas
        vezes a mesma obrigação."""
        s21 = 11.11                                    # 13º + 1/3 de férias
        m3 = calculo.modulo3(60.0, self.GRUPO_A)["pct"]
        m4 = calculo.modulo4(3.5, self.GRUPO_A)["pct"]
        replicado = s21 + m3 + m4
        teto = self.GRUPO_B + self.GRUPO_C + self.GRUPO_D + self.GRUPO_E + self.GRUPO_F
        self.assertLess(replicado, teto,
                        "os módulos somam %.2f%%, acima dos %.2f%% que a CCT "
                        "cobra fora do Grupo A" % (replicado, teto))


if __name__ == "__main__":
    unittest.main()
