# -*- coding: utf-8 -*-
"""
Transforma o deck de proposta em modelo de preenchimento.

    python modelo_ppt/preparar_modelo.py

Entra `Mizys_Modelo_Proposta_Facilities_Seguranca.pptx` — o deck como o
designer entregou, com marcadores humanos do tipo `[ NOME DO CLIENTE ]`.
Sai `proposta_facilities.pptx`, que é o que o CRM preenche.

Por que um script e não editar o .pptx à mão: o deck vai ser mexido de novo
(logo, cores, texto institucional). Toda vez que ele mudar, é só rodar isto e
o modelo de preenchimento nasce igual, sem ninguém ter que lembrar de recolocar
57 marcadores. O deck original nunca é alterado.

O que este script faz:

1. troca cada `[ MARCADOR ]` pelo `{CHAVE}` que o `ppt.py` conhece — por
   slide, e não globalmente, porque `[ TELEFONE ]` quer dizer coisas
   diferentes na carta de apresentação (o consultor) e no escopo (o cliente);
2. deixa as três tabelas com UMA linha-modelo, que é como o `_expandir_linhas`
   trabalha: ele duplica essa linha uma vez por registro. A tabela de
   materiais vem do designer em duas colunas lado a lado (QTD | MATERIAL |
   QTD | MATERIAL), o que não sobrevive à duplicação de linha inteira; vira
   uma lista só, com tipo e valor;
3. acrescenta o slide **Resumo do investimento**, que o deck não tem. Sem ele
   a proposta sai dizendo o valor mensal e escondendo desconto, implantação,
   valor de contrato e primeiro pagamento — números que o cliente pergunta na
   reunião. Ele é clonado do slide de condições gerais, então nasce com o
   mesmo desenho, e é opcional: sai por Configurações se ninguém quiser;
4. anota `SLIDE:<nome>` nas anotações dos slides que podem ser desligados.
   A anotação não é impressa e ninguém a apaga por engano editando o texto.
"""
from __future__ import annotations

import copy
import os
import sys

from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn

AQUI = os.path.dirname(os.path.abspath(__file__))
# O deck do designer mora em `origem/` e não na raiz de modelo_ppt/ por um
# motivo prático: a raiz é o que o CRM oferece no seletor "Modelo de
# apresentação". Um deck sem marcador nenhum listado ali é um convite a gerar
# uma proposta com "[ NOME DO CLIENTE ]" impresso.
ORIGEM = os.path.join(AQUI, "origem",
                      "Mizys_Modelo_Proposta_Facilities_Seguranca.pptx")
DESTINO = os.path.join(AQUI, "proposta_facilities.pptx")


# ── escrita preservando a formatação do designer ─────────────────────────────

def _rpr_modelo(paragrafo):
    """A formatação a usar quando o parágrafo está vazio.

    Célula vazia não tem run nenhum — só um `endParaRPr`, que é onde o
    PowerPoint guarda "como vai ficar o texto que for digitado aqui". É essa a
    formatação que o designer escolheu para o corpo da tabela, então é ela que
    o texto novo herda. Sem isso, a linha-modelo sairia com a fonte padrão e a
    tabela inteira mudaria de cara.
    """
    fim = paragrafo._p.find(qn("a:endParaRPr"))
    return copy.deepcopy(fim) if fim is not None else None


def escrever(frame, texto):
    """Põe `texto` no primeiro parágrafo do frame, mantendo a formatação."""
    par = frame.paragraphs[0]
    for extra in list(frame.paragraphs)[1:]:
        extra._p.getparent().remove(extra._p)

    linhas = str(texto).split("\n")
    if par.runs:
        for run in par.runs[1:]:
            par._p.remove(run._r)
        par.runs[0].text = linhas[0]
        base = par.runs[0]._r
    else:
        rpr = _rpr_modelo(par)
        run = par.add_run()
        run.text = linhas[0]
        if rpr is not None:
            rpr.tag = qn("a:rPr")
            antigo = run._r.find(qn("a:rPr"))
            if antigo is not None:
                run._r.remove(antigo)
            run._r.insert(0, rpr)
        base = run._r

    anterior = base
    for linha in linhas[1:]:
        br = anterior.makeelement(qn("a:br"), {})
        anterior.addnext(br)
        novo = copy.deepcopy(base)
        for t in novo.findall(qn("a:t")):
            t.text = linha
        br.addnext(novo)
        anterior = novo


def _formas(shapes):
    for f in shapes:
        if f.shape_type == 6:  # grupo
            yield from _formas(f.shapes)
        else:
            yield f


def trocar_textos(slide, pares):
    """Aplica as substituições de `[ MARCADOR ]` para `{CHAVE}` no slide."""
    trocas = 0
    for forma in _formas(slide.shapes):
        if not forma.has_text_frame:
            continue
        for par in forma.text_frame.paragraphs:
            original = "".join(r.text for r in par.runs)
            novo = original
            for de, para in pares:
                if de in novo:
                    novo = novo.replace(de, para)
            if novo != original:
                # Escreve só neste parágrafo, sem apagar os vizinhos.
                for run in par.runs[1:]:
                    par._p.remove(run._r)
                par.runs[0].text = novo
                trocas += 1
    return trocas


# ── tabelas ──────────────────────────────────────────────────────────────────

def tabela_do_slide(slide):
    for forma in _formas(slide.shapes):
        if getattr(forma, "has_table", False) and forma.has_table:
            return forma.table
    return None


def apagar_linhas(tabela, de, ate):
    """Remove as linhas [de, ate) — usadas só para o designer ver o volume."""
    tbl = tabela._tbl
    for tr in list(tbl.tr_lst)[de:ate]:
        tbl.remove(tr)


def preencher_linha(tabela, ix, textos):
    for celula, texto in zip(tabela.rows[ix].cells, textos):
        escrever(celula.text_frame, texto)


# ── clonagem de slide ────────────────────────────────────────────────────────

def clonar_slide(prs, indice_origem, posicao):
    """Copia um slide inteiro e o insere em `posicao`.

    As imagens são o detalhe que faz isto dar errado: a forma copiada aponta
    para um `r:embed` que só existe no slide de origem. Sem reapontar, o
    PowerPoint abre o arquivo reclamando que o conteúdo está corrompido — e o
    LibreOffice simplesmente não desenha o fundo. Por isso cada `a:blip` ganha
    um relacionamento novo no slide de destino.
    """
    origem = prs.slides[indice_origem]
    novo = prs.slides.add_slide(origem.slide_layout)
    for forma in list(novo.shapes):
        forma._element.getparent().remove(forma._element)

    tree = novo.shapes._spTree
    for forma in origem.shapes:
        tree.append(copy.deepcopy(forma._element))

    mapa = {}
    for rid, rel in origem.part.rels.items():
        if rel.reltype == RT.IMAGE:
            mapa[rid] = novo.part.relate_to(rel._target, RT.IMAGE)
    if mapa:
        for blip in tree.iter(qn("a:blip")):
            antigo = blip.get(qn("r:embed"))
            if antigo in mapa:
                blip.set(qn("r:embed"), mapa[antigo])

    lst = prs.slides._sldIdLst
    elementos = list(lst)
    lst.remove(elementos[-1])
    lst.insert(posicao, elementos[-1])
    return novo


def anotar(slide, nome):
    slide.notes_slide.notes_text_frame.text = "SLIDE:%s" % nome


# ── o roteiro, slide a slide ─────────────────────────────────────────────────

# Rodapé e logo aparecem em quase todo slide e querem sempre a mesma coisa.
GLOBAIS = [
    ("[SUA EMPRESA]", "{EMPRESA_FANTASIA}"),
    ("[ SUA LOGO ]", "{LOGO}"),
    # As molduras de foto do slide "Nossa gente" ficam vazias: não há foto de
    # colaborador no CRM para preencher. O rótulo some porque "[ FOTO ]"
    # impresso numa proposta que vai ao cliente é pior do que a moldura vazia.
    # O slide inteiro nasce DESLIGADO por isso — quem tiver as fotos monta o
    # slide no PowerPoint e liga em Configurações.
    ("[ FOTO ]", ""),
]

# `[ TELEFONE ]` é o consultor no slide 2 e o cliente no 15; `[ DATA ]` é a
# emissão no 1 e no 15, mas "cidade, data" no 2. Por isso o mapa é por slide.
POR_SLIDE = {
    1: [("[ NOME DO CLIENTE ]", "{CLIENTE}"),
        ("[ ENDEREÇO ]", "{ENDERECO}"),
        ("[ Nº PROPOSTA ]", "{NUMERO}"),
        ("[ DATA ]", "{DATA}"),
        ("[ SITE ]", "{EMPRESA_SITE}")],
    2: [("[ PREZADO(A) SR(A). NOME ]", "Prezado(a) {CONTATO}"),
        ("[ NOME DO CLIENTE ]", "{CLIENTE}"),
        ("[ NOME DO CONSULTOR ]", "{VENDEDOR}"),
        ("[ CARGO ]", "{VENDEDOR_CARGO}"),
        ("[ TELEFONE ]", "{EMPRESA_TELEFONE}"),
        ("[ CELULAR / WHATSAPP ]", "{EMPRESA_WHATSAPP}"),
        ("[ E-MAIL ]", "{EMPRESA_EMAIL}"),
        ("[ CIDADE, DATA ]", "{DATA_EXTENSO}")],
    5: [("[ ANO ]", "{EMPRESA_ANO}"),
        ("[ Nº ]", "{EMPRESA_COLABORADORES}"),
        ("[ LISTAR ]", "{EMPRESA_CERTIFICACOES}")],
    8: [],   # missão/visão/valores: tratados à parte, o texto inteiro é trocado
    15: [("[ RAZÃO SOCIAL / NOME DO CONDOMÍNIO ]", "{CLIENTE}"),
         ("[ LOGRADOURO, NÚMERO — BAIRRO, CIDADE/UF ]", "{ENDERECO}"),
         ("[ NOME DO CONTATO NO CLIENTE ]", "{CONTATO}"),
         ("[ TELEFONE ]", "{CONTATO_TELEFONE}"),
         ("[ E-MAIL ]", "{CONTATO_EMAIL}"),
         ("[ Nº ]", "{NUMERO}"),
         ("[ DATA ]", "{DATA}"),
         ("30 dias", "{VALIDADE} dias"),
         ("20 dias corridos", "{PRAZO} dias corridos"),
         ("Preenchimento automático a partir do cadastro da proposta.",
          "{ESCOPO}")],
    18: [("Valores referentes a [ ANO ]. A proposta tem validade de 30 dias e "
          "está sujeita a alteração após visita técnica do nosso departamento "
          "operacional.",
          "Valores conforme {CCT} · vigência {CCT_VIGENCIA}. A proposta vale "
          "{VALIDADE} dias e está sujeita a alteração após visita técnica do "
          "nosso departamento operacional.")],
    19: [("ao menos 20 dias corridos", "ao menos {PRAZO} dias corridos")],
    20: [("[ NOME DO CONSULTOR ]", "{VENDEDOR}"),
         ("[ E-MAIL ]", "{EMPRESA_EMAIL}"),
         ("[ TELEFONE / WHATSAPP ]", "{EMPRESA_TELEFONE}"),
         ("[ SITE ]", "{EMPRESA_SITE}")],
}

# Slides que dá para desligar em Configurações → o documento da proposta.
OPCIONAIS = {
    5: "sobre", 6: "gente", 8: "missao", 10: "servicos",
    12: "diferencial", 13: "tecnologia", 17: "equipamentos", 18: "beneficios",
}


def main():
    if not os.path.isfile(ORIGEM):
        print("Não achei o deck em %s" % ORIGEM)
        return 1

    prs = Presentation(ORIGEM)
    print("deck original: %d slides" % len(prs.slides))

    # ── 1. os textos ────────────────────────────────────────────────────────
    total = 0
    for i, slide in enumerate(prs.slides, 1):
        total += trocar_textos(slide, GLOBAIS + POR_SLIDE.get(i, []))
    print("marcadores trocados: %d" % total)

    # ── 2. slide 5: os dois "[ Nº ]" são coisas diferentes ──────────────────
    # O mapa por slide trocou os dois por {EMPRESA_COLABORADORES}. O segundo é
    # o de clientes atendidos, e ele fica logo acima do rótulo que diz isso.
    s5 = prs.slides[4]
    caixas = sorted((f for f in _formas(s5.shapes)
                     if f.has_text_frame
                     and "{EMPRESA_COLABORADORES}" in f.text_frame.text),
                    key=lambda f: f.top or 0)
    if len(caixas) == 2:
        escrever(caixas[1].text_frame, "{EMPRESA_CLIENTES}")
        print("slide 5: segundo [ Nº ] virou {EMPRESA_CLIENTES}")

    # ── 3. slide 8: missão, visão e valores ─────────────────────────────────
    # O texto que veio no deck é o padrão de fábrica. Ele continua valendo
    # quando o cliente não preencheu Configurações → Empresa: quem decide é o
    # documentos.py, que só manda {MISSAO} preenchido se houver conteúdo.
    s8 = prs.slides[7]
    rotulos = {"MISSÃO": "{MISSAO}", "VISÃO": "{VISAO}"}
    caixas8 = sorted((f for f in _formas(s8.shapes) if f.has_text_frame),
                     key=lambda f: ((f.top or 0), (f.left or 0)))
    for ix, forma in enumerate(caixas8):
        chave = rotulos.get(forma.text_frame.text.strip())
        if not chave:
            continue
        # O texto correspondente é a caixa logo abaixo, na mesma coluna.
        abaixo = [g for g in caixas8[ix + 1:]
                  if abs((g.left or 0) - (forma.left or 0)) < 91440
                  and (g.top or 0) > (forma.top or 0)]
        if abaixo:
            escrever(abaixo[0].text_frame, chave)
            print("slide 8: %s ligado" % chave)

    # ── 4. as três tabelas ──────────────────────────────────────────────────
    # Quadro de cargos: 7 linhas em branco viram uma linha-modelo.
    t16 = tabela_do_slide(prs.slides[15])
    apagar_linhas(t16, 2, 8)
    # Cargo e escala vão no MESMO parágrafo, separados por "·", que é como o
    # cabeçalho da coluna promete ("CARGO · ESCALA · JORNADA"). Em parágrafos
    # diferentes seria mais bonito, mas a substituição do ppt.py lê run por
    # run e a quebra <a:br/> não é um run: o texto sairia grudado.
    preencher_linha(t16, 1, ["{QTD}", "{QTD_FUNC}",
                             "{CARGO}  ·  {ESCALA_TURNO}",
                             "{VALOR_UNITARIO}", "{VALOR_MENSAL}"])
    escrever(t16.rows[2].cells[4].text_frame, "{VALOR_MENSAL_TOTAL}")
    print("slide 16: quadro de cargos com linha-modelo {QTD}")

    # Materiais: o desenho é de duas colunas lado a lado, o que não sobrevive
    # à duplicação de linha inteira. Vira uma lista só, com tipo e valor.
    t17 = tabela_do_slide(prs.slides[16])
    apagar_linhas(t17, 2, 9)
    preencher_linha(t17, 0, ["QTD.", "MATERIAL / EQUIPAMENTO",
                             "TIPO", "VALOR TOTAL"])
    preencher_linha(t17, 1, ["{EQ_QTD}", "{EQ_NOME}",
                             "{EQ_TIPO}", "{EQ_TOTAL}"])
    preencher_linha(t17, 2, ["", "VALOR TOTAL DE MATERIAIS E EQUIPAMENTOS",
                             "", "{TOTAL_EQUIPAMENTOS}"])
    print("slide 17: materiais em lista única, linha-modelo {EQ_QTD}")

    # Salários e benefícios: uma linha por cargo.
    t18 = tabela_do_slide(prs.slides[17])
    apagar_linhas(t18, 2, 7)
    preencher_linha(t18, 1, ["{SAL_CARGO}", "{SAL_SALARIO}", "{SAL_ADICIONAIS}",
                             "{SAL_REFEICAO}", "{SAL_CESTA}", "{SAL_SAUDE}",
                             "{SAL_SINDICATO}"])
    print("slide 18: salários com linha-modelo {SAL_CARGO}")

    # ── 5. o resumo do investimento ─────────────────────────────────────────
    # Vem depois de cargos, materiais e salários: primeiro o cliente vê de que
    # é feito o preço, e só então o fechamento.
    novo = clonar_slide(prs, 18, 18)   # cópia do "Condições gerais"
    trocar_textos(novo, [("Condições gerais", "Resumo do investimento")])
    cartoes = [
        ("PRAZO DE IMPLANTAÇÃO", "MÃO DE OBRA", "{TOTAL_MAO_DE_OBRA}"),
        ("CONTRATO", "MATERIAIS E EQUIPAMENTOS", "{TOTAL_EQUIPAMENTOS}"),
        ("FORMALIZAÇÃO", "SUBTOTAL MENSAL", "{SUBTOTAL_MENSAL}"),
        ("PROCESSO TRABALHISTA", "DESCONTO ({DESCONTO}%)", "− {VALOR_DESCONTO}"),
        ("INFRAESTRUTURA", "VALOR MENSAL", "{VALOR_MENSAL_TOTAL}"),
        ("REAJUSTE", "IMPLANTAÇÃO (única)", "{VALOR_IMPLANTACAO}"),
    ]
    caixas_novo = [f for f in _formas(novo.shapes) if f.has_text_frame]
    for rotulo_velho, rotulo, valor in cartoes:
        alvo = next((f for f in caixas_novo
                     if f.text_frame.text.strip() == rotulo_velho), None)
        if alvo is None:
            continue
        escrever(alvo.text_frame, rotulo)
        abaixo = [g for g in caixas_novo
                  if abs((g.left or 0) - (alvo.left or 0)) < 91440
                  and (g.top or 0) > (alvo.top or 0)]
        if abaixo:
            escrever(min(abaixo, key=lambda g: g.top).text_frame, valor)
    # A linha de apoio: prazo, total do contrato e primeiro pagamento.
    rodape = next((f for f in caixas_novo if f.has_text_frame
                   and f.text_frame.text.strip() == "05 · PROPOSTA COMERCIAL"), None)
    if rodape is not None:
        escrever(rodape.text_frame,
                 "05 · PROPOSTA COMERCIAL   ·   CONTRATO DE {PRAZO} MESES   ·   "
                 "TOTAL {VALOR_CONTRATO}   ·   1º PAGAMENTO {PRIMEIRO_PAGAMENTO}")
    anotar(novo, "resumo")
    print("slide novo: Resumo do investimento (opcional, SLIDE:resumo)")

    # ── 6. o número do rodapé ───────────────────────────────────────────────
    # No deck ele é digitado à mão, um por slide. Como slide opcional some e o
    # resumo entra, a numeração fixa erra sempre: o cliente recebe uma proposta
    # que pula do 16 para o 18. Vira {PAGINA} e quem numera é o ppt.py, na hora
    # de gerar, já com a lista final de slides.
    # Só a caixa do rodapé, à direita e embaixo. "Texto que é um número" não
    # basta como critério: o sumário tem 01 a 05 e cada divisor tem um número
    # gigante no meio do slide — todos viraram página na primeira tentativa.
    ESQ_MIN, TOPO_MIN = int(10 * 914400), int(6.8 * 914400)
    numerados = 0
    for slide in prs.slides:
        for forma in _formas(slide.shapes):
            if not forma.has_text_frame:
                continue
            if (forma.left or 0) < ESQ_MIN or (forma.top or 0) < TOPO_MIN:
                continue
            texto = forma.text_frame.text.strip()
            if texto.isdigit() and len(texto) <= 2:
                escrever(forma.text_frame, "{PAGINA}")
                numerados += 1
    print("rodapés numerados dinamicamente: %d" % numerados)

    # ── 7. as anotações dos opcionais ───────────────────────────────────────
    for numero, nome in OPCIONAIS.items():
        anotar(prs.slides[numero - 1], nome)
    print("slides opcionais anotados: %s"
          % ", ".join(sorted(set(OPCIONAIS.values()) | {"resumo"})))

    prs.save(DESTINO)
    print("\ngravado: %s (%d slides)" % (DESTINO, len(prs.slides)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
