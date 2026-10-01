// Receives the field log from a phone while it's testing through `npm run phone`.
//
// assets/js/sharks-way-log.js streams its lines here (POST /__sharksway-log)
// when the page was served through a *.trycloudflare.com tunnel. Each day's
// lines go to logs/phone/YYYY-MM-DD.log (gitignored — they contain GPS), with
// a header whenever a different page load starts writing. Errors, warnings,
// ★ marks, test-run steps, drops and 8th Wall events are also echoed to the
// terminal, prefixed with PHONE_LOG_PREFIX so tools/phone.mjs can pick them
// out of Vite's output.
//
// Batches are numbered by the phone and written in number order, not arrival
// order: when a page goes to the background the phone sends its last lines
// with sendBeacon, which can land seconds after the next regular batch. A
// batch that never arrives is skipped after GAP_MS (and noted in the file).
//
// The dev server serves every file under the repo, and through the tunnel
// that's the internet: logs/ (GPS) is refused here, however the path is spelled.
//
// Dev and preview servers only — the GitHub Pages build has no server, so
// production pages never send anything.

import fs from 'node:fs';
import path from 'node:path';

export const PHONE_LOG_ENDPOINT = '/__sharksway-log';
export const PHONE_LOG_PREFIX = '📱 ';

const MAX_BODY = 512 * 1024;
const MAX_LINES = 1000;
const MAX_LINE = 2000;
const GAP_MS = 10000;
const ECHO = /\[(error|warn|mark|test|drop|xr)\]/;

export function phoneLogPlugin({ dir = 'logs/phone' } = {}) {
  let outDir = dir;
  let lastWritten = null;
  let timer = null;
  // id → { page, device, next, held: Map(seq → { lines, at }), done: Set(seq) }
  const sessions = new Map();

  function dayFile() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return path.join(outDir, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`);
  }

  function clean(s, max) {
    // One line per entry, no terminal escape sequences from a page.
    return String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n/g, ' ⏎ ').slice(0, max);
  }

  function write(id, s, lines, note) {
    let out = '';
    if (id !== lastWritten) {
      lastWritten = id;
      out += `\n===== ${new Date().toLocaleString()} · ${s.page} · ${s.device} · load ${id} =====\n`;
      console.log(`${PHONE_LOG_PREFIX}${s.page} — ${s.device}`);
    }
    if (note) out += `…… ${note}\n`;
    for (const l of lines) {
      out += l + '\n';
      if (ECHO.test(l)) console.log(`${PHONE_LOG_PREFIX}  ${l}`);
    }
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(dayFile(), out);
    } catch (err) {
      console.error(`${PHONE_LOG_PREFIX}couldn't write the phone log: ${err.message}`);
    }
  }

  /** Write held batches in number order; skip a gap once it has waited GAP_MS (all: skip now). */
  function drain(id, s, all = false) {
    for (;;) {
      if (s.held.has(s.next)) {
        const b = s.held.get(s.next);
        s.held.delete(s.next);
        s.done.add(s.next);
        s.next++;
        write(id, s, b.lines);
        continue;
      }
      if (!s.held.size) return;
      const waiting = Math.min(...[...s.held.values()].map((b) => b.at));
      if (!all && Date.now() - waiting < GAP_MS) return;
      const first = Math.min(...s.held.keys());
      write(id, s, [], `batch${first - s.next > 1 ? `es ${s.next}–${first - 1}` : ` ${s.next}`} never arrived`);
      s.next = first;
    }
  }

  function flush(all = false) {
    for (const [id, s] of sessions) drain(id, s, all);
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => flush(false), 1000);
    timer.unref();
    process.on('exit', () => flush(true));
  }

  function isLogsPath(url) {
    let p = url.split('?')[0].split('#')[0];
    try { p = decodeURIComponent(p); } catch { return true; }
    // macOS paths are case-insensitive (/LOGS/ works); /@fs/<absolute path> reaches it too.
    return /(^|\/)logs(\/|$)/i.test(path.posix.normalize(p.replace(/\\/g, '/')));
  }

  function handle(req, res, next) {
    if (isLogsPath(req.url)) {
      res.statusCode = 404;
      return res.end();
    }
    if (req.url.split('?')[0] !== PHONE_LOG_ENDPOINT) return next();
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end();
    }

    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        res.statusCode = 413;
        res.end();
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.statusCode = 400;
        return res.end();
      }
      const id = clean(body.id, 40) || 'unknown';
      const seq = Number.isInteger(body.seq) && body.seq >= 0 ? body.seq : null;
      const lines = (Array.isArray(body.lines) ? body.lines.slice(0, MAX_LINES) : []).map((l) => clean(l, MAX_LINE));
      let s = sessions.get(id);
      if (!s) {
        // A page that was already running when this server (re)started picks
        // up from whatever number it's at.
        s = {
          page: clean(body.page, 200), device: clean(body.device, 120),
          next: seq ?? 0, held: new Map(), done: new Set()
        };
        sessions.set(id, s);
      }
      if (seq !== null && (s.done.has(seq) || s.held.has(seq))) {
        // Re-sent after a lost reply — already have it.
      } else if (seq === null || seq < s.next) {
        if (seq !== null) s.done.add(seq);
        write(id, s, lines, seq === null ? null : `batch ${seq} arrived late`);
      } else {
        s.held.set(seq, { lines, at: Date.now() });
        drain(id, s);
      }
      res.statusCode = 204;
      res.end();
    });
  }

  return {
    name: 'sharks-way-phone-log',
    configResolved(config) {
      outDir = path.resolve(config.root, dir);
    },
    configureServer(server) {
      start();
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      start();
      server.middlewares.use(handle);
    }
  };
}
