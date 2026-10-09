// circleback overlay: press ` (or the pen button), circle something, type what you mean, Enter.
// Injected into every HTML page by the circleback proxy. No dependencies; renders in a shadow root.
(() => {
  if (window.__circleback) return;
  window.__circleback = true;
  const BASE = '/__circleback';
  const PENDING = 'circleback-pending';
  const host = document.createElement('circleback-overlay');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}
    svg{position:fixed;inset:0;width:100%;height:100%;pointer-events:auto;cursor:crosshair;background:rgba(0,0,0,.08);touch-action:none}
    .hint,.toast{position:fixed;padding:7px 12px;border-radius:7px;background:#111;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.3)}
    .hint{top:12px;left:50%;transform:translateX(-50%)}
    .toasts{position:fixed;left:16px;bottom:122px;display:grid;gap:6px;max-width:min(420px,calc(100vw - 32px))}
    .toast{position:static}
    .toast b{color:#7ee2a8;font-weight:600}
    form{position:fixed;width:320px;padding:10px;border-radius:9px;background:#111;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.4);pointer-events:auto}
    textarea{display:block;width:100%;resize:vertical;padding:8px;border-radius:6px;border:1px solid #444;background:#1c1c1c;color:#fff;outline:none}
    textarea:focus{border-color:#ff3b6b}
    .row{display:flex;justify-content:space-between;align-items:center;margin-top:6px;color:#aaa;font-size:12px}
    .link{background:none;border:0;color:#aaa;cursor:pointer;text-decoration:underline;font-size:12px;padding:0}
    .pen{position:fixed;left:16px;bottom:72px;width:40px;height:40px;border-radius:50%;border:0;background:#ff3b6b;color:#fff;font-size:18px;cursor:pointer;pointer-events:auto;box-shadow:0 6px 20px rgba(0,0,0,.3)}
    .pen i{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#111;color:#fff;font:600 11px/18px system-ui;font-style:normal}
  </style><div class="layer"></div><div class="toasts"></div>`;
  const layer = root.querySelector('.layer');
  const toasts = root.querySelector('.toasts');

  let mode = 'off';
  let stroke = [];
  let drawing = false;
  let pending = [];
  try { pending = JSON.parse(sessionStorage.getItem(PENDING) || '[]'); } catch {}
  const savePending = () => { try { sessionStorage.setItem(PENDING, JSON.stringify(pending)); } catch {} };

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, text) => {
    const node = tag === 'svg' || tag === 'polyline' || tag === 'circle' ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text) node.textContent = text;
    return node;
  };

  function toast(html, ms = 2400) {
    const t = el('div', { class: 'toast' });
    t.innerHTML = html;
    toasts.append(t);
    setTimeout(() => t.remove(), ms);
  }

  function boxOf(points) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  function describe(node) {
    const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 4) : [];
    const path = [];
    for (let n = node, i = 0; n && n !== document.body && i < 5; n = n.parentElement, i++) {
      const c = typeof n.className === 'string' ? n.className.trim().split(/\s+/)[0] : '';
      path.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : c ? `.${c}` : ''));
    }
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const out = { tag: node.tagName.toLowerCase(), path: path.join(' > ') };
    if (node.id) out.id = node.id;
    if (cls.length) out.classes = cls;
    if (text) out.text = text;
    for (const a of ['data-testid', 'aria-label', 'href', 'src', 'alt']) { const v = node.getAttribute(a); if (v) out[a] = v.slice(0, 160); }
    return out;
  }

  function elementsIn(box) {
    const right = box.left + box.width, bottom = box.top + box.height;
    const hits = [];
    for (const node of document.body.querySelectorAll('*')) {
      if (node === host) continue;
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const ix = Math.max(0, Math.min(r.right, right) - Math.max(r.left, box.left));
      const iy = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, box.top));
      if ((ix * iy) / (r.width * r.height) > 0.7) hits.push(node);
    }
    return hits.filter(n => !hits.some(o => o !== n && o.contains(n))).slice(0, 8);
  }

  function render() {
    layer.replaceChildren();
    if (mode === 'off') {
      const pen = el('button', { class: 'pen', type: 'button', title: 'Leave a note for your agent (`)' }, '✎');
      if (pending.length) pen.append(el('i', {}, String(pending.length)));
      pen.onclick = () => { mode = 'draw'; stroke = []; render(); };
      layer.append(pen);
      return;
    }
    const svg = el('svg');
    svg.style.cursor = mode === 'draw' ? 'crosshair' : 'default';
    if (stroke.length > 1) svg.append(el('polyline', { points: stroke.map(p => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: '#ff3b6b', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (stroke.length === 1) svg.append(el('circle', { cx: stroke[0].x, cy: stroke[0].y, r: 9, fill: 'none', stroke: '#ff3b6b', 'stroke-width': 3 }));
    svg.addEventListener('pointerdown', e => {
      if (mode !== 'draw') return;
      drawing = true; svg.setPointerCapture(e.pointerId);
      stroke = [{ x: e.clientX, y: e.clientY }]; render();
    });
    svg.addEventListener('pointermove', e => {
      if (!drawing) return;
      stroke.push({ x: e.clientX, y: e.clientY });
      const line = svg.querySelector('polyline');
      if (line) line.setAttribute('points', stroke.map(p => `${p.x},${p.y}`).join(' '));
      else render();
    });
    svg.addEventListener('pointerup', () => { if (!drawing) return; drawing = false; mode = 'note'; render(); });
    layer.append(svg);
    if (mode === 'draw' && !stroke.length) layer.append(el('div', { class: 'hint' }, 'Circle or click what you mean · Esc to cancel'));
    if (mode === 'note') {
      const box = boxOf(stroke);
      const form = el('form');
      form.style.left = `${Math.min(Math.max(8, box.left), innerWidth - 328)}px`;
      form.style.top = `${box.top + box.height + 10 > innerHeight - 140 ? Math.max(8, box.top - 130) : box.top + box.height + 10}px`;
      const ta = el('textarea', { rows: 3, placeholder: 'What should change?' });
      const row = el('div', { class: 'row' });
      const redraw = el('button', { class: 'link', type: 'button' }, 'Redraw');
      redraw.onclick = () => { stroke = []; mode = 'draw'; render(); };
      row.append(el('span', {}, 'Enter sends · Shift+Enter newline'), redraw);
      form.append(ta, row);
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ta.value); } e.stopPropagation(); });
      form.onsubmit = e => { e.preventDefault(); send(ta.value); };
      layer.append(form);
      setTimeout(() => ta.focus(), 0);
    }
  }

  async function send(text) {
    if (!text.trim() || !stroke.length) return;
    const box = boxOf(stroke);
    const tiny = box.width < 8 && box.height < 8;
    host.style.display = 'none';
    const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const elements = tiny ? [] : elementsIn(box).map(describe);
    host.style.display = '';
    const round = b => ({ left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) });
    const note = {
      note: text.trim(),
      url: location.pathname + location.search + location.hash,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
      theme: document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark (system)' : 'light (system)'),
      box: round(box),
      pageBox: round({ ...box, left: box.left + scrollX, top: box.top + scrollY }),
      pointed: at && at !== host ? describe(at) : undefined,
      elements,
    };
    mode = 'off'; stroke = []; render();
    try {
      const res = await fetch(`${BASE}/note`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(note) });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = await res.json();
      pending.push(id); savePending(); render();
      toast('Sent');
    } catch (e) { toast(`Send failed (${e.message})`); }
  }

  // Replies are looked up by note id, so a page reload (e.g. after the fix) still shows them.
  async function poll() {
    if (pending.length) {
      try {
        const res = await fetch(`${BASE}/replies?ids=${encodeURIComponent(pending.join(','))}`);
        const replies = res.ok ? await res.json() : [];
        for (const r of replies) {
          pending = pending.filter(id => id !== r.id);
          const safe = String(r.text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
          toast(`<b>✓</b> ${safe}`, 7000);
        }
        if (replies.length) { savePending(); render(); }
      } catch {}
    }
    setTimeout(poll, 2500);
  }

  addEventListener('keydown', e => {
    const t = e.composedPath()[0];
    const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (e.key === '`' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); mode = mode === 'off' ? 'draw' : 'off'; stroke = []; render(); }
    if (e.key === 'Escape' && mode !== 'off') { mode = 'off'; stroke = []; render(); }
  }, true);

  const mount = () => { document.documentElement.append(host); render(); poll(); };
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
})();
