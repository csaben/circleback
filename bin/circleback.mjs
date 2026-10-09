#!/usr/bin/env node
// circleback: a zero-dependency proxy in front of any dev server. It injects an overlay that lets
// you circle part of the page and type a note; notes land in .circleback/inbox.jsonl for your
// coding agent, and the agent's replies show up on the page.
//
//   circleback [--target http://localhost:3000] [--port 3999] [--host 127.0.0.1] [--dir .circleback]
//   circleback reply <note-id> <message...> [--dir .circleback]
//   circleback watch [--dir .circleback]     # prints each new note as one JSON line
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, watch, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value;
};
const dir = resolve(flag('dir', process.env.CIRCLEBACK_DIR || '.circleback'));
const inbox = join(dir, 'inbox.jsonl');
const repliesFile = join(dir, 'replies.jsonl');

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
  const [id, ...words] = argv;
  if (!id || !words.length) { console.error('usage: circleback reply <note-id> <message...>'); process.exit(1); }
  ensureDir();
  appendFileSync(repliesFile, JSON.stringify({ id, at: new Date().toISOString(), text: words.join(' ') }) + '\n');
  console.log(`replied to ${id}`);
} else if (command === 'watch') {
  watchInbox();
} else if (command === 'serve') {
  serve();
} else {
  console.error(`unknown command: ${command}`); process.exit(1);
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
  const secure = target.protocol === 'https:';
  const targetPort = Number(target.port || (secure ? 443 : 80));
  const overlay = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'overlay.js'));
  const tag = '<script src="/__circleback/overlay.js" defer></script>';
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

  function own(req, res) {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__circleback/overlay.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(overlay);
    }
    if (url.pathname === '/__circleback/note' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 64_000) req.destroy(); });
      req.on('end', () => {
        let note;
        try { note = JSON.parse(body); } catch { res.writeHead(400); return res.end('bad json'); }
        const id = Date.now().toString(36);
        const entry = { id, at: new Date().toISOString(), ...note };
        ensureDir();
        appendFileSync(inbox, JSON.stringify(entry) + '\n');
        console.log(`note ${id}: ${String(note.note).slice(0, 100)}`);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id }));
      });
      return;
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
  });
}
