/* ════════════════════════════════════════════════════════════════════════════
   GRÁFICOS — SVG escrito à mão, sem biblioteca.

   O que havia antes eram colunas grossas em degradê com o valor carimbado em
   cima de cada uma. Aquilo é o desenho padrão de todo painel gerado: bloco
   saturado, número em toda marca, grade pesada. Lê como enfeite, não como
   informação — e num painel de vendas o enfeite é justamente o que faz
   ninguém confiar no número.

   O desenho daqui segue três regras, e elas valem para qualquer gráfico que
   entrar depois:

     1. Traço fino. Linha de 2px, ponto de 4px de raio, grade de 1px um passo
        acima do fundo. A tinta pesada é da DADOS, não da moldura.
     2. Rótulo escolhido a dedo. Número em todo ponto vira ruído e ninguém lê.
        Aqui recebem rótulo o pico, o último ponto e o que tiver um comentário
        — o resto se lê no eixo, no hover ou na tabela.
     3. Todo gráfico tem tabela. O <details> embaixo traz os mesmos números em
        texto: quem não enxerga cor, quem imprime e quem quer copiar para a
        planilha continuam atendidos.

   A paleta é a do sistema e foi validada para fundo escuro (banda de
   luminosidade, piso de croma, separação para daltonismo e contraste sobre a
   superfície): violeta #8B5CF6 como série principal e verde-azulado #2DA88C
   como segunda — as duas se separam com folga em deuteranopia e tritanopia.
   ════════════════════════════════════════════════════════════════════════════ */

/* `nreal` mora dentro do fechamento do calculo.js e não é visível aqui — usar
   ela neste arquivo dava "nreal is not defined" e derrubava o gráfico inteiro,
   deixando o cartão vazio. Este arquivo não depende do motor de cálculo, e é
   assim que tem que continuar. */
const _gnum = (v, padrao = 0) => {
  const f = parseFloat(String(v).replace(',', '.'));
  return isNaN(f) ? padrao : f;
};

const GRAF = {
  s1:'#8B5CF6',           /* série principal — o violeta da casa            */
  s1c:'#B79CFF',          /* o mesmo violeta, clareado, para o ponto/rótulo */
  s2:'#2DA88C',           /* série secundária                               */
  grade:'#242235',        /* um passo acima da superfície                   */
  fundo:'#12111C',        /* a cor do cartão: é ela que faz o anel do ponto */
  tinta:'#EEEBF7', muda:'#9E99B8', fraca:'#6F6A8A',
};

/* Teto "redondo" acima do maior valor: 1, 2 ou 5 vezes uma potência de dez.
   Sem isso o eixo vira 0 / 43.217 / 86.434 e ninguém compara nada de cabeça. */
function _teto(v){
  if(v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/* ── Gráfico de linha ────────────────────────────────────────────────────────
   pontos: [{r:'ago', v:84000, nota:'melhor mês'}]
   fmt:    função que formata o valor (money0, num…)
   Devolve o SVG mais a tabela equivalente.

   O SVG tem viewBox e largura de 100%: ele acompanha a largura do cartão sem
   uma linha de JS de redimensionamento. */
function graficoLinha(pontos, fmt, opc){
  opc = opc || {};
  const F = fmt || (v => String(v));
  const n = pontos.length;
  if(!n) return emptyState(opc.vazio || 'Sem dados no período', '');

  const W = 720, H = opc.altura || 250;
  const ml = opc.ml || 66, mr = 22, mt = 30, mb = 34;
  const pw = W - ml - mr, ph = H - mt - mb;
  const max = _teto(Math.max(...pontos.map(p => +p.v || 0)));
  const x = i => n === 1 ? ml + pw / 2 : ml + (i / (n - 1)) * pw;
  const y = v => mt + ph - ((+v || 0) / max) * ph;

  const linha = pontos.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `M${x(0).toFixed(1)},${(mt + ph).toFixed(1)} L${linha.split(' ').join(' L')} L${x(n-1).toFixed(1)},${(mt + ph).toFixed(1)} Z`;

  /* A linha de referência — a margem mínima, a meta do mês. Esta SIM é
     tracejada, e é a única do gráfico: aqui o tracejado significa "limite", que
     é justamente o que ele deve significar. */
  const lim = _gnum(opc.limite, 0);
  const referencia = lim > 0 && lim <= max ? `
    <line x1="${ml}" x2="${W - mr}" y1="${y(lim).toFixed(1)}" y2="${y(lim).toFixed(1)}"
      stroke="${GRAF.s1c}" stroke-width="1" stroke-dasharray="5 4" opacity=".7"/>
    <text x="${W - mr}" y="${(y(lim) - 6).toFixed(1)}" text-anchor="end"
      font-size="10" fill="${GRAF.muda}">${esc(opc.limiteRotulo || 'limite')}</text>` : '';

  /* Grade: três linhas, sólidas e finas. Tracejado aqui só serviria para
     fingir que o valor é projeção. */
  const ticks = [0, max / 2, max];
  const grade = ticks.map(v => `<line x1="${ml}" x2="${W - mr}" y1="${y(v).toFixed(1)}"
      y2="${y(v).toFixed(1)}" stroke="${GRAF.grade}" stroke-width="1"/>
    <text x="${ml - 10}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end"
      font-size="10.5" fill="${GRAF.fraca}">${esc(F(v))}</text>`).join('');

  /* Quem ganha rótulo fixo: o pico e o último ponto. Os dois somem se o valor
     for zero — "R$ 0" escrito no chão do gráfico não informa nada. */
  const iMax = pontos.reduce((m, p, i) => (+p.v > +pontos[m].v ? i : m), 0);
  const rotulados = new Set([iMax, n - 1].filter(i => +pontos[i].v > 0));

  const marcas = pontos.map((p, i) => {
    const px = x(i), py = y(p.v);
    const larguraCol = pw / Math.max(n - 1, 1);
    const hx = Math.max(ml - 4, px - larguraCol / 2);
    const hw = Math.min(larguraCol, W - mr - hx + 4);

    /* O comentário e o valor sobem juntos, um em cima do outro, e só descem
       quando não há teto. O texto leva um contorno na cor do cartão
       (paint-order: o contorno é pintado ANTES do preenchimento), que é o que
       o deixa legível quando cai em cima da própria linha — sem isso, o
       comentário do pico sempre cruza a descida do gráfico. */
    const ancora = px > W - mr - 76 ? 'end' : px < ml + 50 ? 'start' : 'middle';
    const halo = `stroke="${GRAF.fundo}" stroke-width="3.5" paint-order="stroke"`;
    const temRotulo = rotulados.has(i);
    const acima = py - mt >= (temRotulo && p.nota ? 44 : 30);
    const yNota = acima ? py - 15 : py + 22;
    const yValor = acima ? py - (p.nota ? 30 : 15) : py + (p.nota ? 37 : 22);

    const anotacao = p.nota
      ? `<text x="${px.toFixed(1)}" y="${yNota.toFixed(1)}" text-anchor="${ancora}"
           font-size="10.5" fill="${GRAF.muda}" ${halo}>${esc(p.nota)}</text>` : '';

    const rotulo = temRotulo
      ? `<text x="${px.toFixed(1)}" y="${yValor.toFixed(1)}" text-anchor="${ancora}"
           font-size="11.5" font-weight="700" fill="${GRAF.tinta}" ${halo}>${esc(F(p.v))}</text>` : '';

    /* A dica do hover: retângulo de alvo largo (a coluna inteira), não o ponto
       de 8px. Ninguém acerta um alvo de 8px com o mouse em movimento. */
    const txt = `${p.r} · ${F(p.v)}`;
    const tw = Math.max(64, txt.length * 6.4 + 18);
    const tx = Math.min(Math.max(px - tw / 2, 4), W - tw - 4);
    const ty2 = Math.max(py - 46, 4);

    return `<g class="gl-col">
      <rect class="gl-hit" x="${hx.toFixed(1)}" y="${mt}" width="${hw.toFixed(1)}" height="${ph}" fill="transparent"/>
      <line class="gl-cross" x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${mt}" y2="${mt + ph}"
        stroke="${GRAF.s1}" stroke-width="1" opacity="0"/>
      ${anotacao}${rotulo}
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${GRAF.s1c}"
        stroke="${GRAF.fundo}" stroke-width="2"/>
      <g class="gl-tip" transform="translate(${tx.toFixed(1)},${ty2.toFixed(1)})">
        <rect width="${tw.toFixed(0)}" height="26" rx="6" fill="#1A1728" stroke="${GRAF.grade}"/>
        <text x="${(tw/2).toFixed(0)}" y="17" text-anchor="middle" font-size="11.5"
          fill="${GRAF.tinta}">${esc(txt)}</text>
      </g></g>`;
  }).join('');

  const eixoX = pontos.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${H - 12}"
     text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}"
     font-size="10.5" fill="${GRAF.fraca}">${esc(p.r)}</text>`).join('');

  return `<div class="graf">
   <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opc.titulo || 'Gráfico de linha')}">
    ${grade}${referencia}
    <path d="${area}" fill="${GRAF.s1}" fill-opacity=".10"/>
    <polyline points="${linha}" fill="none" stroke="${GRAF.s1}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    ${marcas}${eixoX}
   </svg>
   <details class="graf-tab"><summary>Ver os números</summary>
    <table><thead><tr><th>${esc(opc.coluna || 'Período')}</th><th>${esc(opc.valor || 'Valor')}</th></tr></thead>
    <tbody>${pontos.map(p => `<tr><td>${esc(p.r)}</td>
      <td style="font-weight:600">${esc(F(p.v))}</td></tr>`).join('')}</tbody></table>
   </details></div>`;
}

/* ── Barra fina ──────────────────────────────────────────────────────────────
   Uma linha de leitura: rótulo à esquerda, trilho fino no meio, número à
   direita. O valor NÃO vai dentro do preenchimento — dentro ele some quando a
   barra é curta, e é o que obrigava aquele "mínimo de 6%" de largura só para
   caber o texto. Fora, a barra pode ir a zero e continuar legível. */
function barraFina(linhas, opc){
  opc = opc || {};
  if(!linhas.length) return emptyState(opc.vazio || 'Sem dados no período', '');
  const max = Math.max(...linhas.map(l => +l.v || 0), 1);
  return `<div class="barras">${linhas.map(l => `<div class="bfx">
    <div class="bfx-l">${esc(l.r)}</div>
    <div class="bfx-t"><i style="width:${((+l.v || 0) / max * 100).toFixed(1)}%${
      l.cor ? `;background:${l.cor}` : ''}"></i></div>
    <div class="bfx-n">${l.txt}</div></div>`).join('')}</div>`;
}

/* ── Duas séries na mesma escala ─────────────────────────────────────────────
   Só para medidas da MESMA natureza — proposta emitida contra proposta ganha,
   as duas em contagem. Nunca dois eixos: quando as escalas são diferentes, o
   alinhamento entre elas é arbitrário e o gráfico inventa uma correlação que
   não existe nos dados. Duas medidas de grandeza diferente pedem dois
   gráficos, não dois eixos.

   Com duas séries a legenda é obrigatória: identidade não pode depender só de
   cor. Cada linha ainda leva o rótulo do último ponto, que é onde o olho
   naturalmente termina o percurso. */
function graficoDuasLinhas(a, b, rotA, rotB, fmt, opc){
  opc = opc || {};
  const F = fmt || (v => String(v));
  const n = Math.max(a.length, b.length);
  if(!n) return emptyState(opc.vazio || 'Sem dados no período', '');

  const W = 720, H = opc.altura || 250;
  const ml = opc.ml || 52, mr = 26, mt = 34, mb = 34;
  const pw = W - ml - mr, ph = H - mt - mb;
  const max = _teto(Math.max(...a.map(p => +p.v || 0), ...b.map(p => +p.v || 0)));
  const x = i => n === 1 ? ml + pw / 2 : ml + (i / (n - 1)) * pw;
  const y = v => mt + ph - ((+v || 0) / max) * ph;
  const pontos = l => l.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  const ticks = [0, max / 2, max];
  const grade = ticks.map(v => `<line x1="${ml}" x2="${W - mr}" y1="${y(v).toFixed(1)}"
      y2="${y(v).toFixed(1)}" stroke="${GRAF.grade}" stroke-width="1"/>
    <text x="${ml - 9}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end"
      font-size="10.5" fill="${GRAF.fraca}">${esc(F(v))}</text>`).join('');

  const serie = (l, cor) => `
    <polyline points="${pontos(l)}" fill="none" stroke="${cor}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    ${l.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4"
      fill="${cor}" stroke="${GRAF.fundo}" stroke-width="2"/>`).join('')}`;

  const fim = (l, cor) => {
    const i = l.length - 1;
    return `<text x="${(x(i) - 8).toFixed(1)}" y="${(y(l[i].v) - 10).toFixed(1)}"
      text-anchor="end" font-size="11.5" font-weight="700" fill="${GRAF.tinta}"
      stroke="${GRAF.fundo}" stroke-width="3.5" paint-order="stroke">${esc(F(l[i].v))}</text>`;
  };

  const alvo = a.map((p, i) => {
    const px = x(i), lc = pw / Math.max(n - 1, 1);
    const txt = `${p.r} · ${rotA} ${F(p.v)} · ${rotB} ${F((b[i] || {}).v || 0)}`;
    const tw = Math.max(96, txt.length * 6.2 + 18);
    const tx = Math.min(Math.max(px - tw / 2, 4), W - tw - 4);
    return `<g class="gl-col">
      <rect class="gl-hit" x="${Math.max(ml - 4, px - lc / 2).toFixed(1)}" y="${mt}"
        width="${Math.min(lc, W - mr).toFixed(1)}" height="${ph}" fill="transparent"/>
      <line class="gl-cross" x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${mt}" y2="${mt + ph}"
        stroke="${GRAF.s1}" stroke-width="1" opacity="0"/>
      <g class="gl-tip" transform="translate(${tx.toFixed(1)},${Math.max(mt - 26, 2).toFixed(1)})">
        <rect width="${tw.toFixed(0)}" height="24" rx="6" fill="#1A1728" stroke="${GRAF.grade}"/>
        <text x="${(tw/2).toFixed(0)}" y="16" text-anchor="middle" font-size="11"
          fill="${GRAF.tinta}">${esc(txt)}</text></g></g>`;
  }).join('');

  const eixoX = a.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${H - 12}"
     text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}"
     font-size="10.5" fill="${GRAF.fraca}">${esc(p.r)}</text>`).join('');

  return `<div class="graf">
   <div class="legenda">
    <span><i style="background:${GRAF.s1}"></i>${esc(rotA)}</span>
    <span><i style="background:${GRAF.s2}"></i>${esc(rotB)}</span></div>
   <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opc.titulo || 'Gráfico de linhas')}">
    ${grade}
    ${serie(a, GRAF.s1)}${serie(b, GRAF.s2)}
    ${fim(a, GRAF.s1)}${fim(b, GRAF.s2)}
    ${alvo}${eixoX}
   </svg>
   <details class="graf-tab"><summary>Ver os números</summary>
    <table><thead><tr><th>${esc(opc.coluna || 'Período')}</th>
     <th>${esc(rotA)}</th><th>${esc(rotB)}</th></tr></thead>
    <tbody>${a.map((p, i) => `<tr><td>${esc(p.r)}</td>
      <td style="font-weight:600">${esc(F(p.v))}</td>
      <td style="font-weight:600">${esc(F((b[i] || {}).v || 0))}</td></tr>`).join('')}</tbody></table>
   </details></div>`;
}
