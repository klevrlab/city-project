/**
 * June 10 redline — Sharks Way mode switcher.
 * Wayfinding (default) | Photo Mode | Goalie Mode
 *
 * Photo Mode (real, in-page):
 *  - Place: back-camera XR, tap ground to place Sharkie/Sammy, Snap captures AR frame
 *  - Selfie: Flip Camera → front cam + MediaPipe shoulder mount (no page navigate)
 * Goalie Mode: soccer-game with hard-coded puck (Sharkie in goal).
 */
import '../css/sharks-way-modes.css';

const MODE = {
  WAYFINDING: 'wayfinding',
  PHOTO: 'photo',
  GOALIE: 'goalie'
};

const CHAR = {
  SHARKIE: 'sharkie',
  SAMMY: 'sammy'
};

const CHAR_MODEL = {
  [CHAR.SHARKIE]: '#photo-sharkie',
  [CHAR.SAMMY]: '#photo-sammy'
};

const CHAR_SELFIE_SRC = {
  [CHAR.SHARKIE]: './assets/3D-models/sharkie_final_pose.glb',
  [CHAR.SAMMY]: './assets/3D-models/sammy_final_pose.glb'
};

/** Sharkie / Sammy height in metres. Keep in step with MASCOT_HEIGHT_M in location-experiences.js. */
const MASCOT_HEIGHT_M = 1.9;

/**
 * Farthest a tapped mascot may land. On site, taps toward the horizon put the
 * mascot 10+ m out, where it was small and SLAM drift walked it around ("once
 * placed mascot drifts so hard to get into view"). A few metres away is where a
 * photo with it works anyway.
 */
const PHOTO_MAX_DISTANCE_M = 3.5;
const PHOTO_MIN_DISTANCE_M = 1.2;

const state = {
  mode: MODE.WAYFINDING,
  photoCharacter: CHAR.SHARKIE,
  photoEntity: null,
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

function spawnPhotoMascot(point, facingYaw) {
  const root = document.getElementById('photo-root');
  if (!root) return;
  clearPhotoMascot();
  const model = CHAR_MODEL[state.photoCharacter] || CHAR_MODEL[CHAR.SHARKIE];
  const ent = document.createElement('a-entity');
  ent.setAttribute('gltf-model', model);
  ent.setAttribute('position', `${point.x} 0.02 ${point.z}`);
  ent.setAttribute('rotation', `0 ${facingYaw} 0`);
  // Sharkie is 1.95 m in its GLB and Sammy 2.96 m, and both float above their
  // origin — normalize to a common height so photos frame consistently.
  ent.setAttribute('model-normalize', `height: ${MASCOT_HEIGHT_M}`);
  ent.setAttribute('shadow', 'cast: true');
  root.appendChild(ent);
  state.photoEntity = ent;
}

function placePhotoMascot(tapPoint) {
  const root = document.getElementById('photo-root');
  if (!root || !tapPoint) return;

  clearPhotoMascot();

  // Keep the mascot at photo distance, along the line the visitor tapped.
  const point = new THREE.Vector3(tapPoint.x, 0, tapPoint.z);
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
    d = Math.min(Math.max(d, PHOTO_MIN_DISTANCE_M), PHOTO_MAX_DISTANCE_M);
    point.set(camPos.x + toPoint.x * d, 0, camPos.z + toPoint.z * d);

    // Models face +Z: aim +Z from the mascot back at the camera. The old math
    // aimed it along the tap ray, i.e. facing away from the photographer.
    facingYaw = Math.atan2(-toPoint.x, -toPoint.z) * (180 / Math.PI);
  }

  spawnPhotoMascot(point, facingYaw);

  setInstruction('Tap again to move · Snap to save · Flip for selfie', true);
  setTimeout(() => {
    const el = document.getElementById('tap-instruction');
    if (el) el.classList.remove('visible');
  }, 2800);
}

function syncPhotoCharacterButtons() {
  document.querySelectorAll('[data-photo-char]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-photo-char') === state.photoCharacter);
  });
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
  if (!on) {
    if (state.photoSubmode === 'selfie') stopSelfieMode();
    state.photoSubmode = 'place';
    clearPhotoMascot();
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
  } catch (e) { /* ignore */ }
  const scene = document.getElementById('xrscene');
  if (scene) scene.classList.add('sw-xr-paused');
}

function resumeXr() {
  const scene = document.getElementById('xrscene');
  if (scene) scene.classList.remove('sw-xr-paused');
  try {
    if (window.XR8 && typeof window.XR8.resume === 'function') window.XR8.resume();
  } catch (e) { /* ignore */ }
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
    if (!customElements.get('model-viewer')) {
      await import('https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js');
    }
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
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
  viewer.setAttribute('src', CHAR_SELFIE_SRC[state.photoCharacter] || CHAR_SELFIE_SRC[CHAR.SHARKIE]);
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

async function startSelfieMode() {
  setInstruction('Selfie Mode — line up shoulders, then Snap', true);
  flashToast('Starting front camera…');

  try {
    await ensureSelfieScripts();
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
  } catch (e) {
    console.warn('Front camera error', e);
    flashToast('Front camera blocked — check permissions');
    stopSelfieMode();
    return;
  }

  if (typeof Pose === 'undefined' || typeof Camera === 'undefined') {
    flashToast('Pose tracker unavailable');
    return;
  }

  const pose = new Pose({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`
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
  await camera.start();
  setInstruction('Selfie Mode — Snap to capture · Flip returns to place', true);
}

function stopSelfieMode() {
  try {
    if (state.selfie.camera && typeof state.selfie.camera.stop === 'function') {
      state.selfie.camera.stop();
    }
  } catch (e) { /* ignore */ }
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

function capturePlaceMode() {
  const scene = document.querySelector('a-scene');
  const canvas = scene && (scene.canvas || scene.querySelector('canvas'));
  if (!canvas) {
    flashToast('AR canvas not ready');
    return;
  }
  try {
    showPreview(canvas.toDataURL('image/png'));
  } catch (e) {
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
    flashToast('Camera not ready');
    return;
  }

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
      console.warn('Selfie mascot capture failed', e);
    }
  }

  showPreview(out.toDataURL('image/png'));
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

function savePreview() {
  const img = document.getElementById('sw-photo-preview-img');
  if (!img || !img.src) return;
  const a = document.createElement('a');
  a.href = img.src;
  a.download = `sharks-way-photo-${Date.now()}.png`;
  a.click();
  hidePreview();
  flashToast('Saved');
}

async function sharePreview() {
  const img = document.getElementById('sw-photo-preview-img');
  if (!img || !img.src) return;
  try {
    if (navigator.share) {
      const blob = await (await fetch(img.src)).blob();
      await navigator.share({
        files: [new File([blob], 'sharks-way-photo.png', { type: 'image/png' })],
        title: 'Sharks Way Photo'
      });
    } else {
      flashToast('Share not supported — use Save');
    }
  } catch (e) {
    /* user cancelled */
  }
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
    setInstruction('Sharks appear automatically along Sharks Way — point your camera around', true);
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

  const photoBar = document.createElement('div');
  photoBar.id = 'photo-mode-bar';
  photoBar.innerHTML = `
    <button type="button" data-photo-char="sharkie" class="sw-chip active">Sharkie</button>
    <button type="button" data-photo-char="sammy" class="sw-chip">Sammy</button>
    <button type="button" id="photo-flip-btn" class="sw-chip">Flip Camera</button>
    <button type="button" id="photo-snap-btn" class="sw-chip sw-chip-snap" aria-label="Take photo">Snap</button>
  `;
  document.body.appendChild(photoBar);

  // In-page selfie layer (front camera + shoulder mascot)
  const selfie = document.createElement('div');
  selfie.id = 'sw-selfie-layer';
  selfie.innerHTML = `
    <video id="sw-selfie-video" autoplay playsinline muted></video>
    <div id="sw-selfie-overlay">
      <model-viewer id="sw-selfie-viewer"
        src="./assets/3D-models/sharkie_final_pose.glb"
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
    btn.addEventListener('click', () => {
      state.photoCharacter = btn.getAttribute('data-photo-char');
      syncPhotoCharacterButtons();
      // Replace the mascot in place. Changing gltf-model on the live entity
      // fires model-error for an <a-asset-item> selector (A-Frame 1.5), which
      // left an empty spot where the mascot had been.
      if (state.photoEntity) {
        const o = state.photoEntity.object3D;
        spawnPhotoMascot(o.position.clone(), THREE.MathUtils.radToDeg(o.rotation.y));
      }
      if (state.photoSubmode === 'selfie') applySelfieCharacter();
    });
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

  window.SharksWayMode = {
    get: getSharksWayMode,
    set: setSharksWayMode,
    MODE,
    isWayfinding: () => state.mode === MODE.WAYFINDING,
    isPhoto: () => state.mode === MODE.PHOTO,
    isGoalie: () => state.mode === MODE.GOALIE,
    photoSubmode: () => state.photoSubmode
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSharksWayModes);
} else {
  initSharksWayModes();
}
