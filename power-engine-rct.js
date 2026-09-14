/* Power Calculator engine: individually randomised experiments.
 * Two-arm, multi-arm, 2×2 factorial, covariate-adjusted and imperfect-compliance designs. */
(function (root) {
  'use strict';
  const PE = root.PowerEngine, U = PE.util;

  const sizeN = { id: 'N', label: 'Total sample size (recruited)', min: 4, max: 10000000, def: 500, unit: 'participants' };
  const twoArm = (inp, k) => U.twoArmSizes(inp.P, k, 'participants');
  const twoArmIndex = (inp, N) => U.twoArmIndex(inp.P, N);
  const RECRUIT_AXIS = 'Total sample to recruit';

  // 1. Two-arm individual RCT -------------------------------------------------
  PE.register({
    id: 'two_arm', label: 'Two-arm individual RCT', group: 'experimental',
    description: 'Individuals are randomised to one treatment or to control; the estimate is a difference in means or proportions.',
    method: 'MDE = (t₁₋α/₂ + t₁₋β) · √(1/(P(1−P)N)) in SD units, with N − 2 degrees of freedom. Binary outcomes use the pooled two-proportion normal approximation.',
    citation: 'Duflo, Glennerster & Kremer (2007)',
    binary: true, allocation: true,
    size: sizeN, sizes: twoArm, indexFromSize: twoArmIndex, minIndex: () => 2,
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: 1, df: s.total - 2 }),
    sensitivity: U.attritionColumn,
    chart: (inp, api) => ({
      title: 'Minimum detectable effect by sample size', xLabel: 'Total sample (recruited)', yLabel: api.effectAxis,
      series: [api.series('Minimum detectable effect', U.spread(api.sizeValue, 14), x => ({ solve: 'mde', N: x }), 'mde')]
    })
  });

  // 2. Multi-arm RCT -----------------------------------------------------------
  PE.register({
    id: 'multi_arm', label: 'Multi-arm RCT', group: 'experimental',
    description: 'Several treatment arms, each compared with a common control, with a correction for multiple comparisons.',
    method: 'Each treatment–control comparison uses the two-arm formula at α/k (Bonferroni). Holm is reported with the Bonferroni threshold as a conservative bound. The √k rule makes the control arm √k times each treatment arm.',
    citation: 'Duflo, Glennerster & Kremer (2007); Holm (1979)',
    binary: true,
    inputs: [
      { id: 'arms', label: 'Number of treatment arms', kind: 'int', min: 2, max: 10, step: 1, def: 3 },
      { id: 'correction', label: 'Multiple-testing correction', kind: 'select', def: 'holm', options: [
        { value: 'none', label: 'None' }, { value: 'bonferroni', label: 'Bonferroni' }, { value: 'holm', label: 'Holm' }],
        help: 'Adjusts the significance level because several treatment arms are each compared with control.' },
      { id: 'allocRule', label: 'Allocation', kind: 'select', def: 'equal', options: [
        { value: 'equal', label: 'Equal across all arms' }, { value: 'sqrtk', label: 'Larger control arm (√k rule)' }],
        help: 'With k treatment arms each compared with control, a control arm √k times each treatment arm minimises the total sample.' }
    ],
    size: sizeN,
    sizes: (inp, c) => {
      const nT = inp.allocRule === 'sqrtk' ? Math.max(1, Math.ceil(c / Math.sqrt(inp.arms) - 1e-9)) : c;
      const breakdown = [{ label: 'Control', value: c, part: true }];
      for (let a = 1; a <= inp.arms; a++) breakdown.push({ label: 'Treatment arm ' + a, value: nT, part: true });
      return { total: c + inp.arms * nT, nT, nC: c, unit: 'participants', breakdown };
    },
    indexFromSize: (inp, N) => {
      const k = inp.arms;
      return Math.max(1, Math.round(inp.allocRule === 'sqrtk' ? N * Math.sqrt(k) / (Math.sqrt(k) + k) : N / (k + 1)));
    },
    minIndex: () => 2,
    alpha: inp => (inp.correction === 'none' ? inp.alpha : inp.alpha / inp.arms),
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: 1, df: s.total - inp.arms - 1 }),
    details: inp => [{ label: 'α per comparison', value: U.fmt(inp.correction === 'none' ? inp.alpha : inp.alpha / inp.arms, 4) }],
    warnings: inp => (inp.correction === 'holm' ? [{ code: 'holm_bound', message: "Holm's procedure is shown using the Bonferroni threshold (α/k) for each comparison. This is a conservative bound: Holm's actual power is at least this high." }] : []),
    sensitivity: { label: 'Treatment arms', values: () => [2, 3, 4, 5, 6], current: i => i.arms, apply: (i, v) => { i.arms = v; } },
    chart: (inp, api) => ({
      title: 'Required sample by number of treatment arms', xLabel: 'Treatment arms', yLabel: RECRUIT_AXIS,
      series: [api.series('Required sample', [2, 3, 4, 5, 6, 7, 8, 9, 10], x => ({ solve: 'n', arms: x }), 'n')]
    })
  });

  // 3. 2×2 factorial -----------------------------------------------------------
  PE.register({
    id: 'factorial', label: '2×2 factorial design', group: 'experimental',
    description: 'Two cross-cutting treatments in four equal cells; power for a main effect or for the interaction.',
    method: 'Main effect (assuming no interaction): two-arm formula on the full sample. Interaction contrast: four times the variance of a main effect. N − 4 degrees of freedom.',
    citation: 'Muralidharan, Romero & Wüthrich (2023)',
    binary: true,
    inputs: [
      { id: 'target', label: 'Effect of interest', kind: 'select', def: 'main', options: [
        { value: 'main', label: 'Main effect of one treatment' }, { value: 'interaction', label: 'Interaction between the treatments' }],
        help: 'The interaction contrast has four times the variance of a main effect, so it needs about four times the sample for the same effect size.' }
    ],
    size: sizeN,
    sizes: (inp, k) => ({
      total: 4 * k, nT: 2 * k, nC: 2 * k, unit: 'participants',
      breakdown: ['Control', 'Treatment A only', 'Treatment B only', 'Both treatments'].map(label => ({ label, value: k, part: true }))
    }),
    indexFromSize: (inp, N) => Math.max(1, Math.round(N / 4)),
    minIndex: () => 2,
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: inp.target === 'interaction' ? 4 : 1, df: s.total - 4 }),
    warnings: inp => (inp.target === 'main' ? [{ code: 'factorial_main', message: 'Main-effect power assumes the interaction is zero. If the treatments interact, main-effect estimates from the pooled design are biased (Muralidharan, Romero & Wüthrich 2023).' }] : []),
    sensitivity: U.attritionColumn,
    chart: (inp, api) => {
      const xs = api.effectValues();
      return {
        title: 'Main effect versus interaction', xLabel: api.effectAxis, yLabel: RECRUIT_AXIS,
        series: [
          api.series('Main effect', xs, x => Object.assign({ solve: 'n', target: 'main' }, api.effectPatch(x)), 'n'),
          api.series('Interaction', xs, x => Object.assign({ solve: 'n', target: 'interaction' }, api.effectPatch(x)), 'n')
        ]
      };
    }
  });

  // 4. Stratified / covariate-adjusted ----------------------------------------
  PE.register({
    id: 'covariate_adjusted', label: 'Stratified / covariate-adjusted RCT', group: 'experimental',
    description: 'Randomising within strata or controlling for baseline covariates reduces the residual variance.',
    method: 'Two-arm formula with variance multiplied by (1 − R²); degrees of freedom reduced by the number of covariates.',
    citation: 'Bloom (2006); Duflo, Glennerster & Kremer (2007)',
    binary: true, allocation: true,
    inputs: [
      { id: 'r2', label: 'R² of covariates / strata', kind: 'number', min: 0, max: 0.95, step: 0.05, def: 0.3, ref: 'r2',
        help: 'Share of outcome variance explained by the covariates or strata you will control for.' },
      { id: 'covariates', label: 'Number of covariates', kind: 'int', min: 0, max: 50, step: 1, def: 1, scale: 'linear',
        help: 'Used only to adjust the degrees of freedom.' }
    ],
    size: sizeN, sizes: twoArm, indexFromSize: twoArmIndex,
    minIndex: inp => Math.max(2, Math.ceil((inp.covariates + 3) / 2)),
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: 1 - inp.r2, df: s.total - 2 - inp.covariates }),
    sensitivity: { label: 'R²', values: () => [0, 0.2, 0.4, 0.6, 0.8], current: i => i.r2, apply: (i, v) => { i.r2 = v; } },
    chart: (inp, api) => ({
      title: 'Required sample by covariate R²', xLabel: 'R² of covariates', yLabel: RECRUIT_AXIS,
      series: [api.series('Required sample', [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], x => ({ solve: 'n', r2: x }), 'n')]
    })
  });

  // 10. Imperfect compliance ---------------------------------------------------
  PE.register({
    id: 'compliance', label: 'Imperfect compliance (ITT / TOT)', group: 'experimental',
    description: 'Not everyone offered the treatment takes it up (and some controls may); power for the intention-to-treat or treatment-on-the-treated effect.',
    method: 'The ITT effect equals TOT × (take-up in treatment − take-up in control), so the required sample scales with 1/(take-up gap)².',
    citation: 'Duflo, Glennerster & Kremer (2007); Angrist, Imbens & Rubin (1996)',
    allocation: true,
    inputs: [
      { id: 'estimand', label: 'The effect size you enter is', kind: 'select', def: 'tot', options: [
        { value: 'tot', label: 'Effect on those who take up (TOT / LATE)' }, { value: 'itt', label: 'Effect of being offered (ITT)' }] },
      { id: 'cT', label: 'Take-up in the treatment group', kind: 'number', min: 0.01, max: 1, step: 0.05, def: 0.6 },
      { id: 'cC', label: 'Take-up in the control group', kind: 'number', min: 0, max: 0.99, step: 0.05, def: 0 }
    ],
    normalize: (inp, problems) => {
      if (inp.cT <= inp.cC) problems.push({ code: 'takeup', message: 'Take-up in the treatment group must be higher than in the control group.' });
    },
    size: sizeN, sizes: twoArm, indexFromSize: twoArmIndex, minIndex: () => 2,
    effect: (inp, e) => (inp.estimand === 'tot' ? e * Math.max(inp.cT - inp.cC, 0) : e),
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: 1, df: s.total - 2 }),
    details: (inp, res) => {
      if (res.mde === null) return [];
      const gap = Math.max(inp.cT - inp.cC, 0);
      const itt = inp.estimand === 'tot' ? res.mde * gap : res.mde;
      const tot = inp.estimand === 'tot' ? res.mde : (gap > 0 ? res.mde / gap : null);
      return [{ label: 'ITT effect (SD)', value: U.fmt(itt) }, { label: 'TOT / LATE effect (SD)', value: U.fmt(tot) }, { label: 'Take-up gap', value: U.fmt(gap, 2) }];
    },
    sensitivity: { label: 'Take-up in treatment', values: () => [0.2, 0.4, 0.6, 0.8, 1], current: i => i.cT, apply: (i, v) => { i.cT = v; } },
    chart: (inp, api) => ({
      title: 'Required sample by take-up', xLabel: 'Take-up in the treatment group', yLabel: RECRUIT_AXIS,
      series: [api.series('Required sample', [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].filter(x => x > inp.cC), x => ({ solve: 'n', cT: x }), 'n')]
    })
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
