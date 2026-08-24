# Plano de melhorias — Mizys CRM

> Documento gerado em **29/07/2026** a partir da análise completa do projeto.
> **Status: implementado (todas as cinco fases).** O texto abaixo é mantido como
> registro do diagnóstico original — ele descreve o sistema *antes*.

## O que foi feito

Todos os 8 problemas críticos (P1–P8), os 10 do P9 e os 40 itens das Fases 1 a 5.
Onde procurar cada coisa está no `README.md`. Os testes (`python -m unittest
discover -s tests`) prendem os erros que saíam impressos: a coluna do resumo que
não fechava, o custo no lugar do preço, o congelamento, o adicional noturno e o
desconto legal de VT.

### Antes de usar

1. **Rodar o SQL** no Supabase — `supabase/migracao_v2.sql` (base com dados) ou
   `supabase/schema.sql` (base vazia). Sem isso as colunas e tabelas novas não
   existem e a v2 não sobe.
2. **`python ferramentas.py congelar`** uma vez, para prender o valor das
   propostas que já foram enviadas.
3. Opcionais, cada um destravando um recurso — o **Configurações → Sistema →
   Verificar** mostra o que falta:
   - `SMTP_*` no `.env` → envio por e-mail (4.3);
   - `SUPABASE_SERVICE_KEY` no `.env` → link público de aceite (4.4);
   - `modelo_ppt/logo.png` → logo real na capa (4.6);
   - LibreOffice, se a máquina não tiver PowerPoint → conversão para PDF.

### Uma verificação que ficou pendente

O motor de cálculo existe duas vezes (`calculo.py` e `static/js/calculo.js`) e os
dois têm que dar o mesmo centavo. Não havia runtime de JavaScript nesta máquina
para rodar os dois lado a lado num teste automático. A paridade está garantida
por construção (centavos inteiros, mesmo arredondamento meio-para-cima, mesmo
rateio) e é **conferível em produção**: o botão _"Conferir com o cálculo do
servidor"_, no painel da proposta, compara linha a linha e mostra qualquer
divergência antes de o documento sair.

---

---

## Sumário do estado atual

| Camada | Arquivo | Estado |
|---|---|---|
| Backend | `app.py` (73 linhas) | Flask com 2 rotas: serve o HTML e gera PPT/PDF. Zero lógica de negócio. |
| Documentos | `ppt.py` (301 linhas) | Preenche `{CHAVE}` no modelo, expande linhas de tabela, converte para PDF via PowerPoint COM → fallback LibreOffice. |
| Modelo PPT | `modelo_ppt/build_modelo.py` (348 linhas) | Gera o `.pptx` de 9 slides com placeholders. |
| Dados | `supabase/schema.sql` (487 linhas) | 14 tabelas Postgres. RLS = "qualquer autenticado lê/escreve tudo". |
| Frontend | `templates/my_crm.html` (2.305 linhas, 144 KB) | SPA de arquivo único: CSS + JS + motor de cálculo + todas as telas. |

**Pontos fortes:** parametrização em banco (`configuracoes` / `listas`, nada fixo no código), CCT como fonte de verdade de cargos/salários/encargos, modelo de PPT que preserva formatação, PDF idêntico ao PPT por conversão.

**O que falta:** integridade, histórico, permissão e automação de verdade.

---

# PROBLEMAS CRÍTICOS ENCONTRADOS

## 🔴 P1 — O slide "Resumo do investimento" não fecha a conta

**Onde:** `modelo_ppt/build_modelo.py:276-300` (slide_resumo) × `templates/my_crm.html:869-891` (calcProposta)

O slide apresenta ao cliente:
```
Mão de obra + Equipamentos + Tributos − Desconto = VALOR MENSAL
```

O cálculo real é:
```js
precoBruto = (custoMO + equipMensal) / (1 - markup - imposto)
mensal     = precoBruto * (1 - desconto)
impostoVal = mensal * imposto
```

Simulação com custo direto R$ 100, markup 18%, imposto 14,33%, desconto 0:

| Linha impressa no slide | Valor |
|---|---|
| Mão de obra | 100,00 |
| Equipamentos | 0,00 |
| Tributos e encargos administrativos | 21,18 |
| Desconto | 0,00 |
| **TOTAL VALOR MENSAL** | **147,77** |

Soma real das linhas: **121,18**. Total impresso: **147,77**. Diferença de 22% — exatamente o markup, que não aparece em nenhuma linha.

**Qualquer cliente que somar a coluna encontra o erro.**

---

## 🔴 P2 — A proposta expõe o custo, não o preço de venda

**Onde:** `templates/my_crm.html:1380-1385` (dadosDocumento → postos)

```js
valor_unitario: money(ci.unitPosto),   // = unitFunc * fator  → CUSTO
valor_mensal:   money(ci.total),       // = unitFunc * func   → CUSTO
```

`unitFunc = salário + adicionais + encargos + benefícios` — custo puro, sem markup.

A tabela "Dimensionamento da equipe" do PPT tem colunas chamadas **VALOR UNITÁRIO** e **VALOR MENSAL**, que o cliente lê como preço. Está entregando a composição de custo da empresa; a margem fica dedutível por subtração contra o total.

---

## 🔴 P3 — Proposta enviada muda de valor sozinha

**Onde:** `supabase/schema.sql:197-218` (tabela propostas) × `templates/my_crm.html:841-868` (calcItem)

A tabela `propostas` guarda apenas referências:
```json
itens: [{"cargoId":1,"escalaId":1,"turnoId":1,"qtd":2,"adicionais":["P30"],"beneficios":[1,2]}]
```

Salário, valor de benefício e percentual de encargo são lidos da **CCT atual** a cada render (`DB.get('cct_cargos', item.cargoId)`).

**Consequência:** reajuste da CCT em janeiro → a proposta PRP-2026-0001, enviada e aceita em julho, passa a exibir outro valor na listagem, e um novo PDF sai diferente do que o cliente recebeu.

Não há snapshot, versão nem histórico. Uma proposta enviada precisa ser imutável.

---

## 🔴 P4 — Endpoint de documento sem autenticação

**Onde:** `app.py:44-68` e `app.py:73`

```python
@app.route("/api/documento/<formato>", methods=["POST"])
def documento(formato):
    dados = request.get_json(silent=True)   # nenhuma verificação de sessão
```

Aceita POST de qualquer origem, sem token. O servidor confia 100% no JSON do navegador.

Somado a `app.run(debug=True, port=5050)`, que expõe o console interativo do Werkzeug (execução remota de código), isso impede colocar o sistema em rede sem retrabalho.

---

## 🟠 P5 — Numeração de proposta com corrida

**Onde:** `templates/my_crm.html:990-995`

```js
const nums = DB.list('propostas').map(p => +((p.numero||'').match(/(\d+)$/)?.[1]||0));
const n = (nums.length ? Math.max(...nums) : 0) + 1;
```

Calcula `MAX + 1` sobre a lista em memória do navegador. Dois vendedores criando ao mesmo tempo geram o mesmo número — e `numero` é `unique` no schema, então o segundo recebe erro cru do Postgres.

Precisa virar sequence ou função no banco.

---

## 🟠 P6 — `hoje()` erra a data à noite

**Onde:** `templates/my_crm.html:810`

```js
const hoje = () => new Date().toISOString().slice(0,10);   // UTC!
```

No Brasil (UTC−3), qualquer registro criado depois das 21h fica datado do dia seguinte. Afeta `emissao` de proposta, `criado` de lead, `data` de atividade e a marcação de "atrasada".

---

## 🟠 P7 — Injeção via aspas simples

**Onde:** `templates/my_crm.html:809` (esc) e handlers em 1819, 1825, 2115

```js
const esc = s => String(s??'').replace(/[<>&"]/g, ...)   // não escapa '
```

Handlers montados com aspas simples:
```js
onclick="formConfig('${esc(c.chave)}')"        // linha 1819
onclick="formLista(null,'${esc(g)}')"          // linha 1825
onclick="delConfirm('${e}','${id}','${l}')"    // linha 2115
```

Um grupo de lista cadastrado como `it's` quebra a tela; um valor malicioso executa JS. Risco interno, mas é falha real.

---

## 🟠 P8 — Motor de cálculo trabalhista simplificado

**Onde:** `templates/my_crm.html:841-868` (calcItem)

| Problema | Detalhe |
|---|---|
| `horas_semanais` não é usado | Está cadastrado em `escalas` mas não entra em nenhuma conta. |
| `fator_func` digitado à mão | Não considera DSR, férias, absenteísmo, cobertura de folga. Para 12x36 real o fator é ~2,2–2,4, não 2. |
| Adicional noturno sobre salário integral | `valorNoturno = base * pctNoturno/100`. Legalmente incide só sobre horas entre 22h e 5h, com hora reduzida de 52'30". |
| Insalubridade sobre salário do cargo | Na maioria das CCTs a base é o salário mínimo. Deveria ser configurável. |
| VT/VR sem desconto legal | Falta o desconto da parte do empregado (até 6% do salário no VT, coparticipação no VR). |
| Aritmética em ponto flutuante | Soma das linhas não bate com o total formatado. Deveria ser em centavos (inteiros). |

Para facilities, isso é diferença de milhares de reais por contrato.

---

## 🟡 P9 — Demais problemas

| # | Problema | Onde |
|---|---|---|
| P9.1 | `DB.loadAll()` traz todas as linhas das 14 tabelas a cada login, sem paginação | `my_crm.html:761-769` |
| P9.2 | Cada mexida em slider salva no banco **e** re-renderiza a página inteira | `my_crm.html:1271` (upP) |
| P9.3 | Busca global não busca globalmente — joga o usuário para a tela de propostas | `my_crm.html:2121-2125` |
| P9.4 | Excluir lead deixa propostas órfãs (`leadId` → null) | `schema.sql:200` |
| P9.5 | Nenhuma tabela tem `updated_at`, `created_by` ou `owner_id`. Sem auditoria | `schema.sql` inteiro |
| P9.6 | `refTipo` da atividade fixado em `'Lead'` no formulário, embora o schema aceite Oportunidade/Proposta | `my_crm.html:2074` |
| P9.7 | Slide de equipamentos removido por busca de texto literal `"Equipamentos e recursos"` — quebra se o título mudar | `ppt.py:196-202` |
| P9.8 | `itens[].obs` existe no schema mas não é usado em nenhuma tela | `schema.sql:191` |
| P9.9 | Sem README, sem `.env.example`, sem testes. Um único commit no repositório | — |
| P9.10 | `threaded=False` + lock global = um documento por vez, travando a aplicação inteira | `app.py:73`, `ppt.py:27` |

---

# O QUE FALTA PARA SER "CRM COMPLETO"

**Relacionamento**
- Timeline/histórico por lead (hoje não existe nenhum registro de "o que aconteceu")
- Notas e anexos
- E-mails registrados
- Motivo de ganho/perda
- Detecção de duplicados
- Importação/exportação CSV

**Gestão**
- Papéis e permissões (hoje todo mundo é admin de tudo)
- Metas por vendedor
- Funil com tempo médio por fase
- Previsão ponderada por período
- Filtro de data no dashboard
- Atividades recorrentes e lembretes

**Pós-venda** — o fluxo morre em "Ganho"
- Contrato, vigência, renovação
- Reajuste anual e aditivos
- É onde vive o dinheiro recorrente de facilities

**Proposta**
- Duplicar
- Versionar (v1/v2/v3)
- Fluxo de aprovação para desconto acima do limite
- Link de aceite pelo cliente
- Registro de quando foi aberta

---

# O QUE FALTA NA AUTOMAÇÃO DE PPT/PDF

Hoje a automação é: clicar num botão e baixar um arquivo.

1. **Envio por e-mail** direto do CRM, com corpo e assinatura padrão
2. **Armazenar o gerado** no Supabase Storage, vinculado à proposta, com data e autor — é o comprovante do que foi enviado
3. **Rastreio** de abertura/visualização via link
4. **Múltiplos modelos** de PPT por tipo de cliente (condomínio, indústria, shopping), selecionáveis na proposta
5. **Logo real e capa customizável** — o modelo atual desenha um quadrado azul com a letra "M" (`build_modelo.py:164-166`)
6. **Slides opcionais** liga/desliga configuráveis
7. **Geração server-side a partir do ID** da proposta, em vez de receber tudo pronto do navegador — pré-requisito para agendamento, envio em lote e para resolver o P3
8. **Anexos automáticos**: organograma da equipe, cronograma de implantação, quadro de horários por posto
9. **Fila de geração** assíncrona

---

# PLANO DE EXECUÇÃO

## Fase 1 — Correções (o sistema está errando conta hoje)

| # | Item | Resolve |
|---|---|---|
| 1.1 | Corrigir o slide de resumo: incluir markup/administração e fazer a coluna fechar | P1 |
| 1.2 | Enviar **preço de venda** por posto no PPT, não custo | P2 |
| 1.3 | Congelar a proposta: snapshot de salários/benefícios/encargos no momento do envio | P3 |
| 1.4 | Numeração via sequence no Postgres | P5 |
| 1.5 | `hoje()` em horário local | P6 |
| 1.6 | `esc()` escapando `'`, e handlers via `data-*` em vez de string | P7 |
| 1.7 | Autenticar `/api/documento` com o JWT do Supabase; remover `debug=True` | P4 |

## Fase 2 — Motor de cálculo correto

| # | Item |
|---|---|
| 2.1 | Adicional noturno só sobre horas noturnas, com hora reduzida de 52'30" |
| 2.2 | Base de insalubridade configurável (salário mínimo × salário do cargo) |
| 2.3 | Fator de cobertura calculado (DSR, férias, absenteísmo) a partir de `horas_semanais` |
| 2.4 | Desconto legal de VT/VR |
| 2.5 | Cálculo em centavos (inteiros) — soma das linhas bate com o total |
| 2.6 | Espelhar o motor no servidor, como fonte única para o documento |

## Fase 3 — CRM completo

| # | Item |
|---|---|
| 3.1 | Timeline por lead/oportunidade/proposta com histórico automático |
| 3.2 | Notas e anexos |
| 3.3 | Papéis e permissões (admin / gestor / vendedor) com RLS por dono |
| 3.4 | `owner_id`, `created_by`, `updated_at` em tudo + auditoria |
| 3.5 | Motivo de ganho/perda e relatório de perdas |
| 3.6 | Busca global de verdade |
| 3.7 | Importação/exportação CSV e detecção de duplicados |
| 3.8 | Módulo de contratos: vigência, renovação, reajuste, aditivos |
| 3.9 | Metas, filtros de período e tempo médio por fase |

## Fase 4 — Automação de documentos

| # | Item |
|---|---|
| 4.1 | Geração server-side a partir do ID da proposta |
| 4.2 | Arquivo salvo no Storage, versionado e vinculado |
| 4.3 | Envio por e-mail pelo CRM |
| 4.4 | Link de aceite do cliente + rastreio de abertura |
| 4.5 | Múltiplos modelos e slides opcionais configuráveis |
| 4.6 | Logo/capa reais |
| 4.7 | Fila assíncrona de geração |
| 4.8 | Duplicar e versionar proposta; aprovação de desconto |

## Fase 5 — Engenharia

| # | Item |
|---|---|
| 5.1 | Quebrar o `my_crm.html` de 144 KB em módulos |
| 5.2 | Paginação e carregamento sob demanda |
| 5.3 | Salvamento com debounce, sem re-render total |
| 5.4 | README, `.env.example`, testes do motor de cálculo |
| 5.5 | Servir com Waitress/Gunicorn |

---

## Ordem recomendada

1. **Fases 1 e 2 primeiro, sem exceção** — são erros que hoje saem impressos na proposta do cliente.
2. **Fase 4** em seguida — é o objetivo declarado (automação de PPT/PDF).
3. **Fase 3** depois, incremental.
4. **Fase 5** conforme o sistema crescer.

---

## Decisão pendente

O usuário precisa aprovar quais itens executar — por fase ou item a item.
