/* Power Calculator engine: non-inferiority / equivalence trials and quasi-experimental designs
 * (regression discontinuity, instrumental variables, matching, synthetic control), plus the effect-size converter. */
(function (root) {
  'use strict';
  const PE = root.PowerEngine, U = PE.util, F = PE.formulas, ST = PE.stats;
  const RECRUIT_AXIS = 'Total sample to recruit';
  const sizeN = { id: 'N', label: 'Total sample size (recruited)', min: 4, max: 10000000, def: 500, unit: 'participants' };

  PE.convert = {
    meansToD: (m1, m0, sd) => (m1 - m0) / sd,
    proportionsToH: (p1, p0) => 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p0)),
    oddsRatioToD: or => Math.log(or) * Math.sqrt(3) / Math.PI   // Chinn (2000)
  };

  // 9. Non-inferiority / equivalence -----------------------------------------
  PE.register({
    id: 'noninferiority', label: 'Non-inferiority / equivalence trial', group: 'experimental',
    description: 'Tests whether a new intervention is not worse than (or is equivalent to) an existing one, within a margin.',
    method: 'Non-inferiority: power = T(( δ + Δ)/SE − t₁₋α). Equivalence (two one-sided tests): power = T((Δ − δ)/SE − t₁₋α) + T((Δ + δ)/SE − t₁₋α) − 1, with SE = √(1/n_T + 1/n_C) in SD units.',
    citation: 'Chow, Shao & Wang (2008); Schuirmann (1987)',
    allocation: true, sidesLocked: 1,
    shared: ['solve', 'alpha', 'power', 'attrition'],
    effectInput: { id: 'margin', label: 'Margin Δ (SD units)', kind: 'number', min: 0.001, max: 5, step: 0.01, def: 0.3,
      help: 'The largest difference you would still regard as unimportant.' },
    inputs: [
      { id: 'test', label: 'Test', kind: 'select', def: 'noninf', options: [
        { value: 'noninf', label: 'Non-inferiority' }, { value: 'equiv', label: 'Equivalence (two one-sided tests)' }] },
      { id: 'delta', label: 'Assumed true difference δ (SD units)', kind: 'number', min: -2, max: 2, step: 0.01, def: 0,
        help: 'Positive values favour the new intervention. Usually 0.' }
    ],
    normalize: (inp, problems) => {
      if (inp.test === 'equiv' && inp.solve !== 'mde' && Math.abs(inp.delta) >= inp.margin) {
        problems.push({ code: 'equiv_delta', message: 'For equivalence the assumed true difference must be smaller than the margin.' });
      }
    },
    size: sizeN,
    sizes: (inp, k) => U.twoArmSizes(inp.P, k, 'participants'),
    indexFromSize: (inp, N) => U.twoArmIndex(inp.P, N), minIndex: () => 2,
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: 1, df: s.total - 2 }),
    powerOverride: (inp, s, margin, alpha) => {
      const se = Math.sqrt(1 / s.nT + 1 / s.nC), df = Math.max(1, s.total - 2), tc = ST.tInv(1 - alpha, df);
      if (inp.test === 'equiv') {
        return Math.max(0, ST.tCdf((margin - inp.delta) / se - tc, df) + ST.tCdf((margin + inp.delta) / se - tc, df) - 1);
      }
      return ST.tCdf((inp.delta + margin) / se - tc, df);
    },
    sensitivity: { label: 'Assumed true difference δ', values: () => [-0.1, -0.05, 0, 0.05, 0.1], current: i => i.delta, apply: (i, v) => { i.delta = v; } },
    chart: (inp, api) => ({
      title: 'Required sample by margin', xLabel: 'Margin Δ (SD units)', yLabel: RECRUIT_AXIS,
      series: [api.series('Required sample', [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1].filter(x => x > Math.abs(inp.delta)),
        x => ({ solve: 'n', margin: x }), 'n')]
    })
  });

  // 12. Regression discontinuity --------------------------------------------
  // Correlation between treatment status and the running variable for a cutoff leaving share P above it.
  F.rddRho = function (dist, P, custom) {
    if (dist === 'custom') return custom;
    if (dist === 'uniform') return Math.sqrt(3 * P * (1 - P));
    const c = ST.normInv(1 - P);
    return Math.exp(-c * c / 2) / Math.sqrt(2 * Math.PI) / Math.sqrt(P * (1 - P));
  };
  const rddInflation = inp => {
    const rho = F.rddRho(inp.dist, inp.P, inp.rhoTS);
    return 1 / (1 - rho * rho) / (inp.type === 'fuzzy' ? inp.jump * inp.jump : 1);
  };

  PE.register({
    id: 'rdd', label: 'Regression discontinuity (sharp / fuzzy)', group: 'quasi',
    description: 'Treatment is assigned by a cutoff on a running variable (for example a score); effects are estimated for units near the cutoff.',
    method: 'Variance relative to an RCT of the same size is inflated by 1/(1 − ρ²), where ρ is the correlation between treatment and the running variable within the bandwidth; a fuzzy design divides the effective sample by the squared first-stage jump.',
    citation: 'Schochet (2008)',
    approximation: 'Assumes a linear specification within the bandwidth; local polynomial estimates with data-driven bandwidths will differ.',
    allocation: true,
    inputs: [
      { id: 'type', label: 'Design', kind: 'select', def: 'sharp', options: [{ value: 'sharp', label: 'Sharp' }, { value: 'fuzzy', label: 'Fuzzy' }] },
      { id: 'dist', label: 'Distribution of the running variable', kind: 'select', def: 'normal', options: [
        { value: 'normal', label: 'Normal' }, { value: 'uniform', label: 'Uniform' }, { value: 'custom', label: 'Custom correlation' }] },
      { id: 'rhoTS', label: 'Correlation of treatment with running variable', kind: 'number', min: 0.01, max: 0.99, step: 0.01, def: 0.8, when: i => i.dist === 'custom' },
      { id: 'jump', label: 'First-stage jump in treatment probability', kind: 'number', min: 0.01, max: 1, step: 0.05, def: 0.5, when: i => i.type === 'fuzzy',
        help: 'How much the probability of treatment rises at the cutoff.' }
    ],
    size: { id: 'N', label: 'Observations within the bandwidth (recruited)', min: 4, max: 10000000, def: 2000, unit: 'observations' },
    sizes: (inp, k) => U.twoArmSizes(inp.P, k, 'observations', ['Above cutoff', 'Below cutoff']),
    indexFromSize: (inp, N) => U.twoArmIndex(inp.P, N), minIndex: () => 3,
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: rddInflation(inp), df: s.total - 3 }),
    details: inp => [{ label: 'Variance inflation vs RCT', value: U.fmt(rddInflation(inp), 2) + '×' }],
    sensitivity: {
      label: 'First-stage jump', values: () => [0.2, 0.4, 0.6, 0.8, 1],
      current: i => (i.type === 'fuzzy' ? i.jump : 1),
      apply: (i, v) => { i.type = v === 1 ? i.type : 'fuzzy'; i.jump = v; }
    },
    chart: (inp, api) => (inp.type === 'fuzzy'
      ? { title: 'Required sample by first-stage jump', xLabel: 'First-stage jump', yLabel: RECRUIT_AXIS,
          series: [api.series('Required sample', [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], x => ({ solve: 'n', jump: x }), 'n')] }
      : { title: 'Required sample by treatment–running variable correlation', xLabel: 'Correlation ρ', yLabel: RECRUIT_AXIS,
          series: [api.series('Required sample', [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95], x => ({ solve: 'n', dist: 'custom', rhoTS: x }), 'n')] })
  });

  // 13. Instrumental variables ----------------------------------------------
  PE.register({
    id: 'iv', label: 'Instrumental variables', group: 'quasi',
    description: 'An instrument shifts exposure to the treatment; the effect is identified from that variation alone.',
    method: 'Var(β̂_IV) ≈ Var(β̂_OLS) / R²ₚ, so the required sample is the OLS sample divided by the first-stage partial R²; first-stage F ≈ (N·R²ₚ/(1 − R²ₚ)) / number of instruments.',
    citation: 'Wooldridge (2010); Stock & Yogo (2005); Lee, McCrary, Moreira & Porter (2022)',
    allocation: true,
    inputs: [
      { id: 'r2fs', label: 'First-stage partial R² of the instrument(s)', kind: 'number', min: 0.001, max: 0.99, step: 0.01, def: 0.1, scale: 'log',
        help: 'Share of variation in the treatment explained by the instrument(s), after controls.' },
      { id: 'instruments', label: 'Number of instruments', kind: 'int', min: 1, max: 20, step: 1, def: 1, scale: 'linear' }
    ],
    size: sizeN,
    sizes: (inp, k) => U.twoArmSizes(inp.P, k, 'participants', ['Treated', 'Untreated']),
    indexFromSize: (inp, N) => U.twoArmIndex(inp.P, N), minIndex: inp => Math.max(2, inp.instruments + 2),
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: 1 / inp.r2fs, df: s.total - 2 - inp.instruments }),
    details: (inp, res) => (res.n ? [{ label: 'First-stage F', value: U.fmt(res.n.analysed * inp.r2fs / (1 - inp.r2fs) / inp.instruments, 1) }] : []),
    warnings: (inp, res) => {
      if (!res.n) return [];
      const Fst = res.n.analysed * inp.r2fs / (1 - inp.r2fs) / inp.instruments, out = [];
      if (Fst < 10) out.push({ code: 'weak_f10', message: `The implied first-stage F (${U.fmt(Fst, 1)}) is below 10, the conventional weak-instrument threshold (Staiger & Stock 1997; Stock & Yogo 2005).` });
      else if (inp.instruments === 1 && Fst < 104.7) out.push({ code: 'weak_f104', message: `The implied first-stage F (${U.fmt(Fst, 1)}) is below 104.7, so standard 5% t-tests are not reliable without the tF adjustment (Lee, McCrary, Moreira & Porter 2022).` });
      return out;
    },
    sensitivity: { label: 'First-stage R²', values: () => [0.02, 0.05, 0.1, 0.2, 0.4], current: i => i.r2fs, apply: (i, v) => { i.r2fs = v; } },
    chart: (inp, api) => ({
      title: 'Required sample by first-stage strength', xLabel: 'First-stage partial R²', yLabel: RECRUIT_AXIS,
      series: [api.series('Required sample', [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6], x => ({ solve: 'n', r2fs: x }), 'n')]
    })
  });

  // 15. Matching / propensity score ------------------------------------------
  PE.register({
    id: 'matching', label: 'Matching / propensity score', group: 'quasi',
    description: 'Treated units are matched to one or more similar untreated units on observed characteristics.',
    method: 'Two-group formula with k controls per matched treated unit, variance multiplied by (1 − R²) of the matched covariates, and treated units inflated by 1/(1 − share outside common support).',
    citation: 'Stuart (2010); Austin (2011)',
    approximation: 'Ignores the variance from estimating propensity scores and from matching with replacement.',
    binary: true,
    shared: ['solve', 'alpha', 'sides', 'power'],
    inputs: [
      { id: 'k', label: 'Controls matched to each treated unit (1:k)', kind: 'int', min: 1, max: 5, step: 1, def: 1, scale: 'linear' },
      { id: 'r2', label: 'R² of matched covariates', kind: 'number', min: 0, max: 0.95, step: 0.05, def: 0.2, ref: 'r2' },
      { id: 'drop', label: 'Share of treated units outside common support', kind: 'number', min: 0, max: 0.9, step: 0.05, def: 0.1 }
    ],
    size: { id: 'NT', label: 'Treated units available', min: 2, max: 10000000, def: 300, unit: 'treated units', attrition: false },
    sizes: (inp, k) => ({
      nT: k, nC: inp.k * k, total: k + inp.k * k, unit: 'units', sizeValue: Math.ceil(k / (1 - inp.drop) - 1e-9),
      breakdown: [{ label: 'Matched treated units', value: k }, { label: 'Matched controls', value: inp.k * k }]
    }),
    indexFromSize: (inp, NT) => Math.max(2, Math.floor(NT * (1 - inp.drop) + 1e-9)), minIndex: () => 2,
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: 1 - inp.r2, df: s.total - 2 }),
    recruited: (inp, s) => {
      const treated = Math.ceil(s.nT / (1 - inp.drop) - 1e-9);
      return { total: treated + s.nC, breakdown: [{ label: 'Treated units needed (before trimming)', value: treated }, { label: 'Control pool needed (matched)', value: s.nC }] };
    },
    sensitivity: { label: 'Matching ratio k', values: () => [1, 2, 3, 4, 5], current: i => i.k, apply: (i, v) => { i.k = v; } },
    chart: (inp, api) => ({
      title: 'Treated units needed by matching ratio', xLabel: 'Controls per treated unit (k)', yLabel: 'Treated units needed',
      series: [api.series('Treated units needed', [1, 2, 3, 4, 5], x => ({ solve: 'n', k: x }), s => (s.sizes ? s.sizes.sizeValue : null))]
    })
  });

  // 16. Synthetic control -----------------------------------------------------
  PE.register({
    id: 'synthetic_control', label: 'Synthetic control', group: 'quasi',
    description: 'A single treated unit is compared with a weighted combination of untreated donor units; inference uses placebo tests.',
    method: 'No closed-form power formula exists. With J donor units, placebo-permutation inference has a smallest attainable p-value of 1/(J + 1).',
    citation: 'Abadie, Diamond & Hainmueller (2010)',
    shared: ['alpha'],
    guidanceOnly: inp => {
      const minP = 1 / (inp.donors + 1), achievable = minP <= inp.alpha + 1e-12, neededJ = Math.ceil(1 / inp.alpha - 1 - 1e-9);
      return {
        minP, achievable, neededJ,
        message: achievable
          ? `With ${inp.donors} donor units the smallest placebo p-value is ${U.fmt(minP, 4)}, so a test at α = ${inp.alpha} is possible. Power also depends on pre-treatment fit and the size of the effect relative to placebo gaps.`
          : `With ${inp.donors} donor units the smallest placebo p-value is ${U.fmt(minP, 4)}, so a test at α = ${inp.alpha} is impossible. You need at least ${neededJ} donor units.`
      };
    },
    inputs: [{ id: 'donors', label: 'Number of donor units', kind: 'int', min: 1, max: 1000, step: 1, def: 20, scale: 'log' }],
    warnings: inp => (1 / (inp.donors + 1) > inp.alpha + 1e-12
      ? [{ code: 'synth_alpha', message: 'The chosen significance level cannot be reached with placebo inference and this many donor units.' }] : [])
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
