"""
Gera o modelo base da apresentação comercial da Mizys.

    python modelo_ppt/build_modelo.py

O arquivo produzido (modelo_ppt/mizys_proposta.pptx) é só um esqueleto: todo
texto variável está escrito como {CHAVE}. Quem troca {CHAVE} pelo dado real da
proposta é o ppt.py, tanto no download do PPT quanto no do PDF — por isso os
dois saem idênticos.

Rode este script de novo sempre que quiser mudar o visual do modelo. Se você
preferir editar o .pptx direto no PowerPoint, pode: basta manter os {CHAVE} e as
linhas-modelo das tabelas intactas.
"""
import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "mizys_proposta.pptx")

AZUL = RGBColor(0x1D, 0x4E, 0xD8)
AZUL_CLARO = RGBColor(0x3B, 0x82, 0xF6)
ESCURO = RGBColor(0x0F, 0x17, 0x2A)
CINZA = RGBColor(0x64, 0x74, 0x8B)
CLARO = RGBColor(0xF1, 0xF5, 0xF9)
BRANCO = RGBColor(0xFF, 0xFF, 0xFF)

L, A = Inches(13.333), Inches(7.5)  # 16:9


# ── helpers ───────────────────────────────────────────────────────────────────

def slide_vazio(prs, marcador=None):
    """Slide em branco. `marcador` grava o nome do slide nas ANOTAÇÕES.

    É por esse nome que o ppt.py liga e desliga slides opcionais. Anotação, e
    não texto no corpo: não é impressa, não aparece na apresentação e sobrevive
    a qualquer reescrita de título feita no PowerPoint.
    """
    s = prs.slides.add_slide(prs.slide_layouts[6])  # layout "em branco"
    if marcador:
        s.notes_slide.notes_text_frame.text = "SLIDE:%s" % marcador
    return s


def retangulo(slide, x, y, cx, cy, cor):
    from pptx.enum.shapes import MSO_SHAPE
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, cx, cy)
    sh.fill.solid()
    sh.fill.fore_color.rgb = cor
    sh.line.fill.background()
    sh.shadow.inherit = False
    return sh


def texto(slide, x, y, cx, cy, conteudo, tam=18, cor=ESCURO, negrito=False,
          alinha=PP_ALIGN.LEFT, ancora=MSO_ANCHOR.TOP, espaco=1.0):
    """Caixa de texto. `conteudo` pode ser str ou lista de parágrafos."""
    cx_ = slide.shapes.add_textbox(x, y, cx, cy)
    tf = cx_.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = ancora
    linhas = conteudo if isinstance(conteudo, (list, tuple)) else [conteudo]
    for i, linha in enumerate(linhas):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = str(linha)
        p.alignment = alinha
        p.line_spacing = espaco
        for run in p.runs:
            run.font.size = Pt(tam)
            run.font.color.rgb = cor
            run.font.bold = negrito
            run.font.name = "Segoe UI"
    return cx_


def rotulo(slide, x, y, cx, txt, cor=CINZA):
    """Rótulo pequeno em caixa alta, do tipo 'CONTRATANTE'."""
    return texto(slide, x, y, cx, Inches(0.26), txt.upper(), tam=10,
                 cor=cor, negrito=True)


def marca_dagua(slide, numero_pagina):
    """Rodapé comum a todos os slides internos."""
    retangulo(slide, 0, A - Inches(0.5), L, Inches(0.5), CLARO)
    texto(slide, Inches(0.6), A - Inches(0.44), Inches(7), Inches(0.35),
          "{EMPRESA_FANTASIA} · {EMPRESA_SITE}", tam=10, cor=CINZA)
    texto(slide, L - Inches(4.6), A - Inches(0.44), Inches(4), Inches(0.35),
          "{NUMERO} · página %d" % numero_pagina, tam=10, cor=CINZA,
          alinha=PP_ALIGN.RIGHT)


def titulo_secao(slide, txt):
    """Faixa de título no topo do slide interno."""
    retangulo(slide, 0, 0, L, Inches(1.15), BRANCO)
    retangulo(slide, Inches(0.6), Inches(0.38), Inches(0.09), Inches(0.42), AZUL)
    texto(slide, Inches(0.85), Inches(0.3), Inches(11), Inches(0.6), txt,
          tam=26, cor=ESCURO, negrito=True)
    retangulo(slide, Inches(0.6), Inches(1.05), L - Inches(1.2), Emu(9525), CLARO)


def cartao(slide, x, y, cx, cy, titulo, linhas, cor_titulo=AZUL):
    """Bloco cinza claro com um título e várias linhas de texto."""
    retangulo(slide, x, y, cx, cy, CLARO)
    retangulo(slide, x, y, Inches(0.06), cy, cor_titulo)
    texto(slide, x + Inches(0.32), y + Inches(0.22), cx - Inches(0.6),
          Inches(0.35), titulo.upper(), tam=11, cor=cor_titulo, negrito=True)
    texto(slide, x + Inches(0.32), y + Inches(0.62), cx - Inches(0.6),
          cy - Inches(0.8), linhas, tam=13, cor=ESCURO, espaco=1.35)


def tabela(slide, x, y, cx, cy, cabecalho, linhas, larguras, alinhamentos=None):
    """Tabela com cabeçalho azul. `linhas` inclui a linha-modelo e os totais.

    Não use colunas muito estreitas: o PowerPoint impõe uma largura mínima e a
    tabela acaba estourando o `cx` pedido.
    """
    n_linhas = len(linhas) + 1
    forma = slide.shapes.add_table(n_linhas, len(cabecalho), x, y, cx, cy)
    tb = forma.table
    tb.first_row = True
    tb.horz_banding = True

    total = sum(larguras)
    for i, peso in enumerate(larguras):
        tb.columns[i].width = Emu(int(cx * peso / total))

    def escreve(celula, txt, tam, cor, negrito, alinha):
        celula.margin_left = celula.margin_right = Inches(0.1)
        celula.margin_top = celula.margin_bottom = Inches(0.05)
        celula.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = celula.text_frame.paragraphs[0]
        p.text = str(txt)
        p.alignment = alinha
        for run in p.runs:
            run.font.size = Pt(tam)
            run.font.bold = negrito
            run.font.color.rgb = cor
            run.font.name = "Segoe UI"

    if alinhamentos is None:
        alinhamentos = [PP_ALIGN.CENTER] + [PP_ALIGN.LEFT] * (len(cabecalho) - 3) \
            + [PP_ALIGN.RIGHT, PP_ALIGN.RIGHT]

    for c, txt in enumerate(cabecalho):
        cel = tb.cell(0, c)
        cel.fill.solid()
        cel.fill.fore_color.rgb = AZUL
        escreve(cel, txt, 11, BRANCO, True, alinhamentos[c])

    # "__TOTAL__" marca a linha de totais; o que vier depois do marcador é rótulo.
    for r, linha in enumerate(linhas, start=1):
        ehtotal = str(linha[0]).startswith("__TOTAL__")
        for c, txt in enumerate(linha):
            cel = tb.cell(r, c)
            cel.fill.solid()
            cel.fill.fore_color.rgb = CLARO if ehtotal else BRANCO
            escreve(cel, str(txt).replace("__TOTAL__", ""), 12,
                    AZUL if ehtotal else ESCURO, ehtotal, alinhamentos[c])
    return tb


# ── slides ────────────────────────────────────────────────────────────────────

def slide_capa(prs):
    s = slide_vazio(prs, "capa")
    retangulo(s, 0, 0, L, A, ESCURO)
    retangulo(s, 0, 0, Inches(0.28), A, AZUL)
    # Caixa reservada do logo. Coloque modelo_ppt/logo.png (ou .jpg) e o ppt.py
    # troca ESTA forma pela imagem, contida na mesma caixa e sem distorcer. Sem
    # arquivo, o {LOGO} some e sobra o quadrado com a inicial — o que havia
    # antes. O marcador vive na própria forma para que a imagem herde
    # exatamente o enquadramento dela.
    marca = retangulo(s, Inches(0.9), Inches(1.0), Inches(0.85), Inches(0.85), AZUL_CLARO)
    _p = marca.text_frame.paragraphs[0]
    _p.text = "{LOGO}M"
    _p.alignment = PP_ALIGN.CENTER
    marca.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    for _r in _p.runs:
        _r.font.size, _r.font.bold, _r.font.name = Pt(32), True, "Segoe UI"
        _r.font.color.rgb = BRANCO
    texto(s, Inches(1.95), Inches(1.05), Inches(6), Inches(0.5),
          "{EMPRESA_FANTASIA}", tam=30, cor=BRANCO, negrito=True)
    texto(s, Inches(1.95), Inches(1.55), Inches(6), Inches(0.35),
          "{SEGMENTO}", tam=13, cor=AZUL_CLARO, negrito=True)

    texto(s, Inches(0.9), Inches(2.9), Inches(10), Inches(0.9),
          "Proposta Comercial", tam=54, cor=BRANCO, negrito=True)
    retangulo(s, Inches(0.95), Inches(3.95), Inches(1.6), Inches(0.05), AZUL_CLARO)
    texto(s, Inches(0.9), Inches(4.3), Inches(10), Inches(0.55),
          "{CLIENTE}", tam=28, cor=BRANCO, negrito=True)
    texto(s, Inches(0.9), Inches(4.95), Inches(10), Inches(0.4),
          "{ENDERECO}", tam=14, cor=CINZA)

    texto(s, Inches(0.9), Inches(6.2), Inches(5), Inches(0.4),
          "{NUMERO}", tam=16, cor=AZUL_CLARO, negrito=True)
    texto(s, L - Inches(6.4), Inches(6.2), Inches(5.5), Inches(0.4),
          "{DATA_EXTENSO}", tam=14, cor=CINZA, alinha=PP_ALIGN.RIGHT)
    return s


def slide_missao(prs):
    s = slide_vazio(prs, "missao")
    titulo_secao(s, "Missão, visão e valores")
    larg = Inches(3.86)
    cartao(s, Inches(0.6), Inches(1.6), larg, Inches(4.5), "Missão", "{MISSAO}")
    cartao(s, Inches(4.73), Inches(1.6), larg, Inches(4.5), "Visão", "{VISAO}")
    cartao(s, Inches(8.86), Inches(1.6), larg, Inches(4.5), "Valores", "{VALORES}")
    marca_dagua(s, 2)
    return s


def slide_cliente(prs):
    s = slide_vazio(prs, "cliente")
    titulo_secao(s, "A quem se destina")
    cartao(s, Inches(0.6), Inches(1.6), Inches(6.0), Inches(2.5), "Contratante",
           ["{CLIENTE}", "CNPJ {CNPJ}", "{ENDERECO}", "{CIDADE_UF}"])
    cartao(s, Inches(6.95), Inches(1.6), Inches(5.78), Inches(2.5),
           "Responsável pelo contato",
           ["{CONTATO}", "{CONTATO_CARGO}", "{CONTATO_EMAIL}", "{CONTATO_TELEFONE}"])
    cartao(s, Inches(0.6), Inches(4.35), Inches(6.0), Inches(1.75),
           "Convenção coletiva aplicada", ["{CCT}", "{CCT_SINDICATO}", "{CCT_VIGENCIA}"])
    cartao(s, Inches(6.95), Inches(4.35), Inches(5.78), Inches(1.75), "Emitido por",
           ["{EMPRESA_NOME}", "CNPJ {EMPRESA_CNPJ}", "{EMPRESA_TELEFONE} · {EMPRESA_EMAIL}"])
    marca_dagua(s, 3)
    return s


def slide_escopo(prs):
    s = slide_vazio(prs, "escopo")
    titulo_secao(s, "Objeto da proposta")
    texto(s, Inches(0.6), Inches(1.7), L - Inches(1.2), Inches(2.6), "{ESCOPO}",
          tam=15, cor=ESCURO, alinha=PP_ALIGN.JUSTIFY, espaco=1.4)

    y = Inches(4.5)
    for i, (rot, val) in enumerate([("Investimento mensal", "{VALOR_MENSAL_TOTAL}"),
                                    ("Prazo contratual", "{PRAZO} meses"),
                                    ("Postos de trabalho", "{TOTAL_POSTOS}")]):
        x = Inches(0.6) + i * Inches(4.13)
        retangulo(s, x, y, Inches(3.86), Inches(1.5), AZUL)
        texto(s, x + Inches(0.3), y + Inches(0.25), Inches(3.3), Inches(0.3),
              rot.upper(), tam=10, cor=BRANCO, negrito=True)
        texto(s, x + Inches(0.3), y + Inches(0.6), Inches(3.3), Inches(0.6),
              val, tam=24, cor=BRANCO, negrito=True)
    marca_dagua(s, 4)
    return s


def slide_postos(prs):
    """A nota explicativa fica ACIMA da tabela, não abaixo.

    Abaixo ela tinha posição fixa, e a tabela cresce uma linha por posto: numa
    proposta de cinco postos a tabela passava por cima do texto. Acima, o
    espaço é sempre o mesmo e a tabela cresce para o lado de baixo, onde há
    slide sobrando."""
    s = slide_vazio(prs, "postos")
    titulo_secao(s, "Dimensionamento da equipe")
    texto(s, Inches(0.6), Inches(1.35), L - Inches(1.2), Inches(0.5),
          "Os valores unitários já contemplam salário-base da convenção coletiva, "
          "adicionais legais, encargos sociais e trabalhistas ({ENCARGOS}%) e o "
          "pacote de benefícios da categoria.", tam=11, cor=CINZA, espaco=1.3)
    tabela(
        s, Inches(0.6), Inches(2.0), L - Inches(1.2), Inches(1.2),
        ["QTD", "CARGO", "ESCALA / TURNO", "ADICIONAIS", "VALOR UNITÁRIO", "VALOR MENSAL"],
        [
            # Linha-modelo: o ppt.py duplica esta linha uma vez por posto.
            ["{QTD}", "{CARGO}", "{ESCALA_TURNO}", "{ADICIONAIS}",
             "{VALOR_UNITARIO}", "{VALOR_MENSAL}"],
            ["__TOTAL__", "TOTAL DE MÃO DE OBRA", "__TOTAL__", "__TOTAL__",
             "__TOTAL__", "{TOTAL_MAO_DE_OBRA}"],
        ],
        larguras=[7, 26, 21, 18, 14, 14],
    )
    marca_dagua(s, 5)
    return s


def slide_equipamentos(prs):
    """Dois totais, e não um. A tabela mistura item mensal com item de
    implantação; um total só, somando os dois, seria um número que não existe
    em fatura nenhuma."""
    s = slide_vazio(prs, "equipamentos")
    titulo_secao(s, "Equipamentos e recursos")
    texto(s, Inches(0.6), Inches(1.35), L - Inches(1.2), Inches(0.5),
          "Equipamentos mensais acompanham o valor do contrato; itens de "
          "implantação são cobrados uma única vez, na entrada da operação.",
          tam=11, cor=CINZA, espaco=1.3)
    tabela(
        s, Inches(0.6), Inches(2.0), L - Inches(1.2), Inches(1.2),
        ["QTD", "EQUIPAMENTO", "MARCA / MODELO", "COBRANÇA", "VALOR UNITÁRIO", "VALOR TOTAL"],
        [
            # Linha-modelo: duplicada uma vez por equipamento da proposta.
            ["{EQ_QTD}", "{EQ_NOME}", "{EQ_MARCA}", "{EQ_TIPO}",
             "{EQ_VALOR}", "{EQ_TOTAL}"],
            ["__TOTAL__", "TOTAL MENSAL DE EQUIPAMENTOS", "__TOTAL__", "__TOTAL__",
             "__TOTAL__", "{TOTAL_EQUIPAMENTOS}"],
            ["__TOTAL__", "IMPLANTAÇÃO (PAGAMENTO ÚNICO)", "__TOTAL__", "__TOTAL__",
             "__TOTAL__", "{TOTAL_IMPLANTACAO}"],
        ],
        larguras=[7, 27, 22, 14, 15, 15],
    )
    marca_dagua(s, 6)
    return s


def slide_beneficios(prs):
    """Os benefícios da convenção, um a um, com o que a empresa paga de fato.

    Eles saíam escondidos dentro do valor do posto, e é justamente onde o
    cliente mais desconfia: "por que um servente custa isso?". Vale-refeição,
    cesta, assistência e vale-transporte são obrigação da convenção coletiva,
    não margem — e mostrar linha a linha muda a conversa de preço para
    conformidade.

    A coluna do desconto do empregado existe pelo mesmo motivo: deixa claro que
    parte do benefício volta em folha, e que o número da direita é o custo
    líquido que entra na proposta."""
    s = slide_vazio(prs, "beneficios")
    titulo_secao(s, "Benefícios da convenção coletiva")
    texto(s, Inches(0.6), Inches(1.35), L - Inches(1.2), Inches(0.55),
          "Valores da {CCT}. Benefícios concedidos na forma da convenção não sofrem "
          "encargo previdenciário (arts. 457 §2º e 458 §2º da CLT). O vale-transporte "
          "tem desconto legal de até 6% do salário do empregado.",
          tam=11, cor=CINZA, espaco=1.3)
    tabela(
        s, Inches(0.6), Inches(2.0), L - Inches(1.2), Inches(1.2),
        ["BENEFÍCIO", "BASE", "VALOR CHEIO", "DESCONTO DO EMPREGADO", "CUSTO DA EMPRESA"],
        [
            # Linha-modelo: duplicada uma vez por benefício da proposta.
            ["{BEN_NOME}", "{BEN_BASE}", "{BEN_VALOR}", "{BEN_DESCONTO}", "{BEN_CUSTO}"],
            # "por funcionário" seria mentira quando a proposta mistura duas
            # convenções: ninguém recebe os dois pacotes. É o total do que a
            # empresa paga de benefício, e o rótulo diz isso.
            ["__TOTAL__", "__TOTAL__", "__TOTAL__", "TOTAL DE BENEFÍCIOS",
             "{TOTAL_BENEFICIOS}"],
        ],
        larguras=[34, 18, 16, 16, 16],
    )
    marca_dagua(s, 7)
    return s


def slide_resumo(prs):
    """Resumo do investimento — a coluna FECHA.

    O que havia aqui somava mão de obra + equipamentos (que eram custo) com
    "tributos e encargos administrativos", e o total impresso vinha de outra
    conta: sobrava exatamente o markup, que não aparecia em linha nenhuma.
    Cliente que somasse a coluna achava 22% de diferença (P1).

    A correção não é acrescentar uma linha de "margem" — isso resolveria a
    aritmética e criaria um problema maior, o de publicar a margem da empresa.
    A correção é imprimir PREÇO DE VENDA em todas as linhas: mão de obra e
    equipamentos já saem com encargos, tributos e administração embutidos
    (o rateio vive em calculo.py), e aí

        mão de obra + equipamentos = subtotal;  subtotal − desconto = total

    fecha por construção, sem revelar composição de custo (P2).
    """
    s = slide_vazio(prs, "resumo")
    titulo_secao(s, "Resumo do investimento")
    tabela(
        s, Inches(0.6), Inches(1.6), Inches(7.6), Inches(1.2),
        ["COMPOSIÇÃO DO VALOR MENSAL", "VALOR"],
        [
            ["Mão de obra ({TOTAL_POSTOS} postos)", "{TOTAL_MAO_DE_OBRA}"],
            ["Equipamentos e recursos mensais", "{TOTAL_EQUIPAMENTOS}"],
            ["__TOTAL__Subtotal mensal", "__TOTAL__{SUBTOTAL_MENSAL}"],
            ["Desconto comercial ({DESCONTO}%)", "− {VALOR_DESCONTO}"],
            ["__TOTAL__VALOR MENSAL", "{VALOR_MENSAL_TOTAL}"],
        ],
        larguras=[62, 38],
        alinhamentos=[PP_ALIGN.LEFT, PP_ALIGN.RIGHT],
    )
    texto(s, Inches(0.6), Inches(5.5), Inches(7.6), Inches(1.1),
          "Todos os valores acima já incluem salários da convenção coletiva, "
          "adicionais legais, encargos sociais e trabalhistas, benefícios da "
          "categoria, tributos e despesas administrativas. Não há custo "
          "adicional fora do que está nesta tabela.",
          tam=11, cor=CINZA, espaco=1.3)

    cartao(s, Inches(8.55), Inches(1.6), Inches(4.18), Inches(1.5),
           "Implantação (pagamento único)", ["{VALOR_IMPLANTACAO}"])
    retangulo(s, Inches(8.55), Inches(3.3), Inches(4.18), Inches(1.9), AZUL)
    texto(s, Inches(8.85), Inches(3.6), Inches(3.6), Inches(0.3),
          "TOTAL DO CONTRATO ({PRAZO} MESES)", tam=10, cor=BRANCO, negrito=True)
    texto(s, Inches(8.85), Inches(4.05), Inches(3.6), Inches(0.8),
          "{VALOR_CONTRATO}", tam=24, cor=BRANCO, negrito=True)
    texto(s, Inches(8.55), Inches(5.35), Inches(4.18), Inches(0.5),
          "Primeiro pagamento: {PRIMEIRO_PAGAMENTO}", tam=11, cor=CINZA)
    marca_dagua(s, 7)
    return s


def slide_condicoes(prs):
    s = slide_vazio(prs, "condicoes")
    titulo_secao(s, "Condições comerciais")
    cartao(s, Inches(0.6), Inches(1.6), Inches(6.0), Inches(4.1), "Condições gerais", [
        "Validade da proposta: {VALIDADE} dias, até {VALIDA_ATE}.",
        "Prazo contratual: {PRAZO} meses, renovável automaticamente.",
        "Faturamento: mensal, com vencimento no 5º dia útil do mês seguinte.",
        "Reajuste: anual, pela data-base da categoria ou pelo IPCA acumulado.",
        "Início da operação: até 15 dias corridos após o aceite formal.",
        "Rescisão: mediante aviso prévio de 30 dias por qualquer das partes.",
    ])
    cartao(s, Inches(6.95), Inches(1.6), Inches(5.78), Inches(4.1), "Observações",
           ["{OBS}"])
    marca_dagua(s, 8)
    return s


def slide_final(prs):
    s = slide_vazio(prs, "final")
    retangulo(s, 0, 0, L, A, ESCURO)
    retangulo(s, 0, 0, Inches(0.28), A, AZUL)
    texto(s, Inches(0.9), Inches(2.5), Inches(11), Inches(1.0),
          "Vamos trabalhar juntos?", tam=48, cor=BRANCO, negrito=True)
    retangulo(s, Inches(0.95), Inches(3.7), Inches(1.6), Inches(0.05), AZUL_CLARO)
    texto(s, Inches(0.9), Inches(4.1), Inches(11), Inches(0.5),
          "Colocamo-nos à disposição para esclarecimentos e ajustes no escopo.",
          tam=16, cor=CINZA)
    texto(s, Inches(0.9), Inches(5.0), Inches(11), Inches(1.2),
          ["{EMPRESA_EMAIL}", "{EMPRESA_TELEFONE}", "{EMPRESA_SITE}"],
          tam=18, cor=BRANCO, negrito=True, espaco=1.3)
    return s


def main():
    prs = Presentation()
    prs.slide_width, prs.slide_height = L, A
    for construir in (slide_capa, slide_missao, slide_cliente, slide_escopo,
                      slide_postos, slide_equipamentos, slide_beneficios,
                      slide_resumo, slide_condicoes, slide_final):
        construir(prs)
    prs.save(SAIDA)
    print("Modelo gerado: %s (%d slides)" % (SAIDA, len(prs.slides._sldIdLst)))


if __name__ == "__main__":
    main()
