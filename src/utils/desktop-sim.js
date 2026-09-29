/**
 * Desktop simulation mode — `?desktop=1`
 *
 * 8th Wall needs a phone: SLAM and the camera feed have no desktop equivalent,
 * and XRExtras covers the page with a "scan this QR code" wall instead. But
 * everything *around* XR — GLB loading, model sizing, geofence logic, the plant
 * anchors, placement overrides — is ordinary A-Frame and runs fine on a laptop.
 *
 * This module makes that testable:
 *   - clears the XRExtras desktop QR/loading overlays
 *   - gives the camera WASD + mouse-look so you can walk the planted layout
 *   - drops a reference grid and horizon so "on the ground" is legible
 *   - fakes navigator.geolocation so geofences fire where you say they do
 *
 * What it does NOT simulate: SLAM drift, real-world lighting, phone GPU limits,
 * or how content sits against an actual street. Walk the corridor for those.
 *
 * URL params:
 *   ?desktop=1              enable, standing at the Little Italy corridor
 *   &at=littleitaly|athena|tower|river|sap|underpass    start at a named pin
 *   &lat=37.3354&lng=-121.8974                      start at explicit coords
 *
 * Console: SimGps.teleport('tower'), SimGps.set(lat, lng), SimGps.where()
 */

const PINS = {
  littleitaly: { lat: 37.335333, lng: -121.897389, label: 'Little Italy (Athena, near the overpass)' },
  athena: { lat: 37.335333, lng: -121.897389, label: 'Athena drop' },
  tower: { lat: 37.335417, lng: -121.897889, label: 'Leaning Tower (western corner)' },
  underpass: { lat: 37.335391, lng: -121.896682, label: 'Underpass Jump' },
  river: { lat: 37.334664, lng: -121.899474, label: 'River Jump' },
  sap: { lat: 37.334111, lng: -121.900472, label: 'SAP Center party' },
  finale: { lat: 37.334111, lng: -121.900472, label: 'SAP Center party' }
};

const params = new URLSearchParams(window.location.search);
const enabled = params.get('desktop') === '1' || params.get('sim') === '1';

if (enabled) {
  installFakeGps();
  installFakeCompass();
  document.addEventListener('DOMContentLoaded', () => {
    setupScene();
    killXrOverlays();
  });
  console.log('[desktop-sim] active — WASD to walk, drag to look, SimGps.teleport(name)');
}

// ---- fake geolocation -------------------------------------------------------

function installFakeGps() {
  const start = startPin();
  const state = { lat: start.lat, lng: start.lng, watchers: new Map(), nextId: 1 };

  const fix = () => ({
    coords: {
      latitude: state.lat,
      longitude: state.lng,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null
    },
    timestamp: Date.now()
  });

  // Replacing the whole object: navigator.geolocation's own methods are
  // non-configurable in some browsers, so patching in place can throw.
  const fake = {
    getCurrentPosition: (ok) => setTimeout(() => ok(fix()), 30),
    watchPosition: (ok) => {
      const id = state.nextId++;
      state.watchers.set(id, ok);
      setTimeout(() => ok(fix()), 30);
      // A real watchPosition keeps streaming; code that retries on each fix
      // would otherwise stall here and look like a bug that only exists in sim.
      const iv = setInterval(() => {
        if (!state.watchers.has(id)) return clearInterval(iv);
        ok(fix());
      }, 1000);
      return id;
    },
    clearWatch: (id) => state.watchers.delete(id)
  };

  try {
    Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true });
  } catch (e) {
    console.warn('[desktop-sim] could not replace navigator.geolocation', e);
    return;
  }

  const broadcast = () => state.watchers.forEach((cb) => cb(fix()));

  window.SimGps = {
    pins: PINS,
    set(lat, lng) {
      state.lat = lat;
      state.lng = lng;
      broadcast();
      return this.where();
    },
    teleport(name) {
      const pin = PINS[String(name).toLowerCase()];
      if (!pin) {
        console.warn('[desktop-sim] unknown pin', name, '— try', Object.keys(PINS).join(', '));
        return null;
      }
      return this.set(pin.lat, pin.lng);
    },
    /** Nudge position by metres, to walk in or out of a geofence. */
    nudge(northM, eastM) {
      state.lat += (northM || 0) / 111320;
      state.lng += (eastM || 0) / (111320 * Math.cos(state.lat * Math.PI / 180));
      broadcast();
      return this.where();
    },
    where: () => ({ lat: state.lat, lng: state.lng })
  };
}

/**
 * A laptop has no magnetometer, so geo placement would always fall back to
 * camera-relative and never get exercised. Emit a synthetic absolute heading;
 * SimCompass.set() moves it to test misalignment.
 */
function installFakeCompass() {
  // &nocompass=1 simulates a phone that never yields a heading — permission
  // denied, or a magnetometer that won't settle. Exercises the fallback.
  if (params.get('nocompass') === '1') {
    console.log('[desktop-sim] compass suppressed (&nocompass=1)');
    window.SimCompass = { set: () => null, get: () => null, suppressed: true };
    return;
  }

  // Default to the corridor bearing toward SAP. Note params.get returns null
  // when absent and Number(null) is 0, which is a perfectly finite wrong answer.
  let heading = params.has('heading') ? Number(params.get('heading')) : NaN;
  if (!isFinite(heading)) heading = 87;

  const emit = () => {
    const e = new Event('deviceorientationabsolute');
    e.absolute = true;
    e.alpha = (360 - heading) % 360;
    e.beta = 0;
    e.gamma = 0;
    window.dispatchEvent(e);
  };

  setInterval(emit, 500);
  setTimeout(emit, 200);

  window.SimCompass = {
    set(deg) {
      heading = ((deg % 360) + 360) % 360;
      emit();
      return heading;
    },
    get: () => heading
  };
}

function startPin() {
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (isFinite(lat) && isFinite(lng) && lat && lng) return { lat, lng };
  return PINS[String(params.get('at') || 'littleitaly').toLowerCase()] || PINS.littleitaly;
}

// ---- scene ------------------------------------------------------------------

function setupScene() {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  const apply = () => {
    const cam = document.getElementById('camera');
    if (cam) {
      // xrweb normally drives the camera; with no XR session it never does.
      cam.setAttribute('look-controls', 'pointerLockEnabled: false; touchEnabled: true');
      cam.setAttribute('wasd-controls', 'acceleration: 40; fly: false');
      cam.setAttribute('position', '0 1.6 0');
    }

    // A shadow-shader ground is invisible without a camera feed behind it, so
    // give the desktop view something to read scale and motion against.
    if (!document.getElementById('sim-grid')) {
      // Lines, not a filled plane. An opaque 200 m plane at ground level drew
      // over the lower half of anything standing on it, which read as "the
      // model is sunk into the floor" when the model was in fact sitting
      // exactly on y=0. A GridHelper writes no fill, so it cannot hide content.
      const grid = document.createElement('a-entity');
      grid.setAttribute('id', 'sim-grid');
      const helper = new THREE.GridHelper(200, 100, 0x2f5063, 0x1d3542);
      helper.position.y = 0.005;
      grid.setObject3D('grid', helper);
      scene.appendChild(grid);

      // 1 m reference cube at the origin — every size claim checks against this.
      const ref = document.createElement('a-box');
      ref.setAttribute('id', 'sim-ref-cube');
      ref.setAttribute('width', 1);
      ref.setAttribute('height', 1);
      ref.setAttribute('depth', 1);
      ref.setAttribute('position', '2 0.5 -3');
      ref.setAttribute('material', 'color: #00e5ff; opacity: 0.55; transparent: true; wireframe: true');
      scene.appendChild(ref);

      const label = document.createElement('a-text');
      label.setAttribute('value', '1m reference');
      label.setAttribute('align', 'center');
      label.setAttribute('width', 3);
      label.setAttribute('color', '#00e5ff');
      label.setAttribute('position', '2 1.25 -3');
      scene.appendChild(label);
    }

    if (scene.renderer) scene.renderer.setClearColor(new THREE.Color('#0a1116'), 1);
    const sky = document.createElement('a-sky');
    sky.setAttribute('color', '#0a1116');
    sky.setAttribute('id', 'sim-sky');
    if (!document.getElementById('sim-sky')) scene.appendChild(sky);
  };

  if (scene.hasLoaded) apply();
  else scene.addEventListener('loaded', apply, { once: true });

  // XR content plants on 'realityready', which never fires without a session.
  setTimeout(() => window.dispatchEvent(new CustomEvent('realityready')), 1200);
}

/** Strip the XRExtras "open on your phone" QR wall and loading screens. */
function killXrOverlays() {
  const sweep = () => {
    // The desktop QR wall is #loadingContainer; #almostthereContainer is the
    // "unsupported browser" screen. Both are XRExtras, both cover the scene.
    document.querySelectorAll(
      '#loadingContainer, #almostthereContainer, .xrextras-loading-container,' +
      '#loadBackground, #requestingCameraPermissions, #cameraPermissionsErrorApple,' +
      '#cameraPermissionsError, #motionPermissionsErrorApple, #deviceMotionErrorApple'
    ).forEach((el) => el.remove());

    // Ids have moved between XRExtras versions — also sweep any of our own
    // top-level siblings that blanket the viewport and hold no canvas.
    document.querySelectorAll('body > div').forEach((el) => {
      if (el.id === 'dbg-root' || el.id === 'topbar' || el.id === 'tap-instruction') return;
      if (el.id === 'location-status') return;
      const cs = window.getComputedStyle(el);
      const floating = cs.position === 'fixed' || cs.position === 'absolute';
      const coversPage = floating &&
        el.offsetWidth >= window.innerWidth * 0.9 &&
        el.offsetHeight >= window.innerHeight * 0.9;
      if (coversPage && !el.querySelector('canvas')) el.remove();
    });
  };
  sweep();
  const t = setInterval(sweep, 500);
  setTimeout(() => clearInterval(t), 12000);
}

export default { PINS, enabled };
