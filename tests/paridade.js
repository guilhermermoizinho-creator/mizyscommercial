/* ════════════════════════════════════════════════════════════════════════════
   PONTE PARA O TESTE DE PARIDADE

   Lê {proposta, ctx} em JSON na entrada padrão, roda o calculo.js do navegador
   e devolve os mesmos números que o calculo.py devolve — com os nomes do lado
   Python, para o teste comparar chave a chave sem tradutor no meio.

   Existe porque o motor de cálculo mora em dois arquivos e os dois têm que dar
   o mesmo centavo. Até aqui isso era garantido "por construção" e conferido a
   olho, pelo botão de conferir no painel da proposta. Com o Node instalado, dá
   para prender no teste — que é onde erro de arredondamento tem que morrer,
   não numa reunião com o cliente.

     node tests/paridade.js  < entrada.json
   ════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.dirname(__dirname);
const fonte = fs.readFileSync(path.join(raiz, 'static', 'js', 'calculo.js'), 'utf8');

/* O arquivo termina em `const Calc = (…)();` — avaliar e pedir `Calc` na
   sequência devolve o objeto exportado sem precisar de bundler. */
const Calc = vm.runInNewContext(fonte + '\nCalc', {});

const entrada = JSON.parse(fs.readFileSync(0, 'utf8'));
const c = Calc.calcProposta(entrada.proposta, entrada.ctx);

const saida = {
  custo_mo_c: c.custoMoC,
  insumos_c: c.insumosC,
  equip_mensal_c: c.equipMensalC,
  equip_unico_c: c.equipUnicoC,
  custo_direto_c: c.custoDiretoC,
  ci_c: c.ciC,
  subtotal_c: c.subtotalC,
  lucro_planilha_c: c.lucroPlanilhaC,
  base_c: c.baseC,
  T: c.T,
  preco_bruto_c: c.precoBrutoC,
  desconto_c: c.descontoC,
  mensal_c: c.mensalC,
  imposto_c: c.impostoC,
  lucro_c: c.lucroC,
  margem: c.margem,
  implantacao_c: c.implantacaoC,
  contrato_c: c.contratoC,
  preco_mo_c: c.precoMoC,
  preco_mat_c: c.precoMatC,
  preco_equip_c: c.precoEquipC,
  postos: c.postos,
  func: c.func,
  par_lucro: c.par.lucro,
  par_enc_pct: c.par.encPct,
  margem_aviso: c.par.margemAviso || '',
  itens: c.itens.map(i => ({
    ix: i.ix,
    custo_c: i.custoC, preco_c: i.precoC, unit_func_c: i.unitFuncC,
    unit_posto_c: i.unitPostoC, func: i.func, fator: i.fator,
    m1: i.m1, s21: i.m2.s21, s22: i.m2.s22, s23: i.m2.s23,
    m3: i.m3.total, m4: i.m4.total,
  })),
  materiais: c.materiais.map(m => ({
    custo_c: m.custoC, preco_c: m.precoC, unit_mes_c: m.unitMesC,
    mult: m.mult, base: m.base,
  })),
  equipamentos: c.equipamentos.map(e => ({custo_c: e.custoC, preco_c: e.precoC})),
  problemas: Calc.confere(c),
};

process.stdout.write(JSON.stringify(saida));
