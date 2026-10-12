#!/usr/bin/env node
// circleback: a zero-dependency proxy in front of any dev server. It injects an overlay that lets
// you circle part of the page and type a note; notes land in .circleback/inbox.jsonl for your
// coding agent, and the agent's replies show up on the page.
//
//   circleback [--target http://localhost:3000] [--port 3999] [--host 127.0.0.1] [--dir .circleback]
//   circleback reply <note-id> <message...> [--dir .circleback]
//   circleback watch [--dir .circleback]     # prints each new note as one JSON line
//   circleback export [--out episodes.jsonl]  # traced notes joined into training episodes
// With --trace, the proxy also records each note's code change and your thumbs up/down in .circleback/trace.jsonl.
// Each note can carry a snapshot: a script-free copy of the page as it was, in .circleback/snapshots/.
// With --builder URL (or CIRCLEBACK_BUILDER), the overlay gets a 📱 button: the proxy packs up this folder,
// uploads it to that build server (local or on another machine), and the page shows progress and an install QR.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value;
};
const toggle = name => { const i = argv.indexOf(`--${name}`); if (i !== -1) argv.splice(i, 1); return i !== -1; };
const dir = resolve(flag('dir', process.env.CIRCLEBACK_DIR || '.circleback'));
const inbox = join(dir, 'inbox.jsonl');
const repliesFile = join(dir, 'replies.jsonl');
const snapshotDir = join(dir, 'snapshots');
const traceFile = join(dir, 'trace.jsonl');
const SNAPSHOT_ID = /^[a-z0-9]{6,16}$/;

function ensureDir() {
  mkdirSync(dir, { recursive: true });
  // Self-ignoring, so the project's .gitignore never needs touching.
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
}

const readLines = file => existsSync(file)
  ? readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];

const command = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'serve';

if (command === 'reply') {
  const agent = flag('agent', process.env.CIRCLEBACK_AGENT);
  const session = flag('session', process.env.CIRCLEBACK_SESSION);
  const [id, ...words] = argv;
  if (!id || !words.length) { console.error('usage: circleback reply <note-id> <message...> [--agent NAME] [--session ID]'); process.exit(1); }
  ensureDir();
  const at = new Date().toISOString();
  appendFileSync(repliesFile, JSON.stringify({ id, at, text: words.join(' ') }) + '\n');
  traceReply(id, at, { agent, session });
  console.log(`replied to ${id}`);
} else if (command === 'watch') {
  watchInbox();
} else if (command === 'export') {
  exportEpisodes(flag('out'));
} else if (command === 'serve') {
  serve();
} else {
  console.error(`unknown command: ${command}`); process.exit(1);
}

// ---- Traces -------------------------------------------------------------------------------------------------------
function git(args, env) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'ignore'] });
}

// Files to ship to a phone builder: what git would see (tracked + untracked, minus ignored) plus root .env files,
// which apps often need at build time. Outside git, everything except dependency and build output folders.
const SKIP_DIRS = new Set(['node_modules', '.git', '.circleback', '.gradle', '.expo', '.next', '.dart_tool', '.turbo', '.cache', 'Pods']);
function sourceFiles(root) {
  const envs = readdirSync(root).filter(f => /^\.env/.test(f) && statSync(join(root, f)).isFile());
  try {
    const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(f => f && existsSync(join(root, f)));
    return [...new Set([...listed, ...envs])];
  } catch {}
  const out = [];
  const walk = rel => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || (e.name === 'build' && /(^|\/)(android|ios)(\/app)?$/.test(rel))) continue;
        walk(p);
      } else if (e.isFile()) out.push(p);
    }
  };
  walk('');
  return out;
}

// The whole working tree (tracked and untracked, minus ignored files) as a git tree object. A scratch index keeps
// the user's staging area untouched.
function worktree() {
  try {
    const index = join(dir, 'trace.index');
    const real = resolve(git(['rev-parse', '--git-path', 'index']).trim());
    if (existsSync(real)) copyFileSync(real, index);
    git(['add', '-A'], { GIT_INDEX_FILE: index });
    return git(['write-tree'], { GIT_INDEX_FILE: index }).trim();
  } catch { return null; }
}

function traceReply(id, at, who) {
  const events = readLines(traceFile);
  const note = events.find(e => e.type === 'note' && e.id === id);
  if (!note) return; // not traced
  // Everything changed since the later of this note and the previous reply is this note's fix.
  const base = events.filter(e => e.type === 'reply' && e.tree && e.at > note.at).pop()?.tree || note.tree;
  const tree = worktree();
  let diff = null;
  try { if (base && tree) diff = git(['diff', '--no-color', '--no-ext-diff', base, tree]).slice(0, 500_000); } catch {}
  appendFileSync(traceFile, JSON.stringify({ type: 'reply', id, at, base, tree, diff, ...who }) + '\n');
}

// Boxes count as the same spot when most of the smaller one sits inside the bigger one. Clicks get some slack.
function sameSpot(a, b) {
  if (!a || !b) return false;
  const grow = r => ({ l: r.left - 16, t: r.top - 16, r: r.left + r.width + 16, b: r.top + r.height + 16 });
  const p = grow(a), q = grow(b);
  const ix = Math.max(0, Math.min(p.r, q.r) - Math.max(p.l, q.l)), iy = Math.max(0, Math.min(p.b, q.b) - Math.max(p.t, q.t));
  const area = r => (r.r - r.l) * (r.b - r.t);
  return (ix * iy) / Math.min(area(p), area(q)) > 0.5;
}

// One episode per traced note: what was circled and asked, the agent's change and reply, and how it landed.
// outcome: good / bad (rated in compare), recircled (same spot circled again after the reply), unrated, unanswered.
function exportEpisodes(out) {
  const notes = readLines(inbox), replies = readLines(repliesFile), events = readLines(traceFile);
  const traced = new Map(events.filter(e => e.type === 'note').map(e => [e.id, e]));
  const list = notes.filter(n => traced.has(n.id));
  const episodes = list.map((n, i) => {
    const reply = replies.filter(r => r.id === n.id).pop();
    const fixes = events.filter(e => e.type === 'reply' && e.id === n.id);
    const rating = events.filter(e => e.type === 'rate' && e.id === n.id).pop();
    const again = reply && list.slice(i + 1).find(m => m.at > reply.at && m.url === n.url && sameSpot(n.pageBox, m.pageBox));
    const { snapshot, snapshotFile, ...request } = n;
    return {
      id: n.id,
      at: n.at,
      request,
      agent: fixes.at(-1)?.agent,
      session: fixes.at(-1)?.session,
      reply: reply?.text,
      diff: fixes.map(f => f.diff).filter(Boolean).join('\n'),
      trees: { before: traced.get(n.id).tree, after: fixes.at(-1)?.tree },
      snapshots: { before: snapshotFile, after: rating?.snapshotFile || again?.snapshotFile },
      outcome: rating ? rating.verdict : again ? 'recircled' : reply ? 'unrated' : 'unanswered',
      recircledBy: again?.id,
    };
  });
  const text = episodes.map(e => JSON.stringify(e)).join('\n') + (episodes.length ? '\n' : '');
  if (out) { writeFileSync(out, text); console.error(`${episodes.length} episodes -> ${resolve(out)}`); } else process.stdout.write(text);
}

function watchInbox() {
  ensureDir();
  if (!existsSync(inbox)) writeFileSync(inbox, '');
  let offset = statSync(inbox).size;
  const drain = () => {
    const size = statSync(inbox).size;
    if (size < offset) offset = 0;
    if (size === offset) return;
    const fd = openSync(inbox, 'r');
    const buf = Buffer.alloc(size - offset);
    readSync(fd, buf, 0, buf.length, offset);
    closeSync(fd);
    offset = size;
    for (const line of buf.toString('utf8').split('\n').filter(Boolean)) console.log(line);
  };
  watch(dir, () => drain());
  setInterval(drain, 1000);
}

function serve() {
  const target = new URL(flag('target', process.env.CIRCLEBACK_TARGET || 'http://localhost:3000'));
  const port = Number(flag('port', process.env.CIRCLEBACK_PORT || 3999));
  const host = flag('host', process.env.CIRCLEBACK_HOST || '127.0.0.1');
  const trace = toggle('trace') || process.env.CIRCLEBACK_TRACE === '1';
  const builderFlag = flag('builder', process.env.CIRCLEBACK_BUILDER);
  const builder = builderFlag ? new URL(builderFlag) : null;
  const projectDir = process.cwd();
  const secure = target.protocol === 'https:';
  const targetPort = Number(target.port || (secure ? 443 : 80));
  const overlayFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'overlay.js');
  const tag = `<script src="/__circleback/overlay.js"${trace ? ' data-trace="1"' : ''}${builder ? ' data-builder="1"' : ''} defer></script>`;
  ensureDir();

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/__circleback/')) return own(req, res);
    const headers = { ...req.headers, host: target.host };
    delete headers['accept-encoding']; // HTML must come back uncompressed so the tag can be injected.
    if (headers.origin) headers.origin = target.origin;
    if (headers.referer) headers.referer = headers.referer.replace(/^https?:\/\/[^/]+/, target.origin);
    const upstream = (secure ? https : http).request({ hostname: target.hostname, port: targetPort, path: req.url, method: req.method, headers, rejectUnauthorized: false }, up => {
      const out = { ...up.headers };
      if (out.location?.startsWith(target.origin)) out.location = out.location.slice(target.origin.length) || '/';
      if (!String(up.headers['content-type'] || '').includes('text/html') || req.method === 'HEAD') {
        res.writeHead(up.statusCode, out);
        up.pipe(res);
        return;
      }
      const chunks = [];
      up.on('data', c => chunks.push(c));
      up.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}</body>`) : html + tag;
        delete out['content-encoding']; delete out['transfer-encoding'];
        out['content-length'] = Buffer.byteLength(html);
        res.writeHead(up.statusCode, out);
        res.end(html);
      });
    });
    upstream.on('error', e => { res.writeHead(502, { 'content-type': 'text/plain' }); res.end(`circleback: can't reach ${target.origin} (${e.message})`); });
    req.pipe(upstream);
  });

  // Hot reload runs over WebSockets: pass upgrades straight through.
  server.on('upgrade', (req, socket, head) => {
    const connect = secure ? () => tls.connect({ host: target.hostname, port: targetPort, servername: target.hostname, rejectUnauthorized: false }) : () => net.connect(targetPort, target.hostname);
    const up = connect();
    up.on(secure ? 'secureConnect' : 'connect', () => {
      const headers = { ...req.headers, host: target.host };
      if (headers.origin) headers.origin = target.origin;
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(headers)) for (const value of [].concat(v)) raw += `${k}: ${value}\r\n`;
      up.write(raw + '\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket); socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });

  // Relay a request to the build server. The page only ever talks to the proxy, so the builder can stay on
  // localhost and the page never needs CORS.
  function toBuilder(method, path, body, res) {
    const out = (builder.protocol === 'https:' ? https : http).request(new URL(path, builder), { method, headers: body ? { 'content-type': 'application/json' } : {} }, up => {
      res.writeHead(up.statusCode, { 'content-type': up.headers['content-type'] || 'application/json', 'cache-control': 'no-store' });
      up.pipe(res);
    });
    out.on('error', e => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: `can't reach builder at ${builder.origin} (${e.message})` })); });
    out.end(body ? JSON.stringify(body) : undefined);
  }

  // Pack this folder and stream it to the builder, which builds the copy it receives. Same path whether the builder
  // runs here or on another machine.
  function uploadBuild(res) {
    let list;
    try { list = join(dir, 'upload-files.txt'); writeFileSync(list, sourceFiles(projectDir).join('\n') + '\n'); }
    catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: `couldn't list project files (${e.message})` })); }
    let ref = null;
    try {
      ref = git(['log', '-1', '--format=%h %s']).trim().slice(0, 80);
      if (git(['status', '--porcelain']).trim()) ref += ' (+uncommitted)';
    } catch {}
    const q = new URLSearchParams({ name: basename(projectDir), host: hostname() });
    if (ref) q.set('git', ref);
    // Windows 10+ ships bsdtar; prefer it over a Git-for-Windows GNU tar on PATH.
    const sysTar = process.env.SystemRoot && join(process.env.SystemRoot, 'System32', 'tar.exe');
    const tar = spawn(sysTar && existsSync(sysTar) ? sysTar : 'tar', ['-czf', '-', '-T', list], { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let tarErr = '';
    tar.stderr.on('data', d => (tarErr += d));
    const fail = (code, error) => { if (res.headersSent) return; res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error })); };
    tar.on('error', e => { up.destroy(); fail(500, `tar failed: ${e.message}`); });
    tar.on('close', code => { if (code !== 0) { up.destroy(); fail(500, `tar failed: ${tarErr.trim().slice(0, 300)}`); } });
    const up = (builder.protocol === 'https:' ? https : http).request(new URL(`/api/builds/upload?${q}`, builder), { method: 'POST', headers: { 'content-type': 'application/gzip' } }, r => {
      res.writeHead(r.statusCode, { 'content-type': r.headers['content-type'] || 'application/json', 'cache-control': 'no-store' });
      r.pipe(res);
    });
    up.on('error', e => fail(502, `can't reach builder at ${builder.origin} (${e.message})`));
    tar.stdout.pipe(up);
  }

  function own(req, res) {
    const url = new URL(req.url, 'http://x');
    if (builder && url.pathname.startsWith('/__circleback/build')) {
      let m;
      if (url.pathname === '/__circleback/build' && req.method === 'POST') return uploadBuild(res);
      if (url.pathname === '/__circleback/build/qr.svg') return toBuilder('GET', `/qr.svg?u=${encodeURIComponent(url.searchParams.get('u') || '')}`, null, res);
      if ((m = url.pathname.match(/^\/__circleback\/build\/([\w-]+)$/))) return toBuilder('GET', `/api/builds/${m[1]}`, null, res);
      if ((m = url.pathname.match(/^\/__circleback\/build\/([\w-]+)\/log$/))) return toBuilder('GET', `/api/builds/${m[1]}/log.txt`, null, res);
      if ((m = url.pathname.match(/^\/__circleback\/build\/([\w-]+)\/cancel$/)) && req.method === 'POST') return toBuilder('POST', `/api/builds/${m[1]}/cancel`, null, res);
    }
    if (url.pathname === '/__circleback/overlay.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(readFileSync(overlayFile)); // read per request, so overlay edits apply on reload
    }
    if (url.pathname === '/__circleback/note' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 64_000) req.destroy(); });
      req.on('end', () => {
        let note;
        try { note = JSON.parse(body); } catch { res.writeHead(400); return res.end('bad json'); }
        const id = Date.now().toString(36);
        const entry = { id, at: new Date().toISOString(), ...note };
        // Point the agent at the frozen copy of the page this note was drawn on.
        if (typeof note.snapshot === 'string' && SNAPSHOT_ID.test(note.snapshot)) entry.snapshotFile = join(snapshotDir, `${note.snapshot}.html`);
        else delete entry.snapshot;
        ensureDir();
        // Record the code as it is before the agent sees the note.
        if (trace) appendFileSync(traceFile, JSON.stringify({ type: 'note', id, at: entry.at, tree: worktree() }) + '\n');
        appendFileSync(inbox, JSON.stringify(entry) + '\n');
        console.log(`note ${id}: ${String(note.note).slice(0, 100)}`);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id }));
      });
      return;
    }
    if (url.pathname === '/__circleback/rate' && req.method === 'POST' && trace) {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 4_000) req.destroy(); });
      req.on('end', () => {
        let r;
        try { r = JSON.parse(body); } catch { res.writeHead(400); return res.end('bad json'); }
        if (!/^[a-z0-9]{1,16}$/.test(r.id) || !['good', 'bad'].includes(r.verdict)) { res.writeHead(400); return res.end('bad rating'); }
        const entry = { type: 'rate', id: r.id, at: new Date().toISOString(), verdict: r.verdict };
        // The live page they were looking at when they judged it.
        if (typeof r.snapshot === 'string' && SNAPSHOT_ID.test(r.snapshot)) entry.snapshotFile = join(snapshotDir, `${r.snapshot}.html`);
        appendFileSync(traceFile, JSON.stringify(entry) + '\n');
        console.log(`rated ${r.id}: ${r.verdict}`);
        res.writeHead(204); res.end();
      });
      return;
    }
    if (url.pathname === '/__circleback/snapshot' && req.method === 'POST') {
      const chunks = [];
      let size = 0;
      req.on('data', c => { size += c.length; if (size > 30_000_000) req.destroy(); else chunks.push(c); });
      req.on('end', () => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        mkdirSync(snapshotDir, { recursive: true });
        writeFileSync(join(snapshotDir, `${id}.html`), Buffer.concat(chunks));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id }));
      });
      return;
    }
    const snapshot = url.pathname.match(/^\/__circleback\/snapshot\/([a-z0-9]+)$/);
    if (snapshot && SNAPSHOT_ID.test(snapshot[1])) {
      const file = join(snapshotDir, `${snapshot[1]}.html`);
      if (!existsSync(file)) { res.writeHead(404); return res.end(); }
      // Snapshots are inert copies: no scripts may run in them.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "script-src 'none'" });
      return res.end(readFileSync(file));
    }
    if (url.pathname === '/__circleback/replies') {
      const ids = new Set((url.searchParams.get('ids') || '').split(',').filter(Boolean));
      const replies = readLines(repliesFile).filter(r => ids.has(r.id));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(replies));
    }
    res.writeHead(404); res.end();
  }

  server.listen(port, host, () => {
    console.log(`circleback: http://${host === '0.0.0.0' ? 'localhost' : host}:${port} -> ${target.origin}`);
    console.log(`circleback: notes -> ${inbox}`);
    if (trace) console.log(`circleback: tracing -> ${traceFile}`);
    if (builder) console.log(`circleback: 📱 builds -> ${builder.origin} (${projectDir})`);
  });
}
