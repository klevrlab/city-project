/*
 * Sharks Way field log — a downloadable record of what happened on a phone.
 *
 * Off unless the page URL has ?debug=1 or ?log=1. The choice sticks for the
 * rest of the tab's session (so moving between pages with the menu keeps
 * logging); ?log=0 turns it off. Developer addresses only (DEV_HOST below) —
 * always off on the public site.
 *
 * When on, it records from the first script on the page: console output,
 * errors and failed downloads, every file fetched (size and time), 8th Wall /
 * camera events, model loads, page lifecycle, and a stats line every 5 s
 * (fps, JS heap, GPU textures/geometries, scan status and score, mode). App
 * code adds its own lines with SharksWayLog.add(category, message).
 *
 * Lines are kept in localStorage so a crash or reload doesn't lose them — the
 * next load notes a session that ended without unloading, which on an iPhone
 * usually means Safari killed the tab (memory) — and they only leave the phone
 * when someone taps Share or Download. The log includes GPS positions.
 *
 * One exception, for the dev team's own testing: when the page came through
 * `npm run phone` (a *.trycloudflare.com address), lines are also posted every
 * 2 s to that laptop's dev server, which writes them to logs/phone/
 * (tools/phone-log-plugin.mjs). The public site (github.io) never sends.
 * ?logStream=1 turns it on for a local dev server; ?logStream=0 off.
 *
 * A classic script loaded first in <head>, not a module: modules run after the
 * page is parsed, too late to see a CDN script fail to load.
 */
(function () {
  'use strict';

  var FLAG_KEY = 'sharksway.log.on';
  var CUR_KEY = 'sharksway.log.cur';
  var PREV_KEY = 'sharksway.log.prev';
  var MAX_ENTRIES = 3000;      // per page load; oldest dropped first
  var MAX_PREV_SESSIONS = 2;   // earlier page loads kept alongside this one (localStorage is ~5 MB)
  var MAX_MSG = 800;           // characters per line
  var STATS_MS = 5000;
  var SAVE_MS = 4000;

  function noop() {}

  // The team's test tools — this log and its LOG button, the ?debug=1 panel,
  // the ?test=1 checklist, the ?desktop=1 sim — only open on a developer
  // address: this laptop, its Wi-Fi address, or the `npm run phone` tunnel.
  // On the public site their URL flags do nothing (Oct 2, final production
  // build: "strip all debug HUD"). Set before anything else so the modules
  // can ask: window.SharksWayDevHost.
  var DEV_HOST = (function (h) {
    return h === '' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' ||
      /\.(localhost|local|trycloudflare\.com)$/.test(h) ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  })(window.location.hostname);
  window.SharksWayDevHost = DEV_HOST;

  var flag = null;
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('log') === '0') flag = '0';
    else if (params.get('log') === '1' || params.get('debug') === '1' ||
             params.get('debugPlacement') === '1' || params.get('test') === '1') flag = '1';
  } catch (e) { /* old browser — stay off */ }

  var enabled = false;
  if (!DEV_HOST) flag = '0';
  try {
    if (flag === '0') window.sessionStorage.removeItem(FLAG_KEY);
    else if (flag === '1') window.sessionStorage.setItem(FLAG_KEY, '1');
    enabled = window.sessionStorage.getItem(FLAG_KEY) === '1';
  } catch (e) {
    enabled = flag === '1';
  }

  if (!enabled) {
    window.SharksWayLog = {
      enabled: false, add: noop, mark: noop, save: noop, clear: noop,
      askNote: function (t, cb) { if (cb) cb(null); },
      download: noop, share: noop, text: function () { return ''; },
      entries: function () { return []; }
    };
    return;
  }

  // ---- state ------------------------------------------------------------------

  var startWall = Date.now();
  var startPerf = performance.now();
  var cur = {
    id: startWall.toString(36),
    page: window.location.pathname.split('/').pop() + window.location.search,
    start: startWall,
    ended: false,
    entries: []        // [msSinceStart, category, message]
  };
  var prev = [];
  var dirty = false;
  var persistOk = true;

  // Live copy to the laptop running `npm run phone` (see header). Decided here,
  // before the first add(), so the device header lines are sent too.
  var STREAM_ENDPOINT = '/__sharksway-log';
  var STREAM_MS = 2000;
  var MAX_OUTBOX = 3000;
  var outbox = [];
  var streaming = /\.trycloudflare\.com$/.test(window.location.hostname);
  try {
    var streamFlag = new URLSearchParams(window.location.search).get('logStream');
    if (streamFlag === '1') window.sessionStorage.setItem('sharksway.log.stream', '1');
    if (streamFlag === '0') window.sessionStorage.setItem('sharksway.log.stream', '0');
    var streamPref = window.sessionStorage.getItem('sharksway.log.stream');
    if (streamPref === '1') streaming = true;
    if (streamPref === '0') streaming = false;
  } catch (e) { /* keep the hostname rule */ }

  function now() { return Math.round(performance.now() - startPerf); }

  function add(category, message) {
    var msg = typeof message === 'string' ? message : describe(message);
    if (msg.length > MAX_MSG) msg = msg.slice(0, MAX_MSG) + '…';
    var entry = [now(), String(category || 'log'), msg];
    cur.entries.push(entry);
    if (cur.entries.length > MAX_ENTRIES) cur.entries.splice(0, cur.entries.length - MAX_ENTRIES);
    if (streaming) {
      outbox.push(lineText(cur.start, entry));
      if (outbox.length > MAX_OUTBOX) outbox.splice(0, outbox.length - MAX_OUTBOX);
    }
    dirty = true;
    if (panel && panel.open) renderPanel();
  }

  // ---- formatting ---------------------------------------------------------------

  function describe(v) {
    if (v == null) return String(v);
    if (typeof v === 'string') return v;
    if (v instanceof Error) {
      return v.name + ': ' + v.message + (v.stack ? ' | ' + stackHead(v.stack) : '');
    }
    if (typeof Event !== 'undefined' && v instanceof Event) {
      return 'Event(' + v.type + ')';
    }
    if (typeof Element !== 'undefined' && v instanceof Element) {
      return '<' + v.tagName.toLowerCase() + (v.id ? '#' + v.id : '') + '>';
    }
    try {
      var seen = [];
      return JSON.stringify(v, function (k, val) {
        if (val instanceof Error) return val.name + ': ' + val.message;
        if (typeof Element !== 'undefined' && val instanceof Element) {
          return '<' + val.tagName.toLowerCase() + (val.id ? '#' + val.id : '') + '>';
        }
        if (val && typeof val === 'object') {
          if (seen.indexOf(val) !== -1) return '[circular]';
          seen.push(val);
          if (seen.length > 200) return '[…]';
        }
        if (typeof val === 'number' && !Number.isInteger(val)) return Math.round(val * 1000) / 1000;
        return val;
      });
    } catch (e) {
      try { return String(v); } catch (e2) { return '[unprintable]'; }
    }
  }

  function stackHead(stack) {
    return String(stack).split('\n').slice(0, 4).map(function (l) {
      return l.trim().replace(window.location.origin, '');
    }).join(' ← ');
  }

  // console.log('%cStyled', 'color: red', x) → "Styled x"
  function formatArgs(args) {
    var list = Array.prototype.slice.call(args);
    if (typeof list[0] === 'string' && list[0].indexOf('%c') !== -1) {
      var styles = (list[0].match(/%c/g) || []).length;
      list[0] = list[0].replace(/%c/g, '');
      list.splice(1, styles);
    }
    return list.map(describe).join(' ');
  }

  function shortUrl(url) {
    try {
      var u = new URL(url, window.location.href);
      if (u.origin === window.location.origin) return u.pathname.replace(/^.*?\/(assets|src|data)\//, '$1/') + u.search;
      return u.host + u.pathname;
    } catch (e) {
      return String(url);
    }
  }

  function lineText(start, e) {
    return clock(start + e[0]) + ' +' + (e[0] / 1000).toFixed(1) + 's [' + e[1] + '] ' + e[2];
  }

  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

  function clock(ms) {
    var d = new Date(ms);
    return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' +
      pad(d.getMilliseconds(), 3);
  }

  // ---- persistence ----------------------------------------------------------------

  function readJson(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function save() {
    if (!persistOk || !dirty) return;
    try {
      window.localStorage.setItem(CUR_KEY, JSON.stringify(cur));
      dirty = false;
    } catch (e) {
      // Out of room: drop the older sessions, then half of this one.
      try {
        prev = [];
        window.localStorage.removeItem(PREV_KEY);
        cur.entries.splice(0, Math.floor(cur.entries.length / 2));
        window.localStorage.setItem(CUR_KEY, JSON.stringify(cur));
        dirty = false;
      } catch (e2) {
        persistOk = false;   // keep logging in memory
      }
    }
  }

  (function restore() {
    prev = readJson(PREV_KEY) || [];
    var last = readJson(CUR_KEY);
    var known = prev.some(function (s) { return last && s.id === last.id; });
    if (last && last.entries && !known) {
      prev.push(last);
      while (prev.length > MAX_PREV_SESSIONS) prev.shift();
      try { window.localStorage.setItem(PREV_KEY, JSON.stringify(prev)); } catch (e) { prev = []; }
    }
    // Claim the slot now: a reload before the first save would otherwise find
    // the old session still there and file it twice.
    try { window.localStorage.setItem(CUR_KEY, JSON.stringify(cur)); } catch (e) { /* save() retries */ }
  })();

  setInterval(save, SAVE_MS);

  // ---- text export -------------------------------------------------------------------

  function sessionText(s, index, total) {
    var head = '===== Session ' + index + ' of ' + total + ' · ' + new Date(s.start).toLocaleString() +
      ' · ' + s.page + ' · ' +
      (s === cur ? 'current' : (s.ended ? 'ended normally' :
        'ENDED WITHOUT UNLOADING (tab killed or crashed — often memory on iPhone)')) + ' =====';
    var lines = [head];
    for (var i = 0; i < s.entries.length; i++) lines.push(lineText(s.start, s.entries[i]));
    return lines.join('\n');
  }

  function text() {
    var sessions = prev.concat([cur]);
    var parts = [
      'Sharks Way field log — ' + new Date().toLocaleString(),
      'Contains GPS positions — share it with the team only.',
      ''
    ];
    for (var i = 0; i < sessions.length; i++) {
      parts.push(sessionText(sessions[i], i + 1, sessions.length), '');
    }
    return parts.join('\n');
  }

  function fileName() {
    var d = new Date();
    return 'sharks-way-log-' + d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2) + '-' +
      pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + '.txt';
  }

  function download() {
    add('page', 'log downloaded');
    save();
    var blob = new Blob([text()], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }

  // Straight from the tap, no awaits first: Safari only allows share() then.
  function share() {
    add('page', 'log shared');
    save();
    var file;
    try { file = new File([text()], fileName(), { type: 'text/plain' }); } catch (e) { file = null; }
    if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      navigator.share({ files: [file], title: 'Sharks Way log' }).catch(function (err) {
        if (err && err.name !== 'AbortError') download();
      });
      return;
    }
    download();
  }

  function clear() {
    prev = [];
    cur.entries = [];
    try {
      window.localStorage.removeItem(PREV_KEY);
      window.localStorage.removeItem(CUR_KEY);
    } catch (e) { /* ignore */ }
    add('page', 'log cleared');
  }

  /**
   * A note box drawn in the page — never window.prompt / confirm / alert. On
   * iPhone a native dialog stalls the 8th Wall camera feed until the phone is
   * locked and unlocked: in the Sept 29 and Sept 30 logs every "camera froze"
   * came right after a Mark / ✗ note prompt, and "turning the phone to sleep
   * and back fixed the camera". cb(text) on Save, cb(null) on Cancel.
   */
  function askNote(title, cb) {
    var old = document.getElementById('swlog-note');
    if (old) old.remove();
    var font = 'font:600 14px -apple-system,BlinkMacSystemFont,sans-serif;';
    var box = document.createElement('div');
    box.id = 'swlog-note';
    box.style.cssText = 'position:fixed;left:12px;right:12px;top:70px;z-index:2147483600;padding:12px;' +
      'border-radius:14px;background:rgba(10,14,18,.97);color:#fff;border:1px solid rgba(255,196,0,.6);' + font;
    var btn = 'padding:9px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.3);color:#fff;' + font;
    box.innerHTML = '<div style="margin-bottom:8px"></div>' +
      '<textarea rows="3" style="width:100%;box-sizing:border-box;border-radius:8px;border:1px solid #555;' +
      'background:#0b1116;color:#fff;padding:8px;font:400 15px -apple-system,sans-serif"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">' +
      '<button type="button" data-n="cancel" style="' + btn + 'background:transparent">Cancel</button>' +
      '<button type="button" data-n="save" style="' + btn + 'background:rgba(255,196,0,.35)">Save note</button></div>';
    box.firstChild.textContent = title;
    var ta = box.querySelector('textarea');
    function done(value) {
      box.remove();
      try { cb(value); } catch (e) { /* ignore */ }
    }
    box.addEventListener('click', function (e) {
      e.stopPropagation();
      var n = e.target && e.target.getAttribute && e.target.getAttribute('data-n');
      if (n === 'save') done(ta.value.trim());
      else if (n === 'cancel') done(null);
    });
    document.body.appendChild(box);
    try { ta.focus(); } catch (e) { /* ignore */ }
  }

  /** Log a ★ mark. With a note string it's immediate; without, it asks in-page. */
  function mark(note) {
    if (typeof note === 'string') {
      add('mark', '★ ' + (note || 'marked'));
      save();
      return;
    }
    var at = new Date().toTimeString().slice(0, 8);
    askNote('What just happened? (goes in the log)', function (text) {
      if (text === null) return;
      add('mark', '★ ' + (text || 'marked') + ' (marked at ' + at + ')');
      save();
    });
  }

  // ---- live stream to the laptop ---------------------------------------------------------

  // Batches are numbered and the laptop writes them in number order: a
  // sendBeacon from a page going to the background can land after the next
  // regular batch. A failed batch is re-sent with the same number.
  var streamBusy = false;
  var streamSeq = 0;
  var streamRetry = null;

  function deviceName() {
    var m = navigator.userAgent.match(/\(([^)]+)\)/);
    return m ? m[1].slice(0, 100) : 'unknown device';
  }

  function streamBody(batch) {
    return JSON.stringify({ id: cur.id, seq: batch.seq, page: cur.page, device: deviceName(), lines: batch.lines });
  }

  function stopStreaming(reason) {
    streaming = false;
    outbox = [];
    streamRetry = null;
    add('page', 'live log to the laptop off — ' + reason);
  }

  // final: the page is going away — sendBeacon survives the unload, fetch may not.
  function flushStream(final) {
    if (!streaming || (!outbox.length && !streamRetry)) return;
    if (final && navigator.sendBeacon) {
      try {
        if (streamRetry && navigator.sendBeacon(STREAM_ENDPOINT,
          new Blob([streamBody(streamRetry)], { type: 'application/json' }))) streamRetry = null;
      } catch (e) { /* the retry tick sends it */ }
      while (outbox.length) {
        var chunk = { seq: streamSeq, lines: outbox.slice(0, 200) };
        var sent = false;
        try {
          sent = navigator.sendBeacon(STREAM_ENDPOINT, new Blob([streamBody(chunk)], { type: 'application/json' }));
        } catch (e) { /* fall through */ }
        if (!sent) break;
        streamSeq++;
        outbox.splice(0, chunk.lines.length);
      }
      return;
    }
    if (streamBusy) return;
    streamBusy = true;
    var batch = streamRetry || { seq: streamSeq++, lines: outbox.splice(0, 500) };
    streamRetry = null;
    var body = streamBody(batch);
    fetch(STREAM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: body.length < 60000
    }).then(function (r) {
      streamBusy = false;
      // No receiver: a tunnel to something other than this repo's dev server.
      if (r.status === 404 || r.status === 405 || r.status === 501) {
        stopStreaming('this server has no log receiver (HTTP ' + r.status + ')');
        return;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (outbox.length) flushStream(false);
    }).catch(function () {
      // Offline or the tunnel dropped: same batch, same number, next tick.
      streamBusy = false;
      streamRetry = batch;
    });
  }

  if (streaming) setInterval(function () { flushStream(false); }, STREAM_MS);

  window.SharksWayLog = {
    enabled: true,
    streaming: function () { return streaming; },
    add: add,
    mark: mark,
    askNote: askNote,
    save: function () { dirty = true; save(); },
    clear: clear,
    download: download,
    share: share,
    text: text,
    entries: function () { return cur.entries.slice(); },
    sessions: function () { return prev.length + 1; }
  };

  // ---- automatic capture -------------------------------------------------------------

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level];
    if (typeof orig !== 'function') return;
    console[level] = function () {
      try { add(level === 'warn' || level === 'error' ? level : 'log', formatArgs(arguments)); } catch (e) { /* never break logging */ }
      return orig.apply(console, arguments);
    };
  });

  // Capture phase: failed <script>/<link>/<img> loads don't bubble.
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) {
      add('error', 'failed to load <' + t.tagName.toLowerCase() + '> ' + shortUrl(t.src || t.href || ''));
      return;
    }
    add('error', (e.message || 'error') +
      (e.filename ? ' @ ' + shortUrl(e.filename) + ':' + e.lineno + ':' + e.colno : '') +
      (e.error && e.error.stack ? ' | ' + stackHead(e.error.stack) : ''));
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    add('error', 'unhandled promise rejection: ' + describe(e.reason));
  });

  // Every file fetched: the "slow at the location" and "404" questions.
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (r) {
        if (/^(data|blob):/.test(r.name) || r.name.indexOf(STREAM_ENDPOINT) !== -1) return;
        var status = r.responseStatus;
        var interesting = /\.(glb|bin|wasm|mind|json|js|css|mp4|png|jpe?g)(\?|$)/i.test(r.name) ||
          r.initiatorType === 'script' || status >= 400;
        if (!interesting) return;
        var kb = Math.round((r.transferSize || r.encodedBodySize || r.decodedBodySize || 0) / 1024);
        var cached = r.transferSize === 0 && r.encodedBodySize > 0;
        add('net', shortUrl(r.name) + (status ? ' ' + status : '') + ' ' + kb + 'KB ' +
          Math.round(r.duration) + 'ms' + (cached ? ' (cache)' : ''));
      });
    }).observe({ type: 'resource', buffered: true });
  } catch (e) { /* no PerformanceObserver */ }

  // 8th Wall, camera and app events (A-Frame events bubble up to window).
  var EVENTS = {
    xrloaded: 'xr', realityready: 'xr', realityerror: 'error', camerastatuschange: 'xr',
    // Tracking status (absolute scale calibrates first: LIMITED / INITIALIZING).
    // The engine names it reality.trackingstatus; the A-Frame spelling varies.
    realitytrackingstatus: 'xr', trackingstatus: 'xr',
    sharkFound: 'scan', sharksWayModeChanged: 'mode', sharksWayDropsChanged: 'loc'
  };
  Object.keys(EVENTS).forEach(function (name) {
    window.addEventListener(name, function (e) {
      add(EVENTS[name], name + (e && e.detail != null ? ' ' + describe(e.detail) : ''));
    });
  });

  function describeEntity(el) {
    if (!el || !el.getAttribute) return '?';
    var key = el.getAttribute('data-placement-key') || el.id ||
      (el.parentNode && el.parentNode.getAttribute && el.parentNode.getAttribute('data-drop-root')) || '';
    var model = el.getAttribute('gltf-model') || (el.getAttribute('shared-gltf') || {}).src || '';
    if (typeof model === 'object') model = model.src || '';
    model = String(model);
    // "#asset-id" (shared-gltf keeps the selector) — name the asset, not the page.
    if (model.charAt(0) === '#') {
      var asset = document.getElementById(model.slice(1));
      model = asset && asset.getAttribute('src') ? shortUrl(asset.getAttribute('src')) : model;
    } else {
      model = shortUrl(model);
    }
    return (key ? key + ' ' : '') + model;
  }
  document.addEventListener('model-loaded', function (e) { add('model', 'loaded ' + describeEntity(e.target)); });
  document.addEventListener('model-error', function (e) {
    add('error', 'model-error ' + describeEntity(e.target) + (e.detail && e.detail.src ? ' src=' + shortUrl(e.detail.src) : ''));
  });

  document.addEventListener('visibilitychange', function () {
    add('page', 'visibility ' + document.visibilityState);
    if (document.visibilityState === 'hidden') { dirty = true; save(); flushStream(true); }
  });
  window.addEventListener('pagehide', function (e) {
    add('page', 'pagehide' + (e.persisted ? ' (to back/forward cache)' : ''));
    cur.ended = true;
    dirty = true;
    save();
    flushStream(true);
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { cur.ended = false; add('page', 'pageshow from back/forward cache'); }
  });
  window.addEventListener('online', function () { add('page', 'online'); });
  window.addEventListener('offline', function () { add('page', 'OFFLINE'); });
  window.addEventListener('orientationchange', function () {
    add('page', 'orientation ' + (screen.orientation ? screen.orientation.type : window.orientation));
  });

  // ---- device header -------------------------------------------------------------------

  (function device() {
    var n = navigator;
    var c = n.connection || {};
    add('device', 'page ' + window.location.href);
    add('device', 'ua ' + n.userAgent);
    add('device', 'screen ' + screen.width + 'x' + screen.height + ' @' + window.devicePixelRatio +
      'x, viewport ' + window.innerWidth + 'x' + window.innerHeight +
      (n.deviceMemory ? ', memory ' + n.deviceMemory + 'GB' : '') +
      (n.hardwareConcurrency ? ', cores ' + n.hardwareConcurrency : '') +
      (c.effectiveType ? ', network ' + c.effectiveType + (c.downlink ? ' ' + c.downlink + 'Mbps' : '') : '') +
      (c.saveData ? ', data saver ON' : ''));
    try {
      var gl = document.createElement('canvas').getContext('webgl');
      if (gl) {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        add('device', 'gpu ' + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) +
          ', max texture ' + gl.getParameter(gl.MAX_TEXTURE_SIZE));
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } else {
        add('error', 'no WebGL');
      }
    } catch (e) { add('warn', 'WebGL probe failed: ' + describe(e)); }
    if (prev.length) {
      var last = prev[prev.length - 1];
      if (!last.ended) {
        add('warn', 'previous page load (' + last.page + ', ' + new Date(last.start).toLocaleTimeString() +
          ') ended without unloading — the tab was killed or crashed');
      }
    }
  })();

  document.addEventListener('DOMContentLoaded', function () {
    var bundle = document.querySelector('script[src*="assets/sharkAr8thwall-"], script[type="module"][src*="assets/"]');
    add('device', 'build ' + (bundle ? shortUrl(bundle.getAttribute('src')) : 'raw source (unbuilt)'));
  });

  // ---- stats every 5 s -----------------------------------------------------------------

  var frames = 0;
  (function countFrames() {
    frames++;
    window.requestAnimationFrame(countFrames);
  })();

  var lastStatsAt = performance.now();
  setInterval(function () {
    var t = performance.now();
    var fps = Math.round(frames * 1000 / (t - lastStatsAt));
    frames = 0;
    lastStatsAt = t;
    if (document.visibilityState === 'hidden') return;
    var s = ['fps=' + fps];
    if (performance.memory) {
      s.push('heap=' + Math.round(performance.memory.usedJSHeapSize / 1048576) + '/' +
        Math.round(performance.memory.jsHeapSizeLimit / 1048576) + 'MB');
    }
    try {
      var scene = document.querySelector('a-scene');
      var r = scene && scene.renderer;
      if (r && r.info) {
        s.push('gpu tex=' + r.info.memory.textures + ' geo=' + r.info.memory.geometries +
          ' calls=' + r.info.render.calls + ' tris=' + Math.round(r.info.render.triangles / 1000) + 'k');
      }
      if (window.XR8 && typeof window.XR8.isPaused === 'function') {
        s.push('xr=' + (window.XR8.isPaused() ? 'paused' : 'running'));
      }
      if (window.SharksWayMode && window.SharksWayMode.get) {
        s.push('mode=' + window.SharksWayMode.get() +
          (window.SharksWayMode.photoSubmode ? '/' + window.SharksWayMode.photoSubmode() : ''));
      }
      if (window.SharkVision) {
        var v = window.SharkVision.last();
        s.push('scan="' + window.SharkVision.status() + '"' +
          (v && v.name ? ' best=' + v.name + ' ' + v.score + ' conf=' + v.confidence +
            (v.centred != null ? ' distinct=' + v.centred : '') +
            ' (need ' + window.SharkVision.threshold() + ')' : ''));
      }
      if (window.SharksWayDrops) s.push('drops=' + window.SharksWayDrops.available().join(','));
      if (window.MathUtils && window.MathUtils.groundState) {
        var g = window.MathUtils.groundState();
        var cam = document.getElementById('camera');
        var cy = cam && cam.object3D && window.THREE ? cam.object3D.getWorldPosition(new window.THREE.Vector3()).y : NaN;
        s.push('cam=' + cy.toFixed(2) + ' floor=' + g.floorY.toFixed(2) + ' k=' + (g.k ? g.k.toFixed(2) : '?'));
      }
    } catch (e) { s.push('stats error ' + describe(e)); }
    add('stats', s.join(' '));
  }, STATS_MS);

  // ---- on-screen button ------------------------------------------------------------------
  // The debug panel (?debug=1 on the AR page) has a LOG tab. Everywhere else —
  // ?log=1, other pages, or a page that broke before the panel could load —
  // this small button is the way to get the file off the phone.

  var panel = null;

  function renderPanel() {
    if (!panel || !panel.open) return;
    var info = panel.el.querySelector('[data-log-info]');
    if (info) {
      info.textContent = cur.entries.length + ' lines this page · ' + (prev.length + 1) +
        ' page load(s) stored' + (persistOk ? '' : ' · storage full, memory only') +
        (streaming ? ' · live copy going to the laptop' : '');
    }
  }

  function buildButton() {
    if (document.getElementById('dbg-root') || document.getElementById('swlog-btn')) return;
    var css = 'position:fixed;z-index:2147483000;font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;';
    var btn = document.createElement('button');
    btn.id = 'swlog-btn';
    btn.type = 'button';
    btn.textContent = 'LOG';
    btn.setAttribute('aria-label', 'Field log');
    // Middle of the left edge: the bottom belongs to the drop / photo bars and
    // the instruction banner (two lines on a phone — it covered this button),
    // the top to the status pill, Goalie scoreboard and the ?test=1 card.
    btn.style.cssText = css + 'left:12px;top:50%;transform:translateY(-50%);padding:8px 12px;border-radius:999px;' +
      'border:1px solid rgba(255,196,0,.7);background:rgba(40,30,0,.8);color:#ffd54a;';
    var sheet = document.createElement('div');
    sheet.id = 'swlog-sheet';
    sheet.style.cssText = css + 'left:12px;right:12px;top:calc(50% + 28px);display:none;padding:12px;' +
      'border-radius:14px;background:rgba(10,14,18,.95);color:#fff;border:1px solid rgba(255,196,0,.5);';
    sheet.innerHTML =
      '<div style="margin-bottom:6px">Field log — for the dev team</div>' +
      '<div data-log-info style="opacity:.7;font-weight:400;margin-bottom:10px"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      ['mark:Mark a moment', 'share:Share', 'download:Download', 'clear:Clear', 'close:Close'].map(function (b) {
        var p = b.split(':');
        return '<button type="button" data-act="' + p[0] + '" style="' + css.replace('position:fixed;z-index:2147483000;', '') +
          'padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff">' +
          p[1] + '</button>';
      }).join('') + '</div>';
    document.body.appendChild(btn);
    document.body.appendChild(sheet);
    panel = { el: sheet, open: false };
    btn.addEventListener('click', function () {
      panel.open = sheet.style.display === 'none';
      sheet.style.display = panel.open ? 'block' : 'none';
      renderPanel();
    });
    sheet.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'mark') mark();
      else if (act === 'share') share();
      else if (act === 'download') download();
      else if (act === 'clear') {
        // Two taps, no window.confirm (native dialogs freeze the camera on iPhone).
        if (e.target.getAttribute('data-armed') === '1') clear();
        else {
          e.target.setAttribute('data-armed', '1');
          e.target.textContent = 'Tap again to delete';
          return;
        }
      }
      if (act === 'close' || act === 'share' || act === 'download') {
        panel.open = false;
        sheet.style.display = 'none';
      }
      renderPanel();
    });
  }

  function syncButton() {
    var hasPanel = !!document.getElementById('dbg-root');
    var btn = document.getElementById('swlog-btn');
    if (hasPanel && btn) {
      btn.remove();
      var sheet = document.getElementById('swlog-sheet');
      if (sheet) sheet.remove();
      panel = null;
    } else if (!hasPanel && !btn) {
      buildButton();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Give the debug panel a moment to appear before adding our own button.
    setTimeout(syncButton, 4000);
    setInterval(syncButton, 3000);
  });

  add('page', 'logging on (?log=0 turns it off)' +
    (streaming ? ' · live copy to the laptop (npm run phone; ?logStream=0 stops it)' : ''));
})();
