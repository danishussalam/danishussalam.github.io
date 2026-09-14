/* Power Calculator AI chat panel.
 * Keeps the conversation in the browser, calls the worker, formats replies safely,
 * and turns validated suggestions into "Apply to calculator" buttons. */
(function () {
  'use strict';
  const WORKER_URL = 'https://power-calculator.danish-us-salam.workers.dev/chat';
  const MAX_SEND = 10, MAX_STORE = 50, MAX_CHARS = 2000, DAILY_LIMIT = 25;
  const PE = window.PowerEngine, Page = window.PowerPage, Store = window.PowerStore;
  const $ = id => document.getElementById(id);
  const GREETING = 'Hi! I can help you plan a power calculation. Tell me about your study: what outcome will you measure, and what intervention or policy are you evaluating?';
  const UNAVAILABLE = 'The AI assistant is temporarily unavailable — the calculator still works.';

  let messages = [];
  let busy = false, failure = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---- Persistence ----
  function load() {
    const saved = Store.read().messages;
    messages = Array.isArray(saved) ? saved.slice(-MAX_STORE) : [];
  }
  function save() { Store.patch({ messages: messages.slice(-MAX_STORE) }); }

  // Daily AI message allowance per browser keeps the free AI tier available to everyone.
  const today = () => new Date().toLocaleDateString('en-CA');
  function usedToday() { const u = Store.read().usage; return u && u.date === today() ? u.count : 0; }
  function countMessage() { Store.patch({ usage: { date: today(), count: usedToday() + 1 } }); }
  function renderAllowance() {
    const left = Math.max(0, DAILY_LIMIT - usedToday());
    $('chatRemaining').textContent = `${left} of ${DAILY_LIMIT} messages left today`;
  }

  // ---- Safe formatting: escape everything, then add a small set of tags ----
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code class="bg-white/60 px-1 rounded text-[12px]">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }
  function formatText(text) {
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    escapeHtml(text).split(/\r?\n/).forEach(line => {
      const ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        const type = ul ? 'ul' : 'ol';
        if (list !== type) { close(); out.push(type === 'ul' ? '<ul class="list-disc pl-5 space-y-1">' : '<ol class="list-decimal pl-5 space-y-1">'); list = type; }
        out.push(`<li>${inline((ul || ol)[1])}</li>`);
      } else if (line.trim() === '') {
        close();
      } else {
        close();
        out.push(`<p>${inline(line)}</p>`);
      }
    });
    close();
    return out.join('');
  }

  // ---- Rendering ----
  function suggestionBlock(clean, rationale, index, applied) {
    const box = el('div', 'mt-3 bg-white border border-sand-dark rounded-xl p-3 text-[13px] text-cyprus');
    box.appendChild(el('p', 'font-semibold', 'Suggested settings: ' + PE.designs[clean.design].label));
    const schema = {};
    ['n', 'mde', 'power'].forEach(solve => PE.inputsFor(clean.design, Object.assign({}, clean.inputs, { solve })).forEach(s => { schema[s.id] = s; }));
    const ul = el('ul', 'mt-1 space-y-0.5');
    Object.entries(clean.inputs).forEach(([k, v]) => {
      const s = schema[k];
      const shown = s && s.kind === 'select' ? (s.options.find(o => String(o.value) === String(v)) || {}).label : v;
      ul.appendChild(el('li', '', `${s ? s.label : k}: ${shown}`));
    });
    box.appendChild(ul);
    if (rationale) box.appendChild(el('p', 'mt-2 text-gray-600', rationale));
    const btn = el('button', 'mt-3 bg-cyprus text-sand px-4 py-2 rounded-full font-semibold disabled:opacity-50', applied ? 'Applied' : 'Apply to calculator');
    btn.type = 'button';
    btn.dataset.apply = String(index);
    btn.disabled = !!applied;
    btn.addEventListener('click', () => apply(clean, index));
    box.appendChild(btn);
    return box;
  }

  function cardBubble(m) {
    const wrap = el('div', 'flex justify-start');
    const c = el('div', 'bg-cyprus text-white rounded-2xl px-4 py-3 max-w-[88%] text-[13px]');
    c.dataset.card = '1';
    c.appendChild(el('p', 'text-[11px] uppercase tracking-widest text-sand/70', `Calculator · ${m.card.design}`));
    c.appendChild(el('p', 'text-[26px] font-black leading-tight mt-1', m.card.headline));
    c.appendChild(el('p', 'text-white/70', `${m.card.label} — ${m.card.sub}`));
    (m.card.warnings || []).forEach(w => c.appendChild(el('p', 'mt-2 text-sand text-[12px]', w)));
    wrap.appendChild(c);
    return wrap;
  }

  function bubble(m, index) {
    if (m.role === 'card') return cardBubble(m);
    const mine = m.role === 'user';
    const wrap = el('div', mine ? 'flex justify-end' : 'flex justify-start');
    const b = el('div', (mine ? 'bg-cyprus text-white' : 'bg-sand text-cyprus') + ' rounded-2xl px-4 py-3 max-w-[88%] text-[14px] leading-relaxed space-y-2 break-words');
    b.innerHTML = formatText(m.content);
    if (!mine && m.suggestion) {
      const clean = PE.validateSuggestion(m.suggestion.design, m.suggestion.inputs);
      if (clean) b.appendChild(suggestionBlock(clean, m.suggestion.rationale, index, m.applied));
    }
    wrap.appendChild(b);
    return wrap;
  }

  function render() {
    const box = $('chatMessages');
    box.innerHTML = '';
    if (!messages.length) box.appendChild(bubble({ role: 'assistant', content: GREETING }, -1));
    messages.forEach((m, i) => box.appendChild(bubble(m, i)));
    if (busy) {
      const t = el('div', 'typing px-2 py-2');
      t.setAttribute('aria-label', 'Assistant is typing');
      t.innerHTML = '<span></span><span></span><span></span>';
      box.appendChild(t);
    }
    if (failure) {
      const f = el('div', 'bg-white border border-sand-dark rounded-xl px-4 py-3 text-[13px] text-cyprus');
      f.appendChild(el('p', '', failure.message));
      if (failure.retry) {
        const r = el('button', 'mt-2 font-semibold underline', 'Retry');
        r.type = 'button';
        r.dataset.retry = '1';
        r.addEventListener('click', () => { const mode = failure.mode; failure = null; request(mode); });
        f.appendChild(r);
      }
      box.appendChild(f);
    }
    box.scrollTop = box.scrollHeight;
    $('chatSend').disabled = busy;
    renderAllowance();
  }

  // ---- Actions ----
  function apply(clean, index) {
    const res = Page.applySuggestion(clean.design, clean.inputs);
    if (messages[index]) messages[index].applied = true;
    const h = Page.headline();
    messages.push({
      role: 'card', content: `${h.label}: ${h.headline}`,
      card: { design: PE.designs[clean.design].label, label: h.label, headline: h.headline, sub: h.sub, warnings: ((res && res.warnings) || []).map(w => w.message).slice(0, 3) }
    });
    save();
    render();
    if (window.matchMedia('(min-width: 1024px)').matches && document.body.dataset.chat !== 'expanded') {
      $('calculator').scrollIntoView({ behavior: 'smooth' });
    }
  }

  async function request(forcedMode) {
    busy = true;
    failure = null;
    render();
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_SEND)
      .map(m => ({ role: m.role, content: m.content }));
    while (history.length && history[0].role !== 'user') history.shift();
    const body = { mode: forcedMode || (Page.isTouched() ? 'assist' : 'guided'), messages: history, calculator: Page.summaryForAI() };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const resp = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      clearTimeout(timer);
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 429) { failure = { message: 'Too many messages — please wait a minute.', retry: true, mode: forcedMode }; return; }
      if (resp.status === 413) { messages.pop(); save(); failure = { message: 'That message is too long (2,000 characters max).', retry: false }; return; }
      if (resp.status === 503 && typeof data.error === 'string') { failure = { message: data.error, retry: true, mode: forcedMode }; return; }
      if (!resp.ok || typeof data.reply !== 'string') { failure = { message: UNAVAILABLE, retry: true, mode: forcedMode }; return; }
      messages.push({ role: 'assistant', content: data.reply, suggestion: data.suggestion || null });
      countMessage();
      save();
    } catch (e) {
      failure = { message: UNAVAILABLE, retry: true, mode: forcedMode };
    } finally {
      busy = false;
      render();
    }
  }

  async function send(text, opts = {}) {
    const t = String(text || '').trim();
    if (!t || busy) return;
    if (t.length > MAX_CHARS) { failure = { message: 'That message is too long (2,000 characters max).', retry: false }; render(); return; }
    if (usedToday() >= DAILY_LIMIT) {
      failure = { message: `You have used today's ${DAILY_LIMIT} AI messages. The allowance resets at midnight; the calculator still works in the meantime.`, retry: false };
      render();
      return;
    }
    messages.push({ role: 'user', content: t });
    save();
    await request(opts.mode);
  }

  function open(opts = {}) {
    const panel = $('chatPanel');
    panel.dataset.open = 'true';
    panel.setAttribute('aria-hidden', 'false');
    document.body.dataset.chat = opts.expand ? 'expanded' : 'open';
    $('chatExpand').textContent = opts.expand ? 'Collapse' : 'Expand';
    $('chatFab').hidden = true;
    render();
    setTimeout(() => $('chatInput').focus(), 50);
    if (opts.send) send(opts.send, opts);
  }

  function close() {
    const panel = $('chatPanel');
    panel.dataset.open = 'false';
    panel.setAttribute('aria-hidden', 'true');
    delete document.body.dataset.chat;
    $('chatFab').hidden = false;
  }

  function bind() {
    $('chatFab').addEventListener('click', () => open());
    $('heroChatBtn').addEventListener('click', () => open({ expand: true }));
    $('explainBtn').addEventListener('click', () => open({ send: 'Explain this result and the main assumptions driving it.', mode: 'assist' }));
    $('chatClose').addEventListener('click', close);
    $('chatExpand').addEventListener('click', () => {
      const expanded = document.body.dataset.chat === 'expanded';
      document.body.dataset.chat = expanded ? 'open' : 'expanded';
      $('chatExpand').textContent = expanded ? 'Expand' : 'Collapse';
    });
    $('chatNew').addEventListener('click', () => {
      if (messages.length && !window.confirm('Start a new conversation? The current one will be cleared.')) return;
      messages = [];
      failure = null;
      save();
      render();
    });
    const input = $('chatInput');
    input.addEventListener('input', () => { $('chatCount').textContent = `${input.value.length} / ${MAX_CHARS}`; });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('chatForm').requestSubmit(); }
    });
    $('chatForm').addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value;
      input.value = '';
      $('chatCount').textContent = `0 / ${MAX_CHARS}`;
      send(text);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('chatPanel').dataset.open === 'true') close(); });
  }

  load();
  bind();
  $('chatFab').hidden = false;
  window.PowerChat = { open, close, send, formatText, messages: () => messages.slice() };
})();
