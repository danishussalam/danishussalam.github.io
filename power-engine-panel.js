/* Power Calculator engine: designs with repeated measurements.
 * Baseline + follow-up rounds, within-subject / crossover, difference-in-differences,
 * and interrupted time series. */
(function (root) {
  'use strict';
  const PE = root.PowerEngine, U = PE.util, F = PE.formulas;
  const RECRUIT_AXIS = 'Total sample to recruit';

  // McKenzie (2012) variance factors relative to a single post-treatment comparison (equicorrelated errors).
  F.mckenzie = function (estimator, m, r, rho) {
    const post = (1 + (r - 1) * rho) / r;
    if (estimator === 'post' || m === 0) return post;
    if (estimator === 'did') return post + (1 + (m - 1) * rho) / m - 2 * rho;
    return post - m * rho * rho / (1 + (m - 1) * rho);
  };

  // Burlig, Preonas & Woerman (2020): variance of the unit-level post − pre mean difference.
  F.burlig = (m, r, s2, psiB, psiA, psiX) =>
    ((m + r) / (m * r)) * s2 + ((m - 1) / m) * psiB + ((r - 1) / r) * psiA - 2 * psiX;

  // Average residual covariances under AR(1): Cov(e_s, e_t) = s2 · ρ^|s−t|.
  const covCache = new Map();
  F.ar1Covariances = function (m, r, s2, rho) {
    const key = [m, r, s2, rho].join('|');
    if (covCache.has(key)) return covCache.get(key);
    let sB = 0, nB = 0, sA = 0, nA = 0, sX = 0;
    for (let s = 1; s <= m; s++) for (let t = 1; t <= m; t++) if (s !== t) { sB += Math.pow(rho, Math.abs(s - t)); nB++; }
    for (let s = 1; s <= r; s++) for (let t = 1; t <= r; t++) if (s !== t) { sA += Math.pow(rho, Math.abs(s - t)); nA++; }
    for (let s = 1; s <= m; s++) for (let t = m + 1; t <= m + r; t++) sX += Math.pow(rho, t - s);
    const out = { psiB: nB ? s2 * sB / nB : 0, psiA: nA ? s2 * sA / nA : 0, psiX: s2 * sX / (m * r) };
    if (covCache.size > 2000) covCache.clear();
    covCache.set(key, out);
    return out;
  };

  // Segmented regression GLS variance under stationary AR(1) errors with unit marginal variance.
  // Columns: intercept, time, post, post × (t − T0 − 1). coefIndex 2 = level change, 3 = slope change.
  F.itsVariance = function (T0, T1, rho, coefIndex) {
    const T = T0 + T1, k = 1 / (1 - rho * rho);
    const X = [];
    for (let t = 1; t <= T; t++) { const p = t > T0 ? 1 : 0; X.push([1, t, p, p * (t - T0 - 1)]); }
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < T; i++) {
      const diag = (i === 0 || i === T - 1) ? 1 : 1 + rho * rho;   // tridiagonal AR(1) precision matrix
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        A[a][b] += k * diag * X[i][a] * X[i][b];
        if (i + 1 < T) A[a][b] -= k * rho * (X[i][a] * X[i + 1][b] + X[i + 1][a] * X[i][b]);
      }
    }
    const inv = U.matInv(A);
    return inv ? inv[coefIndex][coefIndex] : Infinity;
  };

  const rhoColumn = { label: 'Correlation ρ', values: () => [0.1, 0.3, 0.5, 0.7, 0.9], current: i => i.rho, apply: (i, v) => { i.rho = v; } };
  const sizeN = { id: 'N', label: 'Total sample size (recruited)', min: 4, max: 10000000, def: 500, unit: 'participants' };

  // 5. Baseline + follow-up rounds ---------------------------------------------
  PE.register({
    id: 'baseline_followup', label: 'Baseline + follow-up survey rounds', group: 'experimental',
    description: 'A randomised trial with one or more baseline and follow-up survey rounds, analysed by POST, ANCOVA or difference-in-differences.',
    method: 'Two-arm formula with the variance factor from McKenzie (2012): POST (1+(r−1)ρ)/r; DiD adds (1+(m−1)ρ)/m − 2ρ; ANCOVA subtracts mρ²/(1+(m−1)ρ), for m baselines, r follow-ups and autocorrelation ρ.',
    citation: 'McKenzie (2012)',
    allocation: true,
    inputs: [
      { id: 'baselines', label: 'Baseline rounds', kind: 'int', min: 0, max: 10, step: 1, def: 1, scale: 'linear' },
      { id: 'followups', label: 'Follow-up rounds', kind: 'int', min: 1, max: 10, step: 1, def: 1, scale: 'linear' },
      { id: 'rho', label: 'Autocorrelation of the outcome (ρ)', kind: 'number', min: 0, max: 0.99, step: 0.05, def: 0.5, ref: 'rho',
        help: 'Correlation between the same person\'s outcome in different survey rounds.' },
      { id: 'estimator', label: 'Estimator', kind: 'select', def: 'ancova', options: [
        { value: 'ancova', label: 'ANCOVA (control for baseline)' }, { value: 'did', label: 'Difference-in-differences' }, { value: 'post', label: 'POST (follow-up only)' }] }
    ],
    normalize: (inp, problems) => {
      if (inp.baselines === 0 && inp.estimator !== 'post') {
        inp.estimator = 'post';
        problems.push({ code: 'no_baseline', message: 'Without a baseline round only the POST estimator is available, so it has been selected.' });
      }
    },
    size: sizeN,
    sizes: (inp, k) => U.twoArmSizes(inp.P, k, 'participants'),
    indexFromSize: (inp, N) => U.twoArmIndex(inp.P, N), minIndex: () => 2,
    model: (inp, s) => ({ kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: F.mckenzie(inp.estimator, inp.baselines, inp.followups, inp.rho), df: s.total - 2 }),
    details: inp => [{ label: 'Variance factor', value: U.fmt(F.mckenzie(inp.estimator, inp.baselines, inp.followups, inp.rho)) }],
    sensitivity: rhoColumn,
    chart: (inp, api) => {
      const xs = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      const series = [api.series('POST', xs, x => ({ solve: 'n', rho: x, estimator: 'post' }), 'n')];
      if (inp.baselines > 0) {
        series.push(api.series('ANCOVA', xs, x => ({ solve: 'n', rho: x, estimator: 'ancova' }), 'n'));
        series.push(api.series('DiD', xs, x => ({ solve: 'n', rho: x, estimator: 'did' }), 'n'));
      }
      return { title: 'Required sample by autocorrelation and estimator', xLabel: 'Autocorrelation ρ', yLabel: RECRUIT_AXIS, series };
    }
  });

  // 7. Within-subject / crossover ----------------------------------------------
  PE.register({
    id: 'within_subject', label: 'Within-subject / crossover', group: 'experimental',
    description: 'Each participant is measured under both conditions; power depends on the correlation between their measurements.',
    method: 'Paired t-test: Var = 2(1 − ρ)/N in SD units, with N − 1 degrees of freedom.',
    citation: 'Cohen (1988); Senn (2002)',
    inputs: [
      { id: 'layout', label: 'Design', kind: 'select', def: 'within', options: [
        { value: 'within', label: 'Within-subject (both conditions per person)' }, { value: 'crossover', label: 'Two-period crossover (AB/BA)' }] },
      { id: 'rho', label: 'Correlation between a person\'s two measurements', kind: 'number', min: 0, max: 0.99, step: 0.05, def: 0.5, ref: 'rho' }
    ],
    size: { id: 'N', label: 'Number of participants (recruited)', min: 3, max: 10000000, def: 100, unit: 'participants' },
    sizes: (inp, k) => ({ total: k, unit: 'participants', breakdown: [] }),
    indexFromSize: (inp, N) => Math.max(3, N), minIndex: () => 3,
    model: (inp, s) => ({ kind: 'general', V: 2 * (1 - inp.rho) / s.total, df: s.total - 1 }),
    warnings: inp => (inp.layout === 'crossover' ? [{ code: 'carryover', message: 'Assumes no carry-over between periods and no period-by-treatment interaction.' }] : []),
    sensitivity: rhoColumn,
    chart: (inp, api) => ({
      title: 'Required participants by within-person correlation', xLabel: 'Correlation ρ', yLabel: 'Participants to recruit',
      series: [api.series('Required participants', [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], x => ({ solve: 'n', rho: x }), 'n')]
    })
  });

  // 11. Difference-in-differences ----------------------------------------------
  PE.register({
    id: 'did', label: 'Difference-in-differences', group: 'quasi',
    description: 'Treated and comparison units observed before and after treatment, allowing several periods and serially correlated outcomes.',
    method: 'MDE = (t₁₋α/₂ + t₁₋β)·√((1/(P(1−P)J))·[((m+r)/(mr))σ² + ((m−1)/m)ψᴮ + ((r−1)/r)ψᴬ − 2ψˣ]), with AR(1) covariances averaged within and across the m pre and r post periods.',
    citation: 'Burlig, Preonas & Woerman (2020)',
    allocation: true,
    effectLabel: 'Effect size (in residual SD units when SD = 1)',
    inputs: [
      { id: 'pre', label: 'Pre-treatment periods', kind: 'int', min: 1, max: 60, step: 1, def: 1, scale: 'linear' },
      { id: 'post', label: 'Post-treatment periods', kind: 'int', min: 1, max: 60, step: 1, def: 1, scale: 'linear' },
      { id: 'rho', label: 'Serial correlation (AR(1) ρ)', kind: 'number', min: 0, max: 0.99, step: 0.05, def: 0.5, ref: 'rho',
        help: 'Correlation between a unit\'s residuals in adjacent periods; it decays as ρ to the power of the gap for periods further apart.' },
      { id: 'sigma', label: 'Residual SD', kind: 'number', min: 0.01, max: 1000, step: 0.01, def: 1, scale: 'log',
        help: 'Leave at 1 to express the effect in standard deviations.' }
    ],
    size: { id: 'J', label: 'Number of units, treated + comparison (recruited)', min: 4, max: 1000000, def: 200, unit: 'units' },
    sizes: (inp, k) => U.twoArmSizes(inp.P, k, 'units', ['Treated units', 'Comparison units']),
    indexFromSize: (inp, J) => U.twoArmIndex(inp.P, J), minIndex: () => 2,
    model: (inp, s) => {
      const s2 = inp.sigma * inp.sigma, c = F.ar1Covariances(inp.pre, inp.post, s2, inp.rho);
      return { kind: 'twoGroup', nT: s.nT, nC: s.nC, mult: F.burlig(inp.pre, inp.post, s2, c.psiB, c.psiA, c.psiX), df: s.total - 2 };
    },
    details: (inp, res) => (res.n ? [{ label: 'Unit-period observations', value: (res.n.analysed * (inp.pre + inp.post)).toLocaleString('en-GB') }] : []),
    sensitivity: { label: 'Serial correlation ρ', values: () => [0.1, 0.3, 0.5, 0.7, 0.9], current: i => i.rho, apply: (i, v) => { i.rho = v; } },
    chart: (inp, api) => ({
      title: 'Minimum detectable effect by number of pre-treatment periods', xLabel: 'Pre-treatment periods', yLabel: 'Minimum detectable effect',
      series: [api.series('Minimum detectable effect', [1, 2, 3, 4, 6, 8, 12, 18, 24], x => ({ solve: 'mde', pre: x, J: api.sizeValue }), 'mde')]
    })
  });

  // 14. Interrupted time series ------------------------------------------------
  const itsSize = i => (i.target === 'pre'
    ? { id: 'T0', label: 'Pre-intervention time points', min: 3, max: 5000, def: 24, unit: 'time points', attrition: false }
    : { id: 'T1', label: 'Post-intervention time points', min: 2, max: 5000, def: 24, unit: 'time points', attrition: false });

  PE.register({
    id: 'its', label: 'Interrupted time series', group: 'quasi',
    description: 'A single series observed at many time points before and after an intervention, analysed by segmented regression with autocorrelated errors.',
    method: 'Exact GLS variance Var(β̂) = σ²(X′Σ⁻¹X)⁻¹ for the regression on intercept, time, post and post × time since intervention, with AR(1) Σ; T − 4 degrees of freedom.',
    citation: 'Wagner, Soumerai, Zhang & Ross-Degnan (2002)',
    approximation: 'The autocorrelation ρ is treated as known; with short series it is estimated imprecisely, so real power will be somewhat lower.',
    shared: ['solve', 'alpha', 'sides', 'power'],
    inputs: [
      { id: 'effectType', label: 'Effect of interest', kind: 'select', def: 'level', options: [
        { value: 'level', label: 'Immediate level change' }, { value: 'slope', label: 'Change in trend (per period)' }] },
      { id: 'target', label: 'Sample dimension', kind: 'select', def: 'post', options: [
        { value: 'post', label: 'Post-intervention points' }, { value: 'pre', label: 'Pre-intervention points' }],
        help: 'Which count is solved for (or varied), with the other held fixed.' },
      { id: 'T0', label: 'Pre-intervention time points', kind: 'int', min: 3, max: 5000, step: 1, def: 36, scale: 'log', when: i => i.target !== 'pre' },
      { id: 'T1', label: 'Post-intervention time points', kind: 'int', min: 2, max: 5000, step: 1, def: 24, scale: 'log', when: i => i.target === 'pre' },
      { id: 'rho', label: 'Autocorrelation (AR(1) ρ)', kind: 'number', min: 0, max: 0.95, step: 0.05, def: 0.3, ref: 'rho' }
    ],
    effectLabel: 'Effect size (residual SD units)',
    effectDefault: 1.5,   // aggregated series typically need large standardised changes; 0.2 SD is rarely detectable
    size: itsSize,
    sizes: (inp, k) => {
      const T0 = inp.target === 'pre' ? k : inp.T0, T1 = inp.target === 'pre' ? inp.T1 : k;
      return { T0, T1, total: T0 + T1, sizeValue: k, unit: 'time points',
        breakdown: [{ label: 'Pre-intervention points', value: T0 }, { label: 'Post-intervention points', value: T1 }] };
    },
    indexFromSize: (inp, v) => v,
    minIndex: inp => (inp.target === 'pre' ? 3 : 2), maxIndex: () => 5000,
    model: (inp, s) => ({ kind: 'general', V: F.itsVariance(s.T0, s.T1, inp.rho, inp.effectType === 'slope' ? 3 : 2), df: s.total - 4 }),
    sensitivity: { label: 'Autocorrelation ρ', values: () => [0, 0.2, 0.4, 0.6, 0.8], current: i => i.rho, apply: (i, v) => { i.rho = v; } },
    chart: (inp, api) => {
      const id = itsSize(inp).id;
      return {
        title: 'Power by number of ' + (id === 'T1' ? 'post' : 'pre') + '-intervention points', xLabel: itsSize(inp).label, yLabel: 'Power',
        series: [api.series('Power', U.spread(api.sizeValue, 14, id === 'T1' ? 2 : 3), x => ({ solve: 'power', [id]: x }), 'power')]
      };
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
