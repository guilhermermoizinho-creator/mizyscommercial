"""
Gera uma proposta comercial de EXEMPLO, com dados falsos, e salva o PPTX e o
PDF em docs/.

    python docs/gerar_proposta_exemplo.py

Para que serve: ver o documento que o cliente recebe sem precisar montar uma
proposta de verdade — conferir se a capa está bonita, se a tabela de postos
cabe, se o slide de benefícios faz sentido, se o total fecha.

Nada fica no banco. O script cria lead, contato e proposta, gera os arquivos e
APAGA tudo no fim, inclusive restaurando os parâmetros da empresa que ele
sobrescreveu para a demonstração. Se ele morrer no meio, roda de novo: os
nomes começam com DEMO e são substituídos.
"""
from __future__ import annotations

import os
import sys
import traceback
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from dotenv import load_dotenv

load_dotenv(os.path.join(RAIZ, ".env"))

import calculo as C  # noqa: E402
import documentos  # noqa: E402
import supa  # noqa: E402

# A empresa da demonstração. Estes valores substituem os de Configurações só
# durante a geração, e voltam ao que eram no fim.
EMPRESA_DEMO = {
    "empresa_nome": "Mizys Facilities e Serviços Ltda.",
    "empresa_fantasia": "Mizys Facilities",
    "empresa_cnpj": "12.345.678/0001-90",
    "empresa_ie": "110.222.333.444",
    "empresa_endereco": "Av. Paulista, 1000 — conj. 142 — São Paulo/SP — CEP 01310-100",
    "empresa_cidade": "São Paulo",
    "empresa_telefone": "(11) 4002-8922",
    "empresa_email": "comercial@mizysfacilities.com.br",
    "empresa_site": "www.mizysfacilities.com.br",
    "empresa_missao": "Cuidar de cada prédio como se fosse o nosso, para que quem "
                      "trabalha nele só precise pensar no próprio trabalho.",
    "empresa_visao": "Ser a operação de facilities mais confiável de São Paulo — "
                     "a que o cliente não precisa fiscalizar.",
    "empresa_valores": "Gente antes de processo; O combinado não sai caro; "
                       "Segurança não se negocia; Transparência na planilha; "
                       "Melhoria sem alarde",
}


def main():
    sb = supa.Supabase(supa.service_key())
    base = supa._url_base()

    def apagar(caminho):
        req = urllib.request.Request(base + caminho, method="DELETE", headers={
            "apikey": supa.anon_key(), "Authorization": "Bearer " + supa.service_key()})
        try:
            return urllib.request.urlopen(req, timeout=30).status
        except urllib.error.HTTPError as e:
            return "ERRO %s" % e.code

    antes = {c["chave"]: c["valor"] for c in sb.select("configuracoes")}
    for chave, valor in EMPRESA_DEMO.items():
        sb.update("configuracoes", {"valor": valor}, chave="eq.%s" % chave)

    criados = {"propostas": [], "contatos": [], "leads": []}
    try:
        lead = sb.insert("leads", {
            "empresa": "Condomínio Edifício Horizonte Paulista",
            "cnpj": "98.765.432/0001-10", "endereco": "Rua Haddock Lobo, 1234",
            "cidade": "São Paulo", "uf": "SP", "status": "Em negociação",
            "origem": "Indicação", "contato_nome": "Marina Vasconcelos",
            "contato_cargo": "Síndica profissional",
            "contato_email": "sindica@edificiohorizonte.com.br",
            "contato_telefone": "(11) 98877-6655"})
        criados["leads"].append(lead["id"])

        contato = sb.insert("contatos", {
            "leadId": lead["id"], "nome": "Marina Vasconcelos",
            "cargo": "Síndica profissional",
            "email": "sindica@edificiohorizonte.com.br",
            "telefone": "(11) 98877-6655", "principal": True})
        criados["contatos"].append(contato["id"])

        asseio = sb.select("ccts", nome="like.*SIEMACO*")[0]
        vigil = sb.select("ccts", nome="like.*SESVESP*")[0]
        cargos_a = sb.select("cct_cargos", **{"cctId": "eq.%s" % asseio["id"]})
        cargos_v = sb.select("cct_cargos", **{"cctId": "eq.%s" % vigil["id"]})
        ben_a = {b["nome"]: b["id"] for b in
                 sb.select("cct_beneficios", **{"cctId": "eq.%s" % asseio["id"]})}
        ben_v = {b["nome"]: b["id"] for b in
                 sb.select("cct_beneficios", **{"cctId": "eq.%s" % vigil["id"]})}
        escalas = {e["nome"]: e["id"] for e in sb.select("escalas")}
        turnos = {t["nome"]: t["id"] for t in sb.select("turnos")}
        equips = {e["nome"]: e["id"] for e in sb.select("equipamentos")}

        def cargo(lista, trecho):
            return next(c["id"] for c in lista if trecho.lower() in c["nome"].lower())

        usa_a = [ben_a[n] for n in ("Vale-refeição", "Vale-transporte",
                                    "Cesta básica I (in natura)",
                                    "Assistência médica e odontológica",
                                    "Benefício Social Sindical") if n in ben_a]
        usa_v = [ben_v[n] for n in ("Vale-refeição", "Vale-transporte",
                                    "Cesta básica") if n in ben_v]

        itens = [
            {"cargoId": cargo(cargos_a, "Porteiro"), "cctId": asseio["id"],
             "escalaId": escalas["12x36 Diurno"], "turnoId": turnos["Diurno"],
             "qtd": 1, "adicionais": [], "beneficios": usa_a,
             "obs": "Recepção e controle de acesso da portaria social"},
            {"cargoId": cargo(cargos_a, "Porteiro"), "cctId": asseio["id"],
             "escalaId": escalas["12x36 Noturno"], "turnoId": turnos["Noturno"],
             "qtd": 1, "adicionais": [], "beneficios": usa_a,
             "obs": "Cobertura noturna com ronda interna a cada 2 horas"},
            {"cargoId": cargo(cargos_a, "Piso mínimo"), "cctId": asseio["id"],
             "escalaId": escalas["5x2 Comercial"], "turnoId": turnos["Comercial"],
             "qtd": 3, "adicionais": ["I20"], "beneficios": usa_a,
             "obs": "Áreas comuns, sanitários sociais e hall — insalubridade grau médio"},
            {"cargoId": cargo(cargos_a, "Encarregado"), "cctId": asseio["id"],
             "escalaId": escalas["5x2 Comercial"], "turnoId": turnos["Comercial"],
             "qtd": 1, "adicionais": [], "beneficios": usa_a,
             "obs": "Supervisão da equipe e interface com a administração"},
            {"cargoId": cargo(cargos_v, "Vigilante"), "cctId": vigil["id"],
             "escalaId": escalas["12x36 Noturno"], "turnoId": turnos["Noturno"],
             "qtd": 1, "adicionais": ["P30"], "beneficios": usa_v,
             "obs": "Vigilância patrimonial desarmada — guarita externa"},
        ]
        equipamentos = [{"id": equips[n], "qtd": q} for n, q in (
            ("Uniforme de asseio", 6), ("EPI por função", 6),
            ("Uniforme de vigilante", 1), ("Reciclagem bienal de vigilante", 1),
        ) if n in equips]

        prop = sb.insert("propostas", {
            "numero": "DEMO-2026-0001", "leadId": lead["id"], "contatoId": contato["id"],
            "cctId": asseio["id"],
            "titulo": "Facilities integrado — portaria, limpeza e vigilância",
            "status": "Rascunho", "emissao": "2026-08-18", "validade": 30, "prazo": 24,
            "encargos": 0, "markup": 12, "imposto": 0, "desconto": 0,
            "regime": "presumido", "modo_preco": "privado", "cobertura_modo": "headcount",
            "rat": 3, "fap": 1, "turnover": 45, "absenteismo": 3.5, "ci_pct": 7, "iss": 2,
            "itens": itens, "equipamentos": equipamentos,
            "escopo": "Prestação de serviços de portaria 24 horas, limpeza e "
                      "conservação das áreas comuns e vigilância patrimonial noturna "
                      "no Edifício Horizonte Paulista, com fornecimento de mão de "
                      "obra treinada e uniformizada, materiais, equipamentos e "
                      "supervisão operacional em rota semanal.",
            "obs": "Materiais de limpeza inclusos. Reajuste por repactuação na "
                   "data-base da categoria (1º de janeiro). Cobertura de férias e "
                   "faltas por folguista da própria equipe, sem custo adicional ao "
                   "condomínio.",
            "modelo_ppt": "mizys_proposta.pptx", "slides": {}})
        criados["propostas"].append(prop["id"])

        _p, _ctx, c = documentos.carregar(sb, prop["id"])
        print("\nPROPOSTA DE EXEMPLO — %d postos · %s funcionários"
              % (len(c["itens"]), c["func"]))
        for i in c["itens"]:
            print("   %-34s %-14s %d posto(s)  %12s/mês"
                  % (i["cargo"]["nome"][:34], (i["escala"] or {}).get("nome", "?"),
                     i["postos"], C.money(i["preco_c"])))
        print("   mensal %s · implantação %s · contrato de %d meses %s · margem %.2f%%"
              % (C.money(c["mensal_c"]), C.money(c["implantacao_c"]),
                 c["prazo"], C.money(c["contrato_c"]), c["margem"]))

        for formato in ("pptx", "pdf"):
            conteudo, _nome, _mime = documentos.gerar(sb, prop["id"], formato)
            destino = os.path.join(RAIZ, "docs", "Exemplo_Proposta_Comercial." + formato)
            with open(destino, "wb") as f:
                f.write(conteudo)
            print("   gerado docs/Exemplo_Proposta_Comercial.%s (%d KB)"
                  % (formato, len(conteudo) // 1024))
    except Exception:
        traceback.print_exc()
        return 1
    finally:
        for pid in criados["propostas"]:
            apagar("/rest/v1/propostas?id=eq.%s" % pid)
        for cid in criados["contatos"]:
            apagar("/rest/v1/contatos?id=eq.%s" % cid)
        for lid in criados["leads"]:
            apagar("/rest/v1/leads?id=eq.%s" % lid)
        for chave in EMPRESA_DEMO:
            sb.update("configuracoes", {"valor": antes.get(chave, "")},
                      chave="eq.%s" % chave)
        apagar("/rest/v1/auditoria?id=gt.0")
        apagar("/rest/v1/timeline?id=gt.0")
        print("   (dados de demonstração apagados do banco)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
