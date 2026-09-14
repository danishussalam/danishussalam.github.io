/* Power Calculator engine: cluster-randomised designs.
 * Cluster RCT (PowerUp! CRA2_2 with unequal cluster sizes) and the stepped-wedge design (Hussey & Hughes 2007). */
(function (root) {
  'use strict';
  const PE = root.PowerEngine, U = PE.util, F = PE.formulas;

  // Multiplier on 1/nT + 1/nC (individuals) giving the PowerUp! CRA2_2 variance, inflated for unequal cluster sizes.
  F.clusterMult = function (m, icc, r2c, r2i, cv) {
    const base = m * icc * (1 - r2c) + (1 - icc) * (1 - r2i);
    const adj = cv > 0 ? (1 + ((cv * cv + 1) * m - 1) * icc) / (1 + (m - 1) * icc) : 1;
    return base * adj;
  };

  // Hussey & Hughes (2007) variance of the treatment effect for a stepped-wedge design with equal groups per step.
  F.husseyHughesVar = function (I, steps, npc, icc) {
    const T = steps + 1, sigma2 = (1 - icc) / npc, tau2 = icc, perStep = I / steps;
    let Usum = 0, W = 0, V = 0;
    const colSums = new Array(T).fill(0);
    for (let g = 0; g < steps; g++) {
      let rowSum = 0;
      for (let j = 0; j < T; j++) {
        const x = j >= g + 1 ? 1 : 0;
        rowSum += x;
        colSums[j] += x * perStep;
      }
      Usum += rowSum * perStep;
      V += rowSum * rowSum * perStep;
    }
    colSums.forEach(c => { W += c * c; });
    return I * sigma2 * (sigma2 + T * tau2) /
      ((I * Usum - W) * sigma2 + (Usum * Usum + I * T * Usum - T * W - I * V) * tau2);
  };

  const iccInput = { id: 'icc', label: 'Intra-cluster correlation (ICC)', kind: 'number', min: 0, max: 0.99, step: 0.01, def: 0.05, ref: 'icc',
    help: 'Share of outcome variance that lies between clusters rather than within them.' };
  const iccColumn = { label: 'ICC', values: () => [0.01, 0.05, 0.1, 0.2, 0.3], current: i => i.icc, apply: (i, v) => { i.icc = v; } };
  const solvingSize = i => i.solve === 'n' && i.target === 'size';
  const targetInput = { id: 'target', label: 'When solving, find the', kind: 'select', def: 'clusters', options: [
    { value: 'clusters', label: 'Number of clusters' }, { value: 'size', label: 'Number of people per cluster' }], when: i => i.solve === 'n' };

  // 6. Cluster RCT -------------------------------------------------------------
  PE.register({
    id: 'cluster_rct', label: 'Cluster RCT', group: 'experimental',
    description: 'Groups such as schools, villages or bank branches are randomised; outcomes are measured on individuals within them.',
    method: 'MDE = M·√(ρ(1−R²₂)/(P(1−P)J) + (1−ρ)(1−R²₁)/(P(1−P)Jn)) with J − 2 degrees of freedom; unequal cluster sizes inflate the variance by [1 + ((CV²+1)n − 1)ρ] / [1 + (n − 1)ρ].',
    citation: 'Dong & Maynard (2013); Eldridge, Ashby & Kerry (2006)',
    binary: true, allocation: true,
    inputs: [
      targetInput,
      { id: 'J', label: 'Number of clusters (treatment + control)', kind: 'int', min: 4, max: 1000000, step: 1, def: 40, scale: 'log', when: solvingSize },
      { id: 'm', label: 'People per cluster (recruited)', kind: 'int', min: 1, max: 100000, step: 1, def: 20, scale: 'log', when: i => !solvingSize(i) },
      iccInput,
      { id: 'cv', label: 'Coefficient of variation of cluster size', kind: 'number', min: 0, max: 2, step: 0.05, def: 0,
        help: '0 means all clusters are the same size. Unequal cluster sizes reduce power.' },
      { id: 'r2c', label: 'R² of cluster-level covariates', kind: 'number', min: 0, max: 0.95, step: 0.05, def: 0, ref: 'r2',
        help: 'Share of between-cluster variance explained by cluster-level covariates.' },
      { id: 'r2i', label: 'R² of individual-level covariates', kind: 'number', min: 0, max: 0.95, step: 0.05, def: 0, ref: 'r2',
        help: 'Share of within-cluster variance explained by individual-level covariates.' }
    ],
    size: i => (solvingSize(i) ? null : { id: 'J', label: 'Number of clusters (treatment + control)', min: 4, max: 1000000, def: 40, unit: 'clusters', attrition: false }),
    sizes: (inp, k) => {
      let JT, JC, m;
      if (solvingSize(inp)) {
        JT = Math.max(1, Math.round(inp.J * inp.P)); JC = Math.max(1, inp.J - JT); m = k;
      } else {
        const s = U.twoArmSizes(inp.P, k);
        JT = s.nT; JC = s.nC; m = Math.max(1, Math.floor(inp.m * (1 - (inp.attrition || 0)) + 1e-9));
      }
      return {
        JT, JC, m, total: (JT + JC) * m, nT: JT * m, nC: JC * m, sizeValue: JT + JC, unit: 'participants',
        breakdown: [{ label: 'Treatment clusters', value: JT }, { label: 'Control clusters', value: JC }, { label: 'Analysed per cluster', value: m }]
      };
    },
    indexFromSize: (inp, J) => U.twoArmIndex(inp.P, J),
    minIndex: inp => (solvingSize(inp) ? 1 : 2),
    maxIndex: inp => (solvingSize(inp) ? 100000 : 1000000),
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: F.clusterMult(s.m, inp.icc, inp.r2c, inp.r2i, inp.cv), df: s.JT + s.JC - 2 }),
    recruited: (inp, s, a) => {
      const mRec = solvingSize(inp) ? Math.ceil(s.m / (1 - a) - 1e-9) : inp.m;
      return {
        total: (s.JT + s.JC) * mRec,
        breakdown: [{ label: 'Treatment clusters', value: s.JT }, { label: 'Control clusters', value: s.JC }, { label: 'Recruited per cluster', value: mRec }]
      };
    },
    details: (inp, res, s) => (s ? [{ label: 'Design effect', value: U.fmt(F.clusterMult(s.m, inp.icc, 0, 0, inp.cv), 2) }] : []),
    warnings: (inp, res, s) => (s && s.JT + s.JC < 20 ? [{ code: 'few_clusters', message: 'Fewer than 20 clusters in total: conventional standard errors can be unreliable, so consider small-sample corrections such as the wild cluster bootstrap.' }] : []),
    unreachableMessage: inp => {
      if (!solvingSize(inp)) return 'The target cannot be reached within 1,000,000 clusters. Try a larger effect or lower power.';
      const JT = Math.max(1, Math.round(inp.J * inp.P)), JC = Math.max(1, inp.J - JT);
      const Vfloor = inp.icc * (1 - inp.r2c) * (inp.cv * inp.cv + 1) * (1 / JT + 1 / JC);
      const df = inp.J - 2, a = inp.sides === 2 ? inp.alpha / 2 : inp.alpha;
      const floor = (PE.stats.tInv(1 - a, df) + PE.stats.tInv(inp.power, df)) * Math.sqrt(Vfloor);
      const need = PE.summary('cluster_rct', Object.assign({}, inp, { target: 'clusters' }));
      const clusters = need.sizes ? (need.sizes.JT + need.sizes.JC).toLocaleString('en-GB') : 'many more';
      return `Adding more people per cluster cannot reach this power: with ${inp.J} clusters the smallest detectable effect is about ${U.fmt(floor)} SD, however large the clusters. With ${inp.m} people per cluster you would need about ${clusters} clusters.`;
    },
    sensitivity: iccColumn,
    chart: (inp, api) => ({
      title: 'Clusters needed by cluster size', xLabel: 'People per cluster', yLabel: 'Clusters needed (treatment + control)',
      series: [api.series('Clusters needed', [5, 10, 15, 20, 30, 50, 75, 100, 150, 200],
        x => ({ solve: 'n', target: 'clusters', m: x }), s => (s.sizes ? s.sizes.JT + s.sizes.JC : null))]
    })
  });

  // 8. Stepped-wedge -----------------------------------------------------------
  const swSolvingSize = i => i.solve === 'n' && i.target === 'size';
  PE.register({
    id: 'stepped_wedge', label: 'Stepped-wedge cluster design', group: 'experimental',
    description: 'All clusters start in control and cross over to treatment in random order, an equal group at each step.',
    method: 'Var(θ̂) = Iσ²(σ² + Tτ²) / [(IU − W)σ² + (U² + ITU − TW − IV)τ²] for I clusters and T periods, with σ² = (1 − ICC)/n per cluster-period and τ² = ICC; normal critical values.',
    citation: 'Hussey & Hughes (2007)',
    inputs: [
      targetInput,
      { id: 'I', label: 'Number of clusters', kind: 'int', min: 1, max: 100000, step: 1, def: 12, scale: 'log', when: swSolvingSize },
      { id: 'steps', label: 'Number of steps', kind: 'int', min: 1, max: 20, step: 1, def: 4, scale: 'linear',
        help: 'Clusters cross over in equal groups at each step; there is one baseline period plus one period per step.' },
      { id: 'npc', label: 'People per cluster per period (recruited)', kind: 'int', min: 1, max: 10000, step: 1, def: 20, scale: 'log', when: i => !swSolvingSize(i) },
      iccInput
    ],
    size: i => (swSolvingSize(i) ? null : { id: 'I', label: 'Number of clusters', min: 1, max: 100000, def: 12, unit: 'clusters', attrition: false }),
    normalize: (inp, problems) => {
      if (inp.solve === 'n' && inp.target !== 'size') return;
      if (inp.I % inp.steps !== 0) {
        const adj = Math.max(inp.steps, Math.round(inp.I / inp.steps) * inp.steps);
        problems.push({ code: 'sw_divisible', message: `The number of clusters must be a multiple of the number of steps, so ${adj} clusters are used instead of ${inp.I}.` });
        inp.I = adj;
      }
    },
    sizes: (inp, k) => {
      let I, npc;
      if (swSolvingSize(inp)) { I = inp.I; npc = k; }
      else { I = k * inp.steps; npc = Math.max(1, Math.floor(inp.npc * (1 - (inp.attrition || 0)) + 1e-9)); }
      const T = inp.steps + 1;
      return {
        I, npc, T, total: I * T * npc, sizeValue: I, unit: 'observations',
        breakdown: [{ label: 'Clusters', value: I }, { label: 'Periods (including baseline)', value: T }, { label: 'Analysed per cluster-period', value: npc }]
      };
    },
    indexFromSize: (inp, I) => Math.max(1, Math.round(I / inp.steps)),
    minIndex: () => 1,
    maxIndex: inp => (swSolvingSize(inp) ? 10000 : Math.floor(100000 / inp.steps)),
    model: (inp, s) => ({ kind: 'general', V: F.husseyHughesVar(s.I, inp.steps, s.npc, inp.icc), df: Infinity }),
    recruited: (inp, s, a) => {
      const npcRec = swSolvingSize(inp) ? Math.ceil(s.npc / (1 - a) - 1e-9) : inp.npc;
      return {
        total: s.I * s.T * npcRec,
        breakdown: [{ label: 'Clusters', value: s.I }, { label: 'Periods (including baseline)', value: s.T }, { label: 'Recruited per cluster-period', value: npcRec }]
      };
    },
    sensitivity: iccColumn,
    chart: (inp, api) => ({
      title: 'Power by number of steps (clusters held roughly fixed)', xLabel: 'Number of steps', yLabel: 'Power',
      series: [api.series('Power', [1, 2, 3, 4, 5, 6, 8],
        x => ({ solve: 'power', steps: x, I: Math.max(x, Math.round((api.sizeValue || 12) / x) * x) }), 'power')]
    })
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
