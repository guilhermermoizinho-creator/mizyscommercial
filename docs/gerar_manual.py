"""
Gera o manual do Mizys CRM em Word (docs/Manual_Mizys_CRM.docx).

Por que um script e não um .docx editado à mão: o manual precisa acompanhar o
sistema, e documento binário editado à mão não mostra o que mudou entre duas
versões. Aqui o conteúdo é texto, entra no git como texto, e o .docx é só a
saída — regerar depois de mexer no sistema é rodar:

    python docs/gerar_manual.py

Para registrar uma mudança nova, acrescente uma linha no topo de MUDANCAS (a
lista logo abaixo) e rode de novo. A versão do documento sai daí.

Depende de python-docx (pip install python-docx).
"""
from __future__ import annotations

import os
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(BASE, "docs", "Manual_Mizys_CRM.docx")
LOGO = os.path.join(BASE, "static", "img", "logo.png")

# ── Identidade visual, a mesma do sistema ────────────────────────────────────
VIOLETA = RGBColor(0x6D, 0x28, 0xD9)
VIOLETA_CLARO = "EDE6FF"
TINTA = RGBColor(0x1F, 0x1B, 0x2E)
CINZA = RGBColor(0x6F, 0x6A, 0x8A)
FUNDO_TABELA = "F4F0FF"
FONTE = "Segoe UI"

# ── Histórico: a linha de cima é a versão atual ──────────────────────────────
MUDANCAS = [
    ("1.8", "18/08/2026", [
        "Proposta e funil finalmente se falam. Toda proposta nasce com uma "
        "oportunidade atrás dela: o valor do funil acompanha o valor da proposta "
        "a cada mudança de posto, e a fase segue o status — enviada vira "
        "Proposta, em análise vira Negociação, aprovada vira Ganho. Antes o "
        "pipeline e o funil ficavam zerados com R$ 80 mil em negociação na mesa.",
        "Botão «Marcar como ganha» na proposta: aprova, congela os valores, move "
        "a oportunidade para Ganho e registra o motivo — de um clique só.",
        "Relatórios e painel de indicadores viraram uma tela só: Dashboard. As "
        "duas mostravam recortes do mesmo dado e obrigavam a escolher onde "
        "procurar antes de procurar.",
        "Três gráficos de linha no Dashboard, escolhidos por decisão que "
        "sustentam: receita ganha por mês, propostas emitidas contra ganhas "
        "(se a linha de baixo não acompanha a de cima, o problema é conversão) e "
        "margem média com a linha da mínima.",
        "As quatro convenções de São Paulo carregadas: SIEMACO, SESVESP, "
        "SINDEEPRES e Bombeiros Civis — 96 cargos, com data-base, reajuste e as "
        "cláusulas que mexem no custo do posto. A dos bombeiros tem data-base em "
        "SETEMBRO e divisor de 180 h/mês no operacional, gravado por cargo.",
        "Slide de benefícios no documento da proposta, com o valor cheio, o "
        "desconto do empregado e o custo da empresa — linha a linha, e dizendo "
        "de qual convenção cada um vem.",
        "Logo do sistema recolorida na paleta do site, a partir da arte original.",
    ]),
    ("1.7", "18/08/2026", [
        "Cada posto pode ter a SUA convenção. Um contrato de facilities mistura "
        "categorias — portaria pela CCT do asseio, vigilância pela dela — e agora "
        "o piso, os benefícios, a base da insalubridade e o divisor de horas "
        "seguem a convenção de cada posto, não uma só da proposta.",
        "Precificação virou aba própria. Os parâmetros e os controles saíram do "
        "painel lateral, onde ficavam espremidos numa coluna de 340px embaixo de "
        "doze linhas de número.",
        "O resumo da direita agora gruda de verdade: ganhou altura máxima e "
        "rolagem própria. Um elemento fixo mais alto que a janela não gruda em "
        "lugar nenhum, e era isso que fazia o valor sumir da vista.",
        "A margem líquida virou número em destaque, dentro do bloco do valor "
        "mensal.",
        "O salário saiu do nome do cargo na lista de escolha.",
        "Corrigido: uma ação duplicada estava sobrescrevendo a gravação de todos "
        "os campos da proposta, fazendo a tela repintar a cada tecla e apagar "
        "campo de texto vazio.",
    ]),
    ("1.6", "18/08/2026", [
        "Lucro de planilha padrão passou de 18% para 12% — 18% é topo de faixa de "
        "manutenção predial e caro para limpeza e portaria. Com 12% a margem "
        "líquida fica em 8,94%, acima do mínimo configurado.",
        "Botão Salvar na proposta, com o estado ao lado (salvando… / tudo salvo). "
        "O editor continua salvando sozinho meio segundo depois de cada mudança.",
        "Bloco de reajuste no painel da proposta: mostra a data-base da convenção, "
        "quantos dias faltam para a repactuação e o texto da cláusula a escrever "
        "no contrato.",
        "«Data-base da CCT» virou a primeira opção de índice de reajuste do "
        "contrato, com a explicação de por que índice de preços no aniversário "
        "custa de 4 a 8 meses de reajuste de folha por ano.",
        "Bloco «de onde vem cada número» no painel: separa o que vem da convenção, "
        "o que vem da lei, o que o sistema calcula e o que depende do regime "
        "tributário e do município.",
    ]),
    ("1.5", "18/08/2026", [
        "As duas convenções de São Paulo 2026/2027 entraram no sistema: asseio e "
        "conservação (SIEMACO-SP × SEAC-SP) com 21 cargos, e vigilância "
        "patrimonial (SESVESP) com 19 — com benefícios, data-base, reajuste e as "
        "cláusulas que mexem no custo do posto.",
        "Vale-refeição e vale-transporte passaram a seguir os dias que o "
        "empregado trabalha NA ESCALA do posto: 21,7 em 5x2 e 15,2 em 12x36. O "
        "mesmo benefício custa cerca de 30% menos no plantão, e isso agora "
        "aparece no preço.",
        "Corrigido um erro que subprecificava plantão pela metade: com o Módulo 4 "
        "ligado, o sistema zerava o fator inteiro da escala e tirava os dois "
        "empregados que um 12x36 exige por estrutura. Agora só a parcela de "
        "COBERTURA migra para o Módulo 4; a estrutural vale sempre.",
    ]),
    ("1.4", "18/08/2026", [
        "A convenção passou a guardar o que faltava para precificar: data-base e "
        "percentual do reajuste, a cláusula do adicional noturno no 12x36, o "
        "intervalo e a indenização quando não é concedido, CRTS, auxílio-creche, "
        "teto da cesta e o piso da jornada reduzida.",
        "Cada proposta pode ter o seu regime tributário, RAT, FAP, turnover, "
        "absenteísmo, custos indiretos, ISS, modo (privado ou licitação) e onde a "
        "cobertura entra. Campo vazio usa o padrão de Configurações.",
        "Aviso quando o campo de encargos recebe os ~79% que a convenção publica: "
        "aquele número é o total e já inclui 13º, férias, rescisão e cobertura, "
        "que aqui são módulos próprios.",
        "No Simples sem RBT12 informado o sistema assume a última faixa e avisa, "
        "em vez de cair na primeira e devolver um preço que não existe.",
    ]),
    ("1.3", "18/08/2026", [
        "Motor de cálculo reescrito na cascata de seis módulos da IN SEGES/MP "
        "05/2017 (Anexo VII-D), com memória aberta módulo a módulo.",
        "Preço agora usa imposto por dentro: BASE ÷ (1 − T), no lugar da conta "
        "antiga. Custos indiretos viraram etapa própria, e «markup» passou a ser "
        "o lucro de planilha sobre custo direto + indiretos.",
        "Quatro regimes tributários (Presumido, Real, Simples Anexo IV e CPRB) e "
        "dois modos de precificação (proposta privada e licitação, esta sem IRPJ "
        "e CSLL por vedação do TCU).",
        "Encargos do submódulo 2.2 calculados por regime, com RAT × FAP.",
        "Periculosidade e insalubridade deixaram de somar: paga-se a maior das "
        "duas (art. 193 §2º da CLT), e a afastada fica registrada na memória.",
        "Módulo 3 (rescisão) calibrado pelo turnover e Módulo 4 (reposição do "
        "ausente) com trava anti-dupla-contagem contra o fator da escala.",
        "Jornada abaixo de 4h paga 60% do piso; intervalo indenizado em posto "
        "unipessoal virou linha do Módulo 1.",
    ]),
    ("1.2", "18/08/2026", [
        "Gráficos refeitos. As colunas grossas em degradê, com o valor carimbado "
        "em cada uma, viraram um gráfico de linha com pontos e comentários no "
        "pico e no mês corrente. Barras de funil, conversão, perdas e margem "
        "passaram a trilhos de 6px, com o número fora da barra.",
        "Todo gráfico ganhou uma tabela equivalente («Ver os números») e uma "
        "dica no passar do mouse, com a coluna inteira como alvo.",
    ]),
    ("1.1", "18/08/2026", [
        "A busca global saiu da barra do topo. Ela ficava colada em toda tela, "
        "disputando espaço com o título e repetindo o campo de busca que cada "
        "lista já tem dentro dela. Cada lista continua com o seu, que filtra o "
        "que está na frente do usuário.",
    ]),
    ("1.0", "18/08/2026", [
        "Tela inicial refeita: o nome do sistema com o traço de luz, e os módulos "
        "numa fileira de quatro que anda pela seta. O botão Gerenciar escolhe "
        "quais módulos aparecem.",
        "Tema escuro em todo o sistema (breu e violeta), no lugar do tema claro.",
        "Logo da empresa no trilho de navegação e no ícone da aba.",
        "Menu lateral reorganizado pelo ciclo da venda: Comercial → Propostas → "
        "Contratos, e depois Bases de cálculo, Análise e Configurações.",
        "Escalas e turnos deixaram de ter tela própria: viraram abas dentro de "
        "Convenções, que é onde a conta do posto mora.",
        "Lead ganhou estágio de conversão (Cliente, Convertido, Em proposta…) "
        "deduzido dos documentos, e a tela do lead abre mostrando as propostas "
        "com status e margem.",
        "Banco novo, sem nenhum dado fictício: sem empresa de exemplo, sem "
        "convenção com salário inventado, sem catálogo de equipamentos.",
        "Correção do gatilho da linha do tempo, que derrubava todo cadastro de "
        "lead com «record \"new\" has no field \"titulo\"».",
    ]),
]

VERSAO, DATA, _ = MUDANCAS[0]


# ── Ferramentas de formatação ────────────────────────────────────────────────

def _fonte(run, tam=10.5, cor=TINTA, negrito=False, italico=False, nome=FONTE):
    run.font.name = nome
    run.font.size = Pt(tam)
    run.font.color.rgb = cor
    run.bold = negrito
    run.italic = italico
    # o Word precisa do nome repetido no XML para fontes não-ocidentais
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts")
        rpr.append(rf)
    for attr in ("w:ascii", "w:hAnsi", "w:cs"):
        rf.set(qn(attr), nome)


def _sombrear(celula, cor_hex):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), cor_hex)
    celula._tc.get_or_add_tcPr().append(shd)


def _borda_inferior(paragrafo, cor="6D28D9", peso=12):
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(peso))
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), cor)
    pbdr.append(bottom)
    paragrafo._p.get_or_add_pPr().append(pbdr)


def titulo(doc, texto, nivel=1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(20 if nivel == 1 else 13)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_with_next = True
    _fonte(p.add_run(texto), 17 if nivel == 1 else 12.5,
           VIOLETA if nivel == 1 else TINTA, negrito=True)
    if nivel == 1:
        _borda_inferior(p)
    return p


def paragrafo(doc, texto, tam=10.5, cor=TINTA, italico=False, espaco=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(espaco)
    p.paragraph_format.line_spacing = 1.25
    _fonte(p.add_run(texto), tam, cor, italico=italico)
    return p


def lista(doc, itens, numerada=False):
    for i, item in enumerate(itens, 1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.6)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.2
        marca = "%d. " % i if numerada else "•  "
        _fonte(p.add_run(marca), 10.5, VIOLETA, negrito=True)
        # negrito antes do travessão, quando houver
        if " — " in item and not numerada:
            cabeca, resto = item.split(" — ", 1)
            _fonte(p.add_run(cabeca + " — "), 10.5, TINTA, negrito=True)
            _fonte(p.add_run(resto), 10.5, TINTA)
        else:
            _fonte(p.add_run(item), 10.5, TINTA)


def destaque(doc, titulo_txt, texto):
    """Caixa violeta clara: o que não pode passar batido."""
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.rows[0].cells[0]
    _sombrear(c, VIOLETA_CLARO)
    c.paragraphs[0].paragraph_format.space_after = Pt(2)
    _fonte(c.paragraphs[0].add_run(titulo_txt), 10, VIOLETA, negrito=True)
    p = c.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.2
    _fonte(p.add_run(texto), 10, TINTA)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return t


def tabela(doc, cabecalho, linhas, larguras=None):
    t = doc.add_table(rows=1, cols=len(cabecalho))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, texto in enumerate(cabecalho):
        c = t.rows[0].cells[i]
        _sombrear(c, FUNDO_TABELA)
        c.paragraphs[0].paragraph_format.space_after = Pt(1)
        _fonte(c.paragraphs[0].add_run(texto), 9.5, VIOLETA, negrito=True)
    for linha in linhas:
        cels = t.add_row().cells
        for i, texto in enumerate(linha):
            cels[i].paragraphs[0].paragraph_format.space_after = Pt(1)
            cels[i].paragraphs[0].paragraph_format.line_spacing = 1.15
            _fonte(cels[i].paragraphs[0].add_run(str(texto)), 9.5, TINTA,
                   negrito=(i == 0 and len(cabecalho) > 2))
    if larguras:
        for linha in t.rows:
            for i, l in enumerate(larguras):
                linha.cells[i].width = Cm(l)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    return t


def numero_de_pagina(doc):
    rodape = doc.sections[0].footer
    p = rodape.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _fonte(p.add_run("Mizys CRM · manual do sistema · versão %s · página " % VERSAO),
           8.5, CINZA)
    campo = OxmlElement("w:fldSimple")
    campo.set(qn("w:instr"), "PAGE")
    p._p.append(campo)


# ── O documento ──────────────────────────────────────────────────────────────

def capa(doc):
    for _ in range(3):
        doc.add_paragraph()
    if os.path.isfile(LOGO):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(LOGO, width=Cm(3.6))
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(18)
    _fonte(p.add_run("Mizys CRM"), 40, VIOLETA, negrito=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _fonte(p.add_run("Manual do sistema"), 18, TINTA)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(30)
    _fonte(p.add_run("Do primeiro contato ao contrato assinado:\n"
                     "prospecção, proposta com custo calculado posto a posto, "
                     "PDF para o cliente e contrato."), 11, CINZA)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(60)
    _fonte(p.add_run("versão %s  ·  %s" % (VERSAO, DATA)), 10, CINZA)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def secao_visao_geral(doc):
    titulo(doc, "1. O que o sistema faz")
    paragrafo(doc, "O Mizys CRM cobre um caminho só, do começo ao fim, e é esse "
                   "caminho que organiza o menu inteiro:")
    tabela(doc, ["Etapa", "O que acontece", "Onde"], [
        ["Lead", "A empresa que pode virar cliente: dados, origem e situação.",
         "Comercial › Leads"],
        ["Contato", "As pessoas dentro do lead — quem decide, quem assina.",
         "Comercial › Contatos"],
        ["Oportunidade", "O negócio em si: valor, fase do funil, chance de fechar.",
         "Comercial › Pipeline"],
        ["Proposta", "O documento com o custo calculado posto a posto.",
         "Propostas"],
        ["Contrato", "O que foi assinado: vigência, valor e reajuste.",
         "Contratos"],
    ], [2.6, 8.4, 4.5])
    paragrafo(doc, "Nada disso é decorativo: a proposta puxa o lead, o contrato "
                   "puxa a proposta, e o histórico de cada registro guarda quem "
                   "mexeu e quando.")
    destaque(doc, "O cálculo é o coração do sistema",
             "A proposta não é um texto com um número no fim. Cada posto de "
             "trabalho é calculado a partir da convenção coletiva (salário, "
             "benefícios, encargos), da escala (quantos funcionários mantêm um "
             "posto coberto) e do turno (quantas horas são noturnas). Encargos, "
             "markup, impostos e desconto entram por cima. A margem que aparece "
             "na tela é a margem de verdade.")


def secao_primeiro_acesso(doc):
    titulo(doc, "2. Primeiro acesso")
    lista(doc, [
        "Abra o endereço do sistema (por padrão http://127.0.0.1:5050).",
        "Clique em «Primeiro acesso? Criar conta» e cadastre e-mail e senha.",
        "O primeiro usuário criado vira administrador automaticamente.",
        "Vá em Configurações e preencha os dados da empresa — eles saem impressos "
        "no PPT e no PDF da proposta.",
        "Cadastre a sua convenção coletiva em Bases de cálculo › Convenções. Sem "
        "ela não é possível montar proposta.",
    ], numerada=True)
    titulo(doc, "Os três papéis", 2)
    tabela(doc, ["Papel", "O que pode fazer"], [
        ["Admin", "Tudo: parâmetros, listas, permissões e os dados de todo mundo."],
        ["Gestor", "Vê e edita o comercial de todo mundo e mexe nos cadastros."],
        ["Vendedor", "Vê e edita o que é dele; cadastros ficam em leitura."],
    ], [3.2, 12.3])
    paragrafo(doc, "Quem barra de verdade é o banco de dados, não a tela: mesmo "
                   "que alguém force um endereço, o Postgres devolve só as linhas "
                   "que o papel permite.", italico=True, cor=CINZA)


def secao_tela_inicial(doc):
    titulo(doc, "3. A tela inicial")
    paragrafo(doc, "A abertura do sistema é o nome da casa e os atalhos. Nada de "
                   "gráfico: quem abre o CRM de manhã quer ir a algum lugar, não "
                   "ler um painel.")
    lista(doc, [
        "Módulos — quatro cartões por vez, com a contagem real do que está aberto "
        "em cada tela. A seta à direita mostra os próximos.",
        "Gerenciar — escolhe quais módulos aparecem nessa fileira. A escolha fica "
        "guardada no navegador, é sua e não afeta os outros usuários.",
        "Contagens — só aparecem quando há o que contar. Base nova mostra o cartão "
        "sem número, e não um zero que parece defeito.",
    ])


def secao_menu(doc):
    titulo(doc, "4. O menu lateral")
    paragrafo(doc, "A faixa da esquerda tem só ícones; o painel com os nomes abre "
                   "quando o mouse encosta (ou no toque, em tablet). A ordem é a "
                   "do ciclo da venda.")
    tabela(doc, ["Grupo", "Telas", "Para quê"], [
        ["Início", "Tela inicial", "A porta de entrada."],
        ["Comercial", "Pipeline · Leads · Contatos · Oportunidades · Atividades",
         "O caminho da prospecção até o negócio, mais a agenda de ligações, "
         "reuniões e visitas."],
        ["Propostas", "Propostas comerciais · Nova proposta",
         "Montar, congelar, gerar o documento e enviar."],
        ["Contratos", "Contratos", "O que existe depois da assinatura."],
        ["Bases de cálculo", "Convenções (com Escalas e Turnos) · Equipamentos",
         "As tabelas que decidem quanto custa um posto."],
        ["Análise", "Painel de indicadores · Relatórios",
         "Os números, quando você quiser vê-los."],
        ["Sistema", "Configurações · Sua conta",
         "Empresa, listas, parâmetros e estado do servidor."],
    ], [3.0, 5.6, 6.9])
    destaque(doc, "Buscar e criar",
             "Cada lista tem o seu campo de busca, dentro da própria tela, e ele "
             "filtra o que está sendo mostrado — na lista de leads, por empresa, "
             "contato ou CNPJ. O botão «Novo», na barra do topo, cria qualquer "
             "coisa (proposta, lead, contato, atividade…) sem sair de onde você "
             "está.")


def secao_leads(doc):
    titulo(doc, "5. Leads")
    paragrafo(doc, "A lista traz empresa, contato, origem, valor estimado, status "
                   "e o estágio. Dá para filtrar por status, responsável e estágio, "
                   "importar e exportar CSV.")
    titulo(doc, "Status e estágio: duas perguntas diferentes", 2)
    paragrafo(doc, "O status é o que a PESSOA acha do lead — ela escolhe entre "
                   "Novo, Contatado, Qualificado, Em negociação e Desqualificado. "
                   "O estágio é o que os DOCUMENTOS provam, e o sistema deduz "
                   "sozinho: ninguém precisa lembrar de marcar «convertido» depois "
                   "de fechar o negócio.")
    tabela(doc, ["Estágio", "Quando aparece"], [
        ["Cliente", "Existe contrato ativo ou em implantação para este lead."],
        ["Ex-cliente", "Houve contrato, mas nenhum está mais de pé."],
        ["Convertido", "Uma proposta foi aceita pelo cliente ou aprovada — falta "
                       "gerar o contrato."],
        ["Em proposta", "Há proposta enviada ou em análise."],
        ["Proposta em rascunho", "Existe proposta montada, ainda sem envio."],
        ["Proposta recusada", "Todas as propostas do lead foram recusadas."],
        ["(vazio)", "Ainda é só um lead: nenhum documento foi criado."],
    ], [4.2, 11.3])
    titulo(doc, "Ao abrir um lead", 2)
    paragrafo(doc, "A primeira coisa da tela são as propostas dele, com emissão, "
                   "valor mensal, MARGEM e status — dá para varrer a lista e ver "
                   "que a proposta aceita foi justamente a de margem menor. A "
                   "margem abaixo do mínimo configurado aparece marcada.")
    lista(doc, [
        "Resumo — propostas, contatos, oportunidades e atividades do lead.",
        "Histórico e notas — tudo o que aconteceu, em ordem, com autor e data.",
        "Propostas — a lista completa, com margem e lucro mensal de cada uma.",
        "Contratos — o que já foi assinado a partir deste lead.",
    ])
    paragrafo(doc, "O sistema avisa quando o lead parece duplicado (mesmo CNPJ ou "
                   "nome parecido) e oferece abrir o outro.", cor=CINZA, italico=True)


def secao_proposta(doc):
    titulo(doc, "6. Propostas")
    paragrafo(doc, "É a tela onde o sistema ganha o dia. Cada posto de trabalho "
                   "entra com cargo, escala, turno, quantidade, adicionais e "
                   "benefícios; o custo aparece na hora, com a memória de cálculo "
                   "aberta ao lado.")
    titulo(doc, "Como o custo de um posto é montado", 2)
    lista(doc, [
        "Salário do cargo — vem da convenção coletiva escolhida na proposta.",
        "Adicionais — insalubridade (sobre mínimo, piso ou salário, conforme a "
        "convenção), periculosidade e adicional noturno.",
        "Adicional noturno — incide só sobre as horas entre 22h e 5h, com a hora "
        "reduzida de 52,5 minutos.",
        "Benefícios — vale-transporte, refeição, cesta e o que mais a convenção "
        "trouxer, já com o desconto legal na folha.",
        "Encargos sociais — percentual sobre a remuneração, vindo da convenção ou "
        "do padrão configurado.",
        "Fator da escala — quantos funcionários são necessários para manter UM "
        "posto coberto: horas de cobertura ÷ jornada contratual, mais absenteísmo "
        "e cobertura de férias. Numa 12x36 isso dá cerca de 2,17 — e não 2.",
    ])
    titulo(doc, "Os seis módulos", 2)
    paragrafo(doc, "O cálculo segue a cascata da IN SEGES/MP 05/2017 (Anexo "
                   "VII-D), que é o padrão que qualquer comprador profissional "
                   "pede e o que se defende em repactuação. A ordem não pode ser "
                   "trocada: cada módulo é base de incidência do seguinte.")
    tabela(doc, ["Módulo", "O que entra", "Sobre o quê incide"], [
        ["1 · Remuneração", "Salário do piso, periculosidade OU insalubridade, "
         "adicional noturno com hora reduzida, intervalo indenizado.", "—"],
        ["2 · Encargos e benefícios", "2.1 13º e terço de férias (11,11%) · 2.2 "
         "INSS, RAT×FAP, terceiros e FGTS · 2.3 VT, VR, cesta, plano, seguro.",
         "2.1 sobre o M1; 2.2 sobre M1 + 2.1; 2.3 em R$, sem encargo."],
        ["3 · Rescisão", "Multa de 40% do FGTS, aviso prévio indenizado e "
         "trabalhado, calibrados pelo turnover.", "M1 + 2.1"],
        ["4 · Reposição do ausente", "Férias do substituto, ausências legais, "
         "absenteísmo real.", "M1 + 2.1, com encargos"],
        ["5 · Insumos", "Uniforme, EPI, material, equipamento, exames, "
         "treinamento.", "R$ por posto"],
        ["6 · Preço", "Custos indiretos, lucro de planilha e tributos.",
         "ver abaixo"],
    ], [3.4, 7.2, 4.9])
    destaque(doc, "A cobertura entra uma vez só",
             "A reserva técnica pode ser tratada no headcount (o fator da escala "
             "multiplica o custo) OU no Módulo 4 (vira linha na planilha). Nunca "
             "nas duas. Contar duas vezes infla o preço em cerca de 13% e é o "
             "motivo nº 1 de se perder concorrência no setor. Quem decide é o "
             "parâmetro «cobertura_modo» em Configurações, e o sistema aplica a "
             "trava sozinho.")
    titulo(doc, "Do custo ao preço", 2)
    paragrafo(doc, "CD = M1+M2+M3+M4+M5 · CI = CD × %indiretos · SUB = CD+CI · "
                   "LUCRO = SUB × %lucro · BASE = SUB+LUCRO · "
                   "PREÇO = BASE ÷ (1 − T).")
    destaque(doc, "Imposto por dentro",
             "O preço divide por (1 − T); nunca multiplica por (1 + T). Parece a "
             "mesma coisa e não é: com T de 16,53%, multiplicar dá 116,53 e "
             "dividir dá 119,80. Os 2,8% de diferença saem inteiros do lucro.")
    titulo(doc, "O regime tributário muda o preço", 2)
    paragrafo(doc, "T é a soma das alíquotas que incidem sobre a receita, e ele "
                   "depende do regime e do modo. Em licitação, IRPJ e CSLL ficam "
                   "fora do campo de tributos (vedação do TCU, Acórdão "
                   "950/2007-Plenário) — o mesmo custo dá preços cerca de 12% "
                   "diferentes nos dois modos.")
    tabela(doc, ["Regime", "Encargos (2.2)", "T · proposta privada"], [
        ["Lucro Presumido", "36,80%", "16,53%"],
        ["Lucro Real", "36,80%", "13,57% (margem 10%, insumos 10%)"],
        ["Simples Anexo IV", "31,00% — isento de terceiros", "11,35% (RBT12 1,5 mi)"],
        ["CPRB 2026", "26,80% + 2,70% da receita", "19,23%"],
        ["Presumido, licitação", "36,80%", "5,65%"],
    ], [4.0, 5.6, 5.9])
    destaque(doc, "Congelamento",
             "Enquanto a proposta está em Rascunho ela acompanha a convenção: se "
             "o salário mudar, o valor muda junto. Ao sair de Rascunho o sistema "
             "guarda uma fotografia de salários, benefícios, encargos, escalas e "
             "turnos. Reajuste de convenção em janeiro não mexe mais numa proposta "
             "enviada em julho — ela virou documento, não consulta.")
    titulo(doc, "Documento e envio", 2)
    lista(doc, [
        "PPT e PDF — gerados pelo servidor a partir do modelo em modelo_ppt/, com "
        "a logo da empresa na capa. O PDF sai do PPTX pelo LibreOffice.",
        "Fila — a geração roda em segundo plano; a tela não trava esperando.",
        "Histórico de documentos — cada arquivo gerado fica guardado, e dá para "
        "baixar de novo exatamente o que o cliente recebeu.",
        "E-mail — envia a proposta anexada, com assunto e corpo configuráveis.",
        "Link de aceite — o cliente abre a proposta sem ter login e registra o "
        "aceite; o sistema anota data, nome e IP.",
    ])


def secao_bases(doc):
    titulo(doc, "7. Bases de cálculo")
    paragrafo(doc, "Três coisas alimentam o custo do posto, e as três moram neste "
                   "grupo. Só admin e gestor editam.")
    titulo(doc, "Convenções, escalas e turnos", 2)
    paragrafo(doc, "Uma tela só, com três abas — porque é uma conta só:")
    lista(doc, [
        "Convenções — sindicato, vigência, cargos com salário, benefícios e "
        "encargos. Uma convenção a vencer em menos de 60 dias aparece marcada.",
        "Escalas — 12x36, 5x2, 6x1, plantão. O fator pode ser informado à mão ou "
        "calculado a partir das horas de cobertura, absenteísmo e férias.",
        "Turnos — faixas de horário, com o cálculo automático de quantas horas "
        "caem na jornada noturna.",
    ])
    titulo(doc, "Equipamentos", 2)
    paragrafo(doc, "Catálogo do que pode entrar numa proposta: uniforme, EPI, "
                   "máquina, rádio, software. Cada item é mensal ou de implantação "
                   "(cobrado uma vez).")


def secao_analise(doc):
    titulo(doc, "8. Contratos e análise")
    lista(doc, [
        "Contratos — vigência, valor mensal, índice de reajuste e a proposta que "
        "deu origem. O histórico de reajustes fica junto.",
        "Painel de indicadores — pipeline, taxa de conversão, metas e o funil do "
        "período.",
        "Relatórios — evolução no tempo, origem dos leads, ranking e metas por "
        "pessoa, com exportação.",
        "Atividades — ligações, reuniões e visitas, com o que está atrasado em "
        "destaque.",
    ])
    titulo(doc, "Como ler os gráficos", 2)
    paragrafo(doc, "A receita ganha por mês é uma linha com um ponto por mês. "
                   "Só dois pontos vêm com o valor escrito: o pico do período e "
                   "o mês corrente — número em cima de todo ponto vira ruído e "
                   "ninguém lê. Os demais aparecem ao passar o mouse (o alvo é a "
                   "coluna inteira, não o pontinho) ou no «Ver os números», que "
                   "abre a mesma informação em tabela para copiar ou imprimir.")
    paragrafo(doc, "Funil, conversão por origem, motivos de perda e margens usam "
                   "a mesma barra fina: rótulo à esquerda, trilho no meio, número "
                   "à direita, fora da barra. Em Margens, a proposta abaixo da "
                   "margem mínima muda de cor — é o único alerta da tela.")


def secao_config(doc):
    titulo(doc, "9. Configurações")
    tabela(doc, ["Aba", "O que fica lá"], [
        ["Parâmetros", "Dados da empresa, textos institucionais, percentuais "
                       "padrão de encargos, markup, imposto e desconto, limites de "
                       "aprovação e margem mínima."],
        ["Listas", "Fases do funil, status, origens, tipos de atividade, "
                   "responsáveis, UFs — tudo editável, nada fixo no código."],
        ["Usuários", "Quem tem acesso e com qual papel."],
        ["Estado do servidor", "O que está de pé: Supabase, LibreOffice para PDF, "
                               "modelo do PPT, logo e envio de e-mail."],
    ], [3.6, 11.9])
    destaque(doc, "Antes de emitir a primeira proposta",
             "Preencha os dados da empresa. Razão social, CNPJ, endereço, telefone "
             "e cidade saem impressos no documento que vai para o cliente, e a "
             "cidade é usada na data por extenso.")


def secao_requisitos(doc):
    titulo(doc, "10. O que o sistema precisa para rodar")
    tabela(doc, ["Peça", "Para quê", "Sem ela"], [
        ["Supabase", "Banco de dados, login e guarda dos arquivos gerados.",
         "O sistema não abre."],
        ["LibreOffice", "Converte o PPTX em PDF, em modo silencioso.",
         "O PPT sai; o PDF, não."],
        ["Modelo do PPT", "O arquivo em modelo_ppt/ que vira a proposta.",
         "A geração falha."],
        ["SMTP", "Envio da proposta por e-mail.",
         "O botão explica o que falta em vez de falhar."],
    ], [3.2, 7.3, 5.0])
    paragrafo(doc, "Tudo isso é verificado sozinho: Configurações › Estado do "
                   "servidor mostra o que está de pé antes de você descobrir na "
                   "hora de mandar a proposta para o cliente.")


def secao_mudancas(doc):
    titulo(doc, "11. Histórico de versões")
    paragrafo(doc, "Cada alteração no sistema entra aqui, da mais recente para a "
                   "mais antiga.")
    for versao, data, itens in MUDANCAS:
        titulo(doc, "Versão %s — %s" % (versao, data), 2)
        lista(doc, itens)


def main():
    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Cm(2.2)
    sec.bottom_margin = Cm(2.0)
    sec.left_margin = Cm(2.4)
    sec.right_margin = Cm(2.4)
    estilo = doc.styles["Normal"]
    estilo.font.name = FONTE
    estilo.font.size = Pt(10.5)

    capa(doc)
    numero_de_pagina(doc)
    secao_visao_geral(doc)
    secao_primeiro_acesso(doc)
    secao_tela_inicial(doc)
    secao_menu(doc)
    secao_leads(doc)
    secao_proposta(doc)
    secao_bases(doc)
    secao_analise(doc)
    secao_config(doc)
    secao_requisitos(doc)
    secao_mudancas(doc)

    doc.save(SAIDA)
    print("gerado: %s (%.0f KB)" % (SAIDA, os.path.getsize(SAIDA) / 1024))


if __name__ == "__main__":
    sys.exit(main())
