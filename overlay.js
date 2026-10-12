// circleback overlay, injected into every HTML page by the circleback proxy. No dependencies; renders in a shadow root.
//   `        circle something, type what you mean, Enter
//   Shift+`  freeze the page first (keeps open menus and hover states), then circle on the frozen copy
//   \        compare: the page as it was when you sent your last note on this page, against the live page
//   📱       (only with --builder) build this project as an Android app and show the install QR
(() => {
  if (window.__circleback) return;
  window.__circleback = true;
  const TRACE = document.currentScript?.dataset.trace === '1'; // proxy started with --trace: offer ratings
  const BUILDER = document.currentScript?.dataset.builder === '1'; // proxy started with --builder: offer 📱 builds
  const BUILD = 'circleback-build';
  const BASE = '/__circleback';
  const PENDING = 'circleback-pending';
  const HISTORY = 'circleback-history';
  const host = document.createElement('circleback-overlay');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}
    iframe{position:fixed;inset:0;width:100vw;height:100vh;border:0;background:#fff;pointer-events:auto}
    .frozen{outline:3px solid #3b82f6;outline-offset:-3px}
    svg{position:fixed;inset:0;width:100%;height:100%;pointer-events:auto;cursor:crosshair;background:rgba(0,0,0,.08);touch-action:none}
    .hint,.toast{position:fixed;padding:7px 12px;border-radius:7px;background:#111;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.3)}
    .hint{top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);pointer-events:auto}
    .hint .link{color:#fff;white-space:nowrap}
    .send{padding:4px 12px;border:0;border-radius:5px;background:#ff3b6b;color:#fff;font-weight:600;cursor:pointer;font-size:12px}
    .acts{display:flex;align-items:center;gap:12px}
    .hint b{color:#93c5fd;font-weight:600}
    .toasts{position:fixed;left:16px;bottom:122px;display:grid;gap:6px;max-width:min(420px,calc(100vw - 32px))}
    .toast{position:static;display:flex;align-items:center;gap:10px;pointer-events:auto}
    .toast b{color:#7ee2a8;font-weight:600}
    .toast button{flex:none;padding:3px 9px;border:1px solid #444;border-radius:5px;background:#222;color:#fff;cursor:pointer;font-size:12px}
    form{position:fixed;width:320px;padding:10px;border-radius:9px;background:#111;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.4);pointer-events:auto}
    textarea{display:block;width:100%;resize:vertical;padding:8px;border-radius:6px;border:1px solid #444;background:#1c1c1c;color:#fff;outline:none}
    textarea:focus{border-color:#ff3b6b}
    .row{display:flex;justify-content:space-between;align-items:center;margin-top:6px;color:#aaa;font-size:12px}
    .link{background:none;border:0;color:#aaa;cursor:pointer;text-decoration:underline;font-size:12px;padding:0}
    .tools{position:fixed;left:16px;bottom:72px;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:auto}
    .pen,.cmp,.app{position:relative;width:40px;height:40px;border-radius:50%;border:0;color:#fff;font-size:18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3)}
    .pen{background:#ff3b6b}
    .cmp{background:#111;font-size:16px}
    .pen i{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#111;color:#fff;font:600 11px/18px system-ui;font-style:normal}
    .bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:4px;border-radius:9px;background:#111;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:auto;max-width:calc(100vw - 24px)}
    .bar button{padding:6px 11px;border:0;border-radius:6px;background:none;color:#bbb;cursor:pointer}
    .bar button[aria-pressed="true"]{background:#fff;color:#111;font-weight:600}
    .bar span{padding:0 10px;color:#999;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}
    .divider{position:fixed;top:0;bottom:0;width:0;pointer-events:none}
    .divider::before{content:'';position:absolute;top:0;bottom:0;left:-1px;width:2px;background:#ff3b6b}
    .grip{position:absolute;top:50%;left:-18px;width:36px;height:36px;margin-top:-18px;border-radius:50%;background:#ff3b6b;color:#fff;display:grid;place-items:center;font-size:15px;cursor:ew-resize;pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.35);touch-action:none}
    .app{background:#111;font-size:17px}
    .app.busy{background:#d97706}
    .buildbox{position:fixed;left:68px;bottom:72px;width:260px;max-width:calc(100vw - 84px);padding:12px;border-radius:10px;background:#111;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.4);pointer-events:auto}
    .buildbox .top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:600}
    .buildbox .sub{color:#aaa;font-size:12px;margin-top:4px;overflow-wrap:anywhere}
    .buildbox img{display:block;width:100%;margin:10px 0 6px;border-radius:6px;background:#fff}
    .buildbox .acts{margin-top:10px;justify-content:space-between}
    .buildbox a.link{color:#93c5fd}
    .kind{display:block;width:100%;margin-top:8px;padding:8px 10px;border:1px solid #333;border-radius:7px;background:#1c1c1c;color:#fff;text-align:left;cursor:pointer}
    .kind:hover:not(:disabled){border-color:#ff3b6b}
    .kind:disabled{opacity:.55;cursor:default}
    .kind b{display:block;font-weight:600}
    .kind span{display:block;color:#aaa;font-size:12px;margin-top:2px}
    .tag{position:fixed;top:60px;padding:3px 8px;border-radius:5px;background:rgba(17,17,17,.85);color:#fff;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
  </style><div class="stage"></div><div class="layer"></div><div class="toasts"></div>`;
  const stage = root.querySelector('.stage');
  const layer = root.querySelector('.layer');
  const toasts = root.querySelector('.toasts');

  let mode = 'off'; // off | draw | note | compare
  let stroke = [];
  let drawing = false;
  let snap = null; // { html, scroll, upload: Promise<id|null> } taken when drawing starts
  let frozen = null; // iframe showing `snap` while frozen
  let compare = null; // { entry, frame, view: 'split'|'before'|'now', x }
  const load = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key) || '') ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
  let pending = load(PENDING, []);
  let history = load(HISTORY, []);
  let build = load(BUILD, null); // { id?, status, step?, startedAt?, installUrl?, latestUrl?, error? }

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, text) => {
    const node = tag === 'svg' || tag === 'polyline' || tag === 'circle' ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text) node.textContent = text;
    return node;
  };

  function toast(html, ms = 2400, action) {
    const t = el('div', { class: 'toast' });
    const body = el('span');
    body.innerHTML = html;
    t.append(body);
    if (action) { const b = el('button', { type: 'button' }, action.label); b.onclick = () => { t.remove(); action.run(); }; t.append(b); }
    toasts.append(t);
    setTimeout(() => t.remove(), ms);
  }
  const escape = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ---- Snapshot: a self-contained, script-free copy of the page as it looks right now ----------------------------
  // Styles are copied in (not linked), so a later hot reload can't change what "before" looked like. Hover/focus
  // states are pinned with attributes and the matching CSS rules are duplicated for them.
  const STATES = [[':focus-within', 'data-cb-focus-within'], [':focus-visible', 'data-cb-focus-visible'], [':focus', 'data-cb-focus'], [':hover', 'data-cb-hover'], [':active', 'data-cb-active']];
  const pin = selector => STATES.reduce((s, [p, a]) => s.split(p).join(`[${a}]`), selector);

  function fixUrls(text, base) {
    if (!base) return text;
    return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => /^(data:|blob:|[a-z]+:|\/\/|#)/i.test(u) ? m : `url("${new URL(u, base).href}")`);
  }

  function walkRules(rules, out) {
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        out.push(r.cssText);
        if (STATES.some(([p]) => r.selectorText.includes(p))) out.push(`${pin(r.selectorText)}{${r.style.cssText}}`);
      } else if (r instanceof CSSMediaRule || r instanceof CSSSupportsRule || (window.CSSContainerRule && r instanceof CSSContainerRule) || (window.CSSLayerBlockRule && r instanceof CSSLayerBlockRule)) {
        const inner = [];
        walkRules(r.cssRules, inner);
        const head = r instanceof CSSMediaRule ? `@media ${r.media.mediaText}`
          : r instanceof CSSSupportsRule ? `@supports ${r.conditionText}`
          : window.CSSContainerRule && r instanceof CSSContainerRule ? `@container ${r.containerName ? r.containerName + ' ' : ''}${r.containerQuery ?? r.conditionText}`
          : `@layer ${r.name}`;
        out.push(`${head}{${inner.join('\n')}}`);
      } else if (!(r instanceof CSSImportRule)) out.push(r.cssText);
    }
  }

  function collectCss() {
    const css = [];
    const unreadable = [];
    for (const sheet of [...document.styleSheets, ...(document.adoptedStyleSheets || [])]) {
      if (sheet.ownerNode && host.contains(sheet.ownerNode)) continue;
      let rules;
      try { rules = sheet.cssRules; } catch { if (sheet.href) unreadable.push(sheet.href); continue; } // cross-origin: keep linked
      const out = [];
      walkRules(rules, out);
      const media = sheet.media && sheet.media.mediaText;
      const text = fixUrls(out.join('\n'), sheet.href);
      css.push(media && media !== 'all' ? `@media ${media}{${text}}` : text);
    }
    return { css: css.join('\n'), unreadable };
  }

  function takeSnapshot() {
    const marked = [];
    for (const [p, a] of STATES) {
      let found = [];
      try { found = document.querySelectorAll(p); } catch {}
      for (const n of found) { if (n === host || host.contains(n)) continue; n.setAttribute(a, ''); marked.push([n, a]); }
    }
    for (const n of document.body.querySelectorAll('*')) {
      if (n.scrollTop || n.scrollLeft) { n.setAttribute('data-cb-scroll', `${n.scrollLeft},${n.scrollTop}`); marked.push([n, 'data-cb-scroll']); }
    }
    const { css, unreadable } = collectCss();
    const clone = document.documentElement.cloneNode(true);
    marked.forEach(([n, a]) => n.removeAttribute(a));

    // Properties that cloning doesn't copy: form values, video frames, canvas pixels.
    const pair = sel => [document.documentElement.querySelectorAll(sel), clone.querySelectorAll(sel)];
    const [liveFields, cloneFields] = pair('input,textarea,select');
    liveFields.forEach((f, i) => {
      const c = cloneFields[i];
      if (!c) return;
      if (f.type === 'checkbox' || f.type === 'radio') { if (f.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
      else if (f.tagName === 'TEXTAREA') c.textContent = f.value;
      else if (f.tagName === 'SELECT') [...c.options].forEach((o, j) => { if (f.options[j]?.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
      else if (f.type !== 'password' && f.type !== 'file') c.setAttribute('value', f.value);
    });
    const [liveMedia, cloneMedia] = pair('video,canvas');
    liveMedia.forEach((m, i) => {
      const c = cloneMedia[i];
      if (!c) return;
      let src = '';
      try {
        if (m.tagName === 'CANVAS') src = m.toDataURL();
        else if (m.videoWidth) { const cv = document.createElement('canvas'); cv.width = m.videoWidth; cv.height = m.videoHeight; cv.getContext('2d').drawImage(m, 0, 0); src = cv.toDataURL('image/jpeg', 0.82); }
      } catch {}
      if (!src && m.tagName === 'VIDEO') src = m.poster || '';
      const img = document.createElement('img');
      for (const a of ['class', 'style', 'width', 'height', 'id']) { const v = c.getAttribute(a); if (v != null) img.setAttribute(a, v); }
      if (src) img.src = src;
      // Keep the exact rendered box: page CSS aimed at video/canvas (aspect-ratio etc.) won't match an img.
      const cs = getComputedStyle(m), rect = m.getBoundingClientRect();
      Object.assign(img.style, { objectFit: cs.objectFit, objectPosition: cs.objectPosition, display: cs.display === 'inline' ? 'inline-block' : cs.display, width: rect.width + 'px', height: rect.height + 'px', maxWidth: 'none' });
      img.alt = '';
      c.replaceWith(img);
    });

    clone.querySelectorAll('script,noscript,circleback-overlay,nextjs-portal,style,link[rel="stylesheet"],link[rel="preload"],link[rel="modulepreload"],link[as="script"]').forEach(n => n.remove());
    clone.querySelectorAll('img[loading="lazy"]').forEach(n => n.setAttribute('loading', 'eager'));
    let head = clone.querySelector('head');
    if (!head) { head = document.createElement('head'); clone.prepend(head); }
    const base = document.createElement('base');
    base.href = location.href;
    head.prepend(base);
    for (const href of unreadable) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; head.append(l); }
    const style = document.createElement('style');
    // A still frame: no motion, no smooth scrolling.
    style.textContent = `${css}\n*,*::before,*::after{animation:none!important;transition:none!important}html{scroll-behavior:auto!important}`;
    head.append(style);

    const html = '<!doctype html>\n' + clone.outerHTML;
    const scroll = { x: Math.round(scrollX), y: Math.round(scrollY) };
    const upload = fetch(`${BASE}/snapshot`, { method: 'POST', headers: { 'content-type': 'text/html' }, body: html })
      .then(r => (r.ok ? r.json() : null)).then(j => j?.id ?? null).catch(() => null);
    return { html, scroll, upload };
  }

  // Load a snapshot into an iframe and put it back at the same scroll positions.
  function showSnapshot(frame, source, scroll) {
    frame.setAttribute('sandbox', 'allow-same-origin'); // no scripts run in a snapshot
    return new Promise(resolve => {
      frame.addEventListener('load', () => {
        const doc = frame.contentDocument;
        try {
          frame.contentWindow.scrollTo(scroll.x, scroll.y);
          doc.querySelectorAll('[data-cb-scroll]').forEach(n => { const [x, y] = n.getAttribute('data-cb-scroll').split(',').map(Number); n.scrollLeft = x; n.scrollTop = y; });
        } catch {}
        resolve(doc);
      }, { once: true });
      if (source.html) frame.srcdoc = source.html; else frame.src = `${BASE}/snapshot/${source.id}`;
    });
  }

  // ---- Drawing ----------------------------------------------------------------------------------------------------
  function boxOf(points) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  function describe(node) {
    const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 4) : [];
    const path = [];
    for (let n = node, i = 0; n && n.tagName !== 'BODY' && i < 5; n = n.parentElement, i++) {
      const c = typeof n.className === 'string' ? n.className.trim().split(/\s+/)[0] : '';
      path.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : c ? `.${c}` : ''));
    }
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const out = { tag: node.tagName.toLowerCase(), path: path.join(' > ') };
    if (node.id) out.id = node.id;
    if (cls.length) out.classes = cls;
    if (text) out.text = text;
    for (const a of ['data-testid', 'aria-label', 'href', 'src', 'alt']) { const v = node.getAttribute(a); if (v && !v.startsWith('data:')) out[a] = v.slice(0, 160); }
    for (const [, a] of STATES) if (node.hasAttribute(a)) (out.state ||= []).push(a.slice(8));
    return out;
  }

  function elementsIn(doc, box) {
    const right = box.left + box.width, bottom = box.top + box.height;
    const hits = [];
    for (const node of doc.body.querySelectorAll('*')) {
      if (node === host) continue;
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const ix = Math.max(0, Math.min(r.right, right) - Math.max(r.left, box.left));
      const iy = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, box.top));
      if ((ix * iy) / (r.width * r.height) > 0.7) hits.push(node);
    }
    return hits.filter(n => !hits.some(o => o !== n && o.contains(n))).slice(0, 8);
  }

  function startDraw(freeze) {
    if (mode === 'compare') closeCompare();
    snap = takeSnapshot(); // before the overlay covers the page, so hover and open menus are captured
    mode = 'draw'; stroke = [];
    if (freeze) setFrozen(true);
    render();
  }

  function setFrozen(on) {
    if (on && !frozen && snap) {
      frozen = el('iframe', { class: 'frozen', title: 'Frozen copy of the page' });
      stage.append(frozen);
      showSnapshot(frozen, snap, snap.scroll);
    } else if (!on && frozen) { frozen.remove(); frozen = null; }
  }

  function cancel() { setFrozen(false); mode = 'off'; stroke = []; snap = null; render(); }

  function render() {
    layer.replaceChildren();
    const touch = matchMedia('(pointer: coarse)').matches;
    if (mode === 'off' || mode === 'compare') {
      if (mode === 'compare') renderCompare();
      const tools = el('div', { class: 'tools' });
      const pen = el('button', { class: 'pen', type: 'button', title: 'Leave a note: ` to circle, Shift+` to freeze the page first' }, '✎');
      if (pending.length) pen.append(el('i', {}, String(pending.length)));
      pen.onclick = () => startDraw(false);
      tools.append(pen);
      if (BUILDER) {
        const busy = build && (build.status === 'queued' || build.status === 'running');
        const app = el('button', { class: `app${busy ? ' busy' : ''}`, type: 'button', title: 'Build this as an Android app and get an install QR' }, '📱');
        app.onclick = () => (build ? closeBuild(busy) : setBuild({ status: 'pick' }));
        tools.append(app);
        if (build) renderBuild();
      }
      if (lastForPage() && mode !== 'compare') {
        const cmp = el('button', { class: 'cmp', type: 'button', title: 'Compare with how this looked at your last note (\\)' }, '⇆');
        cmp.onclick = () => openCompare(lastForPage());
        tools.append(cmp);
      }
      layer.append(tools);
      return;
    }
    const svg = el('svg');
    svg.style.cursor = mode === 'draw' ? 'crosshair' : 'default';
    if (frozen) svg.style.background = 'rgba(59,130,246,.06)';
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
    if (mode === 'draw' && !stroke.length) {
      const hint = el('div', { class: 'hint' });
      hint.innerHTML = touch ? (frozen ? '<b>Frozen</b> · circle or tap what you mean' : 'Circle or tap what you mean')
        : frozen ? '<b>Frozen</b> · circle or click what you mean · Esc to cancel' : 'Circle or click what you mean · Shift+` to freeze · Esc to cancel';
      const x = el('button', { class: 'link', type: 'button' }, 'Cancel'); x.onclick = cancelAll; hint.append(x);
      layer.append(hint);
    }
    if (mode === 'note') {
      const box = boxOf(stroke);
      const form = el('form');
      form.style.left = `${Math.max(8, Math.min(box.left, innerWidth - 328))}px`;
      form.style.maxWidth = 'calc(100vw - 16px)';
      form.style.top = `${box.top + box.height + 10 > innerHeight - 140 ? Math.max(8, box.top - 130) : box.top + box.height + 10}px`;
      const ta = el('textarea', { rows: 3, placeholder: 'What should change?' });
      const row = el('div', { class: 'row' });
      const redraw = el('button', { class: 'link', type: 'button' }, 'Redraw');
      redraw.onclick = () => { stroke = []; mode = 'draw'; render(); };
      // Touch keyboards don't reliably send Enter, so there are always Send and Cancel buttons.
      const close = el('button', { class: 'link', type: 'button' }, 'Cancel'); close.onclick = cancelAll;
      const go = el('button', { class: 'send', type: 'submit' }, 'Send');
      const acts = el('span', { class: 'acts' });
      row.append(el('span', {}, touch ? '' : 'Enter sends'), acts);
      acts.append(close, redraw, go);
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
    // Read elements from the frozen copy when frozen; it sits at the same coordinates as the page.
    const doc = frozen?.contentDocument || document;
    const win = frozen?.contentWindow || window;
    // Live page: hide the overlay so it isn't hit. Frozen: the copy lives inside the overlay, so leave it laid out.
    if (!frozen) host.style.display = 'none';
    const at = doc.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const elements = tiny ? [] : elementsIn(doc, box).map(describe);
    host.style.display = '';
    const round = b => ({ left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) });
    const shot = snap;
    const note = {
      note: text.trim(),
      url: location.pathname + location.search + location.hash,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      scroll: { x: Math.round(win.scrollX), y: Math.round(win.scrollY) },
      theme: document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark (system)' : 'light (system)'),
      frozen: Boolean(frozen),
      box: round(box),
      pageBox: round({ ...box, left: box.left + win.scrollX, top: box.top + win.scrollY }),
      pointed: at && at !== host ? describe(at) : undefined,
      elements,
    };
    setFrozen(false);
    mode = 'off'; stroke = []; snap = null; render();
    try {
      note.snapshot = shot ? await shot.upload : null;
      const res = await fetch(`${BASE}/note`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(note) });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = await res.json();
      pending.push(id); save(PENDING, pending);
      if (note.snapshot) { history = [...history.filter(h => h.id !== id), { id, snapshot: note.snapshot, path: location.pathname, scroll: shot.scroll, note: note.note }].slice(-30); save(HISTORY, history); }
      render();
      toast('Sent');
    } catch (e) { toast(`Send failed (${e.message})`); }
  }

  // ---- Compare: before (snapshot) vs now (live page) --------------------------------------------------------------
  const lastForPage = () => [...history].reverse().find(h => h.path === location.pathname);

  function openCompare(entry) {
    if (!entry) return;
    if (compare) closeCompare();
    scrollTo({ left: entry.scroll.x, top: entry.scroll.y, behavior: 'instant' });
    const frame = el('iframe', { title: 'The page before your note' });
    stage.append(frame);
    compare = { entry, frame, view: 'split', x: Math.round(innerWidth / 2) };
    mode = 'compare';
    showSnapshot(frame, { id: entry.snapshot }, entry.scroll).then(() => {
      if (!compare || compare.frame !== frame) return;
      // Keep both sides scrolled together.
      const w = frame.contentWindow;
      w.addEventListener('scroll', () => { if (Math.round(w.scrollY) !== Math.round(scrollY) || Math.round(w.scrollX) !== Math.round(scrollX)) scrollTo({ left: w.scrollX, top: w.scrollY, behavior: 'instant' }); }, { passive: true });
    });
    render();
  }

  // Positions are compared before syncing, so the two listeners can't ping-pong.
  addEventListener('scroll', () => {
    const w = compare?.frame.contentWindow;
    if (w && (Math.round(w.scrollY) !== Math.round(scrollY) || Math.round(w.scrollX) !== Math.round(scrollX))) w.scrollTo(scrollX, scrollY);
  }, { passive: true });

  function closeCompare() { compare?.frame.remove(); compare = null; if (mode === 'compare') mode = 'off'; render(); }

  function applyCompare() {
    const { frame, view, x } = compare;
    frame.style.display = view === 'now' ? 'none' : '';
    frame.style.clipPath = view === 'split' ? `inset(0 ${innerWidth - x}px 0 0)` : 'none';
  }

  function renderCompare() {
    applyCompare();
    const bar = el('div', { class: 'bar' });
    for (const [view, label] of [['before', 'Before'], ['split', 'Split'], ['now', 'Now']]) {
      const b = el('button', { type: 'button', 'aria-pressed': String(compare.view === view) }, label);
      b.onclick = () => { compare.view = view; render(); };
      bar.append(b);
    }
    bar.append(el('span', {}, `“${compare.entry.note || ''}”`));
    if (TRACE) {
      for (const [verdict, label, title] of [['good', '👍', 'This fixed it'], ['bad', '👎', 'Not what I meant']]) {
        const b = el('button', { type: 'button', title, 'aria-pressed': String(compare.entry.verdict === verdict) }, label);
        b.onclick = () => rate(compare.entry, verdict);
        bar.append(b);
      }
    }
    const close = el('button', { type: 'button', title: 'Close (Esc)' }, '✕');
    close.onclick = closeCompare;
    bar.append(close);
    layer.append(bar);
    if (compare.view !== 'split') return;
    const divider = el('div', { class: 'divider' });
    divider.style.left = `${compare.x}px`;
    const grip = el('div', { class: 'grip', title: 'Drag to compare' }, '⇆');
    grip.addEventListener('pointerdown', e => {
      grip.setPointerCapture(e.pointerId);
      const move = ev => { compare.x = Math.max(0, Math.min(innerWidth, ev.clientX)); divider.style.left = `${compare.x}px`; before.style.left = `${Math.max(8, compare.x - 70)}px`; now.style.left = `${Math.min(innerWidth - 52, compare.x + 12)}px`; applyCompare(); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', () => grip.removeEventListener('pointermove', move), { once: true });
    });
    divider.append(grip);
    const before = el('div', { class: 'tag' }, 'Before');
    const now = el('div', { class: 'tag' }, 'Now');
    before.style.left = `${Math.max(8, compare.x - 70)}px`;
    now.style.left = `${Math.min(innerWidth - 52, compare.x + 12)}px`;
    layer.append(divider, before, now);
  }

  async function rate(entry, verdict) {
    entry.verdict = verdict; save(HISTORY, history); render();
    const shot = takeSnapshot(); // the live page, as they judged it
    try {
      const res = await fetch(`${BASE}/rate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: entry.id, verdict, snapshot: await shot.upload }) });
      if (!res.ok) throw new Error(String(res.status));
      toast(verdict === 'good' ? 'Marked good' : 'Marked not it');
    } catch (e) { toast(`Rating failed (${e.message})`); }
  }

  // ---- Phone builds (proxy started with --builder) ---------------------------------------------------------------
  // The proxy packs up the folder circleback runs in and uploads it to the build server, which builds and serves the APK.
  // State lives in sessionStorage so a hot reload mid-build keeps showing progress.
  const setBuild = b => { build = b; save(BUILD, b); render(); };
  const elapsed = t => { const s = Math.max(0, Math.round((Date.now() - new Date(t)) / 1000)); return `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`; };

  // How a phone reaches circleback: --public-url if given, else this page's address unless it's loopback.
  const PUBLIC = document.currentScript?.dataset.public || (/^(localhost|127\.|\[::1\])/.test(location.hostname) ? null : location.origin);
  const KINDS = [
    ['live', 'Live', 'Tiny app that opens this page. Edits show up instantly, ✎ works inside it. Needs the tailnet.'],
    ['bundled', 'Bundled', 'The built site packed inside (Capacitor). Works offline.'],
    ['native', 'Native', 'Expo, React Native or Android project. Full native app.'],
  ];

  async function startBuild(kind = build?.kind || 'bundled') {
    setBuild({ kind, status: 'queued', step: 'Uploading project', startedAt: new Date().toISOString() });
    try {
      const res = await fetch(`${BASE}/build`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, origin: PUBLIC }) });
      const body = await res.json();
      if (res.status === 404) return setBuild({ kind, status: 'not-app' });
      if (!res.ok) throw new Error(body.error || res.status);
      setBuild({ kind, ...body, startedAt: body.startedAt || body.createdAt });
      pollBuild();
    } catch (e) { setBuild({ kind, status: 'error', error: e.message }); }
  }

  async function pollBuild() {
    if (!build?.id || !['queued', 'running'].includes(build.status)) return;
    try {
      const res = await fetch(`${BASE}/build/${build.id}`);
      if (res.ok) {
        const b = await res.json();
        if (build?.id === b.id) setBuild({ kind: build.kind, ...b, startedAt: b.startedAt || b.createdAt });
      }
    } catch {}
    if (['queued', 'running'].includes(build?.status)) setTimeout(pollBuild, 2500);
  }

  // One ticker keeps the elapsed time moving while a build runs.
  setInterval(() => { if (BUILDER && ['queued', 'running'].includes(build?.status) && (mode === 'off' || mode === 'compare')) render(); }, 1000);

  function closeBuild(running) {
    if (running && build.id) fetch(`${BASE}/build/${build.id}/cancel`, { method: 'POST' }).catch(() => {});
    setBuild(null);
  }

  // Hand a request to the agent as an ordinary note, so its reply shows up like any other.
  async function noteToAgent(text, extra) {
    try {
      const res = await fetch(`${BASE}/note`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: text, url: location.pathname + location.search + location.hash, title: document.title, ...extra }) });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = await res.json();
      pending.push(id); save(PENDING, pending);
      setBuild(null);
      toast('Sent to your agent');
    } catch (e) { toast(`Send failed (${e.message})`); }
  }

  function renderBuild() {
    const box = el('div', { class: 'buildbox' });
    const top = el('div', { class: 'top' });
    const x = el('button', { class: 'link', type: 'button', title: 'Close' }, '✕');
    const running = ['queued', 'running'].includes(build.status);
    x.onclick = () => closeBuild(false);
    const sub = text => el('div', { class: 'sub' }, text);
    const link = (href, text) => { const a = el('a', { class: 'link', href, target: '_blank', rel: 'noopener' }, text); return a; };
    const acts = el('div', { class: 'acts' });
    if (build.status === 'pick') {
      top.append(el('span', {}, 'Build an app'), x);
      box.append(top);
      for (const [kind, label, help] of KINDS) {
        const live = kind === 'live';
        const b = el('button', { class: 'kind', type: 'button' });
        b.append(el('b', {}, label), el('span', {}, live && !PUBLIC ? 'Needs an address your phone can reach: open this page over the tailnet, or start circleback with --public-url.' : help));
        if (live && !PUBLIC) b.disabled = true;
        b.onclick = () => startBuild(kind);
        box.append(b);
      }
    } else if (running) {
      top.append(el('span', {}, `Building ${build.projectName || 'app'}… ${elapsed(build.startedAt)}`), x);
      box.append(top, sub(build.step || (build.status === 'queued' ? 'Waiting in queue' : 'Starting')));
      const stop = el('button', { class: 'link', type: 'button' }, 'Cancel build');
      stop.onclick = () => closeBuild(true);
      acts.append(stop);
      if (build.dashboardUrl) acts.append(link(build.dashboardUrl, 'Full log'));
    } else if (build.status === 'success') {
      top.append(el('span', {}, `${build.projectName} ${build.versionName || ''} is ready`), x);
      // Served through circleback, so the phone needs no route to the builder. "latest" never goes stale, so the
      // same QR keeps working after every rebuild.
      if (PUBLIC) box.append(top, el('img', { src: `${BASE}/build/qr.svg?u=${encodeURIComponent(`${PUBLIC}${BASE}/app/latest.apk`)}`, alt: 'Install QR code' }), sub('Scan with your phone to install'));
      else box.append(top, sub('Open this page from your phone to install, or start circleback with --public-url for a QR code.'));
      const again = el('button', { class: 'send', type: 'button' }, 'Rebuild');
      again.onclick = () => startBuild();
      acts.append(link(`${BASE}/app/${build.id}.apk`, 'Download APK'), again);
    } else if (build.status === 'not-app') {
      const native = build.kind === 'native';
      top.append(el('span', {}, native ? 'No native app yet' : 'Not an app yet'), x);
      box.append(top, sub(native ? 'This project has no Expo, React Native or Android project. Your agent can port it, then tap 📱 again.'
        : 'This project has no Android app to build. Your agent can wrap it as one (Capacitor), then tap 📱 again.'));
      const ask = el('button', { class: 'send', type: 'button' }, native ? 'Port to native' : 'Make it an app');
      ask.onclick = () => native
        ? noteToAgent('Port this project to a native Android app the 📱 button can build (see "make-native" in the circleback skill).', { kind: 'make-native' })
        : noteToAgent('Make this project installable as an Android app so the 📱 button can build it (see "make-app" in the circleback skill).', { kind: 'make-app' });
      const back = el('button', { class: 'link', type: 'button' }, 'Other kinds');
      back.onclick = () => setBuild({ status: 'pick' });
      acts.append(back, ask);
    } else {
      top.append(el('span', {}, build.status === 'cancelled' ? 'Build cancelled' : 'Build failed'), x);
      box.append(top, sub(build.error || (build.step ? `Stopped at: ${build.step}` : '')));
      const again = el('button', { class: 'link', type: 'button' }, 'Retry');
      again.onclick = () => startBuild();
      acts.append(again);
      if (build.status === 'failed' && build.id) {
        const fix = el('button', { class: 'send', type: 'button' }, 'Ask agent to fix');
        fix.onclick = () => noteToAgent(`The Android build failed${build.step ? ` at "${build.step}"` : ''}. Read the log, fix the project, then tell me to tap 📱 again.`, { kind: 'build-failed', buildId: build.id, logUrl: `${location.origin}${BASE}/build/${build.id}/log` });
        acts.append(fix);
      }
    }
    box.append(acts);
    layer.append(box);
  }

  // ---- Replies ----------------------------------------------------------------------------------------------------
  // Looked up by note id, so a page reload (e.g. after the fix) still shows them.
  async function poll() {
    if (pending.length) {
      try {
        const res = await fetch(`${BASE}/replies?ids=${encodeURIComponent(pending.join(','))}`);
        const replies = res.ok ? await res.json() : [];
        for (const r of replies) {
          pending = pending.filter(id => id !== r.id);
          const entry = history.find(h => h.id === r.id);
          toast(`<b>✓</b> ${escape(r.text)}`, 9000, entry ? { label: 'Compare', run: () => openCompare(entry) } : undefined);
        }
        if (replies.length) { save(PENDING, pending); render(); }
      } catch {}
    }
    setTimeout(poll, 2500);
  }

  addEventListener('keydown', e => {
    const t = e.composedPath()[0];
    const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (typing || e.ctrlKey || e.metaKey || e.altKey) { if (e.key === 'Escape' && mode !== 'off') cancelAll(); return; }
    if (e.code === 'Backquote') {
      e.preventDefault();
      if (e.shiftKey) { if (mode === 'draw') { setFrozen(!frozen); render(); } else if (mode !== 'note') startDraw(true); }
      else if (mode === 'off' || mode === 'compare') startDraw(false);
      else cancel();
    } else if (e.code === 'Backslash' && (mode === 'off' || mode === 'compare')) {
      e.preventDefault();
      if (mode === 'compare') closeCompare(); else openCompare(lastForPage());
    } else if (e.key === 'Escape' && mode !== 'off') cancelAll();
  }, true);
  function cancelAll() { if (mode === 'compare') closeCompare(); else cancel(); }
  addEventListener('resize', () => { if (compare) render(); });

  const mount = () => { document.documentElement.append(host); render(); poll(); if (BUILDER) pollBuild(); };
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
})();
