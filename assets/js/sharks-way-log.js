/*
 * Sharks Way field log — a downloadable record of what happened on a phone.
 *
 * Off unless the page URL has ?debug=1 or ?log=1. The choice sticks for the
 * rest of the tab's session (so moving between pages with the menu keeps
 * logging); ?log=0 turns it off.
 *
 * When on, it records from the first script on the page: console output,
 * errors and failed downloads, every file fetched (size and time), 8th Wall /
 * camera events, model loads, page lifecycle, and a stats line every 5 s
 * (fps, JS heap, GPU textures/geometries, scan status and score, mode). App
 * code adds its own lines with SharksWayLog.add(category, message).
 *
 * Nothing is sent anywhere. Lines are kept in localStorage so a crash or
 * reload doesn't lose them — the next load notes a session that ended without
 * unloading, which on an iPhone usually means Safari killed the tab (memory) —
 * and they only leave the phone when someone taps Share or Download. The log
 * includes GPS positions.
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

  var flag = null;
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('log') === '0') flag = '0';
    else if (params.get('log') === '1' || params.get('debug') === '1' ||
             params.get('debugPlacement') === '1' || params.get('test') === '1') flag = '1';
  } catch (e) { /* old browser — stay off */ }

  var enabled = false;
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

  function now() { return Math.round(performance.now() - startPerf); }

  function add(category, message) {
    var msg = typeof message === 'string' ? message : describe(message);
    if (msg.length > MAX_MSG) msg = msg.slice(0, MAX_MSG) + '…';
    cur.entries.push([now(), String(category || 'log'), msg]);
    if (cur.entries.length > MAX_ENTRIES) cur.entries.splice(0, cur.entries.length - MAX_ENTRIES);
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
    for (var i = 0; i < s.entries.length; i++) {
      var e = s.entries[i];
      lines.push(clock(s.start + e[0]) + ' +' + (e[0] / 1000).toFixed(1) + 's [' + e[1] + '] ' + e[2]);
    }
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

  function mark() {
    var note = '';
    try { note = window.prompt('What just happened? (optional — goes in the log)', '') || ''; } catch (e) { /* ignore */ }
    add('mark', '★ ' + (note || 'marked'));
    save();
  }

  window.SharksWayLog = {
    enabled: true,
    add: add,
    mark: mark,
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
        if (/^(data|blob):/.test(r.name)) return;
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
    if (document.visibilityState === 'hidden') { dirty = true; save(); }
  });
  window.addEventListener('pagehide', function (e) {
    add('page', 'pagehide' + (e.persisted ? ' (to back/forward cache)' : ''));
    cur.ended = true;
    dirty = true;
    save();
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
            ' (need ' + window.SharkVision.threshold() + ')' : ''));
      }
      if (window.SharksWayDrops) s.push('drops=' + window.SharksWayDrops.available().join(','));
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
        ' page load(s) stored' + (persistOk ? '' : ' · storage full, memory only');
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
    // Above the drop / photo bars (they reach ~115 px up) and the tap hint.
    btn.style.cssText = css + 'left:12px;bottom:150px;padding:8px 12px;border-radius:999px;' +
      'border:1px solid rgba(255,196,0,.7);background:rgba(40,30,0,.8);color:#ffd54a;';
    var sheet = document.createElement('div');
    sheet.id = 'swlog-sheet';
    sheet.style.cssText = css + 'left:12px;right:12px;bottom:196px;display:none;padding:12px;' +
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
      else if (act === 'clear') { if (window.confirm('Delete the stored log on this phone?')) clear(); }
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

  add('page', 'logging on (?log=0 turns it off)');
})();
