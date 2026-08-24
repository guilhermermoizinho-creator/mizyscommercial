# Publicar o Mizys CRM no seu domínio

Guia para tirar o CRM do `localhost:5050` e colocá-lo em `crm.mizys.com.br`, com o
domínio e o e-mail que já estão na Hostinger.

---

## Antes de tudo: a hospedagem de site da Hostinger não serve

Esta é a primeira coisa a resolver, porque muda todo o resto.

O plano de **Hospedagem de Sites** da Hostinger (Premium, Business, Cloud) roda
**PHP e MySQL**. É o que faz WordPress e loja virtual funcionarem, e é ótimo
nisso. Mas o Mizys CRM é **Python**, e ainda depende do **LibreOffice** — um
programa de 400 MB que precisa ser instalado no sistema para converter o PPTX
em PDF. Não existe como instalar isso num plano compartilhado: você não tem
acesso de administrador à máquina, e ela nem tem Python de servidor.

Não é limitação da Hostinger, é o tipo de plano. Então:

| O que você tem | Serve? |
|---|---|
| Domínio `mizys.com.br` | ✅ serve, e é o que importa — ele aponta para onde você quiser |
| E-mail `guilherme@mizys.com.br` | ✅ funcionando — MX, SPF, DKIM e DMARC configurados |
| Hospedagem de Sites (PHP) | ❌ não roda Python nem LibreOffice |
| VPS da Hostinger | ✅ roda tudo |

**O domínio é a parte fácil.** Ele é só um apontamento: dá para deixá-lo na
Hostinger e mandar `crm.mizys.com.br` para qualquer servidor do mundo, sem mexer
no e-mail.

## Os dois caminhos (quando virar coisa séria)

### Caminho A — VPS na Hostinger (tudo num lugar só)

Você contrata um **VPS** (o KVM 1 dá conta: 1 vCPU, 4 GB), que é um Ubuntu
inteiro com acesso de administrador. Instala Python, LibreOffice, um proxy com
HTTPS, e sobe o CRM ali.

- **A favor:** um fornecedor só, uma fatura só, suporte em português, e o
  servidor é seu — sem limite de uso, sem dormir por inatividade.
- **Contra:** o servidor é seu. Atualização de segurança do Ubuntu, renovação
  do certificado HTTPS, backup — tudo passa a ser tarefa sua. O modo mais comum
  de isso dar errado não é o CRM cair: é o certificado vencer em silêncio nove
  meses depois e o navegador passar a acusar site inseguro.

### Caminho B — plataforma que constrói sozinha (Render, Railway, Fly.io)

Você aponta a plataforma para o código, ela lê o `Dockerfile` que já está no
projeto, constrói e sobe. HTTPS automático e renovado sozinho. O domínio
continua na Hostinger, apontando para lá.

- **A favor:** nada de administrar servidor. Publicar uma versão nova é
  `git push`. O certificado nunca vence.
- **Contra:** mais um fornecedor e mais uma fatura (uns US$ 7/mês no plano que
  aguenta o LibreOffice — os planos gratuitos não têm memória para ele e
  desligam a máquina por inatividade). E exige o código num repositório Git
  (hoje não há: veja "Pendências" no fim).

### Qual escolher — a decisão, em 24/08/2026

**Caminho B, e o domínio fica onde está.**

Duas coisas decidem:

1. **O domínio não se mexe.** No Caminho B entra **um CNAME** chamado `crm` no
   painel da Hostinger, e só. Nenhum dos onze registros que existem hoje é
   tocado — e seis deles existem só para o e-mail chegar e não cair no spam.
2. **O certificado que se renova sozinho.** No Caminho A o modo mais comum de
   dar errado não é o CRM cair — é o HTTPS vencer em silêncio nove meses
   depois.

Custa uns US$ 7 por mês, e por enquanto **não foi contratado nada**. Até que
seja, o CRM roda em `localhost:5050`, na máquina, e é assim que ele é usado.

Servir o CRM a partir do computador do escritório para o mundo — com túnel ou
sem — **foi descartado** em 24/08/2026, e não é para reabrir sem que alguém
peça.

## O que vale para os dois caminhos

### 1. Apontar o subdomínio sem derrubar o e-mail

No painel da Hostinger, **Domínios → mizys.com.br → Editor de DNS**. Você vai
adicionar **um registro só**:

| Caminho | Tipo | Nome | Valor |
|---|---|---|---|
| A (VPS) | `A` | `crm` | o IP do VPS |
| B (plataforma) | `CNAME` | `crm` | o endereço que ela te der |

**Não mexa em mais nada.** O e-mail `guilherme@mizys.com.br` funciona por causa
dos registros **MX**, e eles são outra linha da mesma tabela. Adicionar um `A`
ou `CNAME` chamado `crm` não os toca. Quem quebra e-mail é apagar MX ou trocar
os servidores de nome (nameservers) do domínio inteiro — e nada aqui pede isso.

Use `crm.mizys.com.br` em vez de `mizys.com.br`. Assim o domínio principal fica livre
para o site institucional da empresa, que é o que um cliente digita.

### 2. Trocar a URL do link de aceite

O link que o cliente abre para aceitar a proposta é montado a partir de uma
configuração **no banco**, não do `.env`. Enquanto ela apontar para
`localhost:5050`, o cliente recebe um link que só abre na sua máquina.

Em **Configurações → Parâmetros**, mude `aceite_base_url` para:

```
https://crm.mizys.com.br
```

### 3. HTTPS não é opcional

O CRM tem salário, CNPJ, telefone e e-mail de cliente. Em `http://` isso
trafega em texto puro. No caminho B o HTTPS vem pronto; no caminho A ele é uma
etapa que **não pode ser pulada** (Nginx + Certbot, gratuito).

---

## ⚠ Antes de mandar o link para alguém: rode a `migracao_acesso.sql`

O CRM tem tela de login, mas ela traz um botão **"Primeiro acesso? Criar
conta"** — e ele funciona para qualquer pessoa que chegue no endereço. Foi
pensado para a instalação local, onde só quem está na sua rede alcança a tela.

Num endereço público isso muda: quem descobrir o link cria uma conta de
vendedor e passa a enxergar as tabelas de convenção, cargos e salários. Endereço
difícil de adivinhar não é proteção — é só um segredo mal guardado.

**Antes de mandar o link para qualquer pessoa**, rode
`supabase/migracao_acesso.sql` no SQL Editor do Supabase. Depois dela, conta
nova nasce **pendente**: entra numa fila de espera e não enxerga uma linha do
sistema até um admin liberar em **Configurações → Usuários**.

A migração fecha, de quebra, dois furos que existiam desde o começo: o botão
"desativar usuário" não desativava ninguém, e qualquer usuário conseguia se
promover a admin. O cabeçalho do arquivo explica os dois.

**Não desligue o "Enable Sign Ups" do Supabase.** Uma versão anterior deste
documento mandava desligar — era o reméndio de antes da migração existir.
Desligar agora quebra o pedido de acesso, e criar gente na mão em
**Authentication → Users** volta a ser a única saída. Com a migração rodada, o
cadastro aberto é só uma fila de espera, e ela é mais segura do que o botão
antigo prometia ser.

Isso vale para qualquer publicação — é o primeiro item da lista, não o último.

---

## Fontes: confira o PDF antes de mandar para um cliente

O modelo de proposta usa **Segoe UI**, que é uma fonte da Microsoft e **não
existe em Linux**. Qualquer servidor Linux — VPS ou plataforma — vai substituí-la
por outra na hora de gerar o PDF.

Substituição de fonte não quebra o arquivo: ela muda a **largura das letras**. E
como o modelo tem caixas de tamanho fixo, texto mais largo estoura a caixa,
sobrepõe outro texto ou some no corte. O PDF sai, parece pronto, e está torto.

O `Dockerfile` já instala Liberation e DejaVu, que é o mínimo para sair
legível. Mas **gere um PDF de teste no servidor novo e compare com um gerado na
sua máquina, lado a lado**, antes de mandar proposta para cliente.

Se sair torto, há duas saídas — me chame que eu faço:

1. **Trocar a fonte do modelo** para uma livre que exista nos dois lados (Open
   Sans, Inter, Carlito). É a solução definitiva e não custa licença.
2. Copiar os arquivos da Segoe UI do Windows para o servidor. Funciona, mas a
   licença dela é para uso em Windows — instalar num servidor Linux é área
   cinzenta que eu não recomendo para uma empresa.

---

## Uma instância só, sempre

A fila que gera os documentos (`fila.py`) vive **na memória do processo**: o
navegador pede o PDF, recebe um número de pedido e volta depois para buscar o
arquivo pronto.

Com duas cópias do CRM rodando, a segunda não conhece o pedido feito à
primeira, e o download falha em parte das tentativas — sem erro claro, do jeito
que dá mais trabalho para descobrir.

Então: **não ligue escalonamento automático** na plataforma, e não suba duas
cópias no VPS. Uma instância aguenta com folga o uso de uma equipe comercial.

---

## Roteiro do caminho A (VPS), em ordem

1. Contratar o VPS na Hostinger, imagem **Ubuntu 24.04**, e anotar o IP.
2. Apontar `crm` → IP no Editor de DNS (tabela acima).
3. Entrar por SSH e instalar: Python 3, `libreoffice-impress`, Nginx, Certbot.
   (Ou só Docker, e usar o `Dockerfile` do projeto — menos coisa para manter.)
4. Copiar o projeto e criar o `.env` com as variáveis de produção:
   `HOST=0.0.0.0`, `PORT=8080`, `FLASK_DEBUG=` vazio e o Supabase.
5. Rodar como serviço (`systemd`), para subir sozinho quando a máquina reiniciar.
6. Nginx na frente, encaminhando para a porta 8080.
7. `certbot --nginx -d crm.mizys.com.br` para o HTTPS.
8. Firewall: liberar 80 e 443, **fechar a 8080** para o mundo. Sem isso, dá para
   alcançar o CRM sem HTTPS pela porta direta e o certificado vira decoração.

---

## Roteiro do caminho B (plataforma), em ordem

1. Criar um repositório Git só do `my_crm` e subir para o GitHub (veja
   "Pendências").
2. Criar o serviço na plataforma apontando para o repositório. Ela detecta o
   `Dockerfile` sozinho.
3. Cadastrar as variáveis de ambiente no painel dela: `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_KEY`. **O `.env` não vai no
   repositório** — o `.dockerignore` e o `.gitignore` já barram, e é assim que
   tem que ser: ele tem a chave de serviço do Supabase.
4. Desligar autoscaling / deixar em 1 instância.
5. Adicionar o domínio `crm.mizys.com.br` no painel da plataforma; ela te dá o
   valor do CNAME.
6. Criar o CNAME no Editor de DNS da Hostinger.

---

## Depois de publicar, confira nesta ordem

1. `https://crm.mizys.com.br` abre com o cadeado.
2. Você consegue entrar com a sua conta.
3. **Configurações → Sistema → Verificar**: Supabase ✅, e-mail ✅, PDF ✅.
4. Gere um PDF e **compare com um da sua máquina** (a seção de fontes).
5. Envie uma proposta de teste para você mesmo — confira que chegou de
   `guilherme@mizys.com.br` e não caiu no spam.
6. Abra o link de aceite num navegador anônimo: ele tem que abrir em
   `crm.mizys.com.br`, não em `localhost`.

---

## O que continua igual

- **O banco não muda.** O Supabase já está na nuvem; publicar o CRM não mexe em
  nada dele.
- **O e-mail não muda.** Continua na Hostinger, com a mesma senha e o mesmo
  webmail.
- **O domínio continua seu e na Hostinger.** Só ganha uma linha a mais no DNS.
