"""
Motor de cálculo da proposta — fonte única da verdade.

Tudo em CENTAVOS (inteiros). Ponto flutuante em dinheiro é o que fazia a soma
das linhas não bater com o total impresso: 0,1 + 0,2 não é 0,3 em float, e num
documento que o cliente confere linha a linha isso vira discussão comercial.

O espelho deste arquivo em JavaScript está em static/js/calculo.js. Os dois
precisam produzir exatamente o mesmo número — há teste comparando (tests/).

Regras implementadas (Fase 2 do plano de melhorias):
  2.1 adicional noturno só sobre as horas entre 22h e 5h, com hora ficta de 52'30"
  2.2 base de insalubridade configurável (mínimo / piso / salário do cargo)
  2.3 fator de funcionários por posto calculado a partir da cobertura real
  2.4 desconto legal de VT (6% do salário, teto no valor) e coparticipação de VR
  2.5 aritmética inteira em centavos
  2.6 este módulo é o motor do servidor; o front usa o espelho em JS
"""
from __future__ import annotations

import math

# ── dinheiro em centavos ─────────────────────────────────────────────────────

def arred(x) -> int:
    """Arredondamento meio-para-cima, igual ao Math.round do JavaScript.

    O round() do Python arredonda 0,5 para o par mais próximo (1780,50 → 1780).
    O JavaScript arredonda para cima (→ 1781). Como o espelho deste motor roda
    no navegador, os dois PRECISAM concordar até o centavo — senão a tela mostra
    um número e o PDF, outro.
    """
    return int(math.floor(float(x) + 0.5))


def cents(valor) -> int:
    """Converte reais (float, str ou Decimal) para centavos inteiros."""
    if valor is None or valor == "":
        return 0
    try:
        return arred(float(valor) * 100)
    except (TypeError, ValueError):
        return 0


def money(c: int) -> str:
    """Formata centavos como 'R$ 1.234,56' (pt-BR), sem depender de locale."""
    c = int(c or 0)
    sinal = "-" if c < 0 else ""
    c = abs(c)
    inteiro, resto = divmod(c, 100)
    txt = "{:,}".format(inteiro).replace(",", ".")
    return "R$ %s%s,%02d" % (sinal, txt, resto)


def money0(c: int) -> str:
    """Sem centavos — para KPI e cabeçalho, onde o centavo é ruído."""
    c = arred((c or 0) / 100.0)
    sinal = "-" if c < 0 else ""
    return "R$ %s%s" % (sinal, "{:,}".format(abs(c)).replace(",", "."))


def pct(v, padrao=0.0) -> float:
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return padrao


def _num(v, padrao=0.0) -> float:
    return pct(v, padrao)


def ratear(total: int, pesos: list[int]) -> list[int]:
    """Distribui `total` centavos proporcionalmente a `pesos`, sem perder um
    centavo: o resto vai para as maiores frações (método do maior resto).

    É o que faz a coluna do slide fechar exatamente com o total impresso.
    """
    soma = sum(pesos)
    if soma <= 0 or not pesos:
        return [0] * len(pesos)
    brutos = [total * p / soma for p in pesos]
    parte = [int(b) for b in brutos]
    resto = total - sum(parte)
    ordem = sorted(range(len(pesos)), key=lambda i: brutos[i] - parte[i], reverse=True)
    for k in range(resto):
        parte[ordem[k % len(ordem)]] += 1
    return parte


# ── horas ────────────────────────────────────────────────────────────────────

def _min_do_dia(hhmm, padrao=0) -> int:
    try:
        h, m = str(hhmm).split(":")[:2]
        return (int(h) % 24) * 60 + int(m) % 60
    except (ValueError, AttributeError):
        return padrao


def duracao_turno_h(turno) -> float:
    """Duração líquida do turno em horas (já sem o intervalo)."""
    if not turno:
        return 0.0
    ini = _min_do_dia(turno.get("hora_inicio"), 0)
    fim = _min_do_dia(turno.get("hora_fim"), 0)
    dur = fim - ini
    if dur <= 0:
        dur += 24 * 60           # o turno vira o dia
    dur -= int(_num(turno.get("intervalo_min"), 0))
    return max(dur, 0) / 60.0


def horas_noturnas_h(turno, ini_not="22:00", fim_not="05:00") -> float:
    """Horas de RELÓGIO do turno que caem na janela noturna urbana.

    Percorre o turno minuto a minuto porque a janela vira a meia-noite e o
    turno também: qualquer fórmula fechada erra num dos casos.
    """
    if not turno:
        return 0.0
    ini = _min_do_dia(turno.get("hora_inicio"), 0)
    fim = _min_do_dia(turno.get("hora_fim"), 0)
    dur = fim - ini
    if dur <= 0:
        dur += 24 * 60
    n_ini = _min_do_dia(ini_not, 22 * 60)
    n_fim = _min_do_dia(fim_not, 5 * 60)

    def noturno(minuto: int) -> bool:
        m = minuto % (24 * 60)
        if n_ini <= n_fim:          # janela dentro do mesmo dia
            return n_ini <= m < n_fim
        return m >= n_ini or m < n_fim

    return sum(1 for k in range(dur) if noturno(ini + k)) / 60.0


# ── fator de funcionários por posto (2.3) ────────────────────────────────────

def fator_escala(escala, turno, cfg) -> tuple[float, dict]:
    """Quantos funcionários cobrem 1 posto, e a memória de cálculo.

    No modo 'manual' devolve o número digitado — é o comportamento histórico e
    continua sendo o padrão, para não mudar o valor de proposta nenhuma sem que
    alguém tenha pedido.

    No modo 'calculado':

        fator = (horas de cobertura do posto por semana ÷ jornada contratual)
                × (1 + absenteísmo) × (1 + cobertura de férias)

    Para 12x36 (posto aberto 12h nos 7 dias, jornada de 44h, 4% de absenteísmo
    e cobertura de férias): 84/44 × 1,04 × 1,0909 ≈ 2,17 — e não os 2,0 que a
    conta antiga assumia.
    """
    if not escala:
        return 1.0, {"modo": "ausente", "fator": 1.0}
    if (escala.get("fator_modo") or "manual") != "calculado":
        f = _num(escala.get("fator_func"), 1) or 1.0
        return f, {"modo": "manual", "fator": f}

    horas_dia = _num(escala.get("horas_posto_dia"), 0) or duracao_turno_h(turno)
    dias = _num(escala.get("dias_semana"), 7) or 7
    contratual = _num(escala.get("horas_semanais"), 44) or 44
    base = (horas_dia * dias) / contratual if contratual else 1.0
    abs_pct = _num(escala.get("absenteismo_pct"), 0)
    fer_pct = _num(cfg.get("cobertura_ferias_pct"), 9.0909) \
        if escala.get("cobertura_ferias") else 0.0
    fator = base * (1 + abs_pct / 100.0) * (1 + fer_pct / 100.0)
    # arred/1000 e não round(...,3): o round do Python arredondaria 2,1745 para
    # o par e o Math.round do espelho em JS, para cima. Um milésimo de fator vira
    # centavos numa equipe de 40 postos, e aí a tela e o PDF discordam.
    fator = arred(max(fator, 0.01) * 1000) / 1000.0
    return fator, {
        "modo": "calculado", "horas_posto_dia": round(horas_dia, 2),
        "dias_semana": dias, "horas_semanais": contratual,
        "horas_posto_semana": round(horas_dia * dias, 2),
        "fator_base": round(base, 3), "absenteismo_pct": abs_pct,
        "cobertura_ferias_pct": fer_pct, "fator": fator,
    }


# ── adicionais ───────────────────────────────────────────────────────────────

ADICIONAIS = {
    "P30": {"nome": "Periculosidade", "pct": 30.0, "base": "salario"},
    "I20": {"nome": "Insalubridade grau médio", "pct": 20.0, "base": "insalubridade"},
    "I40": {"nome": "Insalubridade grau máximo", "pct": 40.0, "base": "insalubridade"},
    "A20": {"nome": "Acúmulo de função", "pct": None, "base": "salario"},
}


def base_insalubridade(cct, cfg, salario_c: int) -> tuple[int, str]:
    """(2.2) Sobre o que a insalubridade incide, segundo a convenção."""
    modo = (cct or {}).get("insalubridade_base") or cfg.get("insalubridade_base") or "minimo"
    if modo == "salario":
        return salario_c, "salário do cargo"
    if modo == "piso":
        piso = cents((cct or {}).get("piso_categoria"))
        return (piso or salario_c), "piso da categoria"
    minimo = cents((cct or {}).get("salario_minimo")) or cents(cfg.get("salario_minimo"))
    return (minimo or salario_c), "salário mínimo"


# ── benefícios (2.4) ─────────────────────────────────────────────────────────

def calc_beneficio(ben, salario_c: int, cfg, dias_escala=0) -> dict:
    """Valor mensal do benefício, o desconto legal do empregado e o custo real
    da empresa (que é o que entra na proposta)."""
    # `dias_escala` é quanto o EMPREGADO trabalha no mês naquela escala: 21,7 em
    # 5x2, 15,2 em 12x36. VR e VT são por dia trabalhado, então o mesmo
    # benefício custa ~30% menos num posto 12x36 — vantagem real da escala, que
    # se perde quando o sistema fixa os dias no cadastro.
    valor_c = cents(ben.get("valor"))
    if (ben.get("unid") or "mês") == "dia":
        dias = _num(dias_escala, 0) or _num(ben.get("dias_mes"), 22)
        valor_c = arred(valor_c * dias)

    tipo = ben.get("desconto_tipo") or "nenhum"
    p = _num(ben.get("desconto_pct"), 0)
    if tipo == "pct_salario":
        # Vale-transporte: o empregado paga até 6% do salário; o que passar
        # disso é custo da empresa. Nunca mais que o próprio benefício.
        if p <= 0:
            p = _num(cfg.get("vt_desconto_pct"), 6)
        desconto_c = min(arred(salario_c * p / 100.0), valor_c)
    elif tipo == "pct_valor":
        desconto_c = arred(valor_c * p / 100.0)
    else:
        desconto_c = 0
    desconto_c = max(0, min(desconto_c, valor_c))
    return {
        "id": ben.get("id"), "nome": ben.get("nome"),
        "valor_c": valor_c, "desconto_c": desconto_c,
        "custo_c": valor_c - desconto_c,
        "desconto_tipo": tipo, "desconto_pct": p,
        # A unidade e os dias efetivamente usados vão junto: é o que permite ao
        # documento escrever "R$ 21,80 × 15,2 dias" em vez de só "por mês".
        "unid": ben.get("unid") or "mês",
        "dias": (_num(dias_escala, 0) or _num(ben.get("dias_mes"), 22))
                if (ben.get("unid") or "mês") == "dia" else 0,
    }


# ── um posto de trabalho ─────────────────────────────────────────────────────

# ── MÓDULO 2.2 · encargos sociais por regime ─────────────────────────────────
# Espelho de encargosRegime() no calculo.js. O que muda entre os regimes não é
# só a alíquota do faturamento: muda a folha. O Simples do Anexo IV é isento das
# contribuições a TERCEIROS (salário-educação, INCRA, sistema S, SEBRAE) — 5,80
# pontos sobre toda a folha, normalmente mais do que a margem líquida do
# contrato. A CPRB troca 20% de INSS na folha por 2,70% sobre a receita.
#
# RAT efetivo = RAT nominal × FAP. Limpeza (CNAE 8121-4/00) e vigilância
# (8011-1/01) são grau de risco 3 → RAT 3%. O FAP vai de 0,5 a 2,0 e é a maior
# alavanca de custo que a empresa controla sozinha.
def encargos_regime(regime, rat_ef: float) -> dict:
    r = str(regime or "presumido").lower()
    if r == "simples":
        return {"inss": 20.0, "rat": rat_ef, "terceiros": 0.0, "fgts": 8.0,
                "total": 28.0 + rat_ef, "terceiros_isento": True}
    if r == "cprb":
        return {"inss": 10.0, "rat": rat_ef, "terceiros": 5.8, "fgts": 8.0,
                "total": 23.8 + rat_ef, "cprb_receita": 2.7}
    return {"inss": 20.0, "rat": rat_ef, "terceiros": 5.8, "fgts": 8.0,
            "total": 33.8 + rat_ef}


# ── MÓDULO 3 · provisão para rescisão ────────────────────────────────────────
# Os 6,36% da IN SEGES são referência, não verdade: valem para um turnover que
# quase nenhuma empresa de limpeza em SP tem. Aqui a provisão é calibrada pelo
# turnover informado.
def modulo3(turnover_pct, enc_pct, pct_indenizado=35.0) -> dict:
    t = _num(turnover_pct, 60.0) / 100.0
    p_ind = _num(pct_indenizado, 35.0) / 100.0
    enc = _num(enc_pct, 36.8) / 100.0
    multa = 0.08 * 0.40 * 0.85
    ap_ind = t * p_ind * (1.15 / 12.0)
    fgts_ap = 0.08 * ap_ind
    ap_trab = t * (1 - p_ind) * (0.25 / 12.0)
    enc_ap = enc * ap_trab
    return {"pct": (multa + ap_ind + fgts_ap + ap_trab + enc_ap) * 100.0,
            "det": {"multa": multa * 100, "ap_ind": ap_ind * 100,
                    "fgts_ap": fgts_ap * 100, "ap_trab": ap_trab * 100,
                    "enc_ap": enc_ap * 100, "turnover": t * 100,
                    "p_ind": p_ind * 100}}


# ── MÓDULO 4 · custo de reposição do ausente ─────────────────────────────────
# ⚠ A trava anti-dupla-contagem. A cobertura entra OU aqui, OU no headcount (o
# fator da escala). Nunca nas duas: contar duas vezes infla o preço em ~13% e é
# o erro nº 1 do setor. Quem decide é `cobertura_modo`.
def modulo4(absenteismo_pct, enc_pct) -> dict:
    abs_p = _num(absenteismo_pct, 3.5) / 100.0
    itens = {"ferias": 0.0833, "ausencias": 0.0082, "paternidade": 0.0002,
             "acidente": 0.0003, "maternidade": 0.0003, "absenteismo": abs_p}
    return {"pct": sum(itens.values()) * 100.0, "det": itens,
            "enc_pct": _num(enc_pct, 36.8)}


# ── MÓDULO 6 · tributos sobre o faturamento ──────────────────────────────────
# `T` é a soma das alíquotas que incidem sobre a RECEITA, e é ele que entra no
# gross-up. Duas decisões mudam o número: o REGIME e o MODO. Em licitação, IRPJ
# e CSLL não entram (TCU, Acórdão 950/2007-Plenário): são tributos sobre o lucro
# do contratado, não custo do contrato. O mesmo custo dá preços ~13% diferentes
# nos dois modos.
def tributos(o: dict) -> dict:
    modo = "licitacao" if o.get("modo") == "licitacao" else "privado"
    iss = _num(o.get("iss"), 2.0)
    i = _num(o.get("credito"), 10.0) / 100.0
    m = _num(o.get("lucro_pct"), 10.0) / 100.0
    regime = str(o.get("regime") or "presumido").lower()

    if regime == "simples":
        # Sem RBT12 informado não há faixa: cairia na primeira (4,5%) e daria um
        # preço bonito que não existe. Assume-se o teto e avisa — errar para
        # MAIS não perde dinheiro, errar para menos sim.
        rbt_informado = _num(o.get("rbt12"), 0.0) > 0
        r = _num(o.get("rbt12"), 0.0) if rbt_informado else 4800000.0
        faixas = [(180000, .045, 0), (360000, .09, 8100), (720000, .102, 12420),
                  (1800000, .14, 39780), (3600000, .22, 183780),
                  (4800000, .33, 828000)]
        f = faixas[-1]
        for x in faixas:
            if r <= x[0]:
                f = x
                break
        ef = (r * f[1] - f[2]) / r * 100.0
        return {"T": ef / 100.0, "modo": modo, "regime": regime,
                "rbt_informado": rbt_informado,
                "aviso": ("" if rbt_informado else
                          "Informe o RBT12 (receita bruta dos últimos 12 meses) para "
                          "o Simples calcular a faixa certa. Sem ele, o sistema assume "
                          "a alíquota da última faixa, que é a mais cara."),
                "detalhe": [(("DAS Anexo IV — alíquota efetiva sobre o RBT12"
                              if rbt_informado else
                              "DAS Anexo IV — SEM RBT12 informado, assumida a última faixa"), ef)],
                "nota": "CPP de 20% + RAT ficam FORA do DAS, recolhidos em GPS, e "
                        "já estão no submódulo 2.2. Em compensação há isenção de "
                        "terceiros (5,80 p.p. sobre toda a folha). Acima de R$ 3,6 "
                        "mi de RBT12 o ISS sai do DAS."}

    d = []
    if regime == "real":
        d.append(("PIS não cumulativo, líquido de créditos", 1.65 * (1 - i)))
        d.append(("COFINS não cumulativo, líquido de créditos", 7.60 * (1 - i)))
    else:
        d.append(("PIS cumulativo", 0.65))
        d.append(("COFINS cumulativo", 3.00))
    d.append(("ISS", iss))
    if regime == "cprb":
        d.append(("CPRB 2026 — 2,70% da receita bruta", 2.70))
    if modo == "privado":
        if regime == "real":
            d.append(("IRPJ 15% sobre o lucro real", 15 * m))
            d.append(("Adicional de IRPJ 10%", 10 * m * 0.85))
            d.append(("CSLL 9% sobre o lucro real", 9 * m))
        else:
            d.append(("IRPJ 15% × presunção de 32%", 4.80))
            d.append(("Adicional de IRPJ 10% × 32%", 3.20))
            d.append(("CSLL 9% × presunção de 32%", 2.88))
    t_total = sum(x[1] for x in d) / 100.0
    if modo == "licitacao":
        nota = ("Modo licitação: IRPJ e CSLL fora do campo de tributos (TCU, "
                "Acórdão 950/2007-Plenário). O lucro de planilha precisa cobri-los.")
    elif regime == "real":
        nota = ("Insumos creditáveis: %g%% da receita. A FOLHA NÃO gera crédito de "
                "PIS/COFINS — é por isso que o Real ganha do Presumido só quando a "
                "margem é baixa." % _num(o.get("credito"), 10.0))
    else:
        nota = ("Presunção de 32%: paga-se IRPJ e CSLL como se a margem fosse 32%, "
                "qualquer que seja a margem real.")
    return {"T": t_total, "modo": modo, "regime": regime, "detalhe": d, "nota": nota}


def ponto_indiferenca(credito_pct) -> float:
    """Margem contábil abaixo da qual o Lucro Real fica mais barato que o
    Presumido: 34%×m + 9,25%×(1−i) = 10,88% + 3,65%."""
    i = _num(credito_pct, 10.0) / 100.0
    return (0.1088 + 0.0365 - 0.0925 * (1 - i)) / 0.34 * 100.0


def params_preco(p, cfg) -> dict:
    """Os parâmetros de precificação: a proposta manda, a configuração é o
    padrão. Espelho de paramsPreco() no calculo.js."""
    p = p or {}
    cfg = cfg or {}

    def esc(a, b, d):
        x = a if a not in (None, "") else b
        return d if x in (None, "") else x

    def n(a, b, d):
        return _num(esc(a, b, d), d)

    regime = str(esc(p.get("regime"), cfg.get("regime_tributario"), "presumido")).lower()
    rat = n(p.get("rat"), cfg.get("rat_nominal"), 3.0)
    fap = n(p.get("fap"), cfg.get("fap"), 1.0)
    rat_ef = round(rat * fap, 4)
    enc = encargos_regime(regime, rat_ef)
    enc_manual = _num(p.get("encargos"), 0.0)
    return {
        "regime": regime, "rat": rat, "fap": fap, "rat_ef": rat_ef, "encargos": enc,
        "enc_pct": enc_manual if enc_manual > 0 else enc["total"],
        "enc_fonte": "convenção" if enc_manual > 0 else ("regime " + regime),
        "turnover": n(p.get("turnover"), cfg.get("turnover_pct"), 60.0),
        "ap_indenizado": n(None, cfg.get("aviso_indenizado_pct"), 35.0),
        "absenteismo": n(p.get("absenteismo"), cfg.get("absenteismo_pct"), 3.5),
        "ci": n(p.get("ci_pct"), cfg.get("custos_indiretos_pct"), 8.0),
        "lucro": n(p.get("markup"), cfg.get("proposta_markup"), 10.0),
        "iss": n(p.get("iss"), cfg.get("iss_pct"), 2.0),
        "credito": n(p.get("credito_pct"), cfg.get("insumos_credito_pct"), 10.0),
        "rbt12": n(p.get("rbt12"), cfg.get("rbt12"), 0.0),
        "modo": str(esc(p.get("modo_preco"), cfg.get("modo_preco"), "privado")).lower(),
        "cobertura_modo": str(esc(p.get("cobertura_modo"),
                                  cfg.get("cobertura_modo"), "headcount")).lower(),
        "piso_reduzido": n(None, cfg.get("piso_jornada_reduzida_pct"), 60.0),
    }


def calc_item(item, proposta, ctx) -> dict | None:
    """Custo de um posto. Devolve None se o cargo não existir mais."""
    cargos = ctx["cargos"]
    cargo = cargos.get(str(item.get("cargoId")))
    if not cargo:
        return None
    escala = ctx["escalas"].get(str(item.get("escalaId")))
    turno = ctx["turnos"].get(str(item.get("turnoId")))
    # A convenção é DO POSTO, não da proposta: um contrato de facilities mistura
    # categorias, e cada uma tem piso, benefício, base de insalubridade e
    # divisor de horas próprios. `item["cctId"]` manda; sem ele, a da proposta.
    cct = ((ctx.get("ccts") or {}).get(str(item.get("cctId")))
           or ctx.get("cct") or {})
    cfg = ctx.get("config") or {}

    par = params_preco(proposta, cfg)

    postos = int(_num(item.get("qtd"), 0))
    fator, fator_det = fator_escala(escala, turno, cfg)
    # A TRAVA ANTI-DUPLA-CONTAGEM, e a parte dela que é fácil errar.
    # O fator da escala tem duas camadas: a ESTRUTURAL (um plantão 12x36 exige
    # 2 empregados; um 24×7, 4 — aritmética de jornada, vale sempre) e a de
    # COBERTURA (férias e absenteísmo, que fazem o 2,00 virar 2,17). Só a
    # segunda pode migrar para o Módulo 4. Zerar o fator inteiro tirava os 2
    # empregados do plantão e subprecificava o posto pela metade.
    fator_aplicado = (( _num(fator_det.get("fator_base"), 0.0) or fator)
                      if par["cobertura_modo"] == "modulo4" else fator)
    func = postos * fator_aplicado

    # 1.A — jornada abaixo de 4h paga 60% do piso (CCT do asseio); a de 6h paga
    # piso integral. 22h/semana é a fronteira das 4h diárias.
    salario_piso_c = cents(cargo.get("salario"))
    h_sem = _num((escala or {}).get("horas_semanais"), 44.0)
    jornada_curta = 0 < h_sem < 22
    piso_reduzido = _num(cct.get("piso_jornada_reduzida_pct"), 0) or par["piso_reduzido"]
    salario_c = (arred(salario_piso_c * piso_reduzido / 100.0)
                 if jornada_curta else salario_piso_c)

    # 1.B e 1.C — periculosidade e insalubridade NÃO se acumulam (art. 193 §2º
    # da CLT): paga-se a maior das duas, e a outra fica registrada como afastada
    # para a memória poder mostrar por quê. Acúmulo de função soma normalmente.
    candidatos = []
    for cod in (item.get("adicionais") or []):
        info = ADICIONAIS.get(cod)
        if not info:
            continue
        pcv = info["pct"] if info["pct"] is not None else _num(item.get("a20"), 0)
        if pcv <= 0:
            continue
        if info["base"] == "insalubridade":
            base_c, base_nome = base_insalubridade(cct, cfg, salario_c)
        else:
            base_c, base_nome = salario_c, "salário do cargo"
        candidatos.append({"cod": cod, "nome": info["nome"], "pct": pcv,
                           "base_c": base_c, "base_nome": base_nome,
                           "valor_c": arred(base_c * pcv / 100.0),
                           "excludente": cod == "P30" or cod[:1] == "I"})
    excl = [a for a in candidatos if a["excludente"]]
    adics, afastados = [], []
    if len(excl) > 1:
        maior = max(excl, key=lambda a: a["valor_c"])
        adics.append(maior)
        afastados = [a for a in excl if a is not maior]
    else:
        adics.extend(excl)
    adics.extend([a for a in candidatos if not a["excludente"]])
    valor_adic_c = sum(a["valor_c"] for a in adics)

    noturno = calc_noturno(cargo, turno, cct, cfg, salario_c)

    # 1.G — posto unipessoal sem quem cubra o intervalo: o período é indenizado
    # com adicional de 50% (art. 71 §4º da CLT).
    # O divisor pode ser do cargo: na CCT dos bombeiros o operacional tem 180
    # h/mês e a chefia 220, dentro da mesma convenção.
    horas_mes = (_num(cargo.get("horas_mensais"), 0.0)
                 or _num(cct.get("horas_mensais"), 220.0) or 220.0)
    f_base = _num(fator_det.get("fator_base"), 0.0) or _num(
        (escala or {}).get("fator_func"), 1.0) or 1.0
    dias_posto_mes = _num((escala or {}).get("dias_semana"), 5.0) * 4.345
    plantoes = dias_posto_mes / max(f_base, 1.0)
    intervalo_c = arred((salario_c / horas_mes) * 1.5 * plantoes) if item.get("intervalo") else 0

    # ⚠ Dias de VR/VT: divide pelo fator APLICADO, não pelo fator base.
    #
    # A CCT do SIEMACO-SP é expressa (cláusula décima quinta): o tíquete é
    # devido "por dia efetivamente trabalhado", e "não é devido na ausência de
    # labor decorrente de faltas justificadas e ou injustificadas, afastamentos
    # médicos [...] e férias". Quem está de férias não recebe; quem cobre, sim.
    # O total do posto é, portanto, UM tíquete por plantão coberto.
    #
    # Só que o custo aqui é por funcionário e depois multiplicado pelo fator
    # aplicado, que embute a cobertura de férias e o absenteísmo. Usando os
    # plantões do titular, um posto 12x36 pagava 15,93 × 2,166 = 34,51 tíquetes
    # para cobrir 30,41 plantões — 13,5% a mais, todo mês, em cima de um
    # benefício que a convenção diz não ser devido nesses dias.
    #
    # Dividindo pelo fator aplicado, a multiplicação devolve exatamente os
    # plantões do posto. Em escala de fator manual (5x2, 6x1, 44h) os dois
    # fatores são o mesmo número e nada muda — só as calculadas mexem.
    dias_beneficio = dias_posto_mes / max(fator_aplicado, 0.01)

    m1 = salario_c + valor_adic_c + noturno["valor_c"] + intervalo_c

    # 2.1 — 13º (8,33%) + terço de férias (2,78%). As férias em si não entram:
    # o salário do período já está no Módulo 1, e o custo do SUBSTITUTO é do
    # Módulo 4.
    s21 = arred(m1 * 0.1111)
    # 2.2 — encargos sobre M1 + 2.1, e não só sobre M1: a provisão de 13º e
    # terço também é base de INSS, RAT, terceiros e FGTS.
    enc_pct = par["enc_pct"]
    s22 = arred((m1 + s21) * enc_pct / 100.0)

    benefs = []
    for bid in (item.get("beneficios") or []):
        b = ctx["beneficios"].get(str(bid))
        if b:
            benefs.append(calc_beneficio(b, salario_c, cfg, dias_beneficio))
    s23 = sum(b["custo_c"] for b in benefs)
    benef_bruto_c = sum(b["valor_c"] for b in benefs)
    benef_desc_c = sum(b["desconto_c"] for b in benefs)
    m2 = s21 + s22 + s23

    m3 = modulo3(par["turnover"], enc_pct, par["ap_indenizado"])
    m3_c = arred((m1 + s21) * m3["pct"] / 100.0)

    m4_c, m4 = 0, None
    if par["cobertura_modo"] == "modulo4":
        m4 = modulo4(par["absenteismo"], enc_pct)
        m4_c = arred((m1 + s21) * (m4["pct"] / 100.0) * (1 + enc_pct / 100.0)
                     + s23 * (m4["pct"] / 100.0) * 0.5)

    salario_total_c = m1
    encargos_c = s21 + s22
    benef_c = s23
    unit_func_c = m1 + m2 + m3_c + m4_c
    unit_posto_c = arred(unit_func_c * fator_aplicado)
    total_c = unit_posto_c * postos

    return {
        "cargo": cargo, "escala": escala, "turno": turno, "cct": cct,
        "postos": postos, "fator": fator, "fator_aplicado": fator_aplicado,
        "fator_detalhe": fator_det, "func": func,
        "jornada_curta": jornada_curta, "salario_piso_c": salario_piso_c,
        "base_c": salario_c, "adics": adics, "afastados": afastados,
        "pct_adic": sum(a["pct"] for a in adics),
        "valor_adic_c": valor_adic_c, "intervalo_c": intervalo_c,
        "m1": m1,
        "m2": {"s21": s21, "s22": s22, "s23": s23, "total": m2},
        "m3": {"pct": m3["pct"], "det": m3["det"], "total": m3_c},
        "m4": {"pct": (m4["pct"] if m4 else 0.0), "det": (m4["det"] if m4 else None),
               "total": m4_c, "modo": par["cobertura_modo"]},
        "noturno": noturno,
        "pct_noturno": noturno["pct"], "valor_noturno_c": noturno["valor_c"],
        "salario_total_c": salario_total_c,
        "encargos_c": encargos_c, "encargos_pct": enc_pct,
        "beneficios": benefs, "benef_c": benef_c,
        "benef_bruto_c": benef_bruto_c, "benef_desconto_c": benef_desc_c,
        "unit_func_c": unit_func_c, "unit_posto_c": unit_posto_c,
        "custo_c": total_c,
        "obs": item.get("obs") or "",
    }


def calc_noturno(cargo, turno, cct, cfg, salario_c: int) -> dict:
    """(2.1) Adicional noturno.

    Ele não incide sobre o salário inteiro: incide sobre as HORAS trabalhadas
    entre 22h e 5h, e cada 52'30" dessas valem uma hora (a hora ficta do art.
    73 da CLT). Um porteiro 19h–7h tem 7 horas noturnas de relógio numa jornada
    líquida de 11h — não 100% dela, como a conta antiga assumia.
    """
    vazio = {"pct": 0.0, "valor_c": 0, "horas_relogio": 0.0, "horas_ficta": 0.0,
             "proporcao": 0.0, "valor_hora_c": 0, "marcado": False, "aviso": ""}
    if not turno:
        return vazio

    p = _num(cfg.get("adicional_noturno"), 20)
    if p <= 0:
        return vazio

    h_rel = horas_noturnas_h(turno, cfg.get("noturno_hora_inicio", "22:00"),
                             cfg.get("noturno_hora_fim", "05:00"))
    marcado = bool(turno.get("noturno"))
    if h_rel <= 0:
        vazio = dict(vazio, marcado=marcado)
        if marcado:
            vazio["aviso"] = ("Turno marcado como noturno, mas o horário "
                              "%s–%s não tem horas entre 22h e 5h."
                              % (turno.get("hora_inicio"), turno.get("hora_fim")))
        return vazio

    dur = duracao_turno_h(turno)
    if dur <= 0:
        return dict(vazio, marcado=marcado)

    reduzida = _num(cfg.get("noturno_hora_reduzida"), 52.5) or 52.5
    horas_mes = (_num((cargo or {}).get("horas_mensais"), 0.0)
                 or _num((cct or {}).get("horas_mensais"), 220) or 220.0)
    valor_hora_c = salario_c / horas_mes

    proporcao = min(h_rel / dur, 1.0)
    horas_not_mes = horas_mes * proporcao * (60.0 / reduzida)
    valor_c = arred(valor_hora_c * (p / 100.0) * horas_not_mes)

    return {"pct": p, "valor_c": valor_c,
            "horas_relogio": round(h_rel, 2),
            "horas_ficta": round(h_rel * 60.0 / reduzida, 2),
            "horas_mes_ficta": round(horas_not_mes, 2),
            "proporcao": round(proporcao, 4),
            "valor_hora_c": arred(valor_hora_c),
            "marcado": marcado, "aviso": ""}


# ── MÓDULO 5 · insumos ───────────────────────────────────────────────────────
# Espelho de MAT_BASES no calculo.js. Uniforme, EPI, material de limpeza e
# exames. Insumo NÃO é equipamento: equipamento é bem durável com o valor cheio
# caindo todo mês, insumo é reposição — o que importa é de quanto em quanto
# tempo se troca. Daí o prazo em meses, e o custo mensal ser o valor de
# aquisição dividido por ele.
#
# A base diz por quanto multiplicar: funcionario (uniforme, EPI, exame), posto
# (rádio, chave) ou contrato (produto da área comum, valor fixo).
MAT_BASES = {"funcionario": "por funcionário", "posto": "por posto",
             "contrato": "fixo no contrato"}


def lucro_da_margem(margem_pct, t_ef: float, desconto_pct):
    """Margem líquida desejada → lucro de planilha. Espelho de lucroDaMargem().

        L = (1−T) ÷ [ ((1−T) − m) × (1−d) ] − 1

    Devolve None quando a margem não cabe no regime — o teto é (1−T), porque o
    resto do preço é imposto.
    """
    m = _num(margem_pct, 0.0) / 100.0
    d = min(max(_num(desconto_pct, 0.0) / 100.0, 0.0), 0.95)
    u = 1 - t_ef
    if m <= 0 or u <= 0:
        return 0.0
    if u - m <= 0.0001:
        return None
    return max(u / ((u - m) * (1 - d)) - 1, 0.0) * 100.0


# ── a proposta inteira ───────────────────────────────────────────────────────

def calc_proposta(proposta, ctx) -> dict:
    """Custo, preço de venda e rateio.

    O rateio é o que resolve o P1 e o P2 de uma vez: cada posto e cada
    equipamento recebem a sua fatia do PREÇO (com markup e tributos embutidos),
    a soma das fatias é exatamente o total, e o custo da empresa não aparece
    em lugar nenhum do documento.
    """
    cfg = ctx.get("config") or {}
    # `ix` é a posição no array ORIGINAL: item com cargo apagado devolve None e
    # some da lista, então o índice daqui não é o da tela. Espelho do calculo.js.
    itens = []
    for ix, it in enumerate(proposta.get("itens") or []):
        ci = calc_item(it, proposta, ctx)
        if ci:
            ci["ix"] = ix
            itens.append(ci)

    custo_mo_c = sum(i["custo_c"] for i in itens)

    equips = []
    equip_mensal_c = 0
    equip_unico_c = 0
    for e in (proposta.get("equipamentos") or []):
        eq = ctx["equipamentos"].get(str(e.get("id")))
        if not eq:
            continue
        qtd = max(int(_num(e.get("qtd"), 1)), 1)
        unit_c = cents(eq.get("valor"))
        sub_c = unit_c * qtd
        unico = (eq.get("tipo") == "Único")
        equips.append({"eq": eq, "qtd": qtd, "unit_c": unit_c,
                       "custo_c": sub_c, "unico": unico})
        if unico:
            equip_unico_c += sub_c
        else:
            equip_mensal_c += sub_c

    # ── MÓDULO 5 · insumos ──────────────────────────────────────────────────
    # `func` é o headcount REAL (postos × fator da escala), não o número de
    # postos: uniforme se compra por pessoa, e num 12x36 são duas por posto.
    total_postos = sum(i["postos"] for i in itens)
    total_func = sum(i["func"] for i in itens)

    mats = []
    insumos_c = 0
    for m in (proposta.get("materiais") or []):
        mat = (ctx.get("materiais") or {}).get(str(m.get("id")))
        if not mat:
            continue
        qtd = max(_num(m.get("qtd"), 1), 0.0)
        meses = max(int(_num(mat.get("meses"), 1)), 1)
        base = str(mat.get("base") or "").lower()
        if base not in MAT_BASES:
            base = "funcionario"
        mult = total_postos if base == "posto" else (1 if base == "contrato" else total_func)
        unit_c = cents(mat.get("valor"))
        unit_mes_c = arred(unit_c / meses)
        custo_c = arred(unit_mes_c * qtd * mult)
        mats.append({"mat": mat, "qtd": qtd, "meses": meses, "base": base,
                     "mult": mult, "unit_c": unit_c, "unit_mes_c": unit_mes_c,
                     "custo_c": custo_c})
        insumos_c += custo_c

    # ── MÓDULO 6 · indiretos, lucro e tributos ──────────────────────────────
    # A ordem é a da IN SEGES 05/2017 e não pode ser trocada:
    #
    #   CD    = M1 + M2 + M3 + M4 + M5
    #   CI    = CD × %indiretos
    #   SUB   = CD + CI
    #   LUCRO = SUB × %lucro
    #   BASE  = SUB + LUCRO
    #   PV    = BASE ÷ (1 − T)        ← imposto POR DENTRO
    #
    # O gross-up é o ponto em que mais se perde dinheiro no setor. Multiplicar
    # por (1 + T) parece a mesma coisa e não é: com T de 16,53%, multiplicar dá
    # 116,53 e dividir dá 119,80. Os 2,8% de diferença saem inteiros do lucro.
    par = params_preco(proposta, cfg)
    custo_direto_c = custo_mo_c + insumos_c + equip_mensal_c

    imp_manual = _num(proposta.get("imposto"), 0)

    def trib_de(lucro):
        return tributos({"regime": par["regime"], "modo": par["modo"],
                         "iss": par["iss"], "credito": par["credito"],
                         "lucro_pct": lucro, "rbt12": par["rbt12"]})

    def t_de(tr):
        return min(max(imp_manual / 100.0 if imp_manual > 0 else tr["T"], 0.0), 0.9)

    # ── margem alvo ─────────────────────────────────────────────────────────
    # Preenchida, ela manda no lucro de planilha. No Lucro Real vira um laço —
    # IRPJ e CSLL incidem sobre o lucro, então T depende de L e L depende de T.
    # Ponto fixo resolve; nos outros regimes a primeira volta já é exata.
    margem_alvo = _num(proposta.get("margem_alvo"), 0)
    par["margem_alvo"] = margem_alvo
    par["margem_aviso"] = ""
    par["lucro_fonte"] = "informado"
    if margem_alvo > 0:
        for _ in range(8):
            achado = lucro_da_margem(margem_alvo, t_de(trib_de(par["lucro"])),
                                     _num(proposta.get("desconto"), 0))
            if achado is None:
                teto = (1 - t_de(trib_de(par["lucro"]))) * 100
                _v = f"{margem_alvo:.1f}".replace(".", ",")
                _t = f"{teto:.1f}".replace(".", ",")
                par["margem_aviso"] = (
                    f"Margem de {_v}% não cabe neste regime: o teto é {_t}%, "
                    "porque o resto é imposto. Usando o lucro de planilha "
                    "informado.")
                break
            parou = abs(achado - par["lucro"]) < 1e-7
            par["lucro"] = achado
            if parou:
                break
        if not par["margem_aviso"]:
            par["lucro_fonte"] = "margem alvo"

    ci_c = arred(custo_direto_c * par["ci"] / 100.0)
    subtotal_c = custo_direto_c + ci_c
    lucro_planilha_c = arred(subtotal_c * par["lucro"] / 100.0)
    base_c = subtotal_c + lucro_planilha_c

    trib = trib_de(par["lucro"])
    t_ef = t_de(trib)
    desconto = _num(proposta.get("desconto"), 0) / 100.0

    preco_bruto_c = arred(base_c / (1 - t_ef))
    desconto_c = arred(preco_bruto_c * desconto)
    mensal_c = preco_bruto_c - desconto_c
    imposto_c = arred(mensal_c * t_ef)
    lucro_c = mensal_c - custo_direto_c - ci_c - imposto_c
    margem = (lucro_c / mensal_c * 100.0) if mensal_c else 0.0

    # Implantação também é venda, não custo repassado.
    implantacao_c = (arred(equip_unico_c * (1 + par["ci"] / 100.0)
                           * (1 + par["lucro"] / 100.0) / (1 - t_ef))
                     if equip_unico_c else 0)

    # ── rateio do preço bruto entre postos e equipamentos mensais ──
    # Materiais entram no rateio junto com postos e equipamentos: assim também
    # saem do documento com PREÇO, nunca com o custo de aquisição, e a soma das
    # três colunas continua batendo com o total exato.
    mensais = [e for e in equips if not e["unico"]]
    pesos = ([i["custo_c"] for i in itens] + [m["custo_c"] for m in mats]
             + [e["custo_c"] for e in mensais])
    fatias = ratear(preco_bruto_c, pesos)
    k = 0
    for i in itens:
        i["preco_c"] = fatias[k]
        i["preco_unit_c"] = arred(fatias[k] / i["postos"]) if i["postos"] else fatias[k]
        k += 1
    for m in mats:
        m["preco_c"] = fatias[k]
        m["preco_unit_c"] = arred(fatias[k] / m["qtd"]) if m["qtd"] else fatias[k]
        k += 1
    for e in equips:
        if not e["unico"]:
            e["preco_c"] = fatias[k]
            e["preco_unit_c"] = arred(fatias[k] / e["qtd"]) if e["qtd"] else fatias[k]
            k += 1

    unicos = [e for e in equips if e["unico"]]
    fatias_u = ratear(implantacao_c, [e["custo_c"] for e in unicos])
    for ix, e in enumerate(unicos):
        e["preco_c"] = fatias_u[ix]
        e["preco_unit_c"] = arred(fatias_u[ix] / e["qtd"]) if e["qtd"] else fatias_u[ix]

    preco_mo_c = sum(i["preco_c"] for i in itens)
    preco_mat_c = sum(m["preco_c"] for m in mats)
    preco_equip_c = sum(e["preco_c"] for e in mensais)

    prazo = int(_num(proposta.get("prazo"), 12) or 12)
    return {
        "itens": itens, "materiais": mats, "equipamentos": equips,
        "par": par, "trib": trib,
        # a cascata do Módulo 6, para a planilha aberta
        "ci_c": ci_c, "subtotal_c": subtotal_c, "lucro_planilha_c": lucro_planilha_c,
        "base_c": base_c, "T": t_ef,
        "markup": (preco_bruto_c / custo_direto_c) if custo_direto_c else 0.0,
        # custo — só a tela interna vê
        "custo_mo_c": custo_mo_c, "insumos_c": insumos_c,
        "equip_mensal_c": equip_mensal_c,
        "equip_unico_c": equip_unico_c, "custo_direto_c": custo_direto_c,
        # preço — é o que vai para o documento
        "preco_mo_c": preco_mo_c, "preco_mat_c": preco_mat_c,
        "preco_equip_c": preco_equip_c,
        "preco_bruto_c": preco_bruto_c, "desconto_c": desconto_c,
        "mensal_c": mensal_c, "implantacao_c": implantacao_c,
        "imposto_c": imposto_c, "lucro_c": lucro_c, "margem": margem,
        "postos": total_postos, "func": total_func,
        "contrato_c": mensal_c * prazo + implantacao_c,
        "total_primeiro_c": mensal_c + implantacao_c,
        "prazo": prazo,
    }


def confere(c: dict) -> list[str]:
    """Checagens que precisam valer sempre. Usado nos testes e no /api/saude —
    se alguma falhar, o documento estaria imprimindo uma coluna que não fecha.
    """
    erros = []
    soma = c["preco_mo_c"] + c.get("preco_mat_c", 0) + c["preco_equip_c"]
    if soma != c["preco_bruto_c"]:
        erros.append("rateio não fecha: %d + %d + %d ≠ %d"
                     % (c["preco_mo_c"], c.get("preco_mat_c", 0),
                        c["preco_equip_c"], c["preco_bruto_c"]))
    if c["preco_bruto_c"] - c["desconto_c"] != c["mensal_c"]:
        erros.append("subtotal − desconto ≠ mensal")
    soma_u = sum(e["preco_c"] for e in c["equipamentos"] if e["unico"])
    if soma_u != c["implantacao_c"]:
        erros.append("rateio da implantação não fecha")
    return erros
