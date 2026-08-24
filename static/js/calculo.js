/* ════════════════════════════════════════════════════════════════════════════
   MOTOR DE CÁLCULO — espelho de calculo.py
   ════════════════════════════════════════════════════════════════════════════

   Este arquivo e o calculo.py do servidor têm que devolver EXATAMENTE o mesmo
   número. Não é preciosismo: a tela mostra um valor, o PDF mostra outro, e o
   vendedor descobre a diferença no meio da reunião.

   Três decisões seguram essa igualdade:

     · tudo em centavos inteiros. Float em dinheiro é o motivo de a soma das
       linhas não bater com o total (2.5);
     · `arred()` é meio-para-cima, igual ao Math.round — e o Python teve que ser
       ajustado, porque o round() de lá arredonda para o par;
     · o rateio usa o método do maior resto, então a soma das fatias é sempre o
       total, ao centavo.

   Quem quiser conferir: `GET /api/propostas/<id>/calculo` devolve os totais do
   servidor. A tela de proposta compara sozinha e avisa se divergir.
   ════════════════════════════════════════════════════════════════════════════ */

const Calc = (() => {

const arred = x => Math.round(x);
const cents = v => (v === null || v === undefined || v === '') ? 0
                 : (isNaN(parseFloat(v)) ? 0 : arred(parseFloat(v) * 100));
const nreal = (v, p = 0) => { const f = parseFloat(String(v).replace(',', '.')); return isNaN(f) ? p : f; };

/* Distribui `total` centavos proporcionalmente a `pesos`, sem perder centavo. */
function ratear(total, pesos){
  const soma = pesos.reduce((s, p) => s + p, 0);
  if(!pesos.length || soma <= 0) return pesos.map(() => 0);
  const brutos = pesos.map(p => total * p / soma);
  const parte = brutos.map(b => Math.floor(b));
  let resto = total - parte.reduce((s, p) => s + p, 0);
  const ordem = brutos.map((b, i) => [b - parte[i], i])
                      .sort((a, b) => b[0] - a[0]).map(x => x[1]);
  for(let k = 0; k < resto; k++) parte[ordem[k % ordem.length]]++;
  return parte;
}

/* ── horas ── */
const minDoDia = (hhmm, p = 0) => {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (+m[1] % 24) * 60 + (+m[2] % 60) : p;
};

function duracaoTurnoH(turno){
  if(!turno) return 0;
  const ini = minDoDia(turno.hora_inicio, 0), fim = minDoDia(turno.hora_fim, 0);
  let dur = fim - ini;
  if(dur <= 0) dur += 1440;                       /* o turno vira o dia */
  dur -= Math.trunc(nreal(turno.intervalo_min, 0));
  return Math.max(dur, 0) / 60;
}

/* Horas de RELÓGIO do turno dentro da janela noturna (22h–5h por padrão).
   Minuto a minuto porque tanto a janela quanto o turno viram a meia-noite. */
function horasNoturnasH(turno, iniNot = '22:00', fimNot = '05:00'){
  if(!turno) return 0;
  const ini = minDoDia(turno.hora_inicio, 0), fim = minDoDia(turno.hora_fim, 0);
  let dur = fim - ini;
  if(dur <= 0) dur += 1440;
  const nI = minDoDia(iniNot, 1320), nF = minDoDia(fimNot, 300);
  const dentro = m => { m = ((m % 1440) + 1440) % 1440;
    return nI <= nF ? (m >= nI && m < nF) : (m >= nI || m < nF); };
  let n = 0;
  for(let k = 0; k < dur; k++) if(dentro(ini + k)) n++;
  return n / 60;
}

/* ── fator de funcionários por posto (2.3) ── */
function fatorEscala(escala, turno, cfg){
  if(!escala) return {fator:1, det:{modo:'ausente', fator:1}};
  if((escala.fator_modo || 'manual') !== 'calculado'){
    const f = nreal(escala.fator_func, 1) || 1;
    return {fator:f, det:{modo:'manual', fator:f}};
  }
  const horasDia = nreal(escala.horas_posto_dia, 0) || duracaoTurnoH(turno);
  const dias = nreal(escala.dias_semana, 7) || 7;
  const contratual = nreal(escala.horas_semanais, 44) || 44;
  const base = contratual ? (horasDia * dias) / contratual : 1;
  const absPct = nreal(escala.absenteismo_pct, 0);
  const ferPct = escala.cobertura_ferias ? nreal(cfg.cobertura_ferias_pct, 9.0909) : 0;
  let fator = base * (1 + absPct/100) * (1 + ferPct/100);
  fator = Math.round(Math.max(fator, 0.01) * 1000) / 1000;
  return {fator, det:{modo:'calculado',
    horas_posto_dia:Math.round(horasDia*100)/100, dias_semana:dias,
    horas_semanais:contratual, horas_posto_semana:Math.round(horasDia*dias*100)/100,
    fator_base:Math.round(base*1000)/1000, absenteismo_pct:absPct,
    cobertura_ferias_pct:ferPct, fator}};
}

/* ── adicionais legais ──────────────────────────────────────────────────────
   P30/I20/I40 têm percentual em lei. O que muda é a BASE: periculosidade e
   acúmulo incidem sobre o salário do cargo; insalubridade, sobre o que a
   convenção mandar (2.2) — na maioria delas, o salário mínimo. */
const ADICIONAIS = [
  {cod:'P30', nome:'Periculosidade',            pct:30,   base:'salario'},
  {cod:'I20', nome:'Insalubridade grau médio',  pct:20,   base:'insalubridade'},
  {cod:'I40', nome:'Insalubridade grau máximo', pct:40,   base:'insalubridade'},
  {cod:'A20', nome:'Acúmulo de função',         pct:null, base:'salario'},
];
const infoAdic = cod => ADICIONAIS.find(a => a.cod === cod);

function baseInsalubridade(cct, cfg, salarioC){
  const modo = (cct && cct.insalubridade_base) || cfg.insalubridade_base || 'minimo';
  if(modo === 'salario') return {base:salarioC, nome:'salário do cargo'};
  if(modo === 'piso'){
    const piso = cents(cct && cct.piso_categoria);
    return {base:piso || salarioC, nome:'piso da categoria'};
  }
  const min = cents(cct && cct.salario_minimo) || cents(cfg.salario_minimo);
  return {base:min || salarioC, nome:'salário mínimo'};
}

/* ── benefícios com desconto legal (2.4) ── */
/* `diasEscala` é quantos dias o EMPREGADO trabalha no mês naquela escala: 21,7
   em 5x2, 15,2 em 12x36. Vale-refeição e vale-transporte são por dia
   trabalhado, então o mesmo benefício custa ~30% menos num posto 12x36 — e é
   uma vantagem competitiva real da escala, que se perde quando o sistema fixa
   os dias no cadastro. Sem escala informada, cai no dias_mes do cadastro. */
function calcBeneficio(ben, salarioC, cfg, diasEscala){
  let valorC = cents(ben.valor);
  if((ben.unid || 'mês') === 'dia'){
    const dias = nreal(diasEscala, 0) > 0 ? nreal(diasEscala, 0) : nreal(ben.dias_mes, 22);
    valorC = arred(valorC * dias);
  }
  const tipo = ben.desconto_tipo || 'nenhum';
  let p = nreal(ben.desconto_pct, 0), descontoC = 0;
  if(tipo === 'pct_salario'){
    if(p <= 0) p = nreal(cfg.vt_desconto_pct, 6);
    descontoC = Math.min(arred(salarioC * p / 100), valorC);
  } else if(tipo === 'pct_valor'){
    descontoC = arred(valorC * p / 100);
  }
  descontoC = Math.max(0, Math.min(descontoC, valorC));
  return {id:ben.id, nome:ben.nome, valorC, descontoC, custoC:valorC - descontoC,
          tipo, pct:p, unid:ben.unid || 'mês',
          dias: (ben.unid === 'dia') ? (nreal(diasEscala,0) || nreal(ben.dias_mes,22)) : 0};
}

/* ── adicional noturno proporcional (2.1) ───────────────────────────────────
   Não incide sobre o salário inteiro: incide sobre as horas entre 22h e 5h, e
   cada 52'30" delas valem uma hora (hora ficta, art. 73 da CLT). Um porteiro
   19h–7h tem 7 horas noturnas numa jornada líquida de 11h — 64%, não 100%. */
function calcNoturno(turno, cct, cfg, salarioC, horasCargo){
  const vazio = {pct:0, valorC:0, horasRelogio:0, horasFicta:0, proporcao:0,
                 valorHoraC:0, marcado:!!(turno && turno.noturno), aviso:''};
  if(!turno) return vazio;
  const p = nreal(cfg.adicional_noturno, 20);
  if(p <= 0) return vazio;

  const hRel = horasNoturnasH(turno, cfg.noturno_hora_inicio || '22:00',
                                     cfg.noturno_hora_fim || '05:00');
  if(hRel <= 0){
    if(turno.noturno) vazio.aviso = `Turno marcado como noturno, mas o horário `
      + `${turno.hora_inicio}–${turno.hora_fim} não tem horas entre 22h e 5h.`;
    return vazio;
  }
  const dur = duracaoTurnoH(turno);
  if(dur <= 0) return vazio;

  const reduzida = nreal(cfg.noturno_hora_reduzida, 52.5) || 52.5;
  const horasMes = nreal(horasCargo, 0) || nreal(cct && cct.horas_mensais, 220) || 220;
  const valorHoraC = salarioC / horasMes;
  const proporcao = Math.min(hRel / dur, 1);
  const horasNotMes = horasMes * proporcao * (60 / reduzida);
  return {pct:p, valorC:arred(valorHoraC * (p/100) * horasNotMes),
          horasRelogio:Math.round(hRel*100)/100,
          horasFicta:Math.round(hRel*60/reduzida*100)/100,
          horasMesFicta:Math.round(horasNotMes*100)/100,
          proporcao:Math.round(proporcao*10000)/10000,
          valorHoraC:arred(valorHoraC), marcado:!!turno.noturno, aviso:''};
}

/* ── MÓDULO 2.2 · encargos sociais por regime ────────────────────────────────
   O que muda entre os regimes não é só a alíquota do faturamento: muda a folha.
   O Simples do Anexo IV é isento das contribuições a TERCEIROS (salário-
   educação, INCRA, sistema S, SEBRAE) — 5,80 pontos sobre toda a folha, que é
   normalmente mais do que a margem líquida do contrato. A CPRB troca 20% de
   INSS na folha por 2,70% sobre a receita.

   RAT efetivo = RAT nominal × FAP. Os CNAEs de limpeza (8121-4/00) e vigilância
   (8011-1/01) são grau de risco 3 → RAT 3%. O FAP vai de 0,5 a 2,0 e é a maior
   alavanca de custo que a empresa controla sozinha. */
function encargosRegime(regime, ratEf){
  const r = String(regime || 'presumido').toLowerCase();
  if(r === 'simples') return {inss:20, rat:ratEf, terceiros:0,   fgts:8,
    total:28 + ratEf, terceirosIsento:true};
  if(r === 'cprb')    return {inss:10, rat:ratEf, terceiros:5.8, fgts:8,
    total:23.8 + ratEf, cprbReceita:2.7};
  return {inss:20, rat:ratEf, terceiros:5.8, fgts:8, total:33.8 + ratEf};
}

/* ── MÓDULO 3 · provisão para rescisão ───────────────────────────────────────
   Os 6,36% da IN SEGES são referência, não verdade: valem para um turnover que
   quase nenhuma empresa de limpeza em SP tem. Aqui a provisão é calibrada pelo
   turnover informado — é o que separa quem ganha concorrência de quem paga
   para trabalhar.

     multa de 40% do FGTS   8% × 40% × 85% dos desligamentos sem justa causa
     aviso indenizado       turnover × parcela indenizada × 1,15 salário ÷ 12
     FGTS sobre o aviso     8% do aviso indenizado
     aviso trabalhado       turnover × parcela trabalhada × 25% de um mês
     encargos do trabalhado submódulo 2.2 sobre o aviso trabalhado          */
function modulo3(turnoverPct, encPct, pctIndenizado){
  const t = nreal(turnoverPct, 60) / 100;
  const pInd = nreal(pctIndenizado, 35) / 100;
  const enc = nreal(encPct, 36.8) / 100;
  const multa   = 0.08 * 0.40 * 0.85;
  const apInd   = t * pInd * (1.15 / 12);
  const fgtsAp  = 0.08 * apInd;
  const apTrab  = t * (1 - pInd) * (0.25 / 12);
  const encAp   = enc * apTrab;
  return {pct:(multa + apInd + fgtsAp + apTrab + encAp) * 100,
          det:{multa:multa*100, apInd:apInd*100, fgtsAp:fgtsAp*100,
               apTrab:apTrab*100, encAp:encAp*100, turnover:t*100, pInd:pInd*100}};
}

/* ── MÓDULO 4 · custo de reposição do ausente ────────────────────────────────
   ⚠ A trava anti-dupla-contagem. A cobertura entra OU aqui, OU no headcount
   (o fator da escala). Nunca nas duas. Contar duas vezes infla o preço em
   ~13% e é o erro nº 1 do setor — perde-se a concorrência sem saber por quê.
   Quem decide é `cobertura_modo` nas configurações. */
function modulo4(absenteismoPct, encPct){
  const abs = nreal(absenteismoPct, 3.5) / 100;
  const itens = {ferias:0.0833, ausencias:0.0082, paternidade:0.0002,
                 acidente:0.0003, maternidade:0.0003, absenteismo:abs};
  const soma = Object.values(itens).reduce((s, v) => s + v, 0);
  return {pct:soma * 100, det:itens, encPct:nreal(encPct, 36.8)};
}

/* ── MÓDULO 6 · tributos sobre o faturamento ─────────────────────────────────
   `T` é a soma das alíquotas que incidem sobre a RECEITA, e é ele que entra no
   gross-up. Duas decisões mudam o número:

     · o REGIME (presumido, real, Simples do Anexo IV, CPRB);
     · o MODO. Em licitação, IRPJ e CSLL não entram no campo de tributos — o
       TCU veda (Acórdão 950/2007-Plenário), porque são tributos sobre o lucro
       do contratado, não custo do contrato. Em proposta privada entram, senão
       a margem que sobra não é a que foi prometida.

   O mesmo custo dá preços ~13% diferentes nos dois modos. */
function tributos(o){
  const modo = o.modo === 'licitacao' ? 'licitacao' : 'privado';
  const iss = nreal(o.iss, 2), i = nreal(o.credito, 10) / 100;
  const m = nreal(o.lucroPct, 10) / 100;
  const regime = String(o.regime || 'presumido').toLowerCase();

  if(regime === 'simples'){
    /* Sem RBT12 informado não há faixa: o cálculo cairia na primeira (4,5%) e
       daria um preço bonito que não existe. Melhor assumir o teto e avisar —
       errar para MAIS não perde dinheiro, errar para menos sim. */
    const rbtInformado = nreal(o.rbt12, 0) > 0;
    const R = rbtInformado ? nreal(o.rbt12, 0) : 4800000;
    const faixas = [[180000,.045,0],[360000,.09,8100],[720000,.102,12420],
                    [1800000,.14,39780],[3600000,.22,183780],[4800000,.33,828000]];
    let f = faixas[faixas.length - 1];
    for(const x of faixas) if(R <= x[0]){ f = x; break; }
    const ef = (R * f[1] - f[2]) / R * 100;
    return {T:ef/100, modo, regime, rbtInformado,
      detalhe:[[rbtInformado ? 'DAS Anexo IV — alíquota efetiva sobre o RBT12'
                             : 'DAS Anexo IV — SEM RBT12 informado, assumida a última faixa', ef]],
      aviso: rbtInformado ? '' : 'Informe o RBT12 (receita bruta dos últimos 12 '
           + 'meses) para o Simples calcular a faixa certa. Sem ele, o sistema '
           + 'assume a alíquota da última faixa, que é a mais cara.',
      nota:'CPP de 20% + RAT ficam FORA do DAS, recolhidos em GPS, e já estão '
         + 'no submódulo 2.2. Em compensação há isenção de terceiros (5,80 p.p. '
         + 'sobre toda a folha). Acima de R$ 3,6 mi de RBT12 o ISS sai do DAS.'};
  }

  const d = [];
  if(regime === 'real'){
    d.push(['PIS não cumulativo, líquido de créditos', 1.65 * (1 - i)]);
    d.push(['COFINS não cumulativo, líquido de créditos', 7.60 * (1 - i)]);
  } else {
    d.push(['PIS cumulativo', 0.65]);
    d.push(['COFINS cumulativo', 3.00]);
  }
  d.push(['ISS', iss]);
  if(regime === 'cprb') d.push(['CPRB 2026 — 2,70% da receita bruta', 2.70]);
  if(modo === 'privado'){
    if(regime === 'real'){
      d.push(['IRPJ 15% sobre o lucro real', 15 * m]);
      d.push(['Adicional de IRPJ 10%', 10 * m * 0.85]);
      d.push(['CSLL 9% sobre o lucro real', 9 * m]);
    } else {
      d.push(['IRPJ 15% × presunção de 32%', 4.80]);
      d.push(['Adicional de IRPJ 10% × 32%', 3.20]);
      d.push(['CSLL 9% × presunção de 32%', 2.88]);
    }
  }
  const T = d.reduce((s, x) => s + x[1], 0) / 100;
  return {T, modo, regime, detalhe:d,
    nota: modo === 'licitacao'
      ? 'Modo licitação: IRPJ e CSLL fora do campo de tributos (TCU, Acórdão '
      + '950/2007-Plenário). O lucro de planilha precisa cobri-los.'
      : (regime === 'real'
        ? 'Insumos creditáveis: ' + nreal(o.credito, 10) + '% da receita. A FOLHA '
        + 'NÃO gera crédito de PIS/COFINS — é por isso que o Real ganha do '
        + 'Presumido só quando a margem é baixa.'
        : 'Presunção de 32%: paga-se IRPJ e CSLL como se a margem fosse 32%, '
        + 'qualquer que seja a margem real.')};
}

/* Ponto de indiferença entre Lucro Real e Presumido, em % de margem contábil:
   abaixo dele o Real é mais barato. 34%×m + 9,25%×(1−i) = 10,88% + 3,65%. */
function pontoIndiferenca(creditoPct){
  const i = nreal(creditoPct, 10) / 100;
  return (0.1088 + 0.0365 - 0.0925 * (1 - i)) / 0.34 * 100;
}

/* ── os parâmetros de precificação ───────────────────────────────────────────
   A proposta manda; a configuração é o padrão. Enquanto não existirem colunas
   por proposta para regime, FAP, turnover e custos indiretos, tudo vem de
   Configurações — e no dia em que existirem, o motor já lê sem mudar nada. */
function paramsPreco(p, cfg){
  p = p || {}; cfg = cfg || {};
  const esc = (a, b, d) => {
    const x = (a !== undefined && a !== null && a !== '') ? a : b;
    return (x === undefined || x === null || x === '') ? d : x;
  };
  const n = (a, b, d) => nreal(esc(a, b, d), d);
  const regime = String(esc(p.regime, cfg.regime_tributario, 'presumido')).toLowerCase();
  const rat = n(p.rat, cfg.rat_nominal, 3), fap = n(p.fap, cfg.fap, 1);
  const ratEf = Math.round(rat * fap * 10000) / 10000;
  const enc = encargosRegime(regime, ratEf);
  /* `encargos` gravado na proposta continua sendo a palavra final: é a soma
     dos encargos da própria convenção, quando ela publica a tabela. Vazio,
     quem manda é o regime. */
  const encManual = nreal(p.encargos, 0);
  return {regime, rat, fap, ratEf, encargos:enc,
    encPct: encManual > 0 ? encManual : enc.total,
    encFonte: encManual > 0 ? 'convenção' : 'regime ' + regime,
    turnover: n(p.turnover, cfg.turnover_pct, 60),
    apIndenizado: n(null, cfg.aviso_indenizado_pct, 35),
    absenteismo: n(p.absenteismo, cfg.absenteismo_pct, 3.5),
    ci: n(p.ci_pct, cfg.custos_indiretos_pct, 8),
    lucro: n(p.markup, cfg.proposta_markup, 10),
    iss: n(p.iss, cfg.iss_pct, 2),
    credito: n(p.credito_pct, cfg.insumos_credito_pct, 10),
    rbt12: n(p.rbt12, cfg.rbt12, 0),
    modo: String(esc(p.modo_preco, cfg.modo_preco, 'privado')).toLowerCase(),
    coberturaModo: String(esc(p.cobertura_modo, cfg.cobertura_modo, 'headcount')).toLowerCase(),
    pisoReduzido: n(null, cfg.piso_jornada_reduzida_pct, 60)};
}

/* ── um posto, módulo a módulo ── */
function calcItem(item, proposta, ctx){
  const cargo = ctx.cargos[String(item.cargoId)];
  if(!cargo) return null;
  const escala = ctx.escalas[String(item.escalaId)];
  const turno  = ctx.turnos[String(item.turnoId)];
  /* A convenção é DO POSTO, não da proposta. Um contrato de facilities mistura
     categorias — a portaria vem pela CCT do asseio e a vigilância pela dela —
     e cada uma tem piso, benefício, base de insalubridade e divisor de horas
     próprios. `item.cctId` manda; sem ele, vale a da proposta. */
  const cct = (item.cctId && ctx.ccts && ctx.ccts[String(item.cctId)])
            || ctx.cct || {};
  const cfg = ctx.config || {};
  const par = paramsPreco(proposta, cfg);

  const postos = Math.trunc(nreal(item.qtd, 0));
  const {fator, det} = fatorEscala(escala, turno, cfg);
  /* A TRAVA ANTI-DUPLA-CONTAGEM, e a parte dela que é fácil errar.
     O fator da escala tem DUAS camadas somadas:

       · a estrutural — quantos empregados o posto exige por desenho. Um
         plantão 12x36 precisa de 2, um 24×7 de 4. Isso não é cobertura, é
         aritmética de jornada, e vale sempre;
       · a de cobertura — férias, absenteísmo e afastamentos, que fazem o 2,00
         virar 2,17.

     Só a SEGUNDA pode migrar para o Módulo 4. Zerar o fator inteiro (o que
     este código fazia) tirava os 2 empregados do plantão e subprecificava um
     posto 12x36 pela metade. Com o Módulo 4 ligado, aplica-se o fator BASE. */
  const fatorAplicado = par.coberturaModo === 'modulo4'
    ? (nreal(det.fator_base, 0) || fator) : fator;
  const func = postos * fatorAplicado;

  /* 1.A — jornada abaixo de 4h paga 60% do piso (cláusula da CCT do asseio);
     a de 6h paga piso integral. 22h/semana é a fronteira das 4h diárias. */
  const salarioPisoC = cents(cargo.salario);
  const hSem = nreal(escala && escala.horas_semanais, 44);
  const jornadaCurta = hSem > 0 && hSem < 22;
  const pisoReduzido = nreal(cct.piso_jornada_reduzida_pct, 0) || par.pisoReduzido;
  const salarioC = jornadaCurta ? arred(salarioPisoC * pisoReduzido / 100)
                                : salarioPisoC;

  /* 1.B e 1.C — periculosidade e insalubridade NÃO se acumulam (art. 193 §2º
     da CLT): paga-se a maior das duas, e a outra fica registrada como afastada
     para a memória de cálculo poder mostrar por quê. Acúmulo de função é outra
     natureza e soma normalmente. */
  const candidatos = [];
  (item.adicionais || []).forEach(cod => {
    const info = infoAdic(cod);
    if(!info) return;
    const pc = info.pct !== null ? info.pct : nreal(item.a20, 0);
    if(pc <= 0) return;
    const b = info.base === 'insalubridade' ? baseInsalubridade(cct, cfg, salarioC)
                                            : {base:salarioC, nome:'salário do cargo'};
    candidatos.push({cod, nome:info.nome, pct:pc, baseC:b.base, baseNome:b.nome,
                     valorC:arred(b.base * pc / 100),
                     excludente:(cod === 'P30' || cod.charAt(0) === 'I')});
  });
  const excl = candidatos.filter(a => a.excludente);
  const adics = [], afastados = [];
  if(excl.length > 1){
    const maior = excl.reduce((m, a) => (a.valorC > m.valorC ? a : m), excl[0]);
    adics.push(maior);
    excl.forEach(a => { if(a !== maior) afastados.push(a); });
  } else adics.push(...excl);
  adics.push(...candidatos.filter(a => !a.excludente));
  const valorAdicC = adics.reduce((s, a) => s + a.valorC, 0);

  const noturno = calcNoturno(turno, cct, cfg, salarioC, cargo.horas_mensais);

  /* 1.G — posto unipessoal sem quem cubra o intervalo: o período é indenizado
     com adicional de 50% (art. 71 §4º da CLT). Fingir que não existe é o
     passivo mais barato de evitar e o mais caro de descobrir depois. */
  /* O divisor pode ser do cargo: na CCT dos bombeiros o operacional tem 180
     h/mês e a chefia 220, dentro da mesma convenção. */
  const horasMes = nreal(cargo.horas_mensais, 0) || nreal(cct.horas_mensais, 220) || 220;
  const fBase = nreal(det.fator_base, 0) || nreal(escala && escala.fator_func, 1) || 1;
  const plantoes = (nreal(escala && escala.dias_semana, 5) * 4.345) / Math.max(fBase, 1);
  const intervaloC = item.intervalo ? arred((salarioC / horasMes) * 1.5 * plantoes) : 0;

  const M1 = salarioC + valorAdicC + noturno.valorC + intervaloC;

  /* 2.1 — 13º (8,33%) + terço de férias (2,78%). As férias em si não entram:
     o salário do período já está no Módulo 1, e o custo do SUBSTITUTO é do
     Módulo 4. */
  const s21 = arred(M1 * 0.1111);
  /* 2.2 — encargos sobre M1 + 2.1, e não só sobre M1: a provisão de 13º e
     terço também é base de INSS, RAT, terceiros e FGTS. */
  const s22 = arred((M1 + s21) * par.encPct / 100);

  const benefs = (item.beneficios || [])
    .map(bid => ctx.beneficios[String(bid)])
    .filter(Boolean)
    .map(b => calcBeneficio(b, salarioC, cfg, plantoes));
  const s23 = benefs.reduce((s, b) => s + b.custoC, 0);
  const M2 = s21 + s22 + s23;

  const m3 = modulo3(par.turnover, par.encPct, par.apIndenizado);
  const M3 = arred((M1 + s21) * m3.pct / 100);

  let M4 = 0, m4 = null;
  if(par.coberturaModo === 'modulo4'){
    m4 = modulo4(par.absenteismo, par.encPct);
    M4 = arred((M1 + s21) * (m4.pct / 100) * (1 + par.encPct / 100)
             + s23 * (m4.pct / 100) * 0.5);
  }

  const unitFuncC = M1 + M2 + M3 + M4;
  const unitPostoC = arred(unitFuncC * fatorAplicado);

  return {cargo, escala, turno, cct, postos, fator, fatorAplicado, fatorDetalhe:det, func,
    jornadaCurta, salarioPisoC,
    baseC:salarioC, adics, afastados, pctAdic:adics.reduce((s,a)=>s+a.pct,0), valorAdicC,
    noturno, pctNoturno:noturno.pct, valorNoturnoC:noturno.valorC, intervaloC,
    /* nomes antigos, mantidos porque a tela e o documento leem por eles */
    salarioTotalC:M1, encargosC:s21 + s22, encargosPct:par.encPct,
    beneficios:benefs, benefC:s23,
    benefBrutoC:benefs.reduce((s,b)=>s+b.valorC,0),
    benefDescontoC:benefs.reduce((s,b)=>s+b.descontoC,0),
    /* a cascata dos módulos, para a planilha aberta */
    m1:M1, m2:{s21, s22, s23, total:M2}, m3:{pct:m3.pct, det:m3.det, total:M3},
    m4:{pct:m4 ? m4.pct : 0, det:m4 ? m4.det : null, total:M4,
        modo:par.coberturaModo},
    unitFuncC, unitPostoC, custoC:unitPostoC * postos,
    obs:item.obs || ''};
}

/* ── MÓDULO 5 · insumos ──────────────────────────────────────────────────────
   Uniforme, EPI, material de limpeza e exames. Era a linha que faltava: até
   aqui material só existia como equipamento, e as duas coisas não são iguais.
   Equipamento é bem durável, com o valor cheio caindo todo mês. Insumo é
   reposição — o que importa é de quanto em quanto tempo se troca.

   Por isso cada material tem um PRAZO DE REPOSIÇÃO em meses, e o custo mensal
   é o valor de aquisição dividido por ele. Um conjunto de uniforme de R$ 190
   trocado a cada 6 meses custa R$ 31,67 por funcionário por mês, não R$ 190.

   A BASE diz por quanto multiplicar:

     funcionario · uniforme, EPI, exame admissional  → × nº de funcionários
     posto       · rádio, chave, livro de ocorrência → × nº de postos
     contrato    · produto de limpeza da área comum  → × 1

   Errar a base é o jeito mais rápido de orçar material para 3 pessoas num
   contrato que tem 14 — o fator de cobertura faz o headcount ser bem maior
   que o número de postos. */
const MAT_BASES = {funcionario:'por funcionário', posto:'por posto',
                   contrato:'fixo no contrato'};

/* ── margem alvo → lucro de planilha ─────────────────────────────────────────
   O vendedor pensa em MARGEM ("quero ganhar 15% nesse contrato"); a planilha
   da IN SEGES 05/2017 pede LUCRO DE PLANILHA, que é um markup sobre o custo.
   Não são o mesmo número e a diferença não é pequena: 18% de lucro de planilha
   com T de 16,53% dá 12,7% de margem, não 18%.

   Aqui a conta anda para trás. Com SUB = custo direto + indiretos:

     mensal = SUB × (1+L) × (1−d) ÷ (1−T)
     margem = [mensal × (1−T) − SUB] ÷ mensal

   Isolando L, sem iteração e sem tentativa e erro:

     L = (1−T) ÷ [ ((1−T) − m) × (1−d) ] − 1

   O teto é (1−T): margem de 90% num regime que come 16,53% não existe, e
   quem pedir isso recebe um aviso em vez de um preço absurdo. */
function lucroDaMargem(margemPct, T, descontoPct){
  const m = nreal(margemPct, 0) / 100;
  const d = Math.min(Math.max(nreal(descontoPct, 0) / 100, 0), 0.95);
  const u = 1 - T;
  if(m <= 0 || u <= 0) return 0;
  if(u - m <= 0.0001) return null;          /* margem impossível neste regime */
  return Math.max(u / ((u - m) * (1 - d)) - 1, 0) * 100;
}

/* ── a proposta ─────────────────────────────────────────────────────────────
   O rateio resolve P1 e P2 de uma vez: cada posto, cada material e cada
   equipamento recebem a sua fatia do PREÇO (markup e tributos já dentro), a
   soma das fatias é o total exato, e nenhum número de custo chega ao
   documento. */
function calcProposta(p, ctx){
  const cfg = ctx.config || {};
  /* `ix` é a posição do posto no array ORIGINAL da proposta. Item com cargo
     apagado devolve null e some daqui, então o índice desta lista não é o
     mesmo da tela — e a tela precisa achar o preço rateado de cada posto. Sem
     esta ponte, `linhaPosto` chamava calcItem() sozinho, que não passa pelo
     rateio, e todo posto aparecia como "R$ 0/mês". */
  const itens = (p.itens || []).map((i, ix) => {
    const ci = calcItem(i, p, ctx);
    if(ci) ci.ix = ix;
    return ci;
  }).filter(Boolean);
  const custoMoC = itens.reduce((s,i) => s + i.custoC, 0);

  const equips = [];
  let equipMensalC = 0, equipUnicoC = 0;
  (p.equipamentos || []).forEach(e => {
    const eq = ctx.equipamentos[String(e.id)];
    if(!eq) return;
    const qtd = Math.max(Math.trunc(nreal(e.qtd, 1)), 1);
    const unitC = cents(eq.valor), subC = unitC * qtd;
    const unico = eq.tipo === 'Único';
    equips.push({eq, qtd, unitC, custoC:subC, unico});
    unico ? equipUnicoC += subC : equipMensalC += subC;
  });

  /* ── MÓDULO 5 · insumos ── */
  /* Os multiplicadores saem daqui de cima porque `func` já é o headcount REAL
     (postos × fator de escala), não o número de postos. Uniforme se compra por
     pessoa, e num 12x36 são duas pessoas por posto. */
  const totalPostos = itens.reduce((s,i) => s + i.postos, 0);
  const totalFunc   = itens.reduce((s,i) => s + i.func, 0);

  const mats = [];
  let insumosC = 0;
  (p.materiais || []).forEach(m => {
    const mat = (ctx.materiais || {})[String(m.id)];
    if(!mat) return;
    const qtd = Math.max(nreal(m.qtd, 1), 0);
    const meses = Math.max(Math.trunc(nreal(mat.meses, 1)), 1);
    const base = MAT_BASES[String(mat.base || '').toLowerCase()] ? String(mat.base).toLowerCase()
               : 'funcionario';
    const mult = base === 'posto' ? totalPostos : base === 'contrato' ? 1 : totalFunc;
    const unitC = cents(mat.valor);
    const unitMesC = arred(unitC / meses);
    const custoC = arred(unitMesC * qtd * mult);
    mats.push({mat, qtd, meses, base, mult, unitC, unitMesC, custoC});
    insumosC += custoC;
  });

  /* ── MÓDULO 6 · indiretos, lucro e tributos ───────────────────────────────
     A ordem é a da IN SEGES 05/2017 e não pode ser trocada:

       CD    = M1 + M2 + M3 + M4 + M5
       CI    = CD × %indiretos
       SUB   = CD + CI
       LUCRO = SUB × %lucro
       BASE  = SUB + LUCRO
       PV    = BASE ÷ (1 − T)        ← imposto POR DENTRO

     O gross-up é o ponto em que mais se perde dinheiro no setor. Multiplicar
     por (1 + T) parece a mesma coisa e não é: com T de 16,53%, multiplicar dá
     116,53 e dividir dá 119,80. Os 2,8% de diferença saem inteiros do lucro. */
  const par = paramsPreco(p, cfg);
  const custoDiretoC = custoMoC + insumosC + equipMensalC;

  /* `imposto` gravado na proposta continua podendo mandar: é a saída para o
     caso em que o contador da casa fechou um número diferente. */
  const impManual = nreal(p.imposto, 0);
  const tribDe = L => tributos({regime:par.regime, modo:par.modo, iss:par.iss,
                                credito:par.credito, lucroPct:L, rbt12:par.rbt12});
  const TDe = tr => Math.min(Math.max(impManual > 0 ? impManual / 100 : tr.T, 0), 0.9);

  /* ── margem alvo ──────────────────────────────────────────────────────────
     Preenchida, ela manda no lucro de planilha. No Lucro Real isso vira um
     laço: o IRPJ e a CSLL incidem sobre o lucro, então T depende de L e L
     depende de T. Ponto fixo resolve — nos outros regimes a primeira volta já
     é exata, porque a presunção de 32% não olha para a margem real. */
  const margemAlvo = nreal(p.margem_alvo, 0);
  par.margemAlvo = margemAlvo;
  par.margemAviso = '';
  if(margemAlvo > 0){
    for(let v = 0; v < 8; v++){
      const achado = lucroDaMargem(margemAlvo, TDe(tribDe(par.lucro)), nreal(p.desconto, 0));
      if(achado === null){
        const teto = (1 - TDe(tribDe(par.lucro))) * 100;
        par.margemAviso = 'Margem de ' + margemAlvo.toFixed(1).replace('.', ',')
          + '% não cabe neste regime: o teto é ' + teto.toFixed(1).replace('.', ',')
          + '%, porque o resto é imposto. Usando o lucro de planilha informado.';
        break;
      }
      const parou = Math.abs(achado - par.lucro) < 1e-7;
      par.lucro = achado;
      if(parou) break;
    }
    par.lucroFonte = par.margemAviso ? 'informado' : 'margem alvo';
  } else {
    par.lucroFonte = 'informado';
  }

  const ciC = arred(custoDiretoC * par.ci / 100);
  const subtotalC = custoDiretoC + ciC;
  const lucroPlanilhaC = arred(subtotalC * par.lucro / 100);
  const baseC = subtotalC + lucroPlanilhaC;

  const trib = tribDe(par.lucro);
  const T = TDe(trib);
  const desconto = nreal(p.desconto, 0)/100;

  const precoBrutoC = arred(baseC / (1 - T));
  const descontoC = arred(precoBrutoC * desconto);
  const mensalC = precoBrutoC - descontoC;
  const impostoC = arred(mensalC * T);
  const lucroC = mensalC - custoDiretoC - ciC - impostoC;
  const margem = mensalC ? lucroC / mensalC * 100 : 0;
  const implantacaoC = equipUnicoC
    ? arred(equipUnicoC * (1 + par.ci/100) * (1 + par.lucro/100) / (1 - T)) : 0;

  /* Materiais entram no rateio junto com postos e equipamentos: assim eles
     também saem do documento com PREÇO, nunca com o custo de aquisição, e a
     soma das três colunas continua batendo com o total exato. */
  const mensais = equips.filter(e => !e.unico);
  const pesos = itens.map(i => i.custoC)
    .concat(mats.map(m => m.custoC))
    .concat(mensais.map(e => e.custoC));
  const fatias = ratear(precoBrutoC, pesos);
  let k = 0;
  itens.forEach(i => {
    i.precoC = fatias[k++];
    i.precoUnitC = i.postos ? arred(i.precoC / i.postos) : i.precoC;
  });
  mats.forEach(m => {
    m.precoC = fatias[k++];
    m.precoUnitC = m.qtd ? arred(m.precoC / m.qtd) : m.precoC;
  });
  mensais.forEach(e => {
    e.precoC = fatias[k];
    e.precoUnitC = e.qtd ? arred(fatias[k] / e.qtd) : fatias[k];
    k++;
  });
  const unicos = equips.filter(e => e.unico);
  const fatiasU = ratear(implantacaoC, unicos.map(e => e.custoC));
  unicos.forEach((e, ix) => {
    e.precoC = fatiasU[ix];
    e.precoUnitC = e.qtd ? arred(fatiasU[ix] / e.qtd) : fatiasU[ix];
  });

  const prazo = Math.trunc(nreal(p.prazo, 12)) || 12;
  return {itens, materiais:mats, equipamentos:equips, par, trib,
    ciC, subtotalC, lucroPlanilhaC, baseC, T,
    markup: custoDiretoC ? precoBrutoC / custoDiretoC : 0,
    custoMoC, insumosC, equipMensalC, equipUnicoC, custoDiretoC,
    precoMoC:itens.reduce((s,i) => s + i.precoC, 0),
    precoMatC:mats.reduce((s,m) => s + m.precoC, 0),
    precoEquipC:mensais.reduce((s,e) => s + e.precoC, 0),
    precoBrutoC, descontoC, mensalC, implantacaoC, impostoC, lucroC, margem,
    postos:totalPostos, func:totalFunc,
    contratoC:mensalC * prazo + implantacaoC,
    totalPrimeiroC:mensalC + implantacaoC, prazo};
}

/* As invariantes que fazem a coluna do slide fechar. */
function confere(c){
  const e = [];
  if(c.precoMoC + c.precoMatC + c.precoEquipC !== c.precoBrutoC) e.push('rateio não fecha');
  if(c.precoBrutoC - c.descontoC !== c.mensalC) e.push('subtotal − desconto ≠ mensal');
  const u = c.equipamentos.filter(x => x.unico).reduce((s,x) => s + x.precoC, 0);
  if(u !== c.implantacaoC) e.push('rateio da implantação não fecha');
  return e;
}

return {arred, cents, ratear, duracaoTurnoH, horasNoturnasH, fatorEscala,
        baseInsalubridade, calcBeneficio, calcNoturno, calcItem, calcProposta,
        confere, ADICIONAIS, infoAdic, MAT_BASES, lucroDaMargem,
        encargosRegime, modulo3, modulo4, tributos, pontoIndiferenca, paramsPreco};
})();
