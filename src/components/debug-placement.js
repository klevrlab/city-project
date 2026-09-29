/**
 * Debug placement mode — "did it even spawn, and can I move it?"
 *
 * Enable with `?debug=1` (or `?debugPlacement=1`) on shark-ar-8thwall.html.
 *
 * Four panels:
 *   STATUS  — XR/GPS/FPS, geofence distances, and every <a-asset-item> with its
 *             real load state + HTTP status (a 404 GLB is the usual "nothing
 *             appeared" cause).
 *   MODELS  — spawn any GLB in the repo in front of the camera, one at a time
 *             or all in a labelled row. Reports bounding-box size on load, so a
 *             model that "didn't spawn" but is actually 0.01 m or 400 m is obvious.
 *   OBJECTS — every placed entity: placement key, model, loaded/failed, size,
 *             distance, visibility. Tap to select; also selectable by tapping
 *             the model itself while PICK is armed.
 *   MOVE    — nudge/rotate/scale the selection in world space (camera-relative
 *             axes), drag it along the ground, then SAVE. Saves go to
 *             PlacementOverrides under the entity's data-placement-key and are
 *             re-applied on every later spawn. EXPORT writes the JSON to commit
 *             as data/placement-overrides.json.
 */

const DROP_IDS = ['shark', 'athena', 'tower', 'river', 'party'];
const LOCATION_IDS = [['littleitaly', 'Little Italy'], ['river', 'Guadalupe River'], ['sap', 'SAP Center']];

const GLB_MANIFEST = [
  './assets/3D-models/Athena_Statue-point-left.glb',
  './assets/3D-models/Athena_Statue-point-right.glb',
  './assets/3D-models/Augustus_of_Prima_Porta.glb',
  './assets/3D-models/Leaning_Tower_of_Pisa.glb',
  './assets/3D-models/SEAN_ANIMATED_WiTH_MARIA_SHARK.glb',
  './assets/3D-models/jimmy-shark-swimmer.glb',
  './assets/3D-models/maria-shark-jump-jimmy-txtr.glb',
  './assets/3D-models/MARIA_SHARK_ANIMATED.glb',
  './assets/3D-models/MARIA_SHARK.glb',
  './assets/3D-models/STELLA_CAI_SHARK_SJSU_TEST1.glb',
  './assets/3D-models/StellaFlipped.glb',
  './assets/3D-models/SHAUN_SHARK_ANIMATED.glb',
  './assets/3D-models/SHAUN_SHARK.glb',
  './assets/3D-models/sharkie_final_pose.glb',
  './assets/3D-models/sammy_final_pose.glb',
  './assets/3D-models/sharkie_pose.glb',
  './assets/3D-models/sharkie_pose_02.glb',
  './assets/3D-models/sharkieflipped.glb',
  './assets/3D-models/Pose_sharky_01.glb',
  './assets/3D-models/Pose_sharky_01._no_glass.glb',
  './assets/3D-models/Pose_sharky_02.glb',
  './assets/3D-models/plushie_shark.glb',
  './assets/3D-models/basketball_animation.glb',
  './assets/3D-models/mock_up_eoe_map.glb'
];

const STEPS = [0.05, 0.25, 1, 5];
const YAW_STEPS = [5, 15, 45, 90];

AFRAME.registerComponent('debug-placement', {
  schema: {
    enabled: { type: 'boolean', default: false }
  },

  init: function () {
    const params = new URLSearchParams(window.location.search);
    this.active = this.data.enabled ||
      params.get('debug') === '1' ||
      params.get('debugPlacement') === '1';
    if (!this.active) return;

    this.selected = null;
    this.boxHelper = null;
    this.pickArmed = false;
    this.dragMode = false;
    this.step = 0.25;
    this.yawStep = 15;
    this.tab = 'status';
    this.frames = 0;
    this.fps = 0;
    this.lastFpsAt = performance.now();
    this.assetRows = new Map();
    this.spawned = [];
    // Default to normalized: a raw Athena spawn is 206 m and fills the sky,
    // which reads as "the tool is broken" rather than "this GLB has no units".
    this.normalizeSpawns = true;
    this.log = [];

    // Collectors first — the first render() reads their state.
    this.hookConsole();
    this.watchAssets();
    this.watchGps();
    this.buildUi();

    // Programmatic access from the browser console / remote inspector.
    window.SharksWayDebug = {
      spawn: (url, opts) => this.spawnModel(url, opts),
      spawnAll: () => this.spawnAllModels(),
      select: (keyOrEl) => this.selectByKey(keyOrEl),
      list: () => this.collectObjects().map((o) => o.summary),
      save: () => this.saveSelected(),
      exportJson: () => window.PlacementOverrides.toJSON(),
      clearSpawned: () => this.clearSpawned(),
      panel: () => this.togglePanel(true)
    };

    console.log('[debug-placement] active — window.SharksWayDebug available');
  },

  // ---- UI shell -------------------------------------------------------------

  buildUi: function () {
    const wrap = document.createElement('div');
    wrap.id = 'dbg-root';
    wrap.innerHTML = `
      <button id="dbg-fab" title="Debug placement">🛠</button>
      <div id="dbg-panel" class="dbg-hidden">
        <div id="dbg-head">
          <span id="dbg-title">PLACEMENT DEBUG</span>
          <span id="dbg-fps">–</span>
          <button id="dbg-close">✕</button>
        </div>
        <div id="dbg-tabs">
          <button data-tab="status" class="dbg-tab dbg-on">STATUS</button>
          <button data-tab="models" class="dbg-tab">MODELS</button>
          <button data-tab="objects" class="dbg-tab">OBJECTS</button>
          <button data-tab="move" class="dbg-tab">MOVE</button>
        </div>
        <div id="dbg-body">
          <section data-pane="status" class="dbg-pane"></section>
          <section data-pane="models" class="dbg-pane dbg-hidden"></section>
          <section data-pane="objects" class="dbg-pane dbg-hidden"></section>
          <section data-pane="move" class="dbg-pane dbg-hidden"></section>
        </div>
        <div id="dbg-foot">
          <button id="dbg-save">SAVE</button>
          <button id="dbg-revert">REVERT</button>
          <button id="dbg-export">EXPORT</button>
          <button id="dbg-copy">COPY</button>
          <button id="dbg-wipe">WIPE</button>
        </div>
        <div id="dbg-toast"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    this.panel = wrap.querySelector('#dbg-panel');
    this.toastEl = wrap.querySelector('#dbg-toast');
    this.fpsEl = wrap.querySelector('#dbg-fps');

    wrap.querySelector('#dbg-fab').addEventListener('click', () => this.togglePanel());
    wrap.querySelector('#dbg-close').addEventListener('click', () => this.togglePanel(false));

    wrap.querySelectorAll('.dbg-tab').forEach((btn) => {
      btn.addEventListener('click', () => this.showTab(btn.getAttribute('data-tab')));
    });

    wrap.querySelector('#dbg-save').addEventListener('click', () => this.saveSelected());
    wrap.querySelector('#dbg-revert').addEventListener('click', () => this.revertSelected());
    wrap.querySelector('#dbg-export').addEventListener('click', () => {
      window.PlacementOverrides.download();
      this.toast('Downloaded placement-overrides.json → move it to data/');
    });
    wrap.querySelector('#dbg-copy').addEventListener('click', async () => {
      const ok = await window.PlacementOverrides.copyToClipboard();
      this.toast(ok ? 'JSON copied to clipboard' : 'Clipboard blocked — use EXPORT');
    });
    wrap.querySelector('#dbg-wipe').addEventListener('click', () => {
      if (!window.confirm('Clear all saved placement tweaks on this device?')) return;
      window.PlacementOverrides.clearAll();
      this.toast('Local overrides cleared (reload to see defaults)');
      this.render();
    });

    this.renderTimer = setInterval(() => {
      if (!this.panel.classList.contains('dbg-hidden')) this.render();
    }, 700);

    this.installSceneInput();
    this.render();
  },

  togglePanel: function (force) {
    const show = typeof force === 'boolean' ? force : this.panel.classList.contains('dbg-hidden');
    this.panel.classList.toggle('dbg-hidden', !show);
    if (show) this.render();
  },

  showTab: function (tab) {
    this.tab = tab;
    document.querySelectorAll('.dbg-tab').forEach((b) => {
      b.classList.toggle('dbg-on', b.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('.dbg-pane').forEach((p) => {
      p.classList.toggle('dbg-hidden', p.getAttribute('data-pane') !== tab);
    });
    this.render();
  },

  toast: function (msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('dbg-show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('dbg-show'), 2600);
  },

  // ---- diagnostics collection ----------------------------------------------

  hookConsole: function () {
    const push = (level, args) => {
      this.log.push({
        level,
        t: new Date().toLocaleTimeString(),
        msg: Array.from(args).map(stringify).join(' ').slice(0, 300)
      });
      if (this.log.length > 60) this.log.shift();
    };
    const origWarn = console.warn.bind(console);
    const origErr = console.error.bind(console);
    console.warn = (...a) => { push('warn', a); origWarn(...a); };
    console.error = (...a) => { push('error', a); origErr(...a); };
    window.addEventListener('error', (e) => push('error', [e.message]));
    window.addEventListener('unhandledrejection', (e) => push('error', [String(e.reason)]));
  },

  /** Track <a-asset-item> load state and HEAD each src for the real HTTP status. */
  watchAssets: function () {
    const items = Array.from(document.querySelectorAll('a-asset-item'));
    items.forEach((item) => {
      const id = item.getAttribute('id');
      const src = item.getAttribute('src');
      const row = { id, src, state: item.hasLoaded ? 'loaded' : 'pending', http: '…', bytes: null };
      this.assetRows.set(id, row);

      if (!item.hasLoaded) {
        item.addEventListener('loaded', () => { row.state = 'loaded'; });
        item.addEventListener('error', () => { row.state = 'ERROR'; });
      }

      fetch(src, { method: 'HEAD' })
        .then((r) => {
          row.http = String(r.status);
          const len = r.headers.get('content-length');
          row.bytes = len ? Number(len) : null;
          if (!r.ok) row.state = 'ERROR';
        })
        .catch(() => { row.http = 'net-fail'; row.state = 'ERROR'; });
    });
  },

  watchGps: function () {
    this.gps = { state: 'idle', lat: null, lng: null, acc: null, err: null };
    if (!('geolocation' in navigator)) {
      this.gps.state = 'unsupported';
      return;
    }
    this.gps.state = 'acquiring';
    this.gpsWatch = navigator.geolocation.watchPosition(
      (p) => {
        this.gps.state = 'ok';
        this.gps.lat = p.coords.latitude;
        this.gps.lng = p.coords.longitude;
        this.gps.acc = p.coords.accuracy;
      },
      (e) => { this.gps.state = 'blocked'; this.gps.err = e.message; },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
  },

  /** Every entity worth inspecting: placement-keyed content + anything with a model. */
  collectObjects: function () {
    const scene = this.el.sceneEl || this.el;
    const els = new Set();
    scene.querySelectorAll('[data-placement-key]').forEach((e) => els.add(e));
    scene.querySelectorAll('[gltf-model]').forEach((e) => els.add(e));
    scene.querySelectorAll('[data-debug-spawn]').forEach((e) => els.add(e));

    const camEl = document.getElementById('camera');
    const camPos = camEl && camEl.object3D ? camEl.object3D.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();

    return Array.from(els).map((el) => {
      const key = el.getAttribute('data-placement-key') || el.getAttribute('id') || describeModel(el);
      const world = el.object3D ? el.object3D.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
      const dist = world.distanceTo(camPos);
      const mesh = el.getObject3D('mesh');
      const state = el.dataset.dbgState || (mesh ? 'loaded' : 'pending');
      const dims = el.dataset.dbgDims || (mesh ? measure(el) : '—');
      const visible = el.object3D ? el.object3D.visible && isAncestryVisible(el) : false;
      const height = el.object3D ? boxOf(el).y : 0;
      return {
        el,
        key,
        model: describeModel(el),
        state,
        dims,
        dist,
        visible,
        height,
        // Anything over a storey is either unnormalized or a bad override.
        oversized: height > 4 && !String(key).startsWith('leaning-tower'),
        normalized: !!el.components && !!el.components['model-normalize'],
        world,
        summary: `${key} · ${state} · ${dims} · ${dist.toFixed(1)}m · ${visible ? 'visible' : 'HIDDEN'}`
      };
    }).sort((a, b) => a.dist - b.dist);
  },

  // ---- rendering ------------------------------------------------------------

  render: function () {
    if (this.tab === 'status') this.renderStatus();
    else if (this.tab === 'models') this.renderModels();
    else if (this.tab === 'objects') this.renderObjects();
    else this.renderMove();
  },

  pane: function (name) {
    return document.querySelector(`.dbg-pane[data-pane="${name}"]`);
  },

  renderStatus: function () {
    const camEl = document.getElementById('camera');
    const cam = camEl && camEl.object3D ? camEl.object3D.getWorldPosition(new THREE.Vector3()) : null;
    const xr = window.XR8 ? (window.XR8.isPaused && window.XR8.isPaused() ? 'paused' : 'running') : 'not loaded';
    const objs = this.collectObjects();
    const failed = objs.filter((o) => o.state === 'ERROR').length;
    const huge = objs.filter((o) => o.oversized);
    const mode = window.SharksWayMode && window.SharksWayMode.get ? window.SharksWayMode.get() : 'n/a';

    // Self-check: the usual reasons a statue is still 200 m tall.
    const checks = [];
    const hasNormalize = !!(window.AFRAME && AFRAME.components['model-normalize']);
    checks.push(check('model-normalize registered', hasNormalize,
      hasNormalize ? 'ok' : 'MISSING — script not loaded; hard-reload to clear cache'));
    const overridesWithScale = (window.PlacementOverrides ? window.PlacementOverrides.dirtyKeys() : [])
      .filter((k) => {
        const r = window.PlacementOverrides.get(k);
        return r && r.scale && Math.abs(r.scale.x - 1) > 0.01;
      });
    checks.push(check('saved scale overrides', overridesWithScale.length === 0,
      overridesWithScale.length ? `${overridesWithScale.length} key(s) rescale on top: ${overridesWithScale.join(', ')}` : 'none'));
    checks.push(check('oversized objects', huge.length === 0,
      huge.length ? huge.map((o) => `${o.key} ${o.height.toFixed(0)}m`).join(', ') : 'none over 4 m'));

    function check(label, ok, detail) {
      return `<div class="dbg-row"><span class="${ok ? 'dbg-good' : 'dbg-bad'}">${ok ? '✓' : '✗'}</span>
        <span class="dbg-name">${label}</span><span>${detail}</span></div>`;
    }

    const assets = Array.from(this.assetRows.values()).map((r) => `
      <tr class="${r.state === 'ERROR' ? 'dbg-bad' : r.state === 'loaded' ? 'dbg-good' : ''}">
        <td>${r.id}</td><td>${r.state}</td><td>${r.http}</td>
        <td>${r.bytes ? (r.bytes / 1048576).toFixed(1) + 'MB' : '—'}</td>
      </tr>`).join('');

    const geo = this.geofenceLines();

    const logs = this.log.slice(-8).reverse().map((l) =>
      `<div class="dbg-log dbg-${l.level}">${l.t} ${escapeHtml(l.msg)}</div>`).join('') ||
      '<div class="dbg-dim">no warnings or errors</div>';

    this.pane('status').innerHTML = `
      <div class="dbg-grid">
        <div><b>XR8</b><span>${xr}</span></div>
        <div><b>Mode</b><span>${mode}</span></div>
        <div><b>Camera</b><span>${cam ? fmtVec(cam) : 'none'}</span></div>
        <div><b>Objects</b><span>${objs.length} (${failed} failed)</span></div>
        <div><b>GPS</b><span>${this.gps.state}${this.gps.acc ? ' ±' + Math.round(this.gps.acc) + 'm' : ''}</span></div>
        <div><b>Coords</b><span>${this.gps.lat != null ? this.gps.lat.toFixed(6) + ', ' + this.gps.lng.toFixed(6) : '—'}</span></div>
      </div>
      <h4>Shark recognition</h4>
      <div class="dbg-list">${this.visionLines()}</div>
      <h4>Sizing self-check</h4>
      <div class="dbg-list">${checks.join('')}</div>
      <h4>Locations &amp; drops</h4>
      <div class="dbg-list">${geo}</div>
      <h4>Assets (&lt;a-asset-item&gt;)</h4>
      <table class="dbg-table"><tr><th>id</th><th>state</th><th>http</th><th>size</th></tr>${assets}</table>
      <h4>Recent warnings / errors</h4>
      ${logs}
    `;
  },

  /**
   * Heading state and the two controls that matter on site: grant the compass
   * (iOS needs the tap) and calibrate it against the known corridor bearing.
   */
  /**
   * Live read-out of the painted-shark matcher. The score is the useful number
   * on site: point the camera at a painting and see how close it gets to the
   * threshold before deciding whether the threshold is wrong.
   */
  visionLines: function () {
    const sd = this.el.sceneEl.components['shark-detector'];
    if (!sd) return '<div class="dbg-dim">shark-detector not attached</div>';
    if (!sd.vision) return '<div class="dbg-dim">no vision state</div>';
    const v = sd.vision;
    const thr = sd.data.visionThreshold;
    const score = v.lastScore || 0;
    const close = score >= thr;
    return `
      <div class="dbg-row"><span class="dbg-name">Status</span>
        <span class="${v.enabled ? 'dbg-good' : 'dbg-bad'}">${v.status}</span></div>
      <div class="dbg-row"><span class="dbg-name">Best match</span>
        <span>${v.lastName || '—'}</span></div>
      <div class="dbg-row"><span class="dbg-name">Score / threshold</span>
        <span class="${close ? 'dbg-good' : ''}">${score.toFixed(3)} / ${thr}</span></div>
      <div class="dbg-row"><span class="dbg-name">Confidence</span>
        <span>${(v.lastConfidence || 0).toFixed(2)} (need ${sd.data.visionConfidence})</span></div>
      <div class="dbg-row"><span class="dbg-name">Matches so far</span>
        <span>${v.matches}</span></div>
    `;
  },

  geofenceLines: function () {
    const lx = this.el.sceneEl && this.el.sceneEl.components['location-experiences'];
    if (!lx) return '<div class="dbg-dim">location-experiences not attached</div>';
    const rows = [];
    rows.push(row('Offered now', lx.available.join(', '), `selected: ${lx.selected}`));
    if (this.gps.lat == null) {
      rows.push('<div class="dbg-dim">waiting for GPS — drops below work without it</div>');
    } else {
      LOCATION_IDS.forEach(([id, label]) => {
        const loc = lx.locations.find((l) => l.id === id);
        if (!loc) return;
        const d = lx.distanceTo(loc, this.gps.lat, this.gps.lng);
        rows.push(row(label, `${Math.round(d)}m / ${lx.data.nearRadiusM}m`,
          d <= lx.data.nearRadiusM ? 'NEAR' : ''));
      });
    }
    rows.push(`<div class="dbg-actions">${DROP_IDS.map((id) =>
      `<button class="dbg-mini" data-drop-ahead="${id}">drop ${id}</button>`).join('')}
      <button class="dbg-mini" data-drop-ahead="clear">clear drops</button></div>`);
    rows.push(`<div class="dbg-dim">River water line: ${lx.riverWaterY} m
      (set with &amp;waterY=-3 in the URL, then write it into RIVER_WATER_Y_M)</div>`);
    setTimeout(() => {
      document.querySelectorAll('[data-drop-ahead]').forEach((b) => {
        b.onclick = () => {
          const id = b.getAttribute('data-drop-ahead');
          if (!window.SharksWayDrops) return;
          if (id === 'clear') window.SharksWayDrops.clear();
          else window.SharksWayDrops.dropAhead(id);
          this.toast(id === 'clear' ? 'cleared drops' : `dropped ${id} ahead`);
        };
      });
    }, 0);
    return rows.join('');

    function row(a, b, c) {
      return `<div class="dbg-row"><span>${a}</span><span>${b}</span><span>${c}</span></div>`;
    }
  },

  renderModels: function () {
    const items = GLB_MANIFEST.map((url) => {
      const name = url.split('/').pop();
      return `<div class="dbg-row">
        <span class="dbg-name">${name}</span>
        <button class="dbg-mini" data-spawn="${url}">spawn</button>
      </div>`;
    }).join('');

    this.pane('models').innerHTML = `
      <div class="dbg-actions">
        <button class="dbg-mini" id="dbg-spawn-all">spawn all in a row</button>
        <button class="dbg-mini" id="dbg-clear-spawned">clear spawned (${this.spawned.length})</button>
        <button class="dbg-mini ${this.normalizeSpawns ? 'dbg-on' : ''}" id="dbg-norm">size: ${this.normalizeSpawns ? 'normalized 2.5m' : 'RAW GLB'}</button>
      </div>
      <div class="dbg-dim">Spawns land 3 m ahead and report their measured size. Switch to RAW GLB
      to see a model's true authored size — Athena is 206 m that way, which is the whole reason
      model-normalize exists.</div>
      <div class="dbg-list">${items}</div>
    `;

    const pane = this.pane('models');
    pane.querySelectorAll('[data-spawn]').forEach((b) => {
      b.onclick = () => this.spawnModel(b.getAttribute('data-spawn'));
    });
    pane.querySelector('#dbg-spawn-all').onclick = () => this.spawnAllModels();
    pane.querySelector('#dbg-clear-spawned').onclick = () => this.clearSpawned();
    pane.querySelector('#dbg-norm').onclick = () => {
      this.normalizeSpawns = !this.normalizeSpawns;
      this.render();
    };
  },

  renderObjects: function () {
    const objs = this.collectObjects();
    if (!objs.length) {
      this.pane('objects').innerHTML = '<div class="dbg-dim">Nothing placed yet. Use the MODELS tab, or tap-drop something.</div>';
      return;
    }
    const rows = objs.map((o, i) => `
      <div class="dbg-row dbg-obj ${o.el === this.selected ? 'dbg-sel' : ''}" data-idx="${i}">
        <span class="dbg-name">${o.oversized ? '⚠ ' : ''}${o.key}</span>
        <span class="${o.state === 'ERROR' ? 'dbg-bad' : 'dbg-good'}">${o.state}</span>
        <span class="${o.oversized ? 'dbg-bad' : ''}">${o.dims}</span>
        <span>${o.dist.toFixed(1)}m</span>
        <span>${o.visible ? '👁' : '🚫'}</span>
      </div>`).join('');

    this.pane('objects').innerHTML = `
      <div class="dbg-actions">
        <button class="dbg-mini ${this.pickArmed ? 'dbg-on' : ''}" id="dbg-pick">tap-to-select: ${this.pickArmed ? 'ON' : 'off'}</button>
      </div>
      <div class="dbg-list">${rows}</div>
    `;
    const pane = this.pane('objects');
    pane.querySelectorAll('.dbg-obj').forEach((r) => {
      r.onclick = () => {
        this.select(objs[Number(r.getAttribute('data-idx'))].el);
        this.showTab('move');
      };
    });
    pane.querySelector('#dbg-pick').onclick = () => {
      this.pickArmed = !this.pickArmed;
      this.toast(this.pickArmed ? 'Tap a model in the camera view to select it' : 'Tap-to-select off');
      this.render();
    };
  },

  renderMove: function () {
    if (!this.selected) {
      this.pane('move').innerHTML = '<div class="dbg-dim">No selection. Pick one in OBJECTS, or arm tap-to-select there and tap a model.</div>';
      return;
    }
    const el = this.selected;
    const o = el.object3D;
    const key = el.getAttribute('data-placement-key');
    const dirty = key && window.PlacementOverrides.isDirty(key);

    this.pane('move').innerHTML = `
      <div class="dbg-selhead">
        <b>${key || '(no placement key — moves are not saveable)'}</b>
        <span>${describeModel(el)}</span>
      </div>
      <div class="dbg-readout">
        pos ${fmtVec(o.position)} · yaw ${(THREE.MathUtils.radToDeg(o.rotation.y)).toFixed(1)}° · scale ${o.scale.x.toFixed(3)}
        ${dirty ? '<span class="dbg-dirty">unsaved-on-device override active</span>' : ''}
      </div>
      <div class="dbg-actions">
        step: ${STEPS.map((s) => `<button class="dbg-mini ${s === this.step ? 'dbg-on' : ''}" data-step="${s}">${s}m</button>`).join('')}
      </div>
      <div class="dbg-pad">
        <button data-nudge="f">▲ fwd</button>
        <button data-nudge="u">▲ up</button>
        <button data-nudge="l">◀ left</button>
        <button data-nudge="r">right ▶</button>
        <button data-nudge="b">▼ back</button>
        <button data-nudge="d">▼ down</button>
      </div>
      <div class="dbg-actions">
        yaw: ${YAW_STEPS.map((s) => `<button class="dbg-mini ${s === this.yawStep ? 'dbg-on' : ''}" data-yaw="${s}">${s}°</button>`).join('')}
        <button class="dbg-mini" data-rot="-1">↺</button>
        <button class="dbg-mini" data-rot="1">↻</button>
      </div>
      <div class="dbg-actions">
        scale: <button class="dbg-mini" data-scale="0.8">−20%</button>
        <button class="dbg-mini" data-scale="0.95">−5%</button>
        <button class="dbg-mini" data-scale="1.05">+5%</button>
        <button class="dbg-mini" data-scale="1.25">+25%</button>
      </div>
      <div class="dbg-actions">
        mirror: <button class="dbg-mini" data-mirror="x">flip X</button>
        <button class="dbg-mini" data-mirror="z">flip Z</button>
        <span class="dbg-dim">${o.scale.x < 0 || o.scale.z < 0 ? 'mirrored' : 'not mirrored'}</span>
      </div>
      <div class="dbg-actions">
        <button class="dbg-mini ${this.dragMode ? 'dbg-on' : ''}" id="dbg-drag">drag on ground: ${this.dragMode ? 'ON' : 'off'}</button>
        <button class="dbg-mini" id="dbg-ground">drop to ground</button>
        <button class="dbg-mini" id="dbg-front">bring in front</button>
        <button class="dbg-mini" id="dbg-face">face camera</button>
        <button class="dbg-mini" id="dbg-vis">toggle visible</button>
      </div>
    `;

    const pane = this.pane('move');
    pane.querySelectorAll('[data-step]').forEach((b) => {
      b.onclick = () => { this.step = Number(b.getAttribute('data-step')); this.render(); };
    });
    pane.querySelectorAll('[data-yaw]').forEach((b) => {
      b.onclick = () => { this.yawStep = Number(b.getAttribute('data-yaw')); this.render(); };
    });
    pane.querySelectorAll('[data-nudge]').forEach((b) => {
      b.onclick = () => this.nudge(b.getAttribute('data-nudge'));
    });
    pane.querySelectorAll('[data-rot]').forEach((b) => {
      b.onclick = () => this.rotate(Number(b.getAttribute('data-rot')));
    });
    pane.querySelectorAll('[data-scale]').forEach((b) => {
      b.onclick = () => this.scaleBy(Number(b.getAttribute('data-scale')));
    });
    pane.querySelectorAll('[data-mirror]').forEach((b) => {
      b.onclick = () => this.mirror(b.getAttribute('data-mirror'));
    });
    pane.querySelector('#dbg-drag').onclick = () => {
      this.dragMode = !this.dragMode;
      this.toast(this.dragMode ? 'Drag anywhere to slide the selection along the ground' : 'Drag off');
      this.render();
    };
    pane.querySelector('#dbg-ground').onclick = () => { o.position.y = 0; this.syncAttrs(); };
    pane.querySelector('#dbg-front').onclick = () => this.bringInFront();
    pane.querySelector('#dbg-face').onclick = () => this.faceCamera();
    pane.querySelector('#dbg-vis').onclick = () => {
      o.visible = !o.visible;
      this.toast(o.visible ? 'visible' : 'hidden');
    };
  },

  // ---- spawning -------------------------------------------------------------

  spawnModel: function (url, opts) {
    const options = opts || {};
    const cam = document.getElementById('camera');
    if (!cam || !cam.object3D) {
      this.toast('No camera yet');
      return null;
    }
    const camPos = cam.object3D.getWorldPosition(new THREE.Vector3());
    const forward = window.MathUtils.cameraForward(cam);
    const right = window.MathUtils.cameraRight(cam);

    const pos = camPos.clone()
      .add(forward.multiplyScalar(options.distance || 3))
      .add(right.multiplyScalar(options.lateral || 0));
    pos.y = 0;

    const name = url.split('/').pop().replace(/\.glb$/i, '');
    const key = options.key || `debug:${name}`;

    const ent = document.createElement('a-entity');
    ent.setAttribute('data-debug-spawn', name);
    ent.setAttribute('gltf-model', url);
    ent.setAttribute('animation-mixer', 'loop: repeat');
    if (this.normalizeSpawns) ent.setAttribute('model-normalize', 'height: 2.5');
    window.PlacementOverrides.apply(ent, key, {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: 0, y: THREE.MathUtils.radToDeg(Math.atan2(-forward.x, -forward.z)), z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    });

    const label = document.createElement('a-text');
    label.setAttribute('value', name);
    label.setAttribute('align', 'center');
    label.setAttribute('width', 4);
    label.setAttribute('color', '#0ff');
    label.setAttribute('position', '0 2.2 0');
    ent.appendChild(label);

    ent.addEventListener('model-loaded', () => {
      ent.dataset.dbgState = 'loaded';
      ent.dataset.dbgDims = measure(ent);
      console.log(`[debug-placement] ${name} loaded — bbox ${ent.dataset.dbgDims}`);
      this.toast(`${name}: loaded, ${ent.dataset.dbgDims}`);
      this.render();
    }, { once: true });
    ent.addEventListener('model-error', (e) => {
      ent.dataset.dbgState = 'ERROR';
      console.error(`[debug-placement] ${name} FAILED to load`, e && e.detail);
      this.toast(`${name}: FAILED to load`);
      this.render();
    }, { once: true });

    this.el.sceneEl.appendChild(ent);
    this.spawned.push(ent);
    this.select(ent);
    return ent;
  },

  spawnAllModels: function () {
    this.clearSpawned();
    const perRow = 6;
    GLB_MANIFEST.forEach((url, i) => {
      const col = i % perRow;
      const rowN = Math.floor(i / perRow);
      this.spawnModel(url, {
        distance: 4 + rowN * 5,
        lateral: (col - (perRow - 1) / 2) * 3
      });
    });
    this.selected = null;
    this.toast(`Spawned ${GLB_MANIFEST.length} models in a grid ahead of you`);
  },

  clearSpawned: function () {
    this.spawned.forEach((e) => { if (e.parentNode) e.parentNode.removeChild(e); });
    this.spawned = [];
    if (this.selected && !this.selected.parentNode) this.select(null);
    this.render();
  },

  // ---- selection + transforms ----------------------------------------------

  select: function (el) {
    this.selected = el;
    if (this.boxHelper) {
      this.boxHelper.parent && this.boxHelper.parent.remove(this.boxHelper);
      this.boxHelper = null;
    }
    if (el && el.object3D) {
      this.boxHelper = new THREE.BoxHelper(el.object3D, 0x00ffff);
      this.el.sceneEl.object3D.add(this.boxHelper);
    }
    this.render();
  },

  selectByKey: function (keyOrEl) {
    if (keyOrEl && keyOrEl.object3D) return this.select(keyOrEl);
    const found = this.collectObjects().find((o) => o.key === keyOrEl);
    if (found) this.select(found.el);
    return found ? found.el : null;
  },

  camBasis: function () {
    const cam = document.getElementById('camera');
    return {
      forward: window.MathUtils.cameraForward(cam),
      right: window.MathUtils.cameraRight(cam),
      up: new THREE.Vector3(0, 1, 0)
    };
  },

  /** Move by `step` along a camera-relative axis, writing back in parent-local space. */
  moveWorld: function (deltaWorld) {
    const el = this.selected;
    if (!el || !el.object3D) return;
    const obj = el.object3D;
    const world = obj.getWorldPosition(new THREE.Vector3()).add(deltaWorld);
    if (obj.parent) obj.parent.worldToLocal(world);
    obj.position.copy(world);
    this.syncAttrs();
  },

  nudge: function (dir) {
    const { forward, right, up } = this.camBasis();
    const s = this.step;
    const map = {
      f: forward.clone().multiplyScalar(s),
      b: forward.clone().multiplyScalar(-s),
      l: right.clone().multiplyScalar(-s),
      r: right.clone().multiplyScalar(s),
      u: up.clone().multiplyScalar(s),
      d: up.clone().multiplyScalar(-s)
    };
    if (map[dir]) this.moveWorld(map[dir]);
  },

  rotate: function (sign) {
    const el = this.selected;
    if (!el) return;
    el.object3D.rotation.y += THREE.MathUtils.degToRad(this.yawStep * sign);
    this.syncAttrs();
  },

  scaleBy: function (factor) {
    const el = this.selected;
    if (!el) return;
    el.object3D.scale.multiplyScalar(factor);
    this.syncAttrs();
  },

  /**
   * Mirror on an axis via negative scale. That inverts triangle winding, so the
   * model would light and cull inside-out; force DoubleSide to compensate.
   */
  mirror: function (axis) {
    const el = this.selected;
    if (!el) return;
    el.object3D.scale[axis] *= -1;
    el.object3D.traverse((o) => {
      if (o.isMesh && o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((mat) => {
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        });
      }
    });
    this.syncAttrs();
    this.toast(`mirrored on ${axis.toUpperCase()} — SAVE to keep it`);
  },

  bringInFront: function () {
    const cam = document.getElementById('camera');
    if (!cam || !this.selected) return;
    const { forward } = this.camBasis();
    const target = cam.object3D.getWorldPosition(new THREE.Vector3()).add(forward.multiplyScalar(3));
    target.y = 0;
    const obj = this.selected.object3D;
    if (obj.parent) obj.parent.worldToLocal(target);
    obj.position.copy(target);
    this.syncAttrs();
  },

  faceCamera: function () {
    const cam = document.getElementById('camera');
    if (!cam || !this.selected) return;
    const obj = this.selected.object3D;
    const world = obj.getWorldPosition(new THREE.Vector3());
    const camPos = cam.object3D.getWorldPosition(new THREE.Vector3());
    const dir = camPos.clone().sub(world);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) return;
    obj.rotation.y = Math.atan2(dir.x, dir.z);
    this.syncAttrs();
  },

  /** Keep the A-Frame attributes in step with the object3D we mutated directly. */
  syncAttrs: function () {
    const el = this.selected;
    if (!el) return;
    const o = el.object3D;
    el.setAttribute('position', `${o.position.x} ${o.position.y} ${o.position.z}`);
    el.setAttribute('rotation',
      `${THREE.MathUtils.radToDeg(o.rotation.x)} ${THREE.MathUtils.radToDeg(o.rotation.y)} ${THREE.MathUtils.radToDeg(o.rotation.z)}`);
    el.setAttribute('scale', `${o.scale.x} ${o.scale.y} ${o.scale.z}`);
    if (this.tab === 'move') this.renderMove();
  },

  saveSelected: function () {
    const el = this.selected;
    if (!el) return this.toast('Nothing selected');
    const key = el.getAttribute('data-placement-key');
    if (!key) return this.toast('This entity has no placement key — cannot save');
    window.PlacementOverrides.saveFromEntity(key, el);
    this.toast(`Saved ${key}`);
    this.render();
  },

  revertSelected: function () {
    const el = this.selected;
    if (!el) return this.toast('Nothing selected');
    const key = el.getAttribute('data-placement-key');
    if (!key) return this.toast('No placement key');
    window.PlacementOverrides.clear(key);
    this.toast(`Cleared ${key} — respawn to see the default`);
    this.render();
  },

  // ---- scene input (tap-to-select, drag) ------------------------------------

  installSceneInput: function () {
    const canvas = () => this.el.sceneEl.canvas || document.querySelector('canvas');
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let dragging = false;
    let dragOffset = new THREE.Vector3();

    const camera3D = () => {
      const camEl = document.getElementById('camera');
      return camEl && camEl.getObject3D('camera');
    };

    const toNdc = (e) => {
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      ndc.x = (t.clientX / window.innerWidth) * 2 - 1;
      ndc.y = -(t.clientY / window.innerHeight) * 2 + 1;
    };

    const onDown = (e) => {
      if (!this.pickArmed && !this.dragMode) return;
      const cam = camera3D();
      if (!cam) return;
      toNdc(e);
      raycaster.setFromCamera(ndc, cam);

      if (this.pickArmed) {
        const targets = this.collectObjects().map((o) => o.el).filter((t) => t.object3D);
        const hits = raycaster.intersectObjects(targets.map((t) => t.object3D), true);
        if (hits.length) {
          let node = hits[0].object;
          while (node && !node.el) node = node.parent;
          const picked = node && node.el ? nearestTracked(node.el, targets) : null;
          if (picked) {
            this.select(picked);
            this.pickArmed = false;
            this.togglePanel(true);
            this.showTab('move');
            e.preventDefault();
            return;
          }
        }
      }

      if (this.dragMode && this.selected) {
        const world = this.selected.object3D.getWorldPosition(new THREE.Vector3());
        plane.constant = -world.y;
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, hit)) {
          dragOffset.copy(world).sub(hit);
          dragging = true;
          e.preventDefault();
        }
      }
    };

    const onMove = (e) => {
      if (!dragging || !this.selected) return;
      const cam = camera3D();
      if (!cam) return;
      toNdc(e);
      raycaster.setFromCamera(ndc, cam);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) {
        const world = hit.add(dragOffset);
        const obj = this.selected.object3D;
        if (obj.parent) obj.parent.worldToLocal(world);
        obj.position.copy(world);
        this.syncAttrs();
      }
      e.preventDefault();
    };

    const onUp = () => { dragging = false; };

    const attach = () => {
      const c = canvas();
      if (!c) return setTimeout(attach, 400);
      c.addEventListener('touchstart', onDown, { passive: false });
      c.addEventListener('touchmove', onMove, { passive: false });
      c.addEventListener('touchend', onUp);
      c.addEventListener('mousedown', onDown);
      c.addEventListener('mousemove', onMove);
      c.addEventListener('mouseup', onUp);
    };
    attach();
  },

  tick: function () {
    if (!this.active) return;
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsAt >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.lastFpsAt = now;
      if (this.fpsEl) this.fpsEl.textContent = `${this.fps}fps`;
    }
    if (this.boxHelper && this.selected && this.selected.object3D) {
      this.boxHelper.update();
    }
  },

  remove: function () {
    clearInterval(this.renderTimer);
    if (this.gpsWatch != null) {
      try { navigator.geolocation.clearWatch(this.gpsWatch); } catch (e) { /* ignore */ }
    }
    const root = document.getElementById('dbg-root');
    if (root) root.remove();
  }
});

// ---- helpers ----------------------------------------------------------------

function boxOf(el) {
  const s = new THREE.Vector3();
  new THREE.Box3().setFromObject(el.object3D).getSize(s);
  return isFinite(s.y) ? s : new THREE.Vector3();
}

function measure(el) {
  const box = new THREE.Box3().setFromObject(el.object3D);
  const s = new THREE.Vector3();
  box.getSize(s);
  if (!isFinite(s.x)) return '—';
  return `${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)}m`;
}

function describeModel(el) {
  const m = el.getAttribute('gltf-model');
  if (!m) return el.tagName.toLowerCase();
  return String(m).split('/').pop();
}

function isAncestryVisible(el) {
  let n = el.object3D;
  while (n) {
    if (!n.visible) return false;
    n = n.parent;
  }
  return true;
}

function nearestTracked(el, tracked) {
  let n = el;
  while (n) {
    if (tracked.indexOf(n) !== -1) return n;
    n = n.parentElement;
  }
  return el;
}

function fmtVec(v) {
  return `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}`;
}

function stringify(a) {
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch (e) { return String(a); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Attach even if <a-scene> was parsed before this module registered.
function ensureDebugAttached() {
  const scene = document.querySelector('a-scene');
  if (!scene || !window.AFRAME) return;
  if (!scene.components || !scene.components['debug-placement']) {
    scene.setAttribute('debug-placement', '');
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(ensureDebugAttached, 0));
} else {
  setTimeout(ensureDebugAttached, 0);
}
