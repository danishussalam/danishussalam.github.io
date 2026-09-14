/* Power Calculator engine: core.
 * Distribution functions, the design registry, input schema and validation,
 * and the generic solver for sample size, minimum detectable effect (MDE) and power.
 * Design files (power-engine-*.js) register their designs onto PowerEngine.
 * No DOM access: the same file runs in the browser and in the Node tests. */
(function (root) {
  'use strict';
  const PE = root.PowerEngine = root.PowerEngine || {};
  PE.designs = PE.designs || {};
  PE.order = PE.order || [];
  PE.formulas = PE.formulas || {};

  // ---------------------------------------------------------------------------
  // Distributions
  // ---------------------------------------------------------------------------

  // Log-gamma via the Lanczos approximation (g = 7, n = 9).
  function lgamma(x) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61503916999185, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // Continued fraction for the regularised incomplete beta (Numerical Recipes betacf).
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  // Regularised incomplete beta I_x(a, b).
  function ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }

  // Complementary error function (Numerical Recipes erfcc; |error| < 1.2e-7).
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }

  const normCdf = x => 0.5 * erfc(-x / Math.SQRT2);

  // Inverse normal CDF (Acklam's algorithm; relative error < 1.2e-9).
  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425;
    let q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= 1 - pl) {
      q = p - 0.5; r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  // Student t CDF through the incomplete beta function.
  function tCdf(t, df) {
    if (!isFinite(df) || df > 1e7) return normCdf(t);
    const tail = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5);
    return t >= 0 ? 1 - tail : tail;
  }

  function tPdf(t, df) {
    return Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI) - (df + 1) / 2 * Math.log(1 + t * t / df));
  }

  function tInvBisect(p, df) {
    let lo = -1, hi = 1;
    while (tCdf(lo, df) > p) lo *= 2;
    while (tCdf(hi, df) < p) hi *= 2;
    for (let i = 0; i < 200 && hi - lo > 1e-12; i++) {
      const mid = (lo + hi) / 2;
      if (tCdf(mid, df) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Inverse t CDF: Newton's method from the normal quantile, bisection fallback, memoised.
  const tInvCache = new Map();
  function tInv(p, df) {
    if (!(p > 0 && p < 1) || !(df > 0)) return NaN;
    if (!isFinite(df) || df > 1e7) return normInv(p);
    const key = p + '|' + df;
    if (tInvCache.has(key)) return tInvCache.get(key);
    let t = normInv(p);
    for (let i = 0; i < 30; i++) {
      const step = (tCdf(t, df) - p) / tPdf(t, df);
      if (!isFinite(step)) break;
      t -= step;
      if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(t))) break;
    }
    if (!isFinite(t) || Math.abs(tCdf(t, df) - p) > 1e-10) t = tInvBisect(p, df);
    if (tInvCache.size > 5000) tInvCache.clear();
    tInvCache.set(key, t);
    return t;
  }

  PE.stats = { normCdf, normInv, tCdf, tInv };

  // ---------------------------------------------------------------------------
  // Utilities shared by design files
  // ---------------------------------------------------------------------------

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const round = (x, dp) => { const f = Math.pow(10, dp); return Math.round(x * f) / f; };
  const fmt = (x, dp = 3) => (x === null || x === undefined || !isFinite(x)) ? '—' : String(round(x, dp));
  const uniq = values => values.filter((v, i) => values.findIndex(w => Math.abs(w - v) < 1e-12) === i);

  // Two groups sized from the control-group count c; treatment count follows the allocation share P.
  function twoArmSizes(P, c, unit, labels) {
    const nT = Math.max(1, Math.ceil(c * P / (1 - P) - 1e-9));
    return {
      total: nT + c, nT, nC: c, unit,
      breakdown: [
        { label: labels ? labels[0] : 'Treatment', value: nT, part: true },
        { label: labels ? labels[1] : 'Control', value: c, part: true }
      ]
    };
  }
  const twoArmIndex = (P, N) => Math.max(1, Math.round(N * (1 - P)));

  // Log-spaced integers around a centre value (chart x values).
  function spread(center, count, minValue = 4) {
    const c = Math.max(minValue, Math.round(center) || 100);
    const lo = Math.max(minValue, Math.floor(c / 4)), hi = Math.max(lo + count, Math.ceil(c * 2.5));
    const out = [];
    for (let i = 0; i < count; i++) {
      const v = Math.round(lo * Math.pow(hi / lo, i / (count - 1)));
      if (!out.includes(v)) out.push(v);
    }
    return out;
  }

  // Ensure the current value appears in a list of grid values (replacing the nearest one).
  function withCurrent(values, current) {
    if (current === undefined || current === null || values.some(v => Math.abs(v - current) < 1e-9)) return values.slice();
    const out = values.slice();
    let best = 0;
    out.forEach((v, i) => { if (Math.abs(v - current) < Math.abs(out[best] - current)) best = i; });
    out[best] = current;
    return out.sort((a, b) => a - b);
  }

  // Gauss–Jordan inverse with partial pivoting; returns null for a singular matrix.
  function matInv(A) {
    const n = A.length;
    const scale = Math.max(1e-300, ...A.map(row => Math.max(...row.map(Math.abs))));
    const M = A.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12 * scale) return null;
      [M[col], M[piv]] = [M[piv], M[col]];
      const d = M[col][col];
      for (let j = 0; j < 2 * n; j++) M[col][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
      }
    }
    return M.map(row => row.slice(n));
  }

  const attritionColumn = {
    label: 'Attrition', values: () => [0, 0.05, 0.1, 0.2, 0.3],
    current: i => i.attrition, apply: (i, v) => { i.attrition = v; }
  };

  PE.util = { clamp, round, fmt, uniq, twoArmSizes, twoArmIndex, spread, withCurrent, matInv, attritionColumn };

  // ---------------------------------------------------------------------------
  // Registry and input schema
  // ---------------------------------------------------------------------------

  PE.register = function (def) {
    if (!PE.designs[def.id]) PE.order.push(def.id);
    PE.designs[def.id] = def;
  };

  PE.list = () => PE.order.map(id => {
    const d = PE.designs[id];
    return { id, label: d.label, group: d.group, description: d.description, approximation: !!d.approximation, method: d.method, citation: d.citation };
  });

  const SHARED = {
    solve: { id: 'solve', label: 'Solve for', kind: 'select', def: 'n', options: [
      { value: 'n', label: 'Sample size' }, { value: 'mde', label: 'Minimum detectable effect' }, { value: 'power', label: 'Power' }] },
    outcome: { id: 'outcome', label: 'Outcome type', kind: 'select', def: 'continuous', options: [
      { value: 'continuous', label: 'Continuous' }, { value: 'binary', label: 'Binary (proportion)' }] },
    P: { id: 'P', label: 'Share assigned to treatment', kind: 'number', min: 0.05, max: 0.95, step: 0.05, def: 0.5,
      help: 'Equal allocation (0.5) gives the most power for a fixed total sample.' },
    alpha: { id: 'alpha', label: 'Significance level (α)', kind: 'number', min: 0.001, max: 0.2, step: 0.005, def: 0.05,
      help: 'Probability of a false positive. 0.05 is conventional.' },
    sides: { id: 'sides', label: 'Test', kind: 'select', def: 2, options: [{ value: 2, label: 'Two-sided' }, { value: 1, label: 'One-sided' }] },
    power: { id: 'power', label: 'Power (1 − β)', kind: 'number', min: 0.5, max: 0.99, step: 0.01, def: 0.8,
      help: 'Probability of detecting the effect if it exists. 0.80 is conventional; 0.90 is stricter.' },
    attrition: { id: 'attrition', label: 'Expected attrition', kind: 'number', min: 0, max: 0.9, step: 0.01, def: 0,
      help: 'Share of the recruited sample you expect to lose. Sample sizes you enter are treated as recruited.' }
  };
  const DEFAULT_SHARED = ['solve', 'alpha', 'sides', 'power', 'attrition'];
  const D_INPUT = { id: 'd', label: 'Effect size (SD units)', kind: 'number', min: 0.001, max: 5, step: 0.01, def: 0.2, converter: true,
    help: 'Standardised effect: the difference in means divided by the outcome standard deviation (Cohen\'s d).' };
  const P0_INPUT = { id: 'p0', label: 'Control-group proportion', kind: 'number', min: 0.001, max: 0.999, step: 0.01, def: 0.5 };
  const P1_INPUT = { id: 'p1', label: 'Treatment-group proportion', kind: 'number', min: 0.001, max: 0.999, step: 0.01, def: 0.55 };

  function getDef(id) {
    const d = PE.designs[id];
    if (!d) throw new Error('Unknown design: ' + id);
    return d;
  }
  const sharedOf = def => def.shared || DEFAULT_SHARED;
  const sizeOf = (def, inp) => (typeof def.size === 'function' ? def.size(inp) : def.size) || null;
  const isBinary = (def, inp) => !!def.binary && inp.outcome === 'binary';
  PE.effectId = (def, inp) => def.effectInput ? def.effectInput.id : (isBinary(def, inp) ? 'p1' : 'd');

  PE.inputsFor = function (designId, inputs) {
    const def = getDef(designId), shared = sharedOf(def);
    const inp = Object.assign({}, inputs || {});
    if (!shared.includes('solve')) inp.solve = 'power';
    const solve = inp.solve || 'n';
    const list = [];
    const add = (s, group, hidden) => list.push(Object.assign({}, s, { group, hidden: !!hidden }));

    if (shared.includes('solve')) add(SHARED.solve, 'shared');
    if (def.binary) add(SHARED.outcome, 'shared');
    if (!def.guidanceOnly) {
      if (def.effectInput) add(def.effectInput, 'effect', solve === 'mde');
      else if (def.binary && inp.outcome === 'binary') { add(P0_INPUT, 'effect'); add(P1_INPUT, 'effect', solve === 'mde'); }
      else add(Object.assign({}, D_INPUT, def.effectLabel ? { label: def.effectLabel } : {},
        def.effectDefault !== undefined ? { def: def.effectDefault } : {}), 'effect', solve === 'mde');
      const size = sizeOf(def, Object.assign({ solve }, inp));
      if (size) add(Object.assign({ kind: 'int', step: 1, scale: 'log' }, size), 'size', solve === 'n');
    }
    (def.inputs || []).forEach(s => add(s, 'design', s.when ? !s.when(Object.assign({ solve }, inp)) : false));
    if (def.allocation) add(SHARED.P, 'shared');
    if (shared.includes('alpha')) add(SHARED.alpha, 'shared');
    if (shared.includes('sides') && !def.sidesLocked) add(SHARED.sides, 'shared');
    if (shared.includes('power')) add(SHARED.power, 'shared', solve === 'power');
    if (shared.includes('attrition')) add(SHARED.attrition, 'shared');
    return list;
  };

  function coerce(s, v) {
    const empty = v === undefined || v === null || v === '';
    if (s.kind === 'select') {
      const opt = s.options.find(o => String(o.value) === String(v));
      if (opt) return { value: opt.value };
      return { value: s.def, note: empty ? null : 'was not a valid choice and was reset' };
    }
    let n = typeof v === 'number' ? v : parseFloat(v);
    if (empty || !isFinite(n)) return { value: s.def, note: empty ? null : 'was not a number and was reset' };
    if (s.kind === 'int') n = Math.round(n);
    if (n < s.min) return { value: s.min, note: 'was raised to the minimum of ' + s.min };
    if (n > s.max) return { value: s.max, note: 'was lowered to the maximum of ' + s.max };
    return { value: n };
  }

  PE.validate = function (designId, raw) {
    const def = getDef(designId), src = raw || {}, shared = sharedOf(def);
    let out = {}, problems = [];
    // Selects (solve, outcome, target…) change which inputs exist, so resolve the schema to a fixed point.
    for (let pass = 0; pass < 3; pass++) {
      const schema = PE.inputsFor(designId, pass === 0 ? src : out);
      out = {}; problems = [];
      schema.forEach(s => {
        if (Object.prototype.hasOwnProperty.call(out, s.id)) return;
        const r = coerce(s, src[s.id]);
        out[s.id] = r.value;
        if (r.note && !s.hidden) problems.push({ code: 'adjusted', input: s.id, message: `${s.label} ${r.note}.` });
      });
    }
    if (!shared.includes('solve')) out.solve = 'power';
    if (!shared.includes('attrition')) out.attrition = 0;
    if (!shared.includes('power')) out.power = 0.8;
    if (!shared.includes('sides') || def.sidesLocked) out.sides = def.sidesLocked || 2;
    if (def.normalize) def.normalize(out, problems);
    return { inputs: out, problems };
  };

  // ---------------------------------------------------------------------------
  // Solver
  // ---------------------------------------------------------------------------

  function effectOf(def, inp) { return inp[PE.effectId(def, inp)]; }

  function powerAt(def, inp, sizes, e) {
    const alpha = def.alpha ? def.alpha(inp) : inp.alpha;
    if (def.powerOverride) return def.powerOverride(inp, sizes, e, alpha);
    const m = def.model(inp, sizes);
    const sides = def.sidesLocked || inp.sides;
    const a = sides === 2 ? alpha / 2 : alpha;
    if (isBinary(def, inp) && m.kind === 'twoGroup') {
      // Pooled-variance normal approximation for two proportions (Stata power twoproportions default).
      const p0 = inp.p0, p1 = e, pbar = (m.nT * p1 + m.nC * p0) / (m.nT + m.nC);
      const v0 = m.mult * pbar * (1 - pbar) * (1 / m.nT + 1 / m.nC);
      const v1 = m.mult * (p1 * (1 - p1) / m.nT + p0 * (1 - p0) / m.nC);
      const zc = normInv(1 - a), delta = Math.abs(p1 - p0);
      let pw = normCdf((delta - zc * Math.sqrt(v0)) / Math.sqrt(v1));
      if (sides === 2) pw += normCdf((-delta - zc * Math.sqrt(v0)) / Math.sqrt(v1));
      return Math.min(1, pw);
    }
    const V = m.kind === 'twoGroup' ? m.mult * (1 / m.nT + 1 / m.nC) : m.V;
    if (!(V > 0) || !isFinite(V)) return a * (sides === 2 ? 2 : 1);
    const df = Math.max(1, m.df);
    const eff = Math.abs(def.effect ? def.effect(inp, e) : e);
    const lambda = eff / Math.sqrt(V), tc = tInv(1 - a, df);
    let p = tCdf(lambda - tc, df);
    if (sides === 2) p += tCdf(-lambda - tc, df);
    return Math.min(1, p);
  }

  // Smallest search index k with power ≥ target (exponential then binary search); null if unreachable.
  function searchIndex(def, inp, e, target) {
    const f = k => powerAt(def, inp, def.sizes(inp, k), e);
    const kmin = def.minIndex ? def.minIndex(inp) : 1, kmax = def.maxIndex ? def.maxIndex(inp) : 1e7;
    if (f(kmin) >= target) return kmin;
    let lo = kmin, hi = kmin;
    while (f(hi) < target) {
      if (hi >= kmax) return null;
      lo = hi;
      hi = Math.min(kmax, hi * 2);
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (f(mid) >= target) hi = mid; else lo = mid;
    }
    return hi;
  }

  // f(a) < target ≤ f(b): returns the boundary on b's side, or null if f(b) < target.
  function bisect(f, a, b, target) {
    if (f(b) < target) return null;
    if (f(a) >= target) return a;
    for (let i = 0; i < 60; i++) {
      const mid = (a + b) / 2;
      if (f(mid) >= target) b = mid; else a = mid;
    }
    return b;
  }

  function solveEffect(def, inp, sizes, target) {
    const f = e => powerAt(def, inp, sizes, e);
    if (isBinary(def, inp)) {
      const up = bisect(f, inp.p0 + 1e-6, 0.999999, target);
      return up !== null ? up : bisect(f, inp.p0 - 1e-6, 0.000001, target);
    }
    let lo = 1e-6, hi = 0.01;
    if (f(lo) >= target) return lo;
    while (f(hi) < target) {
      lo = hi; hi *= 2;
      if (hi > 1000) return null;
    }
    return bisect(f, lo, hi, target);
  }

  function solveCore(def, inp) {
    const e = effectOf(def, inp), r = { unreachable: false, sizes: null, k: null, mde: null, power: null };
    if (inp.solve === 'n') {
      r.k = searchIndex(def, inp, e, inp.power);
      if (r.k === null) { r.unreachable = true; return r; }
    } else {
      const size = sizeOf(def, inp), raw = inp[size.id];
      const analysed = size.attrition === false ? raw : Math.max(size.min, Math.floor(raw * (1 - (inp.attrition || 0)) + 1e-9));
      r.k = def.indexFromSize(inp, analysed);
    }
    r.sizes = def.sizes(inp, r.k);
    if (inp.solve === 'mde') {
      r.mde = solveEffect(def, inp, r.sizes, inp.power);
      if (r.mde === null) r.unreachable = true; else r.power = inp.power;
    } else {
      r.mde = e;
      r.power = powerAt(def, inp, r.sizes, e);
    }
    return r;
  }

  function report(def, inp, sizes) {
    const a = inp.attrition || 0, size = sizeOf(def, inp);
    const inflate = v => Math.ceil(v / (1 - a) - 1e-9);
    let recruited, recruitedBreakdown;
    if (def.recruited) {
      const r = def.recruited(inp, sizes, a);
      recruited = r.total; recruitedBreakdown = r.breakdown;
    } else {
      const parts = (sizes.breakdown || []).filter(b => b.part);
      recruitedBreakdown = (sizes.breakdown || []).map(b => ({ label: b.label, value: b.part ? inflate(b.value) : b.value }));
      recruited = parts.length ? parts.reduce((t, b) => t + inflate(b.value), 0) : inflate(sizes.total);
    }
    const sv = sizes.sizeValue !== undefined ? sizes.sizeValue : sizes.total;
    return {
      analysed: sizes.total, recruited, unit: sizes.unit, breakdown: sizes.breakdown || [], recruitedBreakdown,
      recruitedSize: size && size.attrition === false ? sv : inflate(sv)
    };
  }

  function summaryOf(def, inp) {
    const c = solveCore(def, inp);
    if (!c.sizes) return { n: null, analysed: null, mde: null, power: null, sizes: null, unreachable: true };
    const rep = report(def, inp, c.sizes);
    return { n: rep.recruited, analysed: rep.analysed, mde: c.mde, power: c.power, sizes: c.sizes, unreachable: c.unreachable };
  }
  PE.summary = (designId, inputs) => summaryOf(getDef(designId), PE.validate(designId, inputs).inputs);

  function curveFor(def, inp, k, e) {
    const kmin = def.minIndex ? def.minIndex(inp) : 1, kmax = def.maxIndex ? def.maxIndex(inp) : 1e7;
    const lo = Math.max(kmin, Math.floor(k / 4)), hi = Math.min(kmax, Math.max(lo + 4, Math.ceil(k * 2.5)));
    const pts = [], seen = new Set();
    for (let i = 0; i <= 40; i++) {
      const kk = Math.round(lo * Math.pow(hi / lo, i / 40));
      if (seen.has(kk)) continue;
      seen.add(kk);
      const sz = def.sizes(inp, kk);
      pts.push({ x: sz.total, y: powerAt(def, inp, sz, e) });
    }
    return pts;
  }

  function makeApi(def, inp, res) {
    const base = Object.assign({}, inp), eid = PE.effectId(def, inp), binary = isBinary(def, inp);
    if (inp.solve === 'mde' && res.mde !== null && res.mde !== undefined) base[eid] = res.mde;
    const size = sizeOf(def, inp);
    const sizeValue = size ? (inp.solve === 'n' ? (res.n ? res.n.recruitedSize : size.def) : inp[size.id]) : null;
    const MULTS = [0.5, 0.75, 1, 1.25, 1.5];
    return {
      inputs: base, sizeValue, effect: base[eid],
      effectAxis: def.effectInput ? def.effectInput.label : (binary ? 'Treatment-group proportion' : 'Effect size (SD units)'),
      effectValues: () => binary
        ? uniq(MULTS.map(m => round(clamp(inp.p0 + (base.p1 - inp.p0) * m, 0.001, 0.999), 3)))
        : uniq(MULTS.map(m => round(base[eid] * m, 4))),
      effectPatch: x => ({ [eid]: x }),
      series(label, xs, overrides, pick) {
        const points = [];
        xs.forEach(x => {
          const v = PE.validate(def.id, Object.assign({}, base, overrides(x))).inputs;
          const s = summaryOf(def, v);
          const y = typeof pick === 'function' ? pick(s, v) : s[pick];
          if (y !== null && y !== undefined && isFinite(y)) points.push({ x, y });
        });
        return { label, points };
      }
    };
  }

  function sensitivityFor(def, inp, api) {
    const col = def.sensitivity;
    if (!col) return null;
    const size = sizeOf(def, inp);
    let row, rowCurrent;
    if (inp.solve === 'mde' && size) {
      const b = inp[size.id];
      row = { label: size.label, values: uniq([0.5, 0.75, 1, 1.5, 2].map(m => clamp(Math.round(b * m), size.min, size.max))), apply: (i, v) => { i[size.id] = v; } };
      rowCurrent = b;
    } else {
      const eid = PE.effectId(def, inp);
      row = { label: api.effectAxis, values: api.effectValues(), apply: (i, v) => { i[eid] = v; } };
      rowCurrent = api.effect;
    }
    const cur = col.current(inp), cols = uniq(withCurrent(col.values(inp), cur));
    const cells = row.values.map(rv => cols.map(cv => {
      const i = Object.assign({}, inp);
      row.apply(i, rv);
      col.apply(i, cv);
      const s = summaryOf(def, PE.validate(def.id, i).inputs);
      return inp.solve === 'n' ? s.n : inp.solve === 'mde' ? s.mde : s.power;
    }));
    return {
      rowLabel: row.label, colLabel: col.label, rows: row.values, cols, cells, quantity: inp.solve,
      currentRow: row.values.findIndex(v => Math.abs(v - rowCurrent) < 1e-9),
      currentCol: cols.findIndex(v => Math.abs(v - cur) < 1e-9)
    };
  }

  PE.compute = function (designId, raw) {
    const def = getDef(designId), v = PE.validate(designId, raw), inp = v.inputs;
    const res = {
      design: def.id, label: def.label, inputs: inp, solvedFor: inp.solve, binary: isBinary(def, inp),
      approximation: def.approximation || null, citation: def.citation, warnings: v.problems.slice(), details: [],
      unreachable: false, power: null, mde: null, df: null, n: null, sizes: null, curve: [], designChart: null, sensitivity: null
    };
    if (def.guidanceOnly) {
      res.solvedFor = 'guidance';
      res.guidance = def.guidanceOnly(inp);
      if (def.warnings) res.warnings = res.warnings.concat(def.warnings(inp, res, null));
      return res;
    }
    const core = solveCore(def, inp);
    res.unreachable = core.unreachable;
    if (core.unreachable) {
      res.warnings.push({ code: 'unreachable', message: def.unreachableMessage ? def.unreachableMessage(inp)
        : 'The target cannot be reached within the allowed range for this design. Try a larger effect, a larger sample, or lower power.' });
    }
    if (core.sizes) {
      res.sizes = core.sizes;
      res.power = core.power;
      res.mde = core.mde;
      res.n = report(def, inp, core.sizes);
      const m = def.model ? def.model(inp, core.sizes) : null;
      res.df = m && isFinite(m.df) ? m.df : null;
      if (res.mde !== null) res.curve = curveFor(def, inp, core.k, res.mde);
    }
    if (def.details) res.details = def.details(inp, res, core.sizes);
    if (def.warnings) res.warnings = res.warnings.concat(def.warnings(inp, res, core.sizes));
    const api = makeApi(def, inp, res);
    if (def.chart) {
      try { res.designChart = def.chart(inp, api); } catch (e) { res.designChart = null; }
    }
    res.sensitivity = sensitivityFor(def, inp, api);
    return res;
  };

  // Keep only suggestion inputs that exist for the design and are within range.
  PE.validateSuggestion = function (designId, inputs) {
    if (typeof designId !== 'string' || !PE.designs[designId] || !inputs || typeof inputs !== 'object') return null;
    const def = PE.designs[designId], known = {};
    const variants = [];
    ['n', 'mde', 'power'].forEach(solve => ['continuous', 'binary'].forEach(outcome => {
      variants.push(Object.assign({}, inputs, { solve, outcome }));
    }));
    (def.inputs || []).filter(s => s.kind === 'select').forEach(sel => {
      sel.options.forEach(o => variants.slice().forEach(vr => variants.push(Object.assign({}, vr, { [sel.id]: o.value }))));
    });
    variants.forEach(vr => PE.inputsFor(designId, vr).forEach(s => { if (!known[s.id]) known[s.id] = s; }));
    const clean = {};
    Object.keys(inputs).forEach(k => {
      const s = known[k];
      if (!s) return;
      const v = inputs[k];
      if (s.kind === 'select') {
        const o = s.options.find(opt => String(opt.value) === String(v));
        if (o) clean[k] = o.value;
        return;
      }
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (!isFinite(n) || n < s.min || n > s.max) return;
      clean[k] = s.kind === 'int' ? Math.round(n) : n;
    });
    return Object.keys(clean).length ? { design: designId, inputs: clean } : null;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
