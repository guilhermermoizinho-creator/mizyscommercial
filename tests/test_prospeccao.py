"""
Triagem da prospecção — o que entra na lista de ligação e o que sai.

Nada aqui vai à rede: as respostas do Google, do site e da Receita entram
prontas. O que se testa é a decisão tomada em cima delas, que é onde o erro
custa caro — trazer a GPS numa lista que pediu empresa pequena, ou descartar
uma boa por causa de um casamento de texto frouxo.

    python -m unittest discover -s tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import prospeccao as P  # noqa: E402


class TestCnpj(unittest.TestCase):
    """Rodapé de site tem CNPJ digitado errado com frequência, e cada CNPJ
    errado queima uma consulta num serviço limitado a uma a cada 2,5 s."""

    def test_aceita_validos(self):
        for c in ("57.559.387/0001-38", "00.994.242/0001-48", "33000167000101"):
            self.assertTrue(P.cnpj_valido(c), c)

    def test_recusa_invalidos(self):
        for c in ("11.111.111/1111-11", "12.345.678/0001-00", "123", "",
                  "00.000.000/0000-00"):
            self.assertFalse(P.cnpj_valido(c), c)


class TestBloqueioDeGrandes(unittest.TestCase):
    """A comparação é por PALAVRA inteira, sem acento e sem caixa."""

    def test_pega_os_grandes(self):
        for nome in ("Hagana Serviços Ltda", "GPS Predial e Facilities",
                     "SOUZA LIMA CONSERVACAO", "Gocil Servicos",
                     "verzani & sandrini"):
            self.assertTrue(P.e_grande(nome), nome)

    def test_nao_pega_quem_so_contem_as_letras(self):
        """'gps' dentro de outra palavra não é a GPS, e 'Issaquara' não é a
        ISS. Casar por substring descartaria empresa boa em silêncio."""
        for nome in ("Issaquara Limpeza", "Engpsul Serviços",
                     "Limpadora Bandeirantes", "Gepesa Conservação"):
            self.assertFalse(P.e_grande(nome), nome)

    def test_bloqueio_extra_do_usuario(self):
        self.assertTrue(P.e_grande("Limpatudo Norte", ["limpatudo"]))
        self.assertFalse(P.e_grande("Limpatudo Norte"))


class TestTriagem(unittest.TestCase):

    def _cand(self, **over):
        c = {"nome": "Limpadora Bandeirantes", "site": "https://x.com.br",
             "telefone": "(11) 4002-8922", "emails": ["comercial@x.com.br"],
             "avaliacoes": 30, "situacao_maps": "OPERATIONAL",
             "rf": {"cnpj": "57559387000138", "razao_social": "LIMPADORA BANDEIRANTES",
                    "situacao": "ATIVA", "porte": "DEMAIS", "capital_social": 800000,
                    "cnae": "8121400", "cnae_desc": "Limpeza em prédios",
                    "abertura": "2012-03-01", "socios": 2}}
        c.update(over)
        return c

    def test_empresa_boa_passa_com_nota_alta(self):
        c = P.triar(self._cand())
        self.assertFalse(c["descartado"], c["motivos"])
        self.assertGreaterEqual(c["nota_triagem"], 80)

    def test_baixada_na_receita_e_descartada(self):
        c = self._cand()
        c["rf"]["situacao"] = "BAIXADA"
        P.triar(c)
        self.assertTrue(c["descartado"])
        self.assertTrue(any("baixada" in m for m in c["motivos"]))

    def test_capital_alto_denuncia_empresa_grande(self):
        """A rede de segurança para quem não está na lista de nomes: a Verzani
        tem R$ 279 mi de capital e seria trazida como 'pequena' sem isto."""
        c = self._cand(nome="Empresa Que Ninguem Listou")
        c["rf"]["capital_social"] = 279200900
        P.triar(c)
        self.assertTrue(c["descartado"])
        self.assertTrue(any("capital alto" in m for m in c["motivos"]))

    def test_fechada_no_maps_e_descartada(self):
        c = P.triar(self._cand(situacao_maps="CLOSED_PERMANENTLY"))
        self.assertTrue(c["descartado"])

    def test_descartada_nunca_soma_nota(self):
        """A nota ordena a fila de ligação. Descartada com nota alta subiria
        para o topo da lista de quem marcou 'ver descartadas'."""
        c = P.triar(self._cand(nome="Hagana Serviços"))
        self.assertTrue(c["descartado"])
        self.assertEqual(c["nota_triagem"], 0)

    def test_cnae_fora_da_lista_avisa_mas_nao_descarta(self):
        """Nem toda empresa de facilities tem o CNAE certo no cadastro, e
        descartar por isso perderia cliente bom. Vira indício, não veredito."""
        c = self._cand()
        c["rf"]["cnae"] = "4744099"
        c["rf"]["cnae_desc"] = "Comércio de materiais de construção"
        P.triar(c)
        self.assertFalse(c["descartado"])
        self.assertTrue(any("CNAE fora" in s for s in c["sinais"]))

    def test_sem_receita_ainda_assim_e_triada(self):
        """Site que não abriu não pode derrubar o candidato — só reduz a nota."""
        c = P.triar(self._cand(rf={}, emails=[], site=""))
        self.assertFalse(c["descartado"])
        self.assertLess(c["nota_triagem"], 80)


class TestLeituraDeSite(unittest.TestCase):

    def test_email_de_ferramenta_nao_e_contato(self):
        """Rodapé é cheio de e-mail de Sentry, Wix e afins."""
        for lixo in ("abc@sentry.io", "x@wixpress.com", "foto@2x.png"):
            self.assertTrue(any(t in lixo for t in P.EMAIL_LIXO), lixo)


class TestTelefone(unittest.TestCase):
    """O rodapé de um site é um campo minado de números que parecem telefone.

    Os dois falsos positivos que motivaram cada regra estão nos testes: o CNPJ
    57.559.387/0001-38 saía como "(57) 6789-0004", e um id qualquer saía como
    "(17) 8654-7485". Nenhum dos dois é telefone, e os dois iam para a coluna
    de contato do lead.
    """

    def test_plano_de_numeracao(self):
        # Celular: 9 dígitos começando em 9. Fixo: 8 começando de 2 a 5.
        for meio, ok in (("98765", True), ("99999", True), ("3393", True),
                         ("2678", True), ("5000", True),
                         ("8654", False), ("1536", False), ("12345", False),
                         ("6000", False), ("789", False)):
            self.assertEqual(P._telefone_plausivel(meio), ok, meio)

    def test_ddd_precisa_existir(self):
        for existe in (11, 17, 21, 47, 71, 85, 99):
            self.assertIn(existe, P.DDDS)
        for nao_existe in (10, 20, 23, 25, 26, 29, 52, 57, 90):
            self.assertNotIn(nao_existe, P.DDDS)

    def test_cnpj_no_rodape_nao_vira_telefone(self):
        """A corrida longa de dígitos é apagada antes da busca por telefone."""
        html = 'CNPJ 57.559.387/0001-38 — fone (11) 3393-1717'
        limpo = P.RE_DIGITADA_LONGA.sub(" ", html)
        achados = [(d, m, f) for d, m, f in P.RE_TEL.findall(limpo)
                   if int(d) in P.DDDS and P._telefone_plausivel(m)]
        self.assertEqual(achados, [("11", "3393", "1717")])


class TestRedesSociais(unittest.TestCase):

    def test_pega_o_perfil_da_empresa(self):
        html = ('<a href="https://www.instagram.com/minhaempresa">insta</a>'
                '<a href="https://br.linkedin.com/company/minha-empresa">in</a>'
                '<a href="https://wa.me/5511999998888">zap</a>')
        achados = {r: rx.findall(html)[0] for r, rx in P.REDES.items() if rx.findall(html)}
        self.assertEqual(achados.get("instagram"), "minhaempresa")
        self.assertEqual(achados.get("linkedin"), "minha-empresa")
        self.assertEqual(achados.get("whatsapp"), "5511999998888")

    def test_linkedin_de_pessoa_nao_entra(self):
        """`/in/` é gente, `/company/` é empresa. Prospecção quer a empresa."""
        html = '<a href="https://linkedin.com/in/fulano-de-tal">perfil</a>'
        self.assertEqual(P.REDES["linkedin"].findall(html), [])

    def test_botao_de_compartilhar_nao_e_perfil(self):
        html = '<a href="https://www.facebook.com/sharer/sharer.php?u=x">compartilhar</a>'
        alvo = P.REDES["facebook"].findall(html)
        self.assertTrue(not alvo or alvo[0].lower() in P.REDE_LIXO)


if __name__ == "__main__":
    unittest.main()
