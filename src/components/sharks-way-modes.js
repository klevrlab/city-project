/**
 * June 10 redline — Sharks Way mode switcher.
 * Wayfinding (default) | Photo Mode | Goalie Mode
 *
 * Photo Mode (real, in-page):
 *  - Place: back-camera XR, tap ground to place a character, Snap captures AR frame
 *  - Selfie: Flip Camera → front cam + MediaPipe shoulder mount (no page navigate)
 *  - Characters: Sharkie and Sammy everywhere; Athena near Little Italy
 * Goalie Mode: soccer-game with hard-coded puck (Sharkie in goal).
 *
 * Styles: shark-ar-8thwall.html links src/css/sharks-way-modes.css. A JS
 * `import '...css'` only works through Vite; served raw it failed this whole
 * module, and with it Photo and Goalie mode.
 */
import { ensureModel, modelSrc, prefetchModels } from '../utils/model-assets.js';

/** Field log (assets/js/sharks-way-log.js) — a no-op unless ?debug=1 or ?log=1. */
const fieldLog = (category, message) => {
  if (window.SharksWayLog) window.SharksWayLog.add(category, message);
};

const MODE = {
  WAYFINDING: 'wayfinding',
  PHOTO: 'photo',
  GOALIE: 'goalie'
};

const CHAR = {
  SHARKIE: 'sharkie',
  SAMMY: 'sammy',
  ATHENA: 'athena'
};

/** Sharkie / Sammy height in metres. Keep in step with MASCOT_HEIGHT_M in location-experiences.js. */
const MASCOT_HEIGHT_M = 1.9;

/**
 * Photo Mode characters, in chip order.
 *
 * `minM` / `maxM` clamp how far from the camera a tapped character lands. On
 * site, taps toward the horizon put the mascot 10+ m out, where it was small
 * and SLAM drift walked it around ("once placed mascot drifts so hard to get
 * into view"). A few metres away is where a photo with it works anyway —
 * farther for Athena, whose 2.5 m (the Little Italy statue size) doesn't fit
 * in a portrait frame from 1.2 m.
 *
 * `nearOnly` names the location drop that unlocks a character: the Sept 28
 * notes' stretch goal is Athena as a selfie option "when near Little Italy",
 * so she's offered exactly where the Athena drop is.
 *
 * `statue` models are static meshes, loaded through shared-gltf so Photo Mode
 * and the Little Italy drop share one parse and one set of textures.
 */
const CHARACTERS = {
  [CHAR.SHARKIE]: { label: 'Sharkie', asset: 'photo-sharkie', heightM: MASCOT_HEIGHT_M, minM: 1.2, maxM: 3.5 },
  [CHAR.SAMMY]: { label: 'Sammy', asset: 'photo-sammy', heightM: MASCOT_HEIGHT_M, minM: 1.2, maxM: 3.5 },
  [CHAR.ATHENA]: {
    label: 'Athena', asset: 'athena-point-right', heightM: 2.5, minM: 2.5, maxM: 5,
    nearOnly: 'athena', statue: true
  }
};

/** Keep in step with STATUE_MAX_TEXTURE_PX in location-experiences.js. */
const STATUE_MAX_TEXTURE_PX = 1024;

/**
 * Pinned versions, not "latest": with an unpinned URL a MediaPipe release could
 * change or break the selfie on event day without anyone deploying. pose.js and
 * the wasm / model files its locateFile fetches must come from the same version.
 */
const MEDIAPIPE_POSE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404';
const MEDIAPIPE_CAMERA_UTILS_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862';

/** Photos are JPEG: a full-screen PNG took seconds to encode on a phone and ran to ~10 MB. */
const PHOTO_MIME = 'image/jpeg';
const PHOTO_QUALITY = 0.92;

const state = {
  mode: MODE.WAYFINDING,
  photoCharacter: CHAR.SHARKIE,
  photoEntity: null,
  lastTapPoint: null,    // where the visitor last tapped, to re-place on a character switch
  photoSubmode: 'place', // 'place' | 'selfie'
  soccerArmed: false,
  selfie: {
    stream: null,
    pose: null,
    camera: null,
    lastRect: null,
    // Mascot box height as a fraction of the screen, and where it stands
    // relative to the right shoulder (screen px, before mirroring).
    heightFrac: 0.42,
    xNudge: 50,
    scriptsReady: false,
    scriptsLoading: null
  }
};

function closeNav() {
  const navMenu = document.getElementById('nav-menu');
  const navOverlay = document.getElementById('nav-overlay');
  if (navMenu) navMenu.classList.remove('open');
  if (navOverlay) navOverlay.classList.remove('visible');
}

function setInstruction(text, visible = true) {
  const el = document.getElementById('tap-instruction');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('visible', visible);
}

function flashToast(text, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(flashToast._t);
  flashToast._t = setTimeout(() => el.classList.remove('show'), ms);
}

/** Hide the toast, but only if it still says `text` — a newer toast wins. */
function hideToast(text) {
  const el = document.getElementById('toast');
  if (!el || (text && el.textContent !== text)) return;
  clearTimeout(flashToast._t);
  el.classList.remove('show');
}

function currentCharacter() {
  return CHARACTERS[state.photoCharacter] || CHARACTERS[CHAR.SHARKIE];
}

/** Sharkie and Sammy always; a `nearOnly` character while its drop is on offer. */
function isCharacterAvailable(id) {
  const c = CHARACTERS[id];
  if (!c) return false;
  if (!c.nearOnly) return true;
  const drops = window.SharksWayDrops;
  return !!(drops && drops.available().includes(c.nearOnly));
}

/**
 * "Loading Athena…" while a character's file is still downloading (the first
 * pick can beat the prefetch on a slow connection), cleared when the model
 * arrives, and a retry hint instead of an empty spot if it never does.
 */
function reportModelLoad(ent, c, loaded) {
  const loading = `Loading ${c.label}…`;
  const t0 = performance.now();
  if (!loaded) flashToast(loading, 30000);
  ent.addEventListener('model-loaded', () => {
    hideToast(loading);
    fieldLog('photo', `${c.label} on screen ${Math.round(performance.now() - t0)}ms after the tap` +
      (loaded ? '' : ' (was still downloading)'));
  }, { once: true });
  ent.addEventListener('model-error', () => {
    console.warn(`[sharks-way-modes] ${c.label} failed to load`);
    flashToast(`${c.label} didn't load — check your connection and tap again`, 4000);
  }, { once: true });
}

function setWayfindingUi(on) {
  const spawn = document.getElementById('spawn-btn');
  if (spawn) spawn.style.display = on ? '' : 'none';
  const sharkRoot = document.getElementById('shark-root');
  if (sharkRoot && !on) {
    const animator = sharkRoot.components && sharkRoot.components['shark-animator'];
    if (animator && typeof animator.stopCycle === 'function') animator.stopCycle();
    sharkRoot.setAttribute('visible', 'false');
  }
}

function clearPhotoMascot() {
  if (state.photoEntity && state.photoEntity.parentNode) {
    state.photoEntity.parentNode.removeChild(state.photoEntity);
  }
  state.photoEntity = null;
}

/** Scene units per real metre now — see MathUtils.unitsPerMetre. */
function unitsPerMetre() {
  const cam = document.getElementById('camera');
  return window.MathUtils && window.MathUtils.unitsPerMetre ? window.MathUtils.unitsPerMetre(cam) : 1;
}

function spawnPhotoMascot(point, facingYaw, k = unitsPerMetre()) {
  const root = document.getElementById('photo-root');
  if (!root) return;
  clearPhotoMascot();
  const c = currentCharacter();
  // Created on first use (model-assets.js); must exist before the selector is set.
  const item = ensureModel(c.asset);
  const ent = document.createElement('a-entity');
  if (c.statue) {
    ent.setAttribute('shared-gltf', `src: #${c.asset}; maxTexture: ${STATUE_MAX_TEXTURE_PX}`);
  } else {
    ent.setAttribute('gltf-model', `#${c.asset}`);
  }
  ent.setAttribute('position', `${point.x} ${(point.y || 0) + 0.02} ${point.z}`);
  ent.setAttribute('rotation', `0 ${facingYaw} 0`);
  // Sharkie is 1.95 m in its GLB, Sammy 2.96 m and Athena 206 m, and the
  // mascots float above their origin — normalize so photos frame consistently.
  ent.setAttribute('model-normalize', `height: ${c.heightM}`);
  // heightM is metres; 8th Wall's default scale isn't — "Sharkie is kinda
  // small" on Sept 30 was a phone that opened the page held low.
  ent.setAttribute('scale', `${k} ${k} ${k}`);
  ent.setAttribute('shadow', 'cast: true');
  reportModelLoad(ent, c, !item || item.hasLoaded);
  root.appendChild(ent);
  state.photoEntity = ent;
}

function placePhotoMascot(tapPoint, { quiet = false } = {}) {
  const root = document.getElementById('photo-root');
  if (!root || !tapPoint) return;

  clearPhotoMascot();
  // The tap plane follows the real floor as tracking drifts (MathUtils.trackGround).
  const floor = tapPoint.y || 0;
  state.lastTapPoint = new THREE.Vector3(tapPoint.x, floor, tapPoint.z);
  const c = currentCharacter();

  // Keep the character at photo distance, along the line the visitor tapped.
  const point = new THREE.Vector3(tapPoint.x, floor, tapPoint.z);
  let facingYaw = 0;
  const cam = document.getElementById('camera');
  if (cam) {
    const camPos = cam.object3D.getWorldPosition(new THREE.Vector3());
    const toPoint = new THREE.Vector3(point.x - camPos.x, 0, point.z - camPos.z);
    let d = toPoint.length();
    if (d < 0.01) {
      window.MathUtils.cameraForward(cam, toPoint);
      d = 0;
    } else {
      toPoint.divideScalar(d);
    }
    const k = unitsPerMetre();
    const tapped = d;
    d = Math.min(Math.max(d, c.minM * k), c.maxM * k);
    point.set(camPos.x + toPoint.x * d, floor, camPos.z + toPoint.z * d);
    fieldLog('photo', `place ${c.label} at ${(d / k).toFixed(1)}m` +
      (Math.abs(tapped - d) > 0.05 ? ` (tap was ${(tapped / k).toFixed(1)}m)` : '') +
      ` · scale ${k.toFixed(2)} units/m (camera ${(camPos.y - floor).toFixed(2)} units above the floor)`);

    // Models face +Z: aim +Z from the mascot back at the camera. The old math
    // aimed it along the tap ray, i.e. facing away from the photographer.
    facingYaw = Math.atan2(-toPoint.x, -toPoint.z) * (180 / Math.PI);
  }

  spawnPhotoMascot(point, facingYaw);
  if (quiet) return;

  setInstruction('Tap again to move · Snap to save · Flip for selfie', true);
  setTimeout(() => {
    const el = document.getElementById('tap-instruction');
    if (el) el.classList.remove('visible');
  }, 2800);
}

function syncPhotoCharacterButtons() {
  document.querySelectorAll('[data-photo-char]').forEach((btn) => {
    const id = btn.getAttribute('data-photo-char');
    btn.hidden = !isCharacterAvailable(id);
    btn.classList.toggle('active', id === state.photoCharacter);
  });
}

/** Switch character, re-placing (place mode) or re-rendering (selfie) the current one. */
function selectPhotoCharacter(id) {
  if (!isCharacterAvailable(id) || id === state.photoCharacter) {
    syncPhotoCharacterButtons();
    return;
  }
  state.photoCharacter = id;
  fieldLog('photo', `character ${id}`);
  syncPhotoCharacterButtons();
  // Re-place from the original tap rather than swapping the model in place:
  // characters have different distance ranges, and changing gltf-model on the
  // live entity fires model-error for an <a-asset-item> selector (A-Frame
  // 1.5), which left an empty spot where the mascot had been.
  if (state.photoEntity && state.lastTapPoint) {
    placePhotoMascot(state.lastTapPoint, { quiet: true });
  }
  if (state.photoSubmode === 'selfie') applySelfieCharacter();
}

/**
 * The location drops changed (GPS or demo unlock): show or hide Athena. Leaving
 * Little Italy with her selected falls back to Sharkie for the next tap and the
 * selfie overlay; a statue already standing in place mode stays for the photo.
 */
function onDropsChanged() {
  if (!isCharacterAvailable(state.photoCharacter)) {
    state.photoCharacter = CHAR.SHARKIE;
    if (state.photoSubmode === 'selfie') applySelfieCharacter();
  }
  if (!isCharacterAvailable(CHAR.ATHENA)) announceAthena.done = false;
  announceAthena();
  syncPhotoCharacterButtons();
}

/** Once per visit to Little Italy, point out the extra chip. */
function announceAthena() {
  if (state.mode !== MODE.PHOTO || !isCharacterAvailable(CHAR.ATHENA) || announceAthena.done) return;
  announceAthena.done = true;
  flashToast('Athena is here — pick her for a photo', 3500);
}

function syncPhotoSubmodeUi() {
  const flip = document.getElementById('photo-flip-btn');
  if (flip) {
    flip.textContent = state.photoSubmode === 'selfie' ? 'Back Camera' : 'Flip Camera';
  }
  const layer = document.getElementById('sw-selfie-layer');
  if (layer) layer.classList.toggle('visible', state.photoSubmode === 'selfie');

  const root = document.getElementById('photo-root');
  if (root) {
    root.setAttribute('visible',
      state.mode === MODE.PHOTO && state.photoSubmode === 'place' ? 'true' : 'false');
  }
}

function setPhotoUi(on) {
  const bar = document.getElementById('photo-mode-bar');
  if (bar) bar.classList.toggle('visible', on);
  // The two-row photo bar is taller than the drop bar; CSS lifts the hints.
  document.body.classList.toggle('sw-photo-active', on);
  if (on) {
    // Page load only fetches the wayfinding sharks; get the mascots coming now.
    prefetchModels(Object.keys(CHARACTERS)
      .filter(isCharacterAvailable)
      .map((id) => CHARACTERS[id].asset));
    announceAthena();
  } else {
    if (state.photoSubmode === 'selfie') stopSelfieMode();
    state.photoSubmode = 'place';
    clearPhotoMascot();
    state.lastTapPoint = null;
  }
  const root = document.getElementById('photo-root');
  if (root) root.setAttribute('visible', on && state.photoSubmode === 'place' ? 'true' : 'false');
  syncPhotoCharacterButtons();
  syncPhotoSubmodeUi();
}

function disarmSoccer() {
  const soccerRoot = document.getElementById('soccer-root');
  if (soccerRoot && soccerRoot.components && soccerRoot.components['soccer-game']) {
    const game = soccerRoot.components['soccer-game'];
    if (typeof game.resetField === 'function') game.resetField();
  }
  state.soccerArmed = false;

  ['timer', 'score', 'reset-btn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const toast = document.getElementById('toast');
  if (toast) toast.classList.remove('show');
}

function armSoccer() {
  const soccerRoot = document.getElementById('soccer-root');
  if (!soccerRoot) return;
  if (!soccerRoot.components || !soccerRoot.components['soccer-game']) {
    soccerRoot.setAttribute('soccer-game', '');
  } else if (typeof soccerRoot.components['soccer-game'].resetField === 'function') {
    soccerRoot.components['soccer-game'].resetField();
  }
  state.soccerArmed = true;

  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.style.display = '';
}

function setGoalieUi(on) {
  if (on) armSoccer();
  else disarmSoccer();
}

function pauseXr() {
  try {
    if (window.XR8 && typeof window.XR8.pause === 'function') window.XR8.pause();
    fieldLog('xr', 'paused for selfie');
  } catch (e) { fieldLog('warn', `XR8.pause threw: ${e && e.message}`); }
  const scene = document.getElementById('xrscene');
  if (scene) scene.classList.add('sw-xr-paused');
}

function resumeXr() {
  const scene = document.getElementById('xrscene');
  if (scene) scene.classList.remove('sw-xr-paused');
  try {
    if (window.XR8 && typeof window.XR8.resume === 'function') window.XR8.resume();
    fieldLog('xr', 'resumed after selfie');
  } catch (e) { fieldLog('warn', `XR8.resume threw: ${e && e.message}`); }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureSelfieScripts() {
  if (state.selfie.scriptsReady) return;
  if (state.selfie.scriptsLoading) return state.selfie.scriptsLoading;

  state.selfie.scriptsLoading = (async () => {
    // model-viewer as module
    // Sharkie and Sammy are Draco-compressed; decode with the same vendored
    // decoder as the scene instead of model-viewer's default (gstatic). This
    // has to be the global config object, set before the library loads: every
    // <model-viewer> constructor re-applies it (or the gstatic default), so the
    // class's static setter gets undone by the next element.
    window.ModelViewerElement = Object.assign(window.ModelViewerElement || {}, {
      dracoDecoderLocation: new URL('./assets/vendor/draco/', window.location.href).href
    });
    if (!customElements.get('model-viewer')) {
      await import('https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js');
    }
    await loadScript(`${MEDIAPIPE_CAMERA_UTILS_URL}/camera_utils.js`);
    await loadScript(`${MEDIAPIPE_POSE_URL}/pose.js`);
    state.selfie.scriptsReady = true;
  })();

  try {
    await state.selfie.scriptsLoading;
  } finally {
    state.selfie.scriptsLoading = null;
  }
}

function applySelfieCharacter() {
  const viewer = document.getElementById('sw-selfie-viewer');
  if (!viewer) return;
  const c = currentCharacter();
  const src = modelSrc(c.asset);
  if (!src || viewer.getAttribute('src') === src) return;
  // model-viewer fetches the file itself; say so while a big one (Athena) loads.
  const loading = `Loading ${c.label}…`;
  const t0 = performance.now();
  flashToast(loading, 30000);
  const cleanup = () => {
    hideToast(loading);
    viewer.removeEventListener('load', loaded);
    viewer.removeEventListener('error', failed);
  };
  const loaded = () => {
    cleanup();
    fieldLog('selfie', `${c.label} shown on shoulder in ${Math.round(performance.now() - t0)}ms`);
  };
  const failed = (e) => {
    cleanup();
    fieldLog('error', `selfie model failed: ${c.label} ${e && e.detail ? JSON.stringify(e.detail.type || e.detail) : ''}`);
    flashToast(`${c.label} didn't load — check your connection`, 4000);
  };
  viewer.addEventListener('load', loaded);
  viewer.addEventListener('error', failed);
  viewer.setAttribute('src', src);
}

/**
 * Where the video is actually drawn. The preview is `object-fit: cover`, so
 * the camera frame is scaled up and cropped to fill the screen; MediaPipe's
 * normalized landmarks are in *frame* coordinates. Mapping them straight onto
 * the window (the old `lm.x * innerWidth`) was off by the crop, which is what
 * pushed the mascot's head off the top of the screen.
 */
function coverRect(video) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const scale = Math.max(W / vw, H / vh);
  const w = vw * scale;
  const h = vh * scale;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

function onSelfiePoseResults(results) {
  const overlay = document.getElementById('sw-selfie-overlay');
  const viewer = document.getElementById('sw-selfie-viewer');
  const video = document.getElementById('sw-selfie-video');
  if (!overlay || !viewer || !video) return;

  // The hint is only for when there are no shoulders to stand on; once there
  // are, it would just cover the photo.
  setSelfieHint(!results.poseLandmarks);
  logPoseState(!!results.poseLandmarks);
  if (!results.poseLandmarks) {
    overlay.classList.remove('visible');
    state.selfie.lastRect = null;
    return;
  }

  const lm = results.poseLandmarks;
  // Landmark 12 = right shoulder (project convention); 11 = left.
  const left = lm[11];
  const right = lm[12];
  if (!left || !right) return;

  const W = window.innerWidth;
  const H = window.innerHeight;
  const r = coverRect(video);
  // Mirrored preview → flip X.
  const toScreen = (p) => ({ x: r.x + (1 - p.x) * r.w, y: r.y + p.y * r.h });
  const ls = toScreen(left);
  const rs = toScreen(right);

  // Feet on the right shoulder, nudged outward and blended a little toward the
  // mid-shoulder so it doesn't jitter off the edge of the body.
  const footX = (rs.x + state.selfie.xNudge) * 0.75 + ((ls.x + rs.x) / 2) * 0.25;
  const footY = rs.y * 0.75 + ((ls.y + rs.y) / 2) * 0.25;

  // A full-body mascot is taller than wide. Shrink it rather than let the head
  // leave the top of the screen — "head cut off" was the #1 selfie complaint.
  const margin = 8;
  let h = Math.round(H * state.selfie.heightFrac);
  h = Math.min(h, Math.max(140, footY - margin));
  const w = Math.round(h * 0.7);
  let left0 = footX - w / 2;
  let top0 = footY - h;
  left0 = Math.min(Math.max(left0, margin), W - w - margin);
  top0 = Math.min(Math.max(top0, margin), H - h - margin);

  overlay.style.left = `${left0}px`;
  overlay.style.top = `${top0}px`;
  viewer.style.width = `${w}px`;
  viewer.style.height = `${h}px`;
  overlay.classList.add('visible');
  state.selfie.lastRect = { x: left0, y: top0, w, h };
}

/** Field log: first pose, then found/lost changes at most every 2 s. */
function logPoseState(found) {
  const s = state.selfie;
  if (found && !s.firstPoseLogged) {
    s.firstPoseLogged = true;
    fieldLog('selfie', `first pose ${Math.round(performance.now() - (s.startedAt || 0))}ms after camera start`);
  }
  const t = performance.now();
  if (found !== s.poseFound && (!s.poseLoggedAt || t - s.poseLoggedAt > 2000)) {
    s.poseFound = found;
    s.poseLoggedAt = t;
    fieldLog('selfie', found ? 'pose found' : 'pose lost (no shoulders in view)');
  }
}

function setSelfieHint(show) {
  const hint = document.getElementById('sw-selfie-hint');
  if (hint) hint.classList.toggle('visible', show);
}

async function startSelfieMode() {
  setInstruction('Selfie Mode — line up shoulders, then Snap', true);
  flashToast('Starting front camera…');
  setSelfieHint(true);
  const t0 = performance.now();
  fieldLog('selfie', `start (${state.photoCharacter})`);

  try {
    await ensureSelfieScripts();
    fieldLog('selfie', `libraries ready in ${Math.round(performance.now() - t0)}ms`);
  } catch (e) {
    console.warn('Selfie scripts failed', e);
    flashToast('Could not load selfie libraries');
    return;
  }

  pauseXr();
  state.photoSubmode = 'selfie';
  syncPhotoSubmodeUi();
  applySelfieCharacter();

  const video = document.getElementById('sw-selfie-video');
  if (!video) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    state.selfie.stream = stream;
    video.srcObject = stream;
    await video.play();
    const track = stream.getVideoTracks()[0];
    const s = track && track.getSettings ? track.getSettings() : {};
    fieldLog('selfie', `front camera ${s.width}x${s.height} ${s.facingMode || ''} ${s.frameRate ? Math.round(s.frameRate) + 'fps' : ''}`);
  } catch (e) {
    // NotAllowedError = permission; NotReadableError = the camera is still
    // held (by 8th Wall's session); OverconstrainedError = no front camera.
    fieldLog('error', `front camera failed: ${e && e.name}: ${e && e.message}`);
    console.warn('Front camera error', e);
    flashToast('Front camera blocked — check permissions');
    stopSelfieMode();
    return;
  }

  if (typeof Pose === 'undefined' || typeof Camera === 'undefined') {
    fieldLog('error', 'selfie: MediaPipe Pose/Camera missing after load');
    flashToast('Pose tracker unavailable');
    return;
  }
  state.selfie.startedAt = performance.now();
  state.selfie.firstPoseLogged = false;

  const pose = new Pose({
    locateFile: (f) => `${MEDIAPIPE_POSE_URL}/${f}`
  });
  pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  pose.onResults(onSelfiePoseResults);
  state.selfie.pose = pose;

  const camera = new Camera(video, {
    onFrame: async () => {
      if (state.photoSubmode !== 'selfie' || !state.selfie.pose) return;
      try { await state.selfie.pose.send({ image: video }); } catch (e) { /* frame drop */ }
    },
    width: 1280,
    height: 720
  });
  state.selfie.camera = camera;
  try {
    await camera.start();
  } catch (e) {
    fieldLog('error', `selfie: pose camera failed to start: ${e && e.name}: ${e && e.message}`);
    flashToast('Selfie camera failed — try Flip again');
    stopSelfieMode();
    return;
  }
  setInstruction('Selfie Mode — Snap to capture · Flip returns to place', true);
  // Bottom of a selfie is where the visitor is; don't leave text sitting there.
  setTimeout(() => {
    if (state.photoSubmode !== 'selfie') return;
    const el = document.getElementById('tap-instruction');
    if (el) el.classList.remove('visible');
  }, 3000);
}

function stopSelfieMode() {
  fieldLog('selfie', 'stop — back camera');
  try {
    if (state.selfie.camera && typeof state.selfie.camera.stop === 'function') {
      state.selfie.camera.stop();
    }
  } catch (e) { fieldLog('warn', `selfie camera stop threw: ${e && e.message}`); }
  state.selfie.camera = null;
  state.selfie.pose = null;
  state.selfie.lastRect = null;

  if (state.selfie.stream) {
    state.selfie.stream.getTracks().forEach((t) => t.stop());
    state.selfie.stream = null;
  }
  const video = document.getElementById('sw-selfie-video');
  if (video) video.srcObject = null;

  const overlay = document.getElementById('sw-selfie-overlay');
  if (overlay) overlay.classList.remove('visible');
  setSelfieHint(false);

  state.photoSubmode = 'place';
  syncPhotoSubmodeUi();
  resumeXr();
}

async function togglePhotoCamera() {
  if (state.mode !== MODE.PHOTO) return;
  if (state.photoSubmode === 'place') {
    await startSelfieMode();
  } else {
    stopSelfieMode();
    setInstruction('Photo Mode — tap the ground to place your mascot', true);
  }
}

function showPreview(dataUrl) {
  const preview = document.getElementById('sw-photo-preview');
  const img = document.getElementById('sw-photo-preview-img');
  if (!preview || !img) return;
  img.src = dataUrl;
  preview.classList.add('visible');
}

function hidePreview() {
  const preview = document.getElementById('sw-photo-preview');
  if (preview) preview.classList.remove('visible');
}

/**
 * Field log: is the photo actually a picture? Samples it at 16×16 for mean
 * brightness and how much is transparent — a capture that lost the camera
 * feed comes back black or see-through, which only shows up on a phone.
 */
function logCapture(kind, canvas, dataUrl, t0) {
  if (!window.SharksWayLog || !window.SharksWayLog.enabled) return;
  let quality = '';
  try {
    const s = document.createElement('canvas');
    s.width = s.height = 16;
    const ctx = s.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, 16, 16);
    const px = ctx.getImageData(0, 0, 16, 16).data;
    let lum = 0;
    let clear = 0;
    for (let i = 0; i < px.length; i += 4) {
      lum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      if (px[i + 3] < 16) clear++;
    }
    quality = `, brightness ${(lum / 256).toFixed(2)}, transparent ${Math.round(clear / 2.56)}%`;
  } catch (e) {
    quality = `, sample failed: ${e && e.message}`;
  }
  fieldLog('photo', `${kind} capture ${canvas.width}x${canvas.height}, ${Math.round(dataUrl.length * 0.75 / 1024)}KB ` +
    `in ${Math.round(performance.now() - t0)}ms${quality}`);
}

function capturePlaceMode() {
  const scene = document.querySelector('a-scene');
  const canvas = scene && (scene.canvas || scene.querySelector('canvas'));
  if (!canvas) {
    fieldLog('error', 'photo capture: no AR canvas');
    flashToast('AR canvas not ready');
    return;
  }
  const t0 = performance.now();
  try {
    const url = canvas.toDataURL(PHOTO_MIME, PHOTO_QUALITY);
    logCapture('place-mode', canvas, url, t0);
    showPreview(url);
  } catch (e) {
    fieldLog('error', `photo capture failed: ${e && e.name}: ${e && e.message}`);
    console.warn('Place capture failed', e);
    flashToast('Capture failed (try again)');
  }
}

/**
 * Capture what the visitor sees: the cover-cropped, mirrored preview with the
 * mascot where it was drawn. The old capture saved the raw camera frame and
 * stretched the mascot by separate X/Y factors, so the photo never matched the
 * screen.
 */
async function captureSelfieMode() {
  const video = document.getElementById('sw-selfie-video');
  const viewer = document.getElementById('sw-selfie-viewer');
  if (!video || !video.videoWidth) {
    fieldLog('error', 'selfie capture: camera not ready');
    flashToast('Camera not ready');
    return;
  }
  const t0 = performance.now();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const out = document.createElement('canvas');
  out.width = Math.round(W * dpr);
  out.height = Math.round(H * dpr);
  const ctx = out.getContext('2d');
  ctx.scale(dpr, dpr);

  const r = coverRect(video);
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, W - r.x - r.w, r.y, r.w, r.h);
  ctx.restore();

  const rect = state.selfie.lastRect;
  if (rect && viewer && typeof viewer.toDataURL === 'function') {
    try {
      const img = new Image();
      img.src = viewer.toDataURL('image/png');
      await img.decode();
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    } catch (e) {
      fieldLog('error', `selfie mascot capture failed: ${e && e.message}`);
      console.warn('Selfie mascot capture failed', e);
    }
  } else {
    fieldLog('photo', 'selfie capture without a mascot (no shoulders detected at the moment of Snap)');
  }

  const url = out.toDataURL(PHOTO_MIME, PHOTO_QUALITY);
  logCapture('selfie', out, url, t0);
  showPreview(url);
}

function snapPhoto() {
  if (state.mode !== MODE.PHOTO) return;
  const flash = document.getElementById('sw-photo-flash');
  if (flash) {
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 180);
  }
  if (state.photoSubmode === 'selfie') captureSelfieMode();
  else capturePlaceMode();
}

/** File extension for the preview's data URL ("data:image/jpeg;…" → "jpg"). */
function previewExtension(dataUrl) {
  const mime = (dataUrl.match(/^data:([^;,]+)/) || [])[1] || PHOTO_MIME;
  return mime === 'image/png' ? 'png' : 'jpg';
}

function savePreview() {
  const img = document.getElementById('sw-photo-preview-img');
  if (!img || !img.src) return;
  const a = document.createElement('a');
  a.href = img.src;
  a.download = `sharks-way-photo-${Date.now()}.${previewExtension(img.src)}`;
  a.click();
  fieldLog('photo', 'saved (download)');
  hidePreview();
  flashToast('Saved');
}

/** Decode a data URL into a File, synchronously. */
function dataUrlToFile(dataUrl, name) {
  const comma = dataUrl.indexOf(',');
  const mime = (dataUrl.slice(0, comma).match(/^data:([^;,]+)/) || [])[1] || PHOTO_MIME;
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/**
 * No awaits before navigator.share(): Safari only allows it straight out of the
 * tap, and the old `await fetch(dataUrl)` first could cost that permission.
 */
function sharePreview() {
  const img = document.getElementById('sw-photo-preview-img');
  if (!img || !img.src) return;
  let file;
  try {
    file = dataUrlToFile(img.src, `sharks-way-photo.${previewExtension(img.src)}`);
  } catch (e) {
    flashToast('Share failed — use Save');
    return;
  }
  // Desktop browsers often have navigator.share but can't share files; that
  // used to throw into the "user cancelled" catch and do nothing at all.
  if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
    fieldLog('photo', 'share not supported for files on this browser');
    flashToast('Sharing isn\'t supported here — use Save');
    return;
  }
  navigator.share({ files: [file], title: 'Sharks Way Photo' })
    .then(() => fieldLog('photo', 'shared'))
    .catch((e) => {
      fieldLog('photo', `share ended: ${e && e.name}`);
      if (e && e.name !== 'AbortError') flashToast('Share failed — use Save');
    });
}

export function getSharksWayMode() {
  return state.mode;
}

export function setSharksWayMode(mode) {
  if (!Object.values(MODE).includes(mode)) {
    highlightModeButtons(state.mode);
    closeNav();
    return;
  }
  if (mode === state.mode) {
    highlightModeButtons(state.mode);
    closeNav();
    return;
  }

  const prev = state.mode;
  state.mode = mode;

  if (prev === MODE.PHOTO) setPhotoUi(false);
  if (prev === MODE.GOALIE) setGoalieUi(false);
  if (prev === MODE.WAYFINDING) setWayfindingUi(false);

  if (mode === MODE.WAYFINDING) {
    setWayfindingUi(true);
    setInstruction('Point your camera at a painted shark on the sidewalk', true);
    setTimeout(() => {
      const el = document.getElementById('tap-instruction');
      if (el && state.mode === MODE.WAYFINDING) el.classList.remove('visible');
    }, 3500);
  } else if (mode === MODE.PHOTO) {
    setPhotoUi(true);
    setInstruction('Photo Mode — tap the ground to place your mascot', true);
  } else if (mode === MODE.GOALIE) {
    setGoalieUi(true);
    setInstruction('Goalie Mode — tap the ground to place the goal & hockey puck', true);
  }

  highlightModeButtons(mode);
  closeNav();
  window.dispatchEvent(new CustomEvent('sharksWayModeChanged', { detail: { mode, prev } }));
}

function highlightModeButtons(mode) {
  document.querySelectorAll('[data-sw-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-sw-mode') === mode);
  });
}

function onGroundClick(e) {
  if (state.mode !== MODE.PHOTO || state.photoSubmode !== 'place') return;
  const pt = e.detail && e.detail.intersection && e.detail.intersection.point;
  if (!pt) return;
  placePhotoMascot(pt);
}

function injectModeUi() {
  if (document.getElementById('photo-mode-bar')) return;

  // Two rows: who's in the photo, then the camera controls. One row of five
  // chips (with Athena) is wider than a phone.
  const photoBar = document.createElement('div');
  photoBar.id = 'photo-mode-bar';
  photoBar.setAttribute('role', 'toolbar');
  photoBar.setAttribute('aria-label', 'Photo Mode');
  const chips = Object.keys(CHARACTERS).map((id) => `
      <button type="button" data-photo-char="${id}" class="sw-chip${id === state.photoCharacter ? ' active' : ''}"
        ${isCharacterAvailable(id) ? '' : 'hidden'}>${CHARACTERS[id].label}</button>`).join('');
  photoBar.innerHTML = `
    <div class="sw-photo-row">${chips}
    </div>
    <div class="sw-photo-row">
      <button type="button" id="photo-flip-btn" class="sw-chip">Flip Camera</button>
      <button type="button" id="photo-snap-btn" class="sw-chip sw-chip-snap" aria-label="Take photo">Snap</button>
    </div>
  `;
  document.body.appendChild(photoBar);

  // In-page selfie layer (front camera + shoulder mascot). The viewer gets its
  // src from applySelfieCharacter() when the selfie starts.
  const selfie = document.createElement('div');
  selfie.id = 'sw-selfie-layer';
  selfie.innerHTML = `
    <video id="sw-selfie-video" autoplay playsinline muted></video>
    <div id="sw-selfie-overlay">
      <model-viewer id="sw-selfie-viewer"
        camera-orbit="0deg 80deg 105%"
        camera-target="auto auto auto"
        disable-zoom
        disable-pan
        interaction-prompt="none"
        environment-image="neutral"
        shadow-intensity="0"
        style="width:210px;height:300px;background:transparent;--poster-color:transparent;">
      </model-viewer>
    </div>
    <div id="sw-selfie-hint">Step back so your shoulders are visible</div>
  `;
  document.body.appendChild(selfie);

  const flash = document.createElement('div');
  flash.id = 'sw-photo-flash';
  document.body.appendChild(flash);

  const preview = document.createElement('div');
  preview.id = 'sw-photo-preview';
  preview.innerHTML = `
    <div class="sw-preview-card">
      <div class="sw-preview-label">Your Sharks Way Photo</div>
      <img id="sw-photo-preview-img" alt="Captured photo">
      <div class="sw-preview-actions">
        <button type="button" id="sw-photo-retake">Retake</button>
        <button type="button" id="sw-photo-save">Save</button>
        <button type="button" id="sw-photo-share">Share</button>
      </div>
    </div>
  `;
  document.body.appendChild(preview);

  if (!document.getElementById('timer')) {
    const topbar = document.getElementById('topbar');
    if (topbar) {
      topbar.insertAdjacentHTML('beforeend', `
        <span id="timer" class="pill sw-goalie-pill" style="display:none">00:30</span>
        <span id="score" class="pill sw-goalie-pill" style="display:none">Goals 0 / 0</span>
      `);
    }
  }
  if (!document.getElementById('reset-btn')) {
    const btn = document.createElement('button');
    btn.id = 'reset-btn';
    btn.className = 'pill';
    btn.style.display = 'none';
    btn.textContent = 'Reset';
    document.body.appendChild(btn);
  }
  if (!document.getElementById('toast')) {
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
}

function injectNavModeSection() {
  const nav = document.getElementById('nav-menu');
  if (!nav || document.getElementById('sw-mode-section')) return;

  const section = document.createElement('div');
  section.id = 'sw-mode-section';
  section.innerHTML = `
    <h3 class="sw-mode-heading">Sharks Way Modes</h3>
    <button type="button" class="nav-link sw-mode-btn active" data-sw-mode="wayfinding">
      Wayfinding
    </button>
    <button type="button" class="nav-link sw-mode-btn" data-sw-mode="photo">
      Photo Mode
    </button>
    <button type="button" class="nav-link sw-mode-btn" data-sw-mode="goalie">
      Goalie Mode
    </button>
  `;

  const firstLink = nav.querySelector('a.nav-link');
  if (firstLink) nav.insertBefore(section, firstLink);
  else nav.appendChild(section);

  section.querySelectorAll('[data-sw-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setSharksWayMode(btn.getAttribute('data-sw-mode')));
  });
}

function wirePhotoBar() {
  document.querySelectorAll('[data-photo-char]').forEach((btn) => {
    btn.addEventListener('click', () => selectPhotoCharacter(btn.getAttribute('data-photo-char')));
  });

  const flip = document.getElementById('photo-flip-btn');
  if (flip) flip.addEventListener('click', () => { togglePhotoCamera(); });

  const snap = document.getElementById('photo-snap-btn');
  if (snap) snap.addEventListener('click', () => snapPhoto());

  const retake = document.getElementById('sw-photo-retake');
  const save = document.getElementById('sw-photo-save');
  const share = document.getElementById('sw-photo-share');
  if (retake) retake.addEventListener('click', hidePreview);
  if (save) save.addEventListener('click', savePreview);
  if (share) share.addEventListener('click', () => { sharePreview(); });
}

export function initSharksWayModes() {
  injectModeUi();
  injectNavModeSection();
  if (!document.getElementById('sw-mode-section')) {
    let tries = 0;
    const id = setInterval(() => {
      injectNavModeSection();
      if (document.getElementById('sw-mode-section') || ++tries > 20) clearInterval(id);
    }, 50);
  }
  wirePhotoBar();
  highlightModeButtons(MODE.WAYFINDING);

  const ground = document.getElementById('ground');
  if (ground) ground.addEventListener('click', onGroundClick);

  // location-experiences reports which drops GPS has unlocked; Athena rides on hers.
  window.addEventListener('sharksWayDropsChanged', onDropsChanged);

  window.SharksWayMode = {
    get: getSharksWayMode,
    set: setSharksWayMode,
    MODE,
    isWayfinding: () => state.mode === MODE.WAYFINDING,
    isPhoto: () => state.mode === MODE.PHOTO,
    isGoalie: () => state.mode === MODE.GOALIE,
    photoSubmode: () => state.photoSubmode,
    photoCharacter: () => state.photoCharacter,
    selectCharacter: selectPhotoCharacter
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSharksWayModes);
} else {
  initSharksWayModes();
}
