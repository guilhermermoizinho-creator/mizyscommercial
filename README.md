# Mizys CRM

CRM comercial para empresas de **facilities**: do lead ao contrato, com o motor
de custo de mão de obra (convenção coletiva, adicionais legais, encargos,
benefícios, escalas e turnos) e geração da proposta em PPT e PDF.

---

## Como subir

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows;  no Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt

copy .env.example .env          # no Linux/Mac: cp .env.example .env
# preencha SUPABASE_URL e SUPABASE_ANON_KEY

python app.py                   # http://127.0.0.1:5050
```

No Supabase, **SQL Editor → New query → Run**:

| Situação | Arquivo |
|---|---|
| Banco novo / vazio | `supabase/schema.sql` |
| Banco que já tem dados | `supabase/migracao_v2.sql` |
| Depois, em qualquer um dos dois | `supabase/migracao_materiais.sql` |
| E por último | `supabase/migracao_acesso.sql` |

O `migracao_materiais.sql` traz o **Módulo 5** (materiais e insumos) e a
**margem alvo**. É idempotente — rodar duas vezes não quebra nada. Sem ele o
sistema sobe do mesmo jeito, mas o bloco de materiais avisa que a tabela não
existe e a proposta não grava a margem alvo.

O `migracao_acesso.sql` fecha a porta: conta nova passa a nascer **pendente** e
não enxerga nada até um admin liberar em Configurações → Usuários. Ele também
tapa dois buracos que existiam: o `ativo` de perfis não bloqueava ninguém (a
função caía em 'vendedor' quando o perfil estava desativado), e qualquer usuário
podia rodar um update no próprio perfil e virar admin. **Rode antes de deixar o
CRM acessível fora da sua máquina.**

Depois da migração, congele as propostas antigas uma única vez:

```bash
python ferramentas.py congelar --seco   # vê a lista
python ferramentas.py congelar          # grava
```

O **primeiro usuário** que criar conta vira `admin` automaticamente. Os demais
entram como `vendedor`; um admin promove pela tela **Configurações → Usuários**.

**PDF: instale o [LibreOffice](https://www.libreoffice.org/download/).** O PDF é
o PPTX exportado por ele em modo headless, e é o único requisito fora do
`pip install`. Nada mais precisa ser configurado: o servidor acha o `soffice`
pelo registro do Windows (ou pelo PATH), e usa um perfil próprio, então
converter não atrapalha o LibreOffice que você tenha aberto. Instalação em pasta
fora do comum: aponte `LIBREOFFICE_PATH` no `.env`.

O PowerPoint saiu do caminho padrão porque exige sessão interativa do Windows,
disputa a instância aberta pelo usuário e deixa `POWERPNT.exe` pendurado quando
a exportação falha — a partir do segundo processo preso, toda conversão seguinte
travava. Quem quiser de volta tem `PDF_MOTOR=auto` (LibreOffice e, se falhar,
PowerPoint) ou `PDF_MOTOR=powerpoint` no `.env`.

**Configurações → Sistema → Verificar** mostra qual motor está ativo e onde ele
foi encontrado.

---

## Publicar num domínio

O CRM nasce em `localhost:5050`. Para colocá-lo no ar — apontar `crm.seudominio.com`,
ligar o e-mail do domínio e gerar o HTTPS — o passo a passo está em
**[`docs/PUBLICAR.md`](docs/PUBLICAR.md)**, junto com o `Dockerfile` que serve
tanto para VPS quanto para plataforma que constrói sozinha.

Três coisas que esse documento explica e que costumam pegar de surpresa:
hospedagem compartilhada de site (a de WordPress) **não roda** Python nem
LibreOffice; o modelo de PPT usa uma fonte da Microsoft que não existe em Linux;
e o CRM tem que rodar em **uma instância só**, porque a fila de documentos vive
na memória do processo.

---

## Como está montado

```
app.py                     Flask: autenticação, rotas de documento, e-mail, aceite público
  ├── calculo.py           motor de cálculo, em centavos            ← fonte da verdade
  ├── documentos.py        proposta (id) → contexto → dados do PPT
  ├── ppt.py               preenche o modelo, expande tabelas, converte para PDF
  ├── fila.py              fila de geração (o PDF não trava mais o CRM)
  ├── correio.py           envio por SMTP
  └── supa.py              cliente REST do Supabase

modelo_ppt/proposta_facilities.pptx  modelo em uso (21 slides, facilities e seguranca)
modelo_ppt/preparar_modelo.py    gera esse modelo a partir do deck em origem/
modelo_ppt/build_modelo.py       gera o modelo antigo, mizys_proposta.pptx
supabase/schema.sql        banco completo: tabelas, RLS por papel, triggers, storage
supabase/migracao_materiais.sql  Módulo 5 (materiais) e margem alvo, para base já existente
templates/my_crm.html      casca da SPA
static/css/app.css         o sistema visual inteiro
static/js/
  util.js                  utilidades + despachante de eventos por data-*
  calculo.js               espelho de calculo.py                    ← tem que bater
  db.js                    dados, paginação, sessão, busca global
  ui.js                    modal, campos, timeline, notas, anexos, fila
  views-inicio.js          tela inicial: o mapa de atalhos                ← abre aqui
  views-crm.js             painel de indicadores, pipeline, leads, contatos…
  views-proposta.js        lista e editor de proposta, documentos, e-mail
  views-contratos.js       pós-venda: vigência, reajuste, aditivo
  views-cadastros.js       CCT, escalas, turnos, equipamentos, materiais, parâmetros, usuários
  forms.js                 todos os formulários
  app.js                   roteamento, busca, login, partida
tests/                     motor de cálculo e documento de ponta a ponta
  test_paridade.py         calculo.py × calculo.js, centavo a centavo (precisa de Node)
  telas.js                 cada tela pinta sem exceção, com banco de mentira
ferramentas.py             congelar em lote, gerar por id, conferir tudo
```

### As duas regras que sustentam o resto

**1. O motor de cálculo é um só, escrito duas vezes.**
`calculo.py` roda no servidor (é ele que preenche o PDF, o e-mail e o link
público) e `static/js/calculo.js` roda na tela. Os dois trabalham em **centavos
inteiros** e arredondam meio-para-cima, porque `round()` do Python arredonda
para o par e `Math.round` do JavaScript arredonda para cima — um centavo de
diferença aqui é a tela mostrando um número e o PDF, outro.

Quem confere isso não é mais a fé. `tests/test_paridade.py` roda os DOIS
motores sobre a mesma proposta e compara centavo a centavo — todos os regimes,
com e sem margem alvo, com e sem material. Ele precisa do `node` no PATH; sem
Node ele é pulado, não quebra a suíte.

Em produção continuam valendo o botão **"Conferir com o cálculo do servidor"**,
no painel da proposta, que compara linha a linha contra
`GET /api/propostas/<id>/calculo`, e `python ferramentas.py conferir`, que passa
em toda a base.

**2. Proposta enviada é documento, não consulta.**
Quando a proposta sai de *Rascunho*, o servidor grava em `snapshot` os salários,
benefícios, encargos, escalas e turnos como estavam naquele instante. Dali em
diante a tela, o PDF e o link do cliente leem o snapshot. O reajuste de janeiro
não muda mais a proposta enviada em julho.

---

## O que o motor calcula

| Item | Como |
|---|---|
| **Adicional noturno** | Só sobre as horas entre 22h e 5h, com hora ficta de 52'30" (art. 73 da CLT). Um turno 19h–7h paga sobre 7 horas de uma jornada líquida de 11 — não sobre as 11. |
| **Insalubridade** | Sobre a base que a convenção mandar: salário mínimo (padrão), piso da categoria ou salário do cargo. |
| **Periculosidade e acúmulo** | Sobre o salário do cargo. |
| **Funcionários por posto** | `manual` usa o número digitado. `calculado` deriva de horas de cobertura ÷ jornada contratual, com absenteísmo e cobertura de férias — 12x36 dá ~2,17, não 2,0. |
| **Benefícios** | Custo líquido: valor − desconto legal do empregado (VT: até 6% do salário, limitado ao valor; VR e saúde: coparticipação em %). |
| **Materiais (Módulo 5)** | Custo mensal = valor de aquisição ÷ prazo de troca, vezes o multiplicador da base. Uniforme de R$ 190 trocado a cada 6 meses são R$ 31,67 por funcionário por mês. |
| **Preço de venda** | `base ÷ (1 − T)`, imposto **por dentro**, rateado entre postos, materiais e equipamentos pelo método do maior resto. A soma das fatias é o total, ao centavo. |
| **Implantação** | Também vendida com markup, e não repassada a preço de custo. |

O documento imprime **preço**, nunca custo. A composição de custo fica só no
painel interno da proposta.

### Materiais: a base é o que mais erra

Cada material tem um **multiplicador**, e ele é a diferença entre orçar certo e
orçar para um terço do contrato:

| Base | Multiplica por | Exemplo |
|---|---|---|
| `funcionario` | headcount **real** (postos × fator da escala) | uniforme, EPI, exame |
| `posto` | número de postos | rádio, chave, livro de ocorrência |
| `contrato` | 1 | cota mensal de produto de limpeza |

Num 12x36 o fator é ~2,17: um posto são 2,17 pessoas, e uniforme se compra por
pessoa. Marcar `posto` num item de uniforme orça menos da metade do que vai ser
gasto — e o erro não aparece em lugar nenhum, porque a conta fecha, só fecha
errado.

### A proposta em três telas

**Nova proposta não grava nada.** Ela abre um rascunho que só existe na memória
do navegador; o banco só ouve falar dele quando alguém clica em **Salvar
proposta**. Antes, o clique em "Nova" já inseria a linha — quem abria por
curiosidade e desistia deixava proposta vazia na lista, e cada uma queimava um
número da `proposta_numero_seq`, que não anda para trás. O número é pedido ao
banco no momento de salvar.

Na lista, **Abrir** e **Editar** são coisas diferentes:

| Botão | Leva a | Para quê |
|---|---|---|
| **Abrir** | `propostaResumo` | conferir: equipe, materiais, a conta que fecha, imposto por imposto |
| **Editar** | `propostaEditor` | mexer no escopo, nos materiais e na margem |

A tela de conferência existe porque o editor não serve para conferir: lá cada
número está ao lado de um campo que pode mudá-lo. E ela separa as duas famílias
que a palavra "imposto" costuma juntar — **encargos sobre a folha** (INSS,
RAT×FAP, terceiros, FGTS, 13º, rescisão: incidem sobre o salário e entram no
custo) e **tributos sobre o faturamento** (PIS, COFINS, ISS, IRPJ, CSLL:
incidem sobre o preço e saem por dentro dele). Somar os dois num número só é o
erro que faz empresa de facilities vender no prejuízo achando que tem margem.

Cada posto vira um cartão com a **folha aberta de uma pessoa**: salário-base da
convenção, cada adicional com a alíquota e a base sobre a qual foi calculado, e
os benefícios com o desconto legal do empregado. O adicional que a lei manda
afastar — insalubridade quando a periculosidade é maior (art. 193 §2º) —
aparece riscado, com o motivo.

O **adicional noturno** ganha tratamento próprio porque é o que mais gera
pergunta. A tela não mostra só o valor: mostra quantas horas da jornada ganham
adicional, quantas não ganham, e a divisão inteira que produziu o número.

```
Adicional noturno 20%                                    R$ 279,27
  Ganham adicional: 7h da jornada, as que caem entre 22:00 e 05:00 — 64% do turno.
  Não ganham: as outras 4h do turno de 11h, que são hora normal.
  Hora ficta do art. 73 da CLT: cada 52 min e 30 s valem uma hora cheia,
  então as 7h viram 8h por dia e 160h no mês.
  Conta: R$ 1.920,00 ÷ 220h de jornada × 20% × 160h = R$ 279,27
```

A conta aparece como **divisão**, não como hora-base já arredondada: R$ 1.920 ÷
220 dá R$ 8,7273, e os R$ 8,73 que caberiam na tela erram o resultado em nove
centavos — o suficiente para alguém concluir que o sistema não fecha.

**Cliente novo sem sair da proposta.** O seletor de cliente e o de contato têm
um `+ Novo` ao lado; o registro criado ali já entra escolhido na proposta
aberta. A corrente tem três elos (botão → formulário → `saveLead`), e o do meio
é o que quebra calado: se o modal não carregar o "de onde vim" até o botão
Salvar, o cliente é criado e a proposta continua apontando para o anterior. O
`tests/telas.js` prende os três.

A conta do valor mensal é impressa numa coluna que **fecha na calculadora**:

```
mão de obra + materiais + equipamentos   = custo direto
custo direto + administração + impostos + seu lucro = VALOR MENSAL
```

A cascata da IN SEGES ("lucro de planilha") continua no motor e na gaveta
Avançado, mas saiu da tela: ela não soma o total, porque lucro de planilha é
markup ANTES do gross-up dos tributos — e quem conferia somando a coluna achava
que o sistema estava errado.

### Margem alvo: a conta ao contrário

O vendedor pensa em **margem**; a planilha da IN SEGES pede **lucro de
planilha**, que é markup sobre custo. Não são o mesmo número: 18% de lucro de
planilha com T de 16,53% entregam **12,73% de margem**.

Preenchida a margem alvo, o motor resolve o markup por fórmula fechada:

```
L = (1 − T) ÷ [ ((1 − T) − m) × (1 − d) ] − 1
```

`m` é a margem desejada, `T` o tributo do regime, `d` o desconto comercial. No
Lucro Real o IRPJ incide sobre o próprio lucro, então T depende de L e L depende
de T — ali entra um ponto fixo de até 8 voltas, que converge em duas. Margem
acima de `(1 − T)` não existe: o resto do preço é imposto, e o sistema avisa em
vez de devolver um número impossível.

Zerar a margem alvo devolve o controle ao lucro de planilha, que continua na
gaveta **Avançado** — é o que uma licitação exige defender.

O campo **nasce vazio**, sem padrão. Campo pré-preenchido com número plausível é
aceito sem ser olhado, e margem é decisão comercial de cada contrato, não
configuração de sistema. O que a tela mostra é o mínimo da empresa
(`proposta_margem_minima`, 8% de fábrica) — informação, não sugestão. Sem margem
definida o preço sai pelo lucro de planilha padrão, e a tela diz isso com todas
as letras em vez de deixar parecer bug.

---

## Documentos

O navegador manda um **id**; quem lê a proposta, calcula e preenche o modelo é o
servidor:

```
POST /api/propostas/<id>/documento/pdf   → { job: "a1b2c3" }
GET  /api/documento/job/<job>            → andamento
GET  /api/documento/job/<job>/arquivo    → o arquivo
```

Cada geração é guardada no Supabase Storage, versionada e ligada à proposta —
é o comprovante do que o cliente recebeu. O histórico fica na aba **Documento e
envio**.

**Modelo de PPT.** O padrão é `modelo_ppt/proposta_facilities.pptx` — 21
slides de facilities e segurança. Coloque outros `.pptx` na mesma pasta
(condomínio, indústria, shopping) e escolha por proposta.

Esse modelo **não é editado à mão**: ele é gerado a partir do deck do designer,
que fica em `modelo_ppt/origem/` com marcadores humanos (`[ NOME DO CLIENTE ]`).
Mexeu no desenho, rode de novo:

```bash
python modelo_ppt/preparar_modelo.py     # deck em origem/ -> modelo preenchível
python modelo_ppt/build_modelo.py        # o modelo antigo, mizys_proposta.pptx
```

O deck de origem mora numa subpasta de propósito: a raiz de `modelo_ppt/` é o
que o CRM oferece no seletor, e um deck sem marcador nenhum listado ali geraria
proposta com "[ NOME DO CLIENTE ]" impresso.

- Placeholders são `{CHAVE}` no texto; a lista sai de `documentos.dados_documento`.
- Linhas de tabela que crescem: a linha com `{QTD}` (postos), `{EQ_QTD}`
  (materiais e equipamentos) e `{SAL_CARGO}` (salários por cargo) é duplicada
  uma vez por registro.
- `{PAGINA}` é o número do rodapé, resolvido **depois** de os slides opcionais
  saírem — modelo que numera à mão pula de 16 para 18 na cara do cliente.
- Campo vazio vira campo vazio: `{CHAVE}` é substituído sem dó. As exceções são
  missão e visão, que caem na redação do modelo quando Configurações → Empresa
  está em branco (`MISSAO_PADRAO` em `documentos.py`), porque um slide oco é
  pior do que um genérico.
- **Slides opcionais**: o nome do slide vive nas *anotações* como
  `SLIDE:equipamentos`. A tela lê essa lista **do arquivo escolhido**
  (`/api/modelos`), então cada modelo oferece os interruptores que realmente
  tem. `gente` nasce desligado: é o único slide que o CRM não preenche sozinho,
  porque quer a foto de cada colaborador. Não é impresso, não aparece na apresentação e sobrevive
  a qualquer reescrita de título — a versão anterior localizava o slide
  procurando o texto literal do título e quebrava em silêncio.
- **Logo**: coloque `modelo_ppt/logo.png` (ou `.jpg`). A forma marcada com
  `{LOGO}` na capa é trocada pela imagem, contida na caixa, sem distorcer.

---

## Envio e aceite

Preenchendo o bloco `SMTP_*` do `.env`, a proposta é enviada pelo próprio CRM,
com assunto e corpo configuráveis em **Configurações → documento**
(`email_assunto`, `email_corpo`, aceitando os mesmos `{CAMPOS}` do PPT).

Com `SUPABASE_SERVICE_KEY` preenchida, cada proposta ganha um **link público**:

```
/p/<token>            página do cliente, com valor, equipe e escopo
/p/<token>/documento.pdf
```

O link registra abertura (data e contagem) e permite o **aceite** com nome e
carimbo de data/hora. Aceite não é assinatura de contrato — é registro de
concordância, e vira evento na linha do tempo.

**Configurações → Sistema → Verificar** mostra o que está de pé e o que falta.

---

## Papéis

| Papel | Comercial | Cadastros | Parâmetros e papéis |
|---|---|---|---|
| `admin` | tudo | edita | edita |
| `gestor` | tudo | edita | leitura |
| `vendedor` | só o que é dele | leitura | leitura |

Quem aplica isso é o **Row Level Security do Postgres**, não a tela. Os botões
escondidos são conveniência; a política é a barreira.

---

## Segurança

- Toda rota de API exige o **JWT do Supabase**, e o servidor usa esse mesmo
  token para falar com o banco: a RLS continua valendo do lado do servidor.
- `FLASK_DEBUG` fica desligado. Ligado, o Werkzeug abre um console interativo
  que é execução remota de código para quem alcançar a porta.
- Nenhum handler de tela é montado por interpolação de string: o HTML declara
  `data-acao` e um despachante resolve. Valor de dado nunca vira código.
- `SUPABASE_SERVICE_KEY` ignora a RLS. Ela existe só para o link público e não
  sai da máquina do servidor.
- Antes de expor na rede (`HOST=0.0.0.0`), ponha um proxy com HTTPS na frente.

---

## Testes

```bash
python -m unittest discover -s tests -v
```

Cada teste prende um problema conhecido, para ele não voltar em silêncio:

- a coluna do slide de resumo **soma** — o teste abre o `.pptx` gerado e confere;
- proposta congelada **não muda** quando a CCT é reajustada;
- o adicional noturno é proporcional, e não sobre o salário inteiro;
- o desconto legal de VT nunca passa do valor do vale;
- nenhum `{PLACEHOLDER}` sobra no arquivo entregue;
- os **dois motores** dão o mesmo centavo, em todos os regimes;
- a margem alvo **entrega a margem pedida** — pediu 15%, o resultado é 15,000%;
- material por funcionário multiplica pelo headcount real, não pelo nº de postos;
- **cada tela pinta** sem exceção, com o banco de mentira do `tests/telas.js`;
- **"Nova proposta" não escreve no banco** — o cliente do Supabase de mentira
  anota cada tabela tocada, e o teste falha se `propostas` ou `ops` aparecerem;
- o **adicional noturno diz o que não é**: a tela precisa conter "Ganham
  adicional", "Não ganham" e a conta com a divisão;
- a **folha aberta** traz salário-base, salário bruto, custo por pessoa e
  benefícios;
- o `+ Novo` cliente **carrega o vínculo** do botão até o `saveLead`.

Os três últimos grupos precisam do `node` no PATH. Sem Node eles são **pulados**,
não quebram a suíte — quem só mexe no backend não precisa de runtime de
JavaScript. Para rodar só eles:

```bash
python -m unittest tests.test_paridade -v
node tests/telas.js
```

---

## Operação

```bash
python ferramentas.py congelar [--seco]   # congela propostas já enviadas
python ferramentas.py gerar <id> [pdf]    # gera um documento sem navegador
python ferramentas.py conferir            # passa o motor em toda a base
```

Em produção o `python app.py` sobe com **Waitress**. Para rodar como serviço no
Windows, aponte o serviço para o mesmo comando com o `.venv` ativo.

---

## Histórico

O `docs/PLANO_MELHORIAS.md` descreve o estado anterior e o que foi corrigido:
o resumo que não fechava a conta, o custo exposto no lugar do preço, a proposta
que mudava de valor sozinha, o endpoint sem autenticação, a numeração com
corrida, `hoje()` em UTC, a injeção por aspa simples e o motor trabalhista
simplificado — além do módulo de contratos, papéis, timeline, busca global,
CSV, fila de documentos e a quebra do arquivo único de 144 KB.

Depois disso, o editor de proposta foi refeito. Eram **cinco abas e trinta e um
controles** antes do primeiro posto, e treze deles — a aba inteira de
precificação — já funcionavam vazios: regime, RAT, FAP, ISS e o resto sempre
saíram de Configurações sozinhos. A aba existia para *mostrar* o que já era
automático, e cobrava do vendedor a decisão de não mexer.

Hoje é **uma tela e três blocos** — escopo, materiais, condições —, com o resto
em gavetas fechadas. Junto vieram o **Módulo 5** (materiais e insumos, que não
existiam e viravam linha de equipamento) e a **margem alvo**, que trocou a
pergunta errada ("quanto de markup?") pela que o vendedor sabe responder
("quanto quero ganhar?").
