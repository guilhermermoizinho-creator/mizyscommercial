"""
Teste de ponta a ponta do documento: proposta → cálculo → PPTX.

O teste que interessa é o último: ele ABRE o .pptx gerado, lê a tabela do slide
de resumo e soma a coluna com os mesmos olhos do cliente. Era exatamente essa
soma que não fechava (P1) — 22% de diferença, o markup que não aparecia em linha
nenhuma. Se alguém reescrever o slide e a conta voltar a não fechar, este teste
quebra antes de o PDF sair.

    python -m unittest discover -s tests -v
"""
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import calculo   # noqa: E402
import documentos  # noqa: E402
import ppt       # noqa: E402


# ── um Supabase de mentira, com só o que o documentos.py chama ───────────────

class SupabaseFalso:
    def __init__(self, tabelas):
        self.t = tabelas
        self.gravou = []

    def select(self, tabela, colunas="*", ordem=None, limite=None, **filtros):
        linhas = self.t.get(tabela, [])
        for chave, expr in filtros.items():
            if str(expr).startswith("eq."):
                alvo = str(expr)[3:]
                linhas = [x for x in linhas if str(x.get(chave)) == alvo]
        return linhas[:limite] if limite else linhas

    def um(self, tabela, id_):
        r = self.select(tabela, id="eq.%s" % id_, limite=1)
        return r[0] if r else None

    def update(self, tabela, dados, retornar=True, **filtros):
        alvo = str(list(filtros.values())[0])[3:]
        for x in self.t.get(tabela, []):
            if str(x.get("id")) == alvo:
                x.update(dados)
                return x
        return None

    def insert(self, tabela, dados, retornar=True):
        self.gravou.append((tabela, dados))
        self.t.setdefault(tabela, []).append(dados)
        return dados

    def storage_upload(self, *a, **k):
        return "ok"


def base():
    return SupabaseFalso({
        "configuracoes": [
            {"chave": "empresa_fantasia", "valor": "Mizys"},
            {"chave": "empresa_nome", "valor": "Mizys Serviços Ltda."},
            {"chave": "empresa_cidade", "valor": "Santo André"},
            {"chave": "empresa_valores", "valor": "Ética; Qualidade; Respeito"},
            {"chave": "segmento", "valor": "Facilities"},
            {"chave": "adicional_noturno", "valor": "20"},
            {"chave": "salario_minimo", "valor": "1518"},
            {"chave": "aceite_base_url", "valor": "http://localhost:5050"},
        ],
        "ccts": [{"id": 1, "nome": "CCT ABC 2026", "sindicato": "SIEMACO",
                  "vigencia_inicio": "2026-01-01", "vigencia_fim": "2026-12-31",
                  "insalubridade_base": "minimo", "salario_minimo": 1518,
                  "piso_categoria": 1780, "horas_mensais": 220}],
        "cct_cargos": [
            {"id": 1, "cctId": 1, "nome": "Auxiliar de Limpeza", "salario": 1780},
            {"id": 4, "cctId": 1, "nome": "Porteiro", "salario": 1920},
        ],
        "cct_beneficios": [
            {"id": 1, "cctId": 1, "nome": "Vale-transporte", "valor": 352,
             "unid": "mês", "desconto_tipo": "pct_salario", "desconto_pct": 6},
            {"id": 2, "cctId": 1, "nome": "Vale-refeição", "valor": 660,
             "unid": "mês", "desconto_tipo": "pct_valor", "desconto_pct": 20},
        ],
        "escalas": [
            {"id": 1, "nome": "44h", "horas_semanais": 44, "fator_modo": "manual", "fator_func": 1},
            {"id": 2, "nome": "12x36", "horas_semanais": 44, "fator_modo": "calculado",
             "dias_semana": 7, "horas_posto_dia": 12, "absenteismo_pct": 4,
             "cobertura_ferias": True},
        ],
        "turnos": [
            {"id": 1, "nome": "Diurno", "hora_inicio": "07:00", "hora_fim": "19:00",
             "intervalo_min": 60, "noturno": False},
            {"id": 2, "nome": "Noturno", "hora_inicio": "19:00", "hora_fim": "07:00",
             "intervalo_min": 60, "noturno": True},
        ],
        "equipamentos": [
            {"id": 1, "nome": "Uniforme", "marca_modelo": "Padrão", "valor": 186, "tipo": "Mensal"},
            {"id": 10, "nome": "Instalação inicial", "marca_modelo": "—",
             "valor": 2400, "tipo": "Único"},
        ],
        "leads": [{"id": 1, "empresa": "Cond. Four Seasons", "cnpj": "12.345.678/0001-90",
                   "endereco": "Av. das Nações Unidas, 1200", "cidade": "São Paulo",
                   "uf": "SP", "contato_nome": "Ricardo Alves",
                   "contato_email": "ricardo@fs.com.br", "contato_telefone": "(11) 98811-2233"}],
        "contatos": [{"id": 1, "leadId": 1, "nome": "Ricardo Alves", "cargo": "Síndico",
                      "email": "ricardo@fs.com.br", "telefone": "(11) 98811-2233"}],
        "propostas": [{
            "id": 1, "numero": "PRP-2026-0001", "leadId": 1, "contatoId": 1, "cctId": 1,
            "titulo": "Facilities — 2 torres", "status": "Enviada", "emissao": "2026-07-15",
            "validade": 30, "prazo": 12, "encargos": 72, "markup": 18, "imposto": 14.33,
            "desconto": 0, "versao": 1,
            "itens": [
                {"cargoId": 1, "escalaId": 1, "turnoId": 1, "qtd": 4,
                 "adicionais": [], "beneficios": [1, 2], "obs": ""},
                {"cargoId": 4, "escalaId": 2, "turnoId": 2, "qtd": 2,
                 "adicionais": ["P30"], "beneficios": [1, 2], "obs": "Portaria 24h"},
            ],
            "equipamentos": [{"id": 1, "qtd": 6}, {"id": 10, "qtd": 1}],
            "escopo": "Limpeza, conservação e portaria.", "obs": "Reajuste anual.",
            "slides": {},
        }],
        "proposta_documentos": [],
        "timeline": [],
    })


def so_numero(txt):
    """'R$ 1.234,56' → 123456 (centavos)."""
    t = re.sub(r"[^0-9,.-]", "", txt or "").replace(".", "").replace(",", ".")
    return calculo.cents(t) if t not in ("", "-", ".") else 0


class TestDadosDocumento(unittest.TestCase):
    def setUp(self):
        self.sb = base()
        self.p, self.ctx, self.c = documentos.carregar(self.sb, 1)
        self.dados = documentos.dados_documento(self.sb, self.p, self.ctx, self.c)

    def test_campos_essenciais(self):
        campos = self.dados["campos"]
        self.assertEqual(campos["CLIENTE"], "Cond. Four Seasons")
        self.assertEqual(campos["NUMERO"], "PRP-2026-0001")
        self.assertIn("Santo André", campos["DATA_EXTENSO"])
        self.assertIn("julho", campos["DATA_EXTENSO"])
        self.assertEqual(campos["VALIDA_ATE"], "14/08/2026")

    def test_resumo_fecha(self):
        """A coluna do slide de resumo, somada como o cliente somaria."""
        k = self.dados["campos"]
        mo = so_numero(k["TOTAL_MAO_DE_OBRA"])
        eq = so_numero(k["TOTAL_EQUIPAMENTOS"])
        sub = so_numero(k["SUBTOTAL_MENSAL"])
        desc = so_numero(k["VALOR_DESCONTO"])
        total = so_numero(k["VALOR_MENSAL_TOTAL"])
        self.assertEqual(mo + eq, sub, "mão de obra + equipamentos ≠ subtotal")
        self.assertEqual(sub - desc, total, "subtotal − desconto ≠ total")

    def test_tabela_de_postos_soma_o_total(self):
        mo = so_numero(self.dados["campos"]["TOTAL_MAO_DE_OBRA"])
        soma = sum(so_numero(x["valor_mensal"]) for x in self.dados["postos"])
        self.assertEqual(soma, mo)

    def test_postos_saem_com_preco_e_nao_custo(self):
        """P2: o que vai impresso é preço de venda."""
        for ci, linha in zip(self.c["itens"], self.dados["postos"]):
            self.assertEqual(so_numero(linha["valor_mensal"]), ci["preco_c"])
            self.assertGreater(ci["preco_c"], ci["custo_c"])

    def test_observacao_do_posto_aparece(self):
        """P9.8: itens[].obs existia no schema e não era usado em lugar nenhum."""
        self.assertIn("Portaria 24h", self.dados["postos"][1]["cargo"])

    def test_equipamentos_tem_mensal_e_implantacao(self):
        tipos = {e["tipo"] for e in self.dados["equipamentos"]}
        self.assertEqual(tipos, {"Mensal", "Implantação"})
        impl = so_numero(self.dados["campos"]["TOTAL_IMPLANTACAO"])
        self.assertEqual(sum(so_numero(e["total"]) for e in self.dados["equipamentos"]
                             if e["tipo"] == "Implantação"), impl)

    def test_desconto_fecha_com_qualquer_percentual(self):
        for d in (0, 3, 7.5, 15):
            self.sb.t["propostas"][0]["desconto"] = d
            p, ctx, c = documentos.carregar(self.sb, 1)
            k = documentos.dados_documento(self.sb, p, ctx, c)["campos"]
            self.assertEqual(so_numero(k["TOTAL_MAO_DE_OBRA"]) + so_numero(k["TOTAL_EQUIPAMENTOS"]),
                             so_numero(k["SUBTOTAL_MENSAL"]), "desconto %s" % d)
            self.assertEqual(so_numero(k["SUBTOTAL_MENSAL"]) - so_numero(k["VALOR_DESCONTO"]),
                             so_numero(k["VALOR_MENSAL_TOTAL"]), "desconto %s" % d)


class TestCongelamento(unittest.TestCase):
    """P3 — proposta enviada não muda de valor quando a CCT é reajustada."""

    def test_snapshot_prende_o_valor(self):
        sb = base()
        _, _, antes = documentos.carregar(sb, 1)
        documentos.congelar(sb, 1)

        # Reajuste de 10% na convenção, como acontece toda data-base.
        for c in sb.t["cct_cargos"]:
            c["salario"] = round(c["salario"] * 1.10, 2)

        _, ctx, depois = documentos.carregar(sb, 1)
        self.assertTrue(ctx["congelado"])
        self.assertEqual(antes["mensal_c"], depois["mensal_c"],
                         "a proposta congelada mudou de valor com o reajuste da CCT")

    def test_sem_congelar_o_valor_muda(self):
        """O contraponto: é exatamente este comportamento que o snapshot evita."""
        sb = base()
        _, _, antes = documentos.carregar(sb, 1)
        for c in sb.t["cct_cargos"]:
            c["salario"] = round(c["salario"] * 1.10, 2)
        _, _, depois = documentos.carregar(sb, 1)
        self.assertNotEqual(antes["mensal_c"], depois["mensal_c"])

    def test_snapshot_so_guarda_o_que_a_proposta_usa(self):
        sb = base()
        snap = documentos.montar_snapshot(sb, sb.t["propostas"][0])
        self.assertEqual(set(snap["cargos"]), {"1", "4"})
        self.assertEqual(set(snap["equipamentos"]), {"1", "10"})
        self.assertIn("em", snap)

    def test_congelar_e_idempotente(self):
        sb = base()
        documentos.congelar(sb, 1)
        primeiro = sb.t["propostas"][0]["congelada_em"]
        documentos.congelar(sb, 1)
        self.assertEqual(sb.t["propostas"][0]["congelada_em"], primeiro)


class TestPPTX(unittest.TestCase):
    """Gera o arquivo de verdade e lê de volta o que foi impresso."""

    def setUp(self):
        self.sb = base()
        p, ctx, c = documentos.carregar(self.sb, 1)
        self.dados = documentos.dados_documento(self.sb, p, ctx, c)
        self.tmp = tempfile.mkdtemp(prefix="mizys_teste_")
        self.arquivo = os.path.join(self.tmp, "p.pptx")

    def _texto_dos_slides(self, caminho):
        from pptx import Presentation
        prs = Presentation(caminho)
        saida = []
        for s in prs.slides:
            partes = []
            for f in ppt._percorrer_formas(s.shapes):
                if f.has_text_frame:
                    partes.append(f.text_frame.text)
                if getattr(f, "has_table", False) and f.has_table:
                    for linha in f.table.rows:
                        partes.append(" | ".join(cel.text for cel in linha.cells))
            saida.append("\n".join(partes))
        return saida

    def test_gera_e_nao_sobra_placeholder(self):
        ppt.gerar_pptx(self.dados, self.arquivo)
        self.assertTrue(os.path.getsize(self.arquivo) > 10000)
        texto = "\n".join(self._texto_dos_slides(self.arquivo))
        sobrou = re.findall(r"\{[A-Z_0-9]+\}", texto)
        self.assertEqual(sobrou, [], "placeholders não substituídos: %s" % set(sobrou))

    def test_a_coluna_impressa_soma(self):
        """Abre o arquivo, acha a linha do total e confere a soma da coluna."""
        ppt.gerar_pptx(self.dados, self.arquivo)
        for texto in self._texto_dos_slides(self.arquivo):
            if "COMPOSIÇÃO DO VALOR MENSAL" not in texto:
                continue
            valores = {}
            for linha in texto.split("\n"):
                if "|" not in linha:
                    continue
                rot, _, val = linha.partition("|")
                valores[rot.strip().lower()] = so_numero(val)
            mo = next(v for k, v in valores.items() if k.startswith("mão de obra"))
            eq = next(v for k, v in valores.items() if k.startswith("equipamentos"))
            sub = next(v for k, v in valores.items() if k.startswith("subtotal"))
            desc = next(v for k, v in valores.items() if k.startswith("desconto"))
            total = next(v for k, v in valores.items() if k.startswith("valor mensal"))
            self.assertEqual(mo + eq, sub)
            self.assertEqual(sub - desc, total)
            return
        self.fail("slide de resumo não encontrado no arquivo gerado")

    def test_uma_linha_por_posto(self):
        ppt.gerar_pptx(self.dados, self.arquivo)
        for texto in self._texto_dos_slides(self.arquivo):
            if "ESCALA / TURNO" not in texto:
                continue
            self.assertIn("Auxiliar de Limpeza", texto)
            self.assertIn("Porteiro", texto)
            self.assertIn("P30 30%", texto)
            return
        self.fail("slide de postos não encontrado")

    def test_slide_desligado_some(self):
        from pptx import Presentation
        self.dados["slides"] = {"missao": False}
        ppt.gerar_pptx(self.dados, self.arquivo)
        prs = Presentation(self.arquivo)
        marcadores = [ppt.marcador_do_slide(s) for s in prs.slides]
        self.assertNotIn("missao", marcadores)
        self.assertIn("resumo", marcadores)

    def test_sem_equipamentos_o_slide_sai_sozinho(self):
        from pptx import Presentation
        self.dados["equipamentos"] = []
        self.dados["tem_equipamentos"] = False
        ppt.gerar_pptx(self.dados, self.arquivo)
        prs = Presentation(self.arquivo)
        self.assertNotIn("equipamentos", [ppt.marcador_do_slide(s) for s in prs.slides])

    def test_marcador_de_logo_nao_vaza_para_o_slide(self):
        ppt.gerar_pptx(self.dados, self.arquivo)
        texto = "\n".join(self._texto_dos_slides(self.arquivo))
        self.assertNotIn("{LOGO}", texto)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)


class TestAceitePorLink(unittest.TestCase):
    """O interruptor do link público.

    Desligado enquanto o CRM roda em localhost: o link que o cliente receberia
    só abriria na máquina de quem enviou, e link quebrado numa proposta é pior
    do que proposta sem link. O que este teste tranca é o desligamento ser de
    verdade — esconder o botão e continuar gerando token deixaria uma porta
    pública no banco esperando alguém achar o endereço.
    """

    def _cfg(self, valor):
        return {"aceite_base_url": "http://x", "aceite_ativo": valor}

    def test_vazio_conta_como_desligado(self):
        """Quem nunca configurou não deveria estar mandando link público."""
        self.assertFalse(documentos.aceite_ligado({}))
        self.assertFalse(documentos.aceite_ligado(self._cfg("")))

    def test_desligado_em_varias_grafias(self):
        for v in ("0", "nao", "não", "false", "off", "OFF", " 0 "):
            self.assertFalse(documentos.aceite_ligado(self._cfg(v)), v)

    def test_ligado(self):
        for v in ("1", "sim", "true", "on"):
            self.assertTrue(documentos.aceite_ligado(self._cfg(v)), v)

    def test_desligado_nao_monta_link_nem_com_token(self):
        p = {"aceite_token": "abc123"}
        self.assertEqual(documentos.link_aceite(p, self._cfg("0")), "")
        self.assertEqual(documentos.link_aceite(p, self._cfg("1")), "http://x/p/abc123")

    def test_desligado_nao_cria_token(self):
        """Token gravado é porta aberta, mesmo sem ninguém mostrar o endereço."""
        sb = base()
        p = {"id": 1, "aceite_token": None}
        self.assertIsNone(
            documentos.garantir_token_aceite(sb, p, self._cfg("0")).get("aceite_token"))
        self.assertEqual(sb.gravou, [])


class TestModeloFacilities(unittest.TestCase):
    """O modelo novo, gerado por modelo_ppt/preparar_modelo.py.

    Ele tem 57 marcadores espalhados por 21 slides e três tabelas que crescem.
    O jeito de isso dar errado não é estourar exceção: é sair um `{QTD_FUNC}`
    literal no meio da tabela de cargos, no PDF que já foi para o cliente —
    que foi exatamente o que aconteceu na primeira montagem. Por isso o teste
    lê o arquivo gerado em vez de confiar no código que o gerou.
    """

    MODELO = "proposta_facilities.pptx"

    def setUp(self):
        caminho = os.path.join(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))), "modelo_ppt", self.MODELO)
        if not os.path.isfile(caminho):
            self.skipTest("modelo ausente — rode modelo_ppt/preparar_modelo.py")
        self.sb = base()
        p, ctx, c = documentos.carregar(self.sb, 1)
        self.dados = documentos.dados_documento(self.sb, p, ctx, c)
        self.dados["modelo"] = self.MODELO
        self.tmp = tempfile.mkdtemp(prefix="mizys_facilities_")
        self.arquivo = os.path.join(self.tmp, "p.pptx")

    def _prs(self):
        from pptx import Presentation
        ppt.gerar_pptx(self.dados, self.arquivo)
        return Presentation(self.arquivo)

    def _texto(self, slide):
        partes = []
        for f in ppt._percorrer_formas(slide.shapes):
            if f.has_text_frame:
                partes.append(f.text_frame.text)
            if getattr(f, "has_table", False) and f.has_table:
                for linha in f.table.rows:
                    partes.append(" | ".join(cel.text for cel in linha.cells))
        return "\n".join(partes)

    def test_nao_sobra_placeholder(self):
        texto = "\n".join(self._texto(s) for s in self._prs().slides)
        sobrou = sorted(set(re.findall(r"\{[A-Z_0-9]+\}", texto)))
        self.assertEqual(sobrou, [], "placeholders não substituídos: %s" % sobrou)

    def test_nao_sobra_marcador_do_designer(self):
        """`[ NOME DO CLIENTE ]` e afins têm que ter virado {CHAVE}."""
        texto = "\n".join(self._texto(s) for s in self._prs().slides)
        sobrou = sorted(set(re.findall(r"\[ [A-ZÇÃÕÁÉÍÓÚÂÊÔ/ ]{3,40} \]", texto)))
        self.assertEqual(sobrou, [], "marcadores do modelo intactos: %s" % sobrou)

    def test_uma_linha_por_cargo_no_quadro_de_salarios(self):
        esperado = len(self.dados["salarios"])
        self.assertGreater(esperado, 0, "o teste não valeria nada sem cargo")
        for slide in self._prs().slides:
            if "Salários e benefícios" not in self._texto(slide):
                continue
            tabela = next(f.table for f in ppt._percorrer_formas(slide.shapes)
                          if getattr(f, "has_table", False) and f.has_table)
            # Uma de cabeçalho + uma por cargo.
            self.assertEqual(len(tabela.rows), esperado + 1)
            return
        self.fail("slide de salários não foi encontrado")

    def test_postos_e_funcionarios_sao_colunas_diferentes(self):
        """Um posto 12x36 precisa de mais de um funcionário — e o quadro diz."""
        linha = self.dados["postos"][0]
        self.assertIn("qtd_func", linha)
        texto = "\n".join(self._texto(s) for s in self._prs().slides)
        self.assertIn(str(linha["qtd_func"]), texto)

    def test_paginas_sao_sequenciais(self):
        """Slide opcional que sai não pode deixar buraco na numeração."""
        prs = self._prs()
        numeros = []
        for slide in prs.slides:
            for f in ppt._percorrer_formas(slide.shapes):
                if not f.has_text_frame:
                    continue
                if (f.left or 0) < 10 * 914400 or (f.top or 0) < 6.8 * 914400:
                    continue
                t = f.text_frame.text.strip()
                if t.isdigit():
                    numeros.append(int(t))
        self.assertTrue(numeros, "nenhum rodapé numerado")
        self.assertEqual(numeros, sorted(numeros))
        self.assertEqual(len(numeros), len(set(numeros)), "página repetida")
        self.assertLessEqual(max(numeros), len(prs.slides))

    def test_slide_de_fotos_nasce_desligado(self):
        """Sem foto de colaborador no banco, ele sairia com molduras vazias."""
        marcadores = [ppt.marcador_do_slide(s) for s in self._prs().slides]
        self.assertNotIn("gente", marcadores)

    def test_missao_em_branco_cai_na_redacao_do_modelo(self):
        """Substituição de {CHAVE} é cega: sem isto o slide sairia vazio."""
        self.sb.t["configuracoes"] = [c for c in self.sb.t["configuracoes"]
                                      if c["chave"] != "empresa_missao"]
        p, ctx, c = documentos.carregar(self.sb, 1)
        dados = documentos.dados_documento(self.sb, p, ctx, c)
        self.assertEqual(dados["campos"]["MISSAO"], documentos.MISSAO_PADRAO)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
