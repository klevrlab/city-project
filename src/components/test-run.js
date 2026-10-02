/**
 * At-home test run — `shark-ar-8thwall.html?test=1`.
 *
 * A guided checklist over every Sharks Way mode that doesn't need the corridor:
 * summon + drop a shark, Athena, the Leaning Tower, the river jump, the party,
 * Photo Mode (Sharkie / Sammy / Athena), the front-camera selfie and Goalie.
 * Painted-shark scanning is the one thing it can't cover — that needs the
 * paintings.
 *
 * Everything happens on this page. Each step has a "Set it up" button that
 * switches mode / picks the drop itself, then says what to do and what to look
 * for. ✓ / ✗ (with a note) / Skip go into the field log (sharks-way-log.js)
 * together with measurements taken at that moment — distances, rendered
 * heights, fps, GPU memory — so a failed step arrives with numbers attached.
 * ?test=1 also turns logging on and unlocks every drop without GPS
 * (location-experiences.js). Progress survives a reload.
 *
 * Share the log at the end (or any time from the card's ⋯ menu).
 */
const params = new URLSearchParams(window.location.search);
// Developer addresses only — never on the public site (sharks-way-log.js).
const ENABLED = window.SharksWayDevHost === true && params.get('test') === '1';
const PROGRESS_KEY = 'sharksway.testrun.step';

const log = (category, message) => {
  if (window.SharksWayLog) window.SharksWayLog.add(category, message);
};

// ---- measurements ------------------------------------------------------------

function sceneEl() { return document.querySelector('a-scene'); }
function camEl() { return document.getElementById('camera'); }

function camPos() {
  const c = camEl();
  return c ? c.object3D.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
}

/** World bounds of an entity's model as it renders (rigged meshes posed). */
function renderedBox(el) {
  const box = new THREE.Box3();
  if (!el) return box;
  el.object3D.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  el.object3D.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
    // Every vertex: sampling skipped the tower's thin base and reported it
    // floating half a metre up. A one-off full scan is ~tens of ms on a phone.
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v);
      v.applyMatrix4(o.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box;
}

/** "4.8 m away, 2.49 m tall, base at 0.00 m" for a placed thing. */
function describe(el, label) {
  if (!el) return `${label}: not in the scene`;
  const b = renderedBox(el);
  if (b.isEmpty()) return `${label}: in the scene but no model loaded`;
  const c = camPos();
  const ctr = b.getCenter(new THREE.Vector3());
  const size = b.getSize(new THREE.Vector3());
  // Scene units aren't metres under 8th Wall's default scale; report both.
  const k = window.MathUtils && window.MathUtils.unitsPerMetre ? window.MathUtils.unitsPerMetre(camEl()) : 1;
  // Heights from the floor drops land on, which leaves y = 0 when tracking drifts.
  const f = window.MathUtils && window.MathUtils.floorY ? window.MathUtils.floorY() : 0;
  const m = (v) => (v / k).toFixed(2);
  return `${label}: ≈${(Math.hypot(ctr.x - c.x, ctr.z - c.z) / k).toFixed(1)} m away, ≈${m(size.y)} m tall, ` +
    `base ${m(b.min.y - f)} m, top ${m(b.max.y - f)} m · raw units: ${size.y.toFixed(2)} tall, ` +
    `eye ${(c.y - f).toFixed(2)} above floor ${f.toFixed(2)}, ${k.toFixed(2)} units/m`;
}

function gpuInfo() {
  const r = sceneEl() && sceneEl().renderer;
  if (!r) return 'renderer n/a';
  const i = r.info;
  return `gpu geo=${i.memory.geometries} tex=${i.memory.textures} tris=${Math.round(i.render.triangles / 1000)}k`;
}

/** Frames per second over the next `ms`. */
function measureFps(ms = 3000) {
  return new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else resolve(Math.round(frames * 1000 / (performance.now() - t0)));
    };
    requestAnimationFrame(tick);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const drops = () => window.SharksWayDrops;
const modes = () => window.SharksWayMode;

function setMode(mode) {
  const m = modes();
  if (m && m.get() !== mode) m.set(mode);
}

function pickDrop(id) {
  setMode('wayfinding');
  if (drops()) drops().select(id);
}

// ---- the steps ---------------------------------------------------------------
//
// setup():   done by the "Set it up" button (and on arriving at the step).
// measure(): returns a line for the log, taken when ✓ / ✗ is pressed.

const STEPS = [
  {
    id: 'start',
    title: 'Camera & tracking',
    todo: 'Point the phone at the floor a few metres ahead and move it slowly side to side for ~5 s.',
    check: 'Live camera image, no error or "almost there" screens.',
    measure: async () => `fps ${await measureFps()} · ${gpuInfo()}`
  },
  {
    id: 'summon',
    title: 'Summon a shark',
    setup: () => {
      setMode('wayfinding');
      if (drops()) drops().select('shark');
      if (window.manualSharkSpawn) window.manualSharkSpawn();
    },
    setupLabel: 'Summon',
    todo: 'Hold the phone level and watch. "Summon" sends another one.',
    check: 'Comes from behind you, pauses in front, then swims straight away nose-first — no veering or turning. One shark per summon, then nothing.',
    measure: async () => {
      const a = document.getElementById('shark-root');
      const anim = a && a.components['shark-animator'];
      return `swim running: ${anim && anim.isRunning ? 'yes' : 'no'} · ${gpuInfo()}`;
    }
  },
  {
    id: 'drop-shark',
    title: 'Drop a shark',
    setup: () => pickDrop('shark'),
    todo: 'Tap the floor about 3 m ahead.',
    check: 'A shark rises out of the floor where you tapped, side-on, swimming in place, and stays there. Walk around it.',
    measure: async () => {
      const anim = document.getElementById('shark-root').components['shark-animator'];
      return describe(anim && anim.activeEntity, 'dropped shark');
    }
  },
  {
    id: 'athena',
    title: 'Athena statue',
    setup: () => pickDrop('athena'),
    todo: 'Tap the floor right in front of your feet.',
    check: 'Athena lands at least ~3 m away (not on top of you), ~2.5 m tall, standing on the floor, facing you.',
    measure: async () => describe(document.querySelector('[data-drop-root="athena"]'), 'athena')
  },
  {
    id: 'tower',
    title: 'Leaning Tower',
    setup: () => pickDrop('tower'),
    todo: 'Tap the floor 5–10 m ahead. (Best outdoors.)',
    check: 'Tower rises exactly where you tapped (never closer than 4 m), ~8 m tall, base on the ground — not floating. Take a few steps: it stays put.',
    measure: async () => describe(document.querySelector('[data-drop-root="tower"]'), 'tower')
  },
  {
    id: 'river',
    title: 'River jump',
    setup: () => pickDrop('river'),
    todo: 'Hold the phone level and tap the floor ahead. Tap again for another jump.',
    check: 'A shark swims in from the left, breaches clear of the water with its nose a little above your eye level, splashes down and swims off right — visible the whole time.',
    measure: async () => {
      const root = document.querySelector('[data-drop-root="jump"]');
      return (root ? describe(root.firstElementChild, 'jump shark (mid-run)') : 'no jump running right now') +
        ' · ' + gpuInfo();
    }
  },
  {
    id: 'party',
    title: 'Drop a Party',
    setup: () => pickDrop('party'),
    todo: 'Tap the floor ~4 m ahead, then turn slowly all the way round.',
    check: 'Sharkie & Sammy dance where you tapped, three sharks circle around you, a shark jumps. Stays smooth — no freezing.',
    measure: async () => {
      const dancers = [...document.querySelectorAll('[data-drop-root="party"] [data-placement-key^="party/dancer"]')]
        .map((e) => describe(e, e.getAttribute('data-placement-key'))).join(' | ');
      return `fps ${await measureFps()} · ${gpuInfo()} · ${dancers || 'no party on screen'}`;
    }
  },
  {
    id: 'photo',
    title: 'Photo Mode — place',
    setup: () => {
      if (drops()) drops().clear();
      setMode('photo');
    },
    todo: 'Tap the floor. Then switch Sharkie → Sammy → Athena with the chips at the bottom.',
    check: 'Mascot faces you, person-sized (~1.9 m; Athena ~2.5 m), a few metres away, feet on the floor. Switching keeps the same spot.',
    measure: async () => {
      const root = document.getElementById('photo-root');
      const ch = modes() && modes().photoCharacter ? modes().photoCharacter() : '?';
      return `${ch}: ` + describe(root && root.firstElementChild, 'photo mascot');
    }
  },
  {
    id: 'photo-snap',
    title: 'Photo Mode — snap',
    setup: () => setMode('photo'),
    todo: 'With a mascot placed, tap Snap. Try Save and Share from the preview.',
    check: 'Preview shows the camera image with the mascot in it (not black). Save and Share work.',
    measure: async () => gpuInfo()
  },
  {
    id: 'selfie',
    title: 'Selfie — front camera',
    setup: () => {
      setMode('photo');
      const m = modes();
      if (m && m.photoSubmode && m.photoSubmode() !== 'selfie') {
        const flip = document.getElementById('photo-flip-btn');
        if (flip) flip.click();
      }
    },
    setupLabel: 'Flip to selfie',
    todo: 'Step back until your shoulders show. Try each character chip.',
    check: 'Mascot sits on your shoulder with its whole head on screen. No text over your face.',
    measure: async () => {
      const o = document.getElementById('sw-selfie-overlay');
      const r = o && o.getBoundingClientRect();
      return r ? `overlay ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} ` +
        `in ${window.innerWidth}×${window.innerHeight} · visible ${o.classList.contains('visible')}` : 'no overlay';
    }
  },
  {
    id: 'selfie-snap',
    title: 'Selfie — snap, then flip back',
    todo: 'Tap Snap, check the photo, close it. Then tap "Back Camera".',
    check: 'The photo matches the screen, mascot included. Back camera returns to AR with tracking.',
    measure: async () => `mode ${modes() ? modes().get() + '/' + modes().photoSubmode() : '?'}`
  },
  {
    id: 'goalie',
    title: 'Goalie Mode',
    setup: () => setMode('goalie'),
    todo: 'Tap the floor to place the goal and puck, then flick the puck at the goal. Try Reset.',
    check: 'Goal with Sharkie appears, the puck moves when flicked, goals count, Reset works.',
    measure: async () => `fps ${await measureFps()} · ${gpuInfo()}`
  },
  {
    id: 'soak',
    title: 'Freeze check (automatic)',
    setup: null,   // the run button below does it
    runLabel: 'Run soak (~70 s)',
    run: async (say) => {
      setMode('wayfinding');
      if (drops()) drops().clear();
      await wait(1000);
      const before = gpuInfo();
      log('test', `soak start · ${before}`);
      for (let i = 0; i < 5; i++) {
        say(`Summoning shark ${i + 1} of 5…`);
        if (window.manualSharkSpawn) window.manualSharkSpawn();
        await wait(10500);
      }
      for (let i = 0; i < 3; i++) {
        say(`Dropping tower ${i + 1} of 3…`);
        if (drops()) drops().dropAhead('tower', 14);
        await wait(3500);
      }
      if (drops()) drops().clear();
      await wait(1500);
      const fps = await measureFps();
      const after = gpuInfo();
      log('test', `soak end · fps ${fps} · before: ${before} · after: ${after}`);
      say(`Done — fps ${fps}. Memory before: ${before}. After: ${after}.`);
    },
    todo: 'Keep the camera pointed ahead and tap "Run soak". It summons 5 sharks and drops 3 towers by itself.',
    check: 'No freezing or growing slowdown. (The before/after memory numbers should be about the same.)',
    measure: async () => `fps ${await measureFps()} · ${gpuInfo()}`
  }
];

// ---- the card ----------------------------------------------------------------

const CSS = `
#tr-card{position:fixed;left:8px;right:8px;top:60px;z-index:3000;background:rgba(0,22,26,.92);
  border:1px solid rgba(0,169,224,.5);border-radius:14px;color:#fff;font:13px/1.35 system-ui,sans-serif;
  box-shadow:0 6px 24px rgba(0,0,0,.4);backdrop-filter:blur(8px);max-height:46vh;overflow:auto}
#tr-card .tr-head{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer}
#tr-card .tr-step{font-weight:700;flex:1}
#tr-card .tr-count{opacity:.7;font-size:12px}
#tr-card .tr-body{padding:0 12px 10px}
#tr-card.tr-min .tr-body{display:none}
#tr-card .tr-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.6;margin-top:6px}
#tr-card .tr-row{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}
#tr-card button{appearance:none;border:1px solid rgba(0,169,224,.5);background:rgba(0,169,224,.2);color:#fff;
  font:600 13px system-ui,sans-serif;padding:8px 11px;border-radius:9px}
#tr-card .tr-ok{background:rgba(40,200,120,.35);border-color:rgba(40,200,120,.7)}
#tr-card .tr-bad{background:rgba(230,70,70,.35);border-color:rgba(230,70,70,.7)}
#tr-card .tr-go{background:rgba(0,169,224,.45)}
#tr-card .tr-say{margin-top:6px;color:#9fe3ff}
#tr-card .tr-dots{display:flex;gap:3px;margin-top:8px;flex-wrap:wrap}
#tr-card .tr-dot{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.2)}
#tr-card .tr-dot.pass{background:#2bd07b}#tr-card .tr-dot.fail{background:#e64646}
#tr-card .tr-dot.skip{background:#888}#tr-card .tr-dot.cur{outline:2px solid #00a9e0}
`;

function loadProgress() {
  try { return JSON.parse(window.sessionStorage.getItem(PROGRESS_KEY)) || { i: 0, results: {} }; } catch (e) { return { i: 0, results: {} }; }
}
function saveProgress(p) {
  try { window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
}

function startTestRun() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const card = document.createElement('div');
  card.id = 'tr-card';
  document.body.appendChild(card);

  const progress = loadProgress();
  let busy = false;

  log('test', `test run ${progress.i > 0 ? 'resumed at step ' + (progress.i + 1) : 'started'} · ${STEPS.length} steps`);

  function render(sayText) {
    const done = progress.i >= STEPS.length;
    const dots = STEPS.map((s, k) =>
      `<span class="tr-dot ${progress.results[s.id] || ''} ${k === progress.i ? 'cur' : ''}"></span>`).join('');
    if (done) {
      const tally = ['pass', 'fail', 'skip'].map((r) =>
        `${Object.values(progress.results).filter((x) => x === r).length} ${r}`).join(' · ');
      card.innerHTML = `
        <div class="tr-head"><span class="tr-step">Test run finished</span><span class="tr-count">${tally}</span></div>
        <div class="tr-body">
          <div>Share the log so Claude can read it — it has every ✓/✗, your notes and the measurements.</div>
          <div class="tr-dots">${dots}</div>
          <div class="tr-row">
            <button class="tr-go" data-a="share">Share log</button>
            <button data-a="download">Download log</button>
            <button data-a="restart">Start over</button>
          </div>
        </div>`;
    } else {
      const s = STEPS[progress.i];
      card.innerHTML = `
        <div class="tr-head" data-a="toggle">
          <span class="tr-step">${progress.i + 1}. ${s.title}</span>
          <span class="tr-count">${progress.i + 1}/${STEPS.length} ▾</span>
        </div>
        <div class="tr-body">
          <div class="tr-lbl">Do</div><div>${s.todo}</div>
          <div class="tr-lbl">Looks right if</div><div>${s.check}</div>
          ${sayText ? `<div class="tr-say">${sayText}</div>` : ''}
          <div class="tr-row">
            ${s.setup ? `<button class="tr-go" data-a="setup">${s.setupLabel || 'Set it up'}</button>` : ''}
            ${s.run ? `<button class="tr-go" data-a="run">${s.runLabel}</button>` : ''}
            <button class="tr-ok" data-a="pass">✓ Works</button>
            <button class="tr-bad" data-a="fail">✗ Problem</button>
            <button data-a="skip">Skip</button>
          </div>
          <div class="tr-row">
            ${progress.i > 0 ? '<button data-a="back">‹ Back</button>' : ''}
            <button data-a="note">★ Note</button>
            <button data-a="share">Share log</button>
          </div>
          <div class="tr-dots">${dots}</div>
        </div>`;
    }
  }

  function enterStep() {
    const s = STEPS[progress.i];
    if (!s) return;
    log('test', `▶ step ${progress.i + 1}/${STEPS.length} ${s.id} — ${s.title}`);
    if (s.setup) {
      try { s.setup(); } catch (e) { log('error', `test setup ${s.id}: ${e.message}`); }
    }
  }

  /** In-page note box (sharks-way-log.js) — window.prompt froze the camera on iPhone. */
  function askNote(title) {
    return new Promise((resolve) => {
      const L = window.SharksWayLog;
      if (L && L.askNote) L.askNote(title, resolve);
      else resolve('');
    });
  }

  async function finish(result) {
    const s = STEPS[progress.i];
    // Measure first, while the scene is still what the tester was looking at.
    let m = '';
    try { m = await s.measure(); } catch (e) { m = `measure failed: ${e.message}`; }
    let note = '';
    if (result === 'fail') {
      note = await askNote(`What went wrong with "${s.title}"?`);
      if (note === null) { render(); return; }   // Cancel: stay on this step
    }
    const icon = { pass: '✓', fail: '✗', skip: '–' }[result];
    const line = `${icon} step ${progress.i + 1} ${s.id} — ${s.title}${note ? ' — "' + note + '"' : ''} · ${m}`;
    // Failures go in as marks (★) so they're easy to find in a long log.
    if (result === 'fail') log('mark', `★ TEST FAIL ${line}`);
    else log('test', line);
    progress.results[s.id] = result;
    progress.i++;
    saveProgress(progress);
    if (window.SharksWayLog && window.SharksWayLog.save) window.SharksWayLog.save();
    if (progress.i >= STEPS.length) {
      log('test', 'test run finished · ' + STEPS.map((x) => `${x.id}:${progress.results[x.id] || '-'}`).join(' '));
    } else {
      enterStep();
    }
    render();
  }

  card.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    e.stopPropagation();
    const act = a.getAttribute('data-a');
    if (busy && act !== 'toggle') return;
    const s = STEPS[progress.i];

    if (act === 'toggle') card.classList.toggle('tr-min');
    else if (act === 'setup' && s && s.setup) { s.setup(); log('test', `set up ${s.id} again`); }
    else if (act === 'run' && s && s.run) {
      busy = true;
      try { await s.run((t) => render(t)); } catch (err) { log('error', `test run ${s.id}: ${err.message}`); }
      busy = false;
    } else if (act === 'pass' || act === 'fail' || act === 'skip') {
      busy = true;
      render('Measuring…');
      await finish(act);
      busy = false;
    } else if (act === 'back') {
      progress.i = Math.max(0, progress.i - 1);
      saveProgress(progress);
      enterStep();
      render();
    } else if (act === 'note') {
      if (window.SharksWayLog) window.SharksWayLog.mark();
    } else if (act === 'share') {
      if (window.SharksWayLog) window.SharksWayLog.share();
    } else if (act === 'download') {
      if (window.SharksWayLog) window.SharksWayLog.download();
    } else if (act === 'restart') {
      progress.i = 0;
      progress.results = {};
      saveProgress(progress);
      log('test', 'test run restarted');
      enterStep();
      render();
    }
  });

  // Let the page's own UI finish building before the first setup runs.
  const begin = () => {
    render();
    if (progress.i < STEPS.length) setTimeout(enterStep, 1500);
  };
  if (window.SharksWayDrops && window.SharksWayMode) begin();
  else {
    let tries = 0;
    const id = setInterval(() => {
      if ((window.SharksWayDrops && window.SharksWayMode) || ++tries > 60) {
        clearInterval(id);
        begin();
      }
    }, 250);
  }

  window.SharksWayTestRun = { steps: STEPS.map((s) => s.id), progress: () => ({ ...progress }) };
}

if (ENABLED) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startTestRun);
  else startTestRun();
}
