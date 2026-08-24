"""
Geração do PPT e do PDF da proposta.

O PDF **não** é desenhado por aqui: ele é o PPTX gerado, convertido pelo
LibreOffice em modo headless. É isso que garante que os dois arquivos fiquem
visualmente idênticos — é o mesmo documento, exportado.

Por que o LibreOffice e não o PowerPoint (que era o caminho principal antes):
o PowerPoint é single-instance e automatizado por COM. Ele exige uma sessão
interativa do Windows, briga com a instância que o usuário já tem aberta, e
`Quit()` deixa POWERPNT.exe pendurado quando a exportação falha no meio — a
partir do segundo processo zumbi, toda conversão seguinte trava. O LibreOffice
é um processo filho comum: nasce, converte, morre, e o código sabe o código de
saída. Ele continua como **motor padrão** mesmo quando há Office na máquina.

Quem monta o dicionário é o documentos.py, no servidor, a partir do id da
proposta — o navegador não manda mais número nenhum. Aqui só trocamos {CHAVE}
pelo texto correspondente no modelo de modelo_ppt/, expandimos as tabelas e
ligamos/desligamos os slides opcionais.
"""
import copy
import os
import pathlib
import shutil
import subprocess
import tempfile
import threading

from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.util import Emu

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELOS_DIR = os.path.join(BASE_DIR, "modelo_ppt")

# Imagens aceitas como logo da capa, em ordem de preferência.
LOGOS = ("logo.png", "logo.jpg", "logo.jpeg", "logo.svg")

# Só uma conversão por vez. O LibreOffice até aguenta paralelismo com perfis
# separados, mas duas exportações simultâneas na mesma máquina só disputam CPU:
# a fila já serializa o trabalho, e o lock garante isso mesmo se alguém chamar
# converter_para_pdf() de fora dela.
_LOCK_CONVERSAO = threading.Lock()

# Motor de conversão. "libreoffice" é o padrão; "powerpoint" força o COM (só
# Windows com Office) e "auto" tenta o LibreOffice e cai para o PowerPoint.
PDF_MOTOR = (os.environ.get("PDF_MOTOR") or "libreoffice").strip().lower()

# Uma conversão normal leva de 5 a 30 segundos. O primeiro uso é mais lento,
# porque o LibreOffice ainda está criando o perfil.
TIMEOUT_CONVERSAO = int(os.environ.get("PDF_TIMEOUT") or 240)

LIBREOFFICE_CANDIDATOS = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/opt/libreoffice/program/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "soffice",
    "libreoffice",
]

# Windows: o filho não pode piscar uma janela de console no servidor.
_SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0


class ErroDocumento(Exception):
    """Falha esperada e explicável ao gerar PPT/PDF."""


# ── substituição de texto preservando a formatação do modelo ──────────────────

def _escrever_paragrafo(paragrafo, texto):
    """Coloca `texto` no parágrafo mantendo a formatação do primeiro run.

    Quebras de linha viram <a:br/>, e não parágrafos novos, para o espaçamento
    do modelo continuar valendo.
    """
    runs = paragrafo.runs
    if not runs:
        return
    modelo_run = runs[0]._r
    p = paragrafo._p
    for run in runs[1:]:
        p.remove(run._r)

    linhas = str(texto).split("\n")
    runs[0].text = linhas[0]
    anterior = modelo_run
    for linha in linhas[1:]:
        br = anterior.makeelement(qn("a:br"), {})
        anterior.addnext(br)
        novo = copy.deepcopy(modelo_run)
        for filho in novo.findall(qn("a:t")):
            filho.text = linha
        br.addnext(novo)
        anterior = novo


def _substituir_no_frame(frame, valores):
    """Troca cada {CHAVE} pelo valor. Funciona mesmo se o PowerPoint tiver
    quebrado o placeholder em vários runs (acontece direto)."""
    for paragrafo in frame.paragraphs:
        original = "".join(run.text for run in paragrafo.runs)
        if "{" not in original:
            continue
        novo = original
        for chave, valor in valores.items():
            marcador = "{%s}" % chave
            if marcador in novo:
                novo = novo.replace(marcador, "" if valor is None else str(valor))
        if novo != original:
            _escrever_paragrafo(paragrafo, novo)


def _percorrer_formas(formas):
    """Gera todas as formas, entrando nos agrupamentos."""
    for forma in formas:
        if forma.shape_type == 6:  # MSO_SHAPE_TYPE.GROUP
            yield from _percorrer_formas(forma.shapes)
        else:
            yield forma


def _substituir_no_slide(slide, valores):
    for forma in _percorrer_formas(slide.shapes):
        if forma.has_text_frame:
            _substituir_no_frame(forma.text_frame, valores)
        if getattr(forma, "has_table", False) and forma.has_table:
            for linha in forma.table.rows:
                for celula in linha.cells:
                    _substituir_no_frame(celula.text_frame, valores)


# ── tabelas que crescem: uma linha-modelo vira N linhas ───────────────────────

def _achar_tabela(slide, marcador):
    """Devolve (tabela, índice_da_linha_modelo) da tabela que contém o marcador."""
    for forma in _percorrer_formas(slide.shapes):
        if not (getattr(forma, "has_table", False) and forma.has_table):
            continue
        for i, linha in enumerate(forma.table.rows):
            if any(marcador in c.text for c in linha.cells):
                return forma.table, i
    return None, None


def _expandir_linhas(slide, marcador, registros, chaves):
    """Duplica a linha-modelo uma vez por registro.

    `chaves` mapeia a chave do placeholder ({QTD} → "qtd") para o campo do dict.
    Sem registros, a linha-modelo é removida e a tabela fica só com os totais.
    """
    tabela, ix = _achar_tabela(slide, marcador)
    if tabela is None:
        return
    tbl = tabela._tbl
    tr_modelo = tbl.tr_lst[ix]

    anterior = tr_modelo
    for registro in registros:
        nova = copy.deepcopy(tr_modelo)
        anterior.addnext(nova)
        anterior = nova

    tbl.remove(tr_modelo)

    # Reindexa depois da remoção: as linhas novas ocupam o lugar da modelo.
    for offset, registro in enumerate(registros):
        valores = {ph: registro.get(campo, "") for ph, campo in chaves.items()}
        for celula in tabela.rows[ix + offset].cells:
            _substituir_no_frame(celula.text_frame, valores)


def _remover_slide(prs, indice):
    lst = prs.slides._sldIdLst
    slides = list(lst)
    if indice >= len(slides):
        return
    rid = slides[indice].get(
        "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    prs.part.drop_rel(rid)
    lst.remove(slides[indice])


# ── slides opcionais (4.5) ───────────────────────────────────────────────────

def marcador_do_slide(slide):
    """Nome do slide, lido das ANOTAÇÕES ('SLIDE:equipamentos').

    Antes o slide de equipamentos era localizado procurando o texto literal
    "Equipamentos e recursos" no corpo — bastava alguém reescrever o título no
    PowerPoint para a remoção parar de funcionar em silêncio (P9.7). A anotação
    não é impressa, não aparece na apresentação e ninguém a edita por engano.
    """
    try:
        if not slide.has_notes_slide:
            return None
        texto = slide.notes_slide.notes_text_frame.text or ""
    except (AttributeError, KeyError):
        return None
    for linha in texto.splitlines():
        linha = linha.strip()
        if linha.upper().startswith("SLIDE:"):
            return linha.split(":", 1)[1].strip().lower()
    return None


def _slide_ligado(nome, escolhas, tem_equipamentos):
    if nome is None:
        return True
    if nome in escolhas:
        return bool(escolhas[nome])
    # Padrão: tudo ligado, menos o de equipamentos quando não há equipamento.
    if nome == "equipamentos":
        return tem_equipamentos
    return True


# ── logo de verdade na capa (4.6) ────────────────────────────────────────────

def caminho_logo():
    for nome in LOGOS:
        caminho = os.path.join(MODELOS_DIR, nome)
        if os.path.isfile(caminho) and not nome.endswith(".svg"):
            return caminho
    return None


def _aplicar_logo(slide, caminho):
    """Troca a forma marcada com {LOGO} pela imagem, mantendo o enquadramento.

    A imagem entra CONTIDA na caixa reservada (nunca esticada): logo distorcido
    é o tipo de detalhe que o cliente nota antes do preço.
    """
    alvos = [f for f in _percorrer_formas(slide.shapes)
             if f.has_text_frame and "{LOGO}" in f.text_frame.text]
    if not alvos:
        return
    for forma in alvos:
        cx, cy = forma.width, forma.height
        x, y = forma.left, forma.top
        try:
            from PIL import Image  # opcional: sem Pillow, cai no ajuste simples
            with Image.open(caminho) as img:
                pw, ph = img.size
            escala = min(cx / pw, cy / ph)
            larg, alt = int(pw * escala), int(ph * escala)
        except Exception:  # noqa: BLE001 — sem Pillow ou imagem ilegível
            larg, alt = cx, cy
        slide.shapes.add_picture(caminho, Emu(int(x + (cx - larg) / 2)),
                                 Emu(int(y + (cy - alt) / 2)), Emu(larg), Emu(alt))
        forma._element.getparent().remove(forma._element)


def _limpar_marcadores(slide):
    """Apaga o texto {LOGO} que sobrou quando não há imagem de logo."""
    for forma in _percorrer_formas(slide.shapes):
        if forma.has_text_frame and "{LOGO}" in forma.text_frame.text:
            _substituir_no_frame(forma.text_frame, {"LOGO": ""})


# ── API principal ────────────────────────────────────────────────────────────

def caminho_modelo(nome_arquivo):
    if not nome_arquivo:
        nome_arquivo = "mizys_proposta.pptx"
    nome_arquivo = os.path.basename(nome_arquivo)  # nada de subir diretório
    caminho = os.path.join(MODELOS_DIR, nome_arquivo)
    if not os.path.isfile(caminho):
        disponiveis = ", ".join(sorted(
            f for f in os.listdir(MODELOS_DIR) if f.lower().endswith(".pptx")
        )) if os.path.isdir(MODELOS_DIR) else "(pasta modelo_ppt não existe)"
        raise ErroDocumento(
            "Modelo '%s' não encontrado em modelo_ppt/. Disponíveis: %s"
            % (nome_arquivo, disponiveis or "nenhum"))
    return caminho


def gerar_pptx(dados, destino):
    """Preenche o modelo com `dados` e grava o .pptx em `destino`."""
    prs = Presentation(caminho_modelo(dados.get("modelo")))

    postos = dados.get("postos") or []
    equipamentos = dados.get("equipamentos") or []
    beneficios = dados.get("beneficios") or []
    escolhas = {str(k).lower(): v for k, v in (dados.get("slides") or {}).items()}
    tem_eq = bool(dados.get("tem_equipamentos", equipamentos))
    tem_ben = bool(dados.get("tem_beneficios", beneficios))

    # 1. Fora os slides desligados — de trás para a frente, para os índices que
    #    ainda faltam não escorregarem a cada remoção.
    for i in range(len(prs.slides) - 1, -1, -1):
        nome = marcador_do_slide(prs.slides[i])
        if nome == "beneficios" and not tem_ben:
            _remover_slide(prs, i)
            continue
        if not _slide_ligado(nome, escolhas, tem_eq):
            _remover_slide(prs, i)

    slides = list(prs.slides)
    logo = caminho_logo()

    # 2. Tabelas que crescem, antes da substituição de texto: as linhas novas
    #    ainda precisam dos {CHAVE} intactos para serem preenchidas.
    for slide in slides:
        _expandir_linhas(slide, "{QTD}", postos, {
            "QTD": "qtd", "CARGO": "cargo", "ESCALA_TURNO": "escala_turno",
            "ADICIONAIS": "adicionais", "OBS_POSTO": "obs",
            "VALOR_UNITARIO": "valor_unitario", "VALOR_MENSAL": "valor_mensal",
        })
        _expandir_linhas(slide, "{EQ_QTD}", equipamentos, {
            "EQ_QTD": "qtd", "EQ_NOME": "nome", "EQ_MARCA": "marca",
            "EQ_TIPO": "tipo", "EQ_VALOR": "valor", "EQ_TOTAL": "total",
        })
        _expandir_linhas(slide, "{BEN_NOME}", beneficios, {
            "BEN_NOME": "nome", "BEN_BASE": "base", "BEN_VALOR": "valor",
            "BEN_DESCONTO": "desconto", "BEN_CUSTO": "custo",
        })

    # 3. Logo e campos.
    campos = dict(dados.get("campos") or {})
    for slide in slides:
        if logo:
            _aplicar_logo(slide, logo)
        else:
            _limpar_marcadores(slide)
        _substituir_no_slide(slide, campos)

    prs.save(destino)
    return destino


# ── achar o LibreOffice ──────────────────────────────────────────────────────

def _libreoffice_no_registro():
    """No Windows o instalador deixa o caminho no registro — mais confiável do
    que adivinhar 'Program Files', que muda com idioma e instalação por usuário.
    """
    if os.name != "nt":
        return None
    try:
        import winreg
    except ImportError:
        return None
    chaves = [
        (winreg.HKEY_LOCAL_MACHINE,
         r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\soffice.exe", ""),
        (winreg.HKEY_CURRENT_USER,
         r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\soffice.exe", ""),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\LibreOffice\UNO\InstallPath", "program"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\LibreOffice\UNO\InstallPath", "program"),
    ]
    for raiz, caminho, sufixo in chaves:
        try:
            with winreg.OpenKey(raiz, caminho) as chave:
                valor = winreg.QueryValueEx(chave, "")[0]
        except OSError:
            continue
        # A chave UNO aponta para a PASTA program/; App Paths, para o .exe.
        exe = os.path.join(valor, "soffice.exe") if sufixo else valor
        if os.path.isfile(exe):
            return exe
    return None


def _binario_libreoffice():
    """O soffice desta máquina, ou None.

    Ordem: o que o .env mandou, o registro do Windows, os caminhos conhecidos e
    por fim o PATH. O .env vem primeiro para dar saída a instalação portátil.
    """
    do_env = (os.environ.get("LIBREOFFICE_PATH") or "").strip().strip('"')
    if do_env:
        if os.path.isdir(do_env):  # apontaram a pasta, não o executável
            for nome in ("soffice.exe", "soffice"):
                if os.path.isfile(os.path.join(do_env, nome)):
                    return os.path.join(do_env, nome)
        if os.path.isfile(do_env):
            return do_env

    achado = _libreoffice_no_registro()
    if achado:
        return achado

    for candidato in LIBREOFFICE_CANDIDATOS:
        if os.path.isfile(candidato):
            return candidato
        achado = shutil.which(candidato)
        if achado:
            return achado
    return None


def _perfil_libreoffice():
    """Perfil próprio do servidor, como URI file://.

    Sem isto a conversão compartilha o perfil do usuário logado. Aí, se ele
    estiver com o LibreOffice aberto, o `soffice --headless` apenas conversa com
    a instância que já existe, devolve 0 na hora e **não gera arquivo nenhum** —
    a falha mais chata deste caminho, porque parece sucesso.
    """
    pasta = os.path.join(tempfile.gettempdir(), "mizys_lo_perfil")
    os.makedirs(pasta, exist_ok=True)
    return pathlib.Path(pasta).as_uri()


# ── conversão ────────────────────────────────────────────────────────────────

def _pdf_valido(caminho):
    """Arquivo existe, tem conteúdo e começa com %PDF.

    O LibreOffice já devolveu 0 deixando um arquivo de zero byte para trás.
    Conferir a assinatura custa cinco bytes e evita mandar lixo ao cliente.
    """
    try:
        if os.path.getsize(caminho) <= 0:
            return False
        with open(caminho, "rb") as fh:
            return fh.read(5) == b"%PDF-"
    except OSError:
        return False


def _rodar(cmd, timeout):
    """Executa e devolve (codigo, stderr). Mata o filho se ele passar do tempo —
    `subprocess.run` levanta TimeoutExpired mas deixa o processo vivo, e um
    soffice pendurado envenena a próxima conversão."""
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            creationflags=_SEM_JANELA)
    try:
        _, erro = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        raise ErroDocumento(
            "O LibreOffice não respondeu em %ds e foi encerrado." % timeout)
    return proc.returncode, (erro or b"").decode("utf-8", "replace").strip()


def _converter_libreoffice(pptx, pdf):
    """Exporta pelo LibreOffice Impress, em processo isolado.

    Duas tentativas: a primeira de um perfil novo às vezes morre no meio da
    criação dele, e a segunda passa sem que ninguém precise saber disso.
    """
    binario = _binario_libreoffice()
    if not binario:
        raise ErroDocumento(
            "LibreOffice não encontrado. Instale-o (libreoffice.org) ou aponte o "
            "executável em LIBREOFFICE_PATH no .env.")

    saida = os.path.dirname(os.path.abspath(pdf))
    gerado = os.path.join(saida, os.path.splitext(os.path.basename(pptx))[0] + ".pdf")
    cmd = [
        binario,
        "-env:UserInstallation=%s" % _perfil_libreoffice(),
        "--headless", "--invisible", "--nologo", "--nodefault",
        "--nofirststartwizard", "--nolockcheck", "--norestore",
        # O filtro explícito do Impress: sem ele o LibreOffice escolhe o
        # exportador pela extensão e um .pptx atípico pode cair no do Writer.
        "--convert-to", "pdf:impress_pdf_Export",
        "--outdir", saida, os.path.abspath(pptx),
    ]

    problemas = []
    for tentativa in (1, 2):
        if os.path.exists(gerado):
            os.remove(gerado)
        codigo, erro = _rodar(cmd, TIMEOUT_CONVERSAO)
        if _pdf_valido(gerado):
            if os.path.abspath(gerado) != os.path.abspath(pdf):
                shutil.move(gerado, pdf)
            return pdf
        problemas.append("tentativa %d: saiu com código %s%s"
                         % (tentativa, codigo, (" — " + erro) if erro else
                            " e não deixou PDF legível"))
    raise ErroDocumento("LibreOffice não converteu o arquivo (%s)."
                        % "; ".join(problemas))


def _converter_powerpoint(pptx, pdf):
    """Exporta pelo PowerPoint — é o mesmo 'Salvar como PDF' feito à mão.

    Só entra como alternativa (PDF_MOTOR=powerpoint ou auto sem LibreOffice).
    A instância que o USUÁRIO já tinha aberta nunca é encerrada: fechar o
    PowerPoint de quem está trabalhando na máquina, para exportar um PDF em
    segundo plano, é perder o trabalho dele.
    """
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    app = apresentacao = None
    nossa = False
    try:
        try:
            app = win32com.client.GetActiveObject("PowerPoint.Application")
        except Exception:  # noqa: BLE001 — não havia instância aberta
            app = win32com.client.Dispatch("PowerPoint.Application")
            nossa = True
        apresentacao = app.Presentations.Open(pptx, ReadOnly=True, WithWindow=False)
        apresentacao.SaveAs(pdf, 32)  # 32 = ppSaveAsPDF
    finally:
        if apresentacao is not None:
            try:
                apresentacao.Close()
            except Exception:
                pass
        if app is not None and nossa:
            try:
                app.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


def motores_pdf():
    """(nome, função) na ordem em que devem ser tentados, conforme PDF_MOTOR."""
    lo = ("LibreOffice", _converter_libreoffice)
    pp = ("PowerPoint", _converter_powerpoint)
    if PDF_MOTOR == "powerpoint":
        return [pp] if os.name == "nt" else [lo]
    if PDF_MOTOR == "auto":
        return [lo, pp] if os.name == "nt" else [lo]
    return [lo]                                   # padrão: só o LibreOffice


def pdf_disponivel():
    """Há como converter para PDF nesta máquina?

    A tela de Configurações mostra isso — descobrir que não dá para gerar PDF
    na hora de mandar a proposta para o cliente é tarde demais.
    """
    if bool(_binario_libreoffice()):
        return True
    return os.name == "nt" and PDF_MOTOR in ("auto", "powerpoint")


def converter_para_pdf(pptx, pdf):
    """Converte o PPTX em PDF preservando o layout."""
    erros = []
    with _LOCK_CONVERSAO:
        for nome, conversor in motores_pdf():
            try:
                conversor(pptx, pdf)
                if _pdf_valido(pdf):
                    return pdf
                erros.append("%s: não produziu um PDF legível" % nome)
            except Exception as exc:  # noqa: BLE001 — queremos tentar o próximo
                erros.append("%s: %s" % (nome, exc))
    raise ErroDocumento(
        "Não foi possível converter para PDF. " + " | ".join(erros))


def gerar(dados, formato):
    """Gera o documento e devolve (bytes, nome_do_arquivo, mimetype)."""
    if formato not in ("pptx", "pdf"):
        raise ErroDocumento("Formato inválido: %s" % formato)

    base = "".join(
        c if (c.isalnum() or c in "-_") else "_"
        for c in str(dados.get("arquivo") or "proposta")
    ) or "proposta"

    with tempfile.TemporaryDirectory(prefix="mizys_") as tmp:
        pptx = os.path.join(tmp, base + ".pptx")
        gerar_pptx(dados, pptx)
        if formato == "pptx":
            alvo, mime = pptx, ("application/vnd.openxmlformats-officedocument"
                                ".presentationml.presentation")
        else:
            alvo = os.path.join(tmp, base + ".pdf")
            converter_para_pdf(pptx, alvo)
            mime = "application/pdf"
        with open(alvo, "rb") as fh:
            return fh.read(), os.path.basename(alvo), mime
