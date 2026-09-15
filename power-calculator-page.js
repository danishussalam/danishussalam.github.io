/* Power Calculator page: renders the form from the engine schema, recomputes on every change,
 * draws charts and the sensitivity table, and handles presets, exports, the shareable URL and
 * saving calculator state in the browser. Exposes PowerStore and PowerPage for the chat panel. */
(function () {
  'use strict';
  const PE = window.PowerEngine, EX = window.PowerExport, REFS = window.POWER_REFS || {};
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'powercalc.v1';
  const CYPRUS = '#163300', MID = '#454745', SAND_DARK = '#868685', GRID = 'rgba(14, 15, 12, 0.08)';
  const SERIES = ['#163300', '#9fe870', '#868685', '#ffc091'];
  const QUANTITY = { n: 'Required sample', mde: 'Minimum detectable effect', power: 'Power', guidance: 'Synthetic control inference' };
  const CARRY = ['solve', 'alpha', 'sides', 'power'];   // inputs kept when switching design

  // ---- Browser storage shared with the chat (storage can be unavailable: never throw) ----
  const PowerStore = window.PowerStore = {
    read() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } },
    patch(obj) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign(this.read(), obj, { updatedAt: new Date().toISOString() })));
      } catch (e) { /* keep working without storage */ }
    }
  };

  // ---- Presets: illustrative starting points ----
  const PRESETS = [
    { id: 'survey_disclosure', label: 'Online survey experiment on disclosure', design: 'two_arm', note: 'Illustrative preset: comprehension rises from 50% to 55%.',
      inputs: { solve: 'n', outcome: 'binary', p0: 0.5, p1: 0.55, power: 0.8, alpha: 0.05, P: 0.5 } },
    { id: 'nudge_multi', label: 'Multi-arm nudge trial', design: 'multi_arm', note: 'Illustrative preset: three nudges against one control with a Holm correction.',
      inputs: { solve: 'n', arms: 3, correction: 'holm', allocRule: 'equal', d: 0.15 } },
    { id: 'school_cluster', label: 'School cluster RCT', design: 'cluster_rct', note: 'Illustrative preset: 25 pupils per school; school covariates explain half the between-school variance.',
      inputs: { solve: 'n', target: 'clusters', icc: 0.15, m: 25, r2c: 0.5, d: 0.2 } },
    { id: 'household_ancova', label: 'Household survey with baseline + follow-up', design: 'baseline_followup', note: 'Illustrative preset: one baseline and one follow-up, analysed by ANCOVA.',
      inputs: { solve: 'n', baselines: 1, followups: 1, rho: 0.5, estimator: 'ancova', d: 0.2 } },
    { id: 'policy_did', label: 'Staggered policy change, monthly panel', design: 'did', note: 'Illustrative preset: 12 months before and after for 200 units.',
      inputs: { solve: 'mde', pre: 12, post: 12, rho: 0.7, J: 200, P: 0.5 } },
    { id: 'credit_rdd', label: 'Eligibility-cutoff RDD (e.g. credit score)', design: 'rdd', note: 'Illustrative preset: 2,000 applicants within the bandwidth.',
      inputs: { solve: 'power', type: 'sharp', dist: 'normal', N: 2000, d: 0.2 } }
  ];

  let state = { design: 'two_arm', inputs: {} };
  let touched = false, lastResult = null, curveChart = null, designChart = null, pending = false;
  const listeners = [];

  // ---- Small DOM helpers ----
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const pct = x => String(Math.round(x * 1000) / 10) + '%';
  const num = x => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-GB') : String(PE.util.round(x, 3)));
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // ---- Static controls ----
  function buildDesignSelect() {
    const sel = $('designSelect');
    [['experimental', 'Experimental'], ['quasi', 'Quasi-experimental']].forEach(([group, label]) => {
      const og = document.createElement('optgroup');
      og.label = label;
      PE.list().filter(d => d.group === group).forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.label; og.appendChild(o); });
      sel.appendChild(og);
    });
    sel.addEventListener('change', () => {
      // Carry shared settings only if the previous design actually showed them (synthetic control has no solve/power).
      const carried = {}, shown = PE.inputsFor(state.design, state.inputs).filter(s => !s.hidden || s.id === 'power').map(s => s.id);
      CARRY.forEach(k => { if (shown.includes(k) && state.inputs[k] !== undefined) carried[k] = state.inputs[k]; });
      state = { design: sel.value, inputs: carried };
      touched = true;
      render();
    });
  }

  function buildPresetSelect() {
    const sel = $('presetSelect');
    PRESETS.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; sel.appendChild(o); });
    sel.addEventListener('change', () => {
      const p = PRESETS.find(x => x.id === sel.value);
      if (!p) return;
      state = { design: p.design, inputs: Object.assign({}, p.inputs) };
      touched = true;
      render();
      toast(p.note);
      sel.value = '';
    });
  }

  function segButtons(container, options, current, onPick) {
    container.innerHTML = '';
    options.forEach(o => {
      const b = el('button', 'px-2 py-2 rounded-full', o.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(String(o.value) === String(current)));
      b.addEventListener('click', () => onPick(o.value));
      container.appendChild(b);
    });
  }

  function renderSegments(schema) {
    const solve = schema.find(s => s.id === 'solve'), outcome = schema.find(s => s.id === 'outcome');
    $('solveBox').hidden = !solve;
    if (solve) segButtons($('solveControl'), solve.options.map(o => ({ value: o.value, label: o.value === 'mde' ? 'MDE' : o.label })), state.inputs.solve, v => setInput('solve', v, true));
    $('outcomeBox').hidden = !outcome;
    if (outcome) segButtons($('outcomeControl'), outcome.options, state.inputs.outcome, v => setInput('outcome', v, true));
  }

  // ---- Inputs rendered from the engine schema ----
  function refPanel(key) {
    const wrap = el('div', 'hidden mt-2 bg-white border border-sand-dark rounded-xl p-3 text-[12px] leading-relaxed space-y-2');
    REFS[key].forEach(r => {
      const p = el('p');
      p.appendChild(el('strong', '', r.range + ' '));
      p.appendChild(document.createTextNode(`— ${r.context}. `));
      const a = el('a', 'underline', r.source);
      a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
      p.appendChild(a);
      wrap.appendChild(p);
    });
    wrap.appendChild(el('p', 'text-gray-500', 'These are typical ranges — use values from your own pilot or baseline data where possible.'));
    return wrap;
  }

  function inputRow(s) {
    const wrap = el('div');
    const id = 'in-' + s.id, val = state.inputs[s.id];
    const head = el('div', 'flex items-center justify-between gap-3 mb-1.5');
    const label = el('label', 'text-[13px] font-semibold text-gray-900', s.label);
    label.htmlFor = id;
    head.appendChild(label);
    const tools = el('div', 'flex items-center gap-3 text-[12px] shrink-0');
    let panel = null;
    if (s.ref && REFS[s.ref] && REFS[s.ref].length) {
      panel = refPanel(s.ref);
      const b = el('button', 'underline underline-offset-2 text-du-blue', 'Typical values');
      b.type = 'button';
      b.addEventListener('click', () => panel.classList.toggle('hidden'));
      tools.appendChild(b);
    }
    if (s.converter) {
      const b = el('button', 'underline underline-offset-2 text-du-blue', 'Converter');
      b.type = 'button';
      b.addEventListener('click', () => { $('converter').open = true; $('converter').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      tools.appendChild(b);
    }
    head.appendChild(tools);
    wrap.appendChild(head);

    if (s.kind === 'select') {
      const sel = el('select', 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-sand');
      sel.id = id;
      s.options.forEach(o => {
        const opt = el('option', '', o.label);
        opt.value = String(o.value);
        if (String(o.value) === String(val)) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => setInput(s.id, sel.value, true));
      wrap.appendChild(sel);
    } else {
      const row = el('div', 'flex items-center gap-3');
      const range = el('input', 'flex-1 min-w-0');
      range.type = 'range'; range.min = 0; range.max = 1000; range.step = 1;
      range.setAttribute('aria-label', s.label + ' slider');
      const box = el('input', 'w-28 shrink-0 border border-gray-300 rounded-lg px-3 py-2 text-[14px] text-right focus:outline-none focus:ring-2 focus:ring-sand');
      box.type = 'number'; box.id = id; box.min = s.min; box.max = s.max; box.step = s.kind === 'int' ? 1 : 'any'; box.value = val;
      const log = s.scale === 'log' && s.min > 0;
      const toSlider = x => Math.round(1000 * (log ? Math.log(x / s.min) / Math.log(s.max / s.min) : (x - s.min) / (s.max - s.min)));
      const fromSlider = p => {
        const x = log ? s.min * Math.pow(s.max / s.min, p / 1000) : s.min + (s.max - s.min) * p / 1000;
        if (s.kind === 'int') return Math.round(x);
        const st = s.step || 0.001;
        return PE.util.round(Math.round(x / st) * st, 6);
      };
      range.value = toSlider(val);
      range.addEventListener('input', () => { const x = fromSlider(+range.value); box.value = x; setInput(s.id, x, false); });
      box.addEventListener('input', () => {
        if (box.value === '' || !isFinite(+box.value)) return;
        range.value = toSlider(Math.min(s.max, Math.max(s.min, +box.value)));
        setInput(s.id, +box.value, false);
      });
      box.addEventListener('change', () => render());   // show the validated (clamped) value
      row.appendChild(range);
      row.appendChild(box);
      wrap.appendChild(row);
    }
    if (panel) wrap.appendChild(panel);
    if (s.help) wrap.appendChild(el('p', 'text-[12px] text-gray-500 mt-1.5 leading-relaxed', s.help));
    return wrap;
  }

  function renderInputs(schema) {
    const box = $('inputs');
    box.innerHTML = '';
    schema.filter(s => !s.hidden && s.id !== 'solve' && s.id !== 'outcome').forEach(s => box.appendChild(inputRow(s)));
  }

  // ---- State changes ----
  function setInput(id, value, rerender) {
    state.inputs[id] = value;
    touched = true;
    if (rerender) render(); else scheduleRecompute();
  }
  function scheduleRecompute() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; recompute(); });
  }

  function render() {
    const v = PE.validate(state.design, state.inputs);
    state.inputs = v.inputs;
    const def = PE.designs[state.design];
    $('designSelect').value = state.design;
    $('designDescription').textContent = def.description;
    $('approxBadge').hidden = !def.approximation;
    const schema = PE.inputsFor(state.design, state.inputs);
    renderSegments(schema);
    renderInputs(schema);
    recompute();
  }

  function recompute() {
    let res;
    try {
      res = PE.compute(state.design, state.inputs);
    } catch (e) {
      console.error(e);
      $('resultHeadline').textContent = 'Error';
      $('resultSub').textContent = 'Something went wrong computing this design. Please adjust the inputs.';
      return;
    }
    lastResult = res;
    renderResult(res);
    renderWarnings(res);
    renderCharts(res);
    renderSensitivity(res);
    writeHash();
    PowerStore.patch({ calculator: { design: state.design, inputs: PE.validate(state.design, state.inputs).inputs } });
    listeners.forEach(fn => { try { fn(res); } catch (e) { /* a listener must not break the page */ } });
  }

  // ---- Results ----
  function effectText(res, e) {
    if (e === null || e === undefined) return '—';
    if (res.design === 'noninferiority') return `Δ = ${PE.util.fmt(e)} SD`;
    if (res.binary) return `p₁ = ${PE.util.fmt(e)}`;
    if (res.design === 'its' && res.inputs.effectType === 'slope') return `${PE.util.fmt(e)} SD / period`;
    return `${PE.util.fmt(e)} SD`;
  }

  function renderResult(res) {
    const i = res.inputs, fmtInt = x => Number(x).toLocaleString('en-GB');
    $('resultLabel').textContent = QUANTITY[res.solvedFor] || '';
    let headline, sub;
    if (res.solvedFor === 'guidance') {
      headline = `p ≥ ${PE.util.fmt(res.guidance.minP, 4)}`;
      sub = res.guidance.message;
    } else if (!res.n || res.unreachable) {
      headline = 'Not reachable';
      sub = 'See the notes below for why and what to change.';
    } else if (res.solvedFor === 'n') {
      headline = fmtInt(res.n.recruited);
      sub = `${res.n.unit} to recruit` + (i.attrition > 0 ? ` (${fmtInt(res.n.analysed)} analysed after ${Math.round(i.attrition * 100)}% attrition)` : '') + ` · power ${pct(res.power)}`;
    } else if (res.solvedFor === 'mde') {
      headline = effectText(res, res.mde);
      sub = `with ${fmtInt(res.n.analysed)} ${res.n.unit} analysed, at ${pct(i.power)} power`;
    } else {
      headline = pct(res.power);
      sub = `to detect ${effectText(res, res.mde)} with ${fmtInt(res.n.analysed)} ${res.n.unit} analysed`;
    }
    $('resultHeadline').textContent = headline;
    $('resultSub').textContent = sub;
    const dl = $('resultDetails');
    dl.innerHTML = '';
    const items = [];
    if (res.n) res.n.recruitedBreakdown.forEach(b => items.push([b.label, fmtInt(b.value)]));
    (res.details || []).forEach(d => items.push([d.label, d.value]));
    if (res.df !== null && isFinite(res.df)) items.push(['Degrees of freedom', String(Math.round(res.df))]);
    items.forEach(([k, v]) => { dl.appendChild(el('dt', 'text-white/55', k)); dl.appendChild(el('dd', 'font-semibold text-right', v)); });
  }

  function renderWarnings(res) {
    const box = $('warnings');
    box.innerHTML = '';
    const notes = res.warnings.slice();
    if (res.approximation) notes.unshift({ code: 'approximation', message: 'Approximation: ' + res.approximation });
    notes.forEach(w => box.appendChild(el('p', 'bg-gray-100 border border-sand-dark rounded-xl px-4 py-3 text-[13px] leading-relaxed text-gray-800', w.message)));
  }

  function lineChart(existing, canvas, cfg) {
    if (!window.Chart) return null;
    const datasets = cfg.series.map((s, k) => ({
      label: s.label, data: s.points, borderColor: SERIES[k % SERIES.length], backgroundColor: SERIES[k % SERIES.length],
      borderWidth: 2.5, pointRadius: 0, tension: 0.25
    }));
    (cfg.hlines || []).forEach(h => datasets.push({ label: h.label, data: h.points, borderColor: SAND_DARK, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 }));
    (cfg.markers || []).forEach(m => datasets.push({ label: m.label, data: [m.point], type: 'scatter', pointRadius: 6, pointBackgroundColor: CYPRUS, pointBorderColor: '#ffffff', pointBorderWidth: 2 }));
    const options = {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: cfg.xLabel, color: MID }, grid: { color: GRID }, ticks: { color: MID, callback: v => num(v) } },
        y: { title: { display: true, text: cfg.yLabel, color: MID }, grid: { color: GRID }, ticks: { color: MID, callback: v => num(v) }, min: cfg.yMin, max: cfg.yMax }
      },
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: CYPRUS, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${num(c.parsed.y)}` } }
      }
    };
    if (existing) { existing.data.datasets = datasets; existing.options = options; existing.update('none'); return existing; }
    return new window.Chart(canvas, { type: 'line', data: { datasets }, options });
  }

  function renderCharts(res) {
    const pts = res.curve || [];
    $('curveBox').hidden = pts.length === 0;
    if (pts.length) {
      curveChart = lineChart(curveChart, $('curveChart'), {
        series: [{ label: 'Power', points: pts }],
        xLabel: `Sample analysed (${res.n ? res.n.unit : 'units'})`, yLabel: 'Power', yMin: 0, yMax: 1,
        hlines: res.solvedFor === 'power' ? [] : [{ label: 'Target power', points: [{ x: pts[0].x, y: res.inputs.power }, { x: pts[pts.length - 1].x, y: res.inputs.power }] }],
        markers: res.n && res.power !== null ? [{ label: 'Your design', point: { x: res.n.analysed, y: res.power } }] : []
      });
    }
    const dc = res.designChart;
    const hasChart = !!(dc && dc.series.some(s => s.points.length > 1));
    $('designChartBox').hidden = !hasChart;
    if (hasChart) {
      $('designChartTitle').textContent = dc.title;
      designChart = lineChart(designChart, $('designChart'), { series: dc.series, xLabel: dc.xLabel, yLabel: dc.yLabel });
    }
  }

  function renderSensitivity(res) {
    const s = res.sensitivity, box = $('sensitivityBox');
    box.hidden = !s;
    if (!s) return;
    $('sensitivityCaption').textContent = `${QUANTITY[s.quantity]} for combinations of ${s.rowLabel.toLowerCase()} (rows) and ${s.colLabel.toLowerCase()} (columns). Your current design is highlighted.`;
    const t = $('sensitivityTable');
    t.innerHTML = '';
    const thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', 'px-3 py-2 text-left text-gray-500 font-semibold', `${s.rowLabel} ↓ / ${s.colLabel} →`));
    s.cols.forEach(c => hr.appendChild(el('th', 'px-3 py-2 text-right font-semibold', num(c))));
    thead.appendChild(hr);
    t.appendChild(thead);
    const tb = el('tbody');
    s.rows.forEach((r, ri) => {
      const tr = el('tr', 'border-t border-gray-200');
      tr.appendChild(el('th', 'px-3 py-2 text-left font-semibold', num(r)));
      s.cells[ri].forEach((v, ci) => {
        const current = ri === s.currentRow && ci === s.currentCol;
        const text = v === null ? '—' : s.quantity === 'power' ? pct(v) : s.quantity === 'mde' ? PE.util.fmt(v) : Math.round(v).toLocaleString('en-GB');
        tr.appendChild(el('td', 'px-3 py-2 text-right tabular-nums' + (current ? ' bg-sand text-malt font-bold' : ''), text));
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
  }

  // ---- Share link ----
  function writeHash() {
    const params = new URLSearchParams({ design: state.design });
    PE.inputsFor(state.design, state.inputs).filter(s => !s.hidden).forEach(s => params.set(s.id, state.inputs[s.id]));
    history.replaceState(null, '', '#' + params.toString());
  }
  function parseHash(hash) {
    if (!hash || hash.length < 2) return null;
    const params = new URLSearchParams(hash.slice(1)), design = params.get('design');
    if (!design || !PE.designs[design]) return null;
    const raw = {};
    params.forEach((v, k) => { if (k !== 'design') raw[k] = v; });
    const v = PE.validate(design, raw);
    return { state: { design, inputs: v.inputs }, adjusted: v.problems.length > 0 };
  }

  // ---- Exports ----
  function bindExports() {
    document.querySelectorAll('[data-export]').forEach(btn => {
      btn.dataset.label = btn.textContent;
      btn.addEventListener('click', async () => {
        if (!lastResult) return;
        const kind = btn.dataset.export;
        const text = kind === 'prereg' ? EX.prereg(lastResult) : kind === 'stata' ? EX.stata(lastResult) : kind === 'r' ? EX.r(lastResult) : location.href;
        const pre = $('exportPreview');
        pre.textContent = text;
        pre.hidden = false;
        let copied = false;
        try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { copied = false; }
        btn.textContent = copied ? 'Copied' : 'Shown below — copy it manually';
        setTimeout(() => { btn.textContent = btn.dataset.label; }, 1800);
      });
    });
  }

  // ---- Effect-size converter ----
  function bindConverter() {
    let value = null;
    const run = () => {
      const kind = $('convKind').value;
      document.querySelectorAll('[data-conv]').forEach(d => { d.hidden = d.dataset.conv !== kind; });
      let out = NaN, label = "Cohen's d";
      if (kind === 'means') out = PE.convert.meansToD(parseFloat($('convM1').value), parseFloat($('convM0').value), parseFloat($('convSD').value));
      else if (kind === 'props') { out = PE.convert.proportionsToH(parseFloat($('convP1').value), parseFloat($('convP0').value)); label = "Cohen's h"; }
      else out = PE.convert.oddsRatioToD(parseFloat($('convOR').value));
      value = isFinite(out) && out !== 0 ? PE.util.round(Math.abs(out), 3) : null;
      $('convResult').textContent = value === null ? 'Enter valid numbers to convert.' : `${label} = ${PE.util.round(out, 3)}`;
      $('convUse').disabled = value === null;
    };
    ['convKind', 'convM1', 'convM0', 'convSD', 'convP1', 'convP0', 'convOR'].forEach(id => $(id).addEventListener('input', run));
    $('convUse').addEventListener('click', () => {
      if (value === null) return;
      const def = PE.designs[state.design];
      if (def.effectInput) state.inputs[def.effectInput.id] = value;
      else { state.inputs.d = value; if (def.binary) state.inputs.outcome = 'continuous'; }
      touched = true;
      render();
      toast('Effect size set to ' + value + ' SD.');
    });
  }

  // ---- Methods list ----
  function renderMethods() {
    const box = $('methodsList');
    PE.list().forEach(d => {
      const card = el('div', 'bg-white border border-gray-300 rounded-xl p-5');
      const h = el('h3', 'text-[15px] font-bold mb-1', d.label);
      if (d.approximation) h.appendChild(el('span', 'ml-2 align-middle text-[10px] font-semibold bg-sand text-malt border border-sand-dark px-2 py-0.5 rounded-full', 'Approximation'));
      card.appendChild(h);
      card.appendChild(el('p', 'text-[13px] text-gray-600 leading-relaxed mb-2', d.method));
      card.appendChild(el('p', 'text-[12px] text-gray-500', 'Source: ' + d.citation));
      box.appendChild(card);
    });
  }

  // ---- Public API for the chat panel ----
  window.PowerPage = {
    getState: () => ({ design: state.design, inputs: Object.assign({}, state.inputs) }),
    getResult: () => lastResult,
    isTouched: () => touched,
    summaryForAI() {
      const r = lastResult;
      if (!r) return null;
      const visible = {};
      PE.inputsFor(state.design, state.inputs).filter(s => !s.hidden).forEach(s => { visible[s.id] = state.inputs[s.id]; });
      return {
        design: state.design, designLabel: r.label, inputs: visible,
        result: {
          solvedFor: r.solvedFor,
          n: r.n ? { analysed: r.n.analysed, recruited: r.n.recruited, unit: r.n.unit, breakdown: r.n.recruitedBreakdown } : null,
          mde: r.mde, power: r.power, guidance: r.guidance || null,
          warnings: r.warnings.map(w => w.message), approximation: r.approximation
        }
      };
    },
    applySuggestion(design, inputs) {
      const base = design === state.design ? Object.assign({}, state.inputs) : {};
      state = { design, inputs: Object.assign(base, inputs) };
      touched = true;
      render();
      return lastResult;
    },
    onChange(fn) { listeners.push(fn); },
    headline: () => ({ label: $('resultLabel').textContent, headline: $('resultHeadline').textContent, sub: $('resultSub').textContent })
  };

  function init() {
    buildDesignSelect();
    buildPresetSelect();
    bindExports();
    bindConverter();
    renderMethods();
    $('resetBtn').addEventListener('click', () => { state = { design: state.design, inputs: {} }; render(); toast('Calculator reset to defaults.'); });
    const fromHash = parseHash(location.hash), saved = PowerStore.read().calculator;
    if (fromHash) {
      state = fromHash.state;
      if (fromHash.adjusted) toast('Some values in the link were adjusted to valid ranges.');
    } else if (saved && PE.designs[saved.design]) {
      state = { design: saved.design, inputs: saved.inputs || {} };
    }
    render();
    window.addEventListener('hashchange', () => {
      const next = parseHash(location.hash);
      if (!next) return;
      state = next.state;
      if (next.adjusted) toast('Some values in the link were adjusted to valid ranges.');
      render();
    });
  }

  init();
})();
