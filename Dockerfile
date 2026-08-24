# ============================================================================
# Mizys CRM — imagem de produção
#
# Serve para os dois caminhos de publicação:
#   · plataforma que aceita Dockerfile (Render, Railway, Fly.io) — `git push`
#     e ela constrói sozinha;
#   · VPS com Docker instalado — `docker build` e `docker run`.
#
# O que obriga esta imagem a existir é o LIBREOFFICE. Ele não se instala por
# `pip`, e é ele que converte o PPTX em PDF. Sem ele o CRM sobe e funciona
# inteiro, mas o botão "Gerar PDF" para de responder — que é o botão pelo qual
# a proposta chega ao cliente.
# ============================================================================
FROM python:3.12-slim

# ── LibreOffice, só o Impress ───────────────────────────────────────────────
# `libreoffice` completo traz Writer, Calc, Base e Draw: mais de 1 GB para
# converter um .pptx. `libreoffice-impress` sozinho faz a conversão e economiza
# quase metade da imagem.
#
# As fontes NÃO são detalhe. O modelo de PPT usa Segoe UI, que é da Microsoft e
# não existe em Linux: sem nenhuma fonte instalada o LibreOffice substitui pela
# primeira que achar, e o texto estoura as caixas do slide. Liberation e DejaVu
# são o mínimo para o PDF sair legível — leia a seção "Fontes" do
# docs/PUBLICAR.md antes de mandar a primeira proposta para um cliente.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-impress \
        libreoffice-core \
        fonts-liberation \
        fonts-dejavu-core \
        fontconfig \
        curl \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependências antes do código: mexer no código não reinstala o pip inteiro.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 0.0.0.0 porque dentro do contêiner o 127.0.0.1 só é alcançável pelo próprio
# contêiner — a plataforma nunca chegaria na porta. A PORT quem manda é ela,
# e o app.py já lê as duas do ambiente.
ENV HOST=0.0.0.0 \
    PORT=8080 \
    PYTHONUNBUFFERED=1 \
    FLASK_DEBUG=

EXPOSE 8080

# /api/saude não exige login e responde o que está de pé — é o endpoint certo
# para a plataforma saber se o contêiner subiu.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/api/saude || exit 1

# ⚠ UMA instância só. A fila de geração de documentos (fila.py) vive na memória
# do processo: o navegador pede o PDF, recebe um id de job e volta para buscar
# o arquivo. Com duas instâncias, a segunda não conhece o job da primeira e o
# download falha em metade das tentativas. Não ligue autoscaling.
CMD ["python", "app.py"]
