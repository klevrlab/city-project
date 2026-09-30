/**
 * Restart the 8th Wall camera if its feed stalls.
 *
 * Field logs, Sept 29–30 (iPhone): the camera image froze and stayed frozen
 * until the phone was locked and unlocked. Every case followed a native
 * dialog (window.prompt for a note) — those are gone now — but the Share
 * sheet and other system overlays can do the same, and a frozen camera with
 * the 3D still rendering looks like the app hung.
 *
 * The 8th Wall video element comes with `camerastatuschange` (status
 * hasVideo). While the page is visible and AR isn't deliberately paused
 * (selfie mode), its currentTime should keep moving; if it stops for
 * STALL_MS we do what the lock/unlock did — XR8.pause() then XR8.resume(),
 * the same path the selfie flip-back uses — and log it.
 */
const CHECK_MS = 1000;
const STALL_MS = 3000;
const MIN_GAP_MS = 10000;   // never restart more often than this

const log = (category, message) => {
  if (window.SharksWayLog) window.SharksWayLog.add(category, message);
};

let video = null;
let lastTime = -1;
let lastMoved = 0;
let everMoved = false;
let lastRestart = -Infinity;
let restarts = 0;

window.addEventListener('camerastatuschange', (e) => {
  const d = e && e.detail;
  if (d && d.status === 'hasVideo' && d.video) {
    video = d.video;
    lastTime = -1;
    everMoved = false;
    lastMoved = performance.now();
  }
});

function arPausedOnPurpose() {
  const scene = document.getElementById('xrscene');
  return !!(scene && scene.classList.contains('sw-xr-paused'));
}

function restart(stalledMs) {
  const XR8 = window.XR8;
  if (!XR8 || typeof XR8.pause !== 'function' || typeof XR8.resume !== 'function') return;
  lastRestart = performance.now();
  restarts++;
  log('xr', `camera feed stalled ${Math.round(stalledMs / 100) / 10}s — restarting camera (#${restarts})`);
  try {
    XR8.pause();
    setTimeout(() => {
      try { XR8.resume(); } catch (e) { log('warn', `XR8.resume threw: ${e && e.message}`); }
    }, 400);
  } catch (e) {
    log('warn', `XR8.pause threw: ${e && e.message}`);
  }
}

setInterval(() => {
  const now = performance.now();
  if (!video || document.visibilityState !== 'visible' || arPausedOnPurpose()) {
    lastMoved = now;
    return;
  }
  const t = video.currentTime;
  if (t !== lastTime) {
    if (lastTime >= 0) everMoved = true;
    lastTime = t;
    lastMoved = now;
    return;
  }
  // Only act on a feed we have seen running — some browsers never advance
  // currentTime on a camera stream, and restarting those would loop.
  if (!everMoved) return;
  const stalled = now - lastMoved;
  if (stalled >= STALL_MS && now - lastRestart >= MIN_GAP_MS) restart(stalled);
}, CHECK_MS);

window.SharksWayCameraWatchdog = {
  restarts: () => restarts,
  video: () => video
};
