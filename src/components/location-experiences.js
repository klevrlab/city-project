/**
 * Sept 28 "final touches" — location drops are tap-to-place, never automatic.
 *
 * Rhonda, after the on-site walk: "No More Automatic Location Based Placements
 * (too unreliable)". Everything this component used to plant on a geofence —
 * the eight Little Italy statues, the tower, the three jumps, the finale — was
 * placed from GPS + compass, and downtown GPS (±5–15 m) and phone magnetometers
 * (±10–20°) put it in the wrong place often enough to read as broken.
 *
 * Now GPS only decides which extra drops are *offered*. The visitor picks one
 * from the bar at the bottom of the screen and taps the ground, and the content
 * lands where they tapped. No compass, no coordinates in the placement itself.
 *
 *   Anywhere         Shark (the looping Jimmy — shark-animator owns that drop)
 *   Little Italy     Athena statue, Leaning Tower of Pisa
 *   Guadalupe River  River jump
 *   SAP Center       Party: dancing mascots + circling sharks + jumping shark,
 *                    with the visitor in the middle of the circle
 *
 * `?demoLocations=1` offers every drop regardless of GPS; in the desktop sim,
 * `&at=littleitaly|river|finale` fakes standing at one.
 *
 * The heavy models behind these drops load on demand (model-assets.js): they
 * start downloading when the visitor comes within range, so most taps land on
 * a model that's already there.
 */
import { prefetchModels } from '../utils/model-assets.js';

/** Field log (assets/js/sharks-way-log.js) — a no-op unless ?debug=1 or ?log=1. */
const fieldLog = (category, message) => {
  if (window.SharksWayLog) window.SharksWayLog.add(category, message);
};

/** World y of the floor under the visitor now — y = 0 until tracking drifts. */
const floorY = () => (window.MathUtils && window.MathUtils.floorY ? window.MathUtils.floorY() : 0);

/**
 * Real-world sizes, in metres. Models are normalized to these on load (see
 * model-normalize.js) — none of the source GLBs share a unit convention.
 */
const STATUE_HEIGHT_M = 2.5;   // marble statue — taller than a person, under a storey
const MASCOT_HEIGHT_M = 1.9;   // Sharkie / Sammy — person-scale. Keep in step with sharks-way-modes.js.
const SHARK_MAX_DIM_M = 3.0;   // sharks are long and low, so pin the longest axis
const TOWER_HEIGHT_M = 8;      // the June 10 redline's 8 m / 26 ft replica
/**
 * The jump. Sept 28–29 it was "too high to see" — the baked clip climbed
 * 12.6 m. Cut to a 2 m shark peaking 0.7 m up (nose ~1.35 m), Sept 30 on site
 * said it "could honestly be higher". The clip turns the shark almost vertical
 * at the top, so its *length* adds to the apex: 2.5 m long with the body's
 * centre at 1.6 m clears the water completely, tail and all, and puts the nose
 * ~2.4 m up (desktop sim) — a head above a person, still in the middle of a
 * portrait frame at the 8 m minimum drop.
 */
const JUMP_SHARK_MAX_DIM_M = 2.5;
const JUMP_APEX_HEIGHT_M = 1.6;
// Sept 30 evening, "can we make it higher" was marked with the camera reading ~4 m above
// a floor that had sunk (MathUtils.trackGround now re-bases it), i.e. looked
// down on from above. Left at 1.6; `&jumpApex=2.2` tries a height on site.
const JUMP_RUN_M = 10;          // swim in, breach, swim off: ~10 m across the view

/**
 * How close counts as "near" a location. Downtown GPS wanders 5–15 m, so this
 * is deliberately generous: a visitor standing at the spot must never be told
 * it isn't there.
 */
const NEAR_RADIUS_M = 75;

/**
 * Once near, stay near until this much farther out. Without it, a visitor
 * standing at the edge of the radius had the drop bar appear and vanish (and
 * the "pick a drop" hint re-fire) every time the fix wandered a few metres.
 */
const NEAR_EXIT_MARGIN_M = 25;

/**
 * The Pisa GLB is handed the wrong way round for us, so it gets mirrored on X.
 * Flip this to false, or hit MIRROR X in the debug panel and SAVE, to undo.
 */
const TOWER_MIRROR_X = true;

/**
 * Height of the river's surface relative to the ground the visitor stands on.
 * The jump treats the ground they tap as the water: the shark breaches out of
 * the floor where they tapped, no guess at how far below the bridge the real
 * river is. (Sept 29 log: taps landed 1.2–2.9 m out and the jump cleared the
 * visitor's head; MIN_DROP_DISTANCE_M and JUMP_APEX_HEIGHT_M handle that.)
 * `&waterY=-3` still drops the water plane for experimenting on site.
 */
const RIVER_WATER_Y_M = 0;

/**
 * SAP party: "User is in 'center' of party". The June spec's 30 m finale ring
 * put the sharks so far out they read as specks; around a visitor it has to be
 * close enough to see and still clear their head.
 */
const PARTY_CIRCLE_RADIUS_M = 8;
const PARTY_CIRCLE_PERIOD_MS = 20000;  // ~2.5 m/s at 8 m
const PARTY_DURATION_MS = 45000;

/** Texture cap for the statue — Athena ships with 4K+ maps that crash older phones. */
const STATUE_MAX_TEXTURE_PX = 1024;

/** A tap this far out still lands, but pulled in — far drops are tiny and drift. */
const MAX_DROP_DISTANCE_M = 25;

/**
 * …and a tap this close is pushed out along the same line, so the visitor is
 * never standing inside what they dropped. Only a floor: the Sept 30 corridor
 * run had every tower land at exactly 12 m, "visibly offset forward from my
 * tapping point" — the old 12 m minimum overrode ordinary taps (and drifted
 * tracking made taps land short, see MathUtils.trackGround). 4 m keeps the
 * tower's base clear of the visitor; they can step back to see the top.
 */
const MIN_DROP_DISTANCE_M = { athena: 3, tower: 4, river: 8, party: 3 };

/**
 * Where each drop is offered. Coordinates from Rhonda's Sept 28 notes; the
 * river pin is the June spec's bridge railing.
 */
const LOCATIONS = [
  {
    id: 'littleitaly',
    label: 'Little Italy',
    pins: [
      { lat: 37.335333, lng: -121.897389 },   // Athena, near the overpass (37°20'07.2"N 121°53'50.6"W)
      { lat: 37.335417, lng: -121.897889 }    // Tower, western corner (37°20'07.5"N 121°53'52.4"W)
    ],
    drops: ['athena', 'tower']
  },
  {
    id: 'river',
    label: 'Guadalupe River',
    pins: [{ lat: 37.334664, lng: -121.899474 }],
    drops: ['river']
  },
  {
    id: 'sap',
    label: 'SAP Center',
    pins: [{ lat: 37.334111, lng: -121.900472 }],   // 37°20'02.8"N 121°54'01.7"W
    drops: ['party']
  }
];

const DROP_LABELS = {
  shark: 'Shark',
  athena: 'Athena',
  tower: 'Leaning Tower',
  river: 'River Jump',
  party: 'Drop a Party'
};

const DROP_HINTS = {
  shark: 'Tap the ground to drop a shark',
  athena: 'Tap the ground to place Athena',
  tower: 'Tap the ground to place the Leaning Tower',
  river: 'Aim at the water and tap to make a shark jump',
  party: 'Tap the ground to drop a party'
};

/**
 * Lazy asset ids (model-assets.js) each drop needs. The party's Maria and
 * Jimmy reuse the wayfinding swimmers, which the page already loaded.
 */
const DROP_MODELS = {
  athena: ['athena-point-right'],
  tower: ['leaning-tower-model'],
  river: ['diving-shark'],
  party: ['diving-shark', 'circle-stella', 'photo-sharkie', 'photo-sammy']
};

/** One splash droplet: thrown up, falls back, fades. Local units = metres. */
AFRAME.registerComponent('splash-drop', {
  schema: {
    vx: { type: 'number', default: 0 },
    vy: { type: 'number', default: 2.5 },
    vz: { type: 'number', default: 0 },
    life: { type: 'number', default: 900 }   // ms
  },
  init: function () { this.t = 0; },
  tick: function (time, delta) {
    if (!delta) return;
    this.t += delta;
    const t = this.t / 1000;
    const d = this.data;
    this.el.object3D.position.set(d.vx * t, Math.max(0, d.vy * t - 4.9 * t * t), d.vz * t);
    const mesh = this.el.getObject3D('mesh');
    if (mesh && mesh.material) mesh.material.opacity = Math.max(0, 0.9 * (1 - this.t / d.life));
    if (this.t > d.life) this.el.object3D.visible = false;
  }
});

AFRAME.registerComponent('location-experiences', {
  schema: {
    nearRadiusM: { type: 'number', default: NEAR_RADIUS_M }
  },

  init: function () {
    this.watchId = null;
    this.locations = LOCATIONS;
    this.userLat = null;
    this.userLng = null;
    this.accuracy = null;
    this.selected = 'shark';
    this.available = ['shark'];
    this.nearIds = new Set();  // locations currently "near", for the exit margin
    this.nearLabel = null;
    this.placed = {};          // drop id -> root entity, for drops that stay put
    this.partyTimer = null;
    this.jumpBusy = false;
    this.statusEl = null;
    this.barEl = null;

    const params = new URLSearchParams(window.location.search);
    // ?test=1 is the at-home test run (test-run.js): every drop, no GPS needed.
    this.unlockAll = params.get('demoLocations') === '1' || params.get('demo') === 'locations' ||
      params.get('test') === '1';
    const waterY = parseFloat(params.get('waterY'));
    this.riverWaterY = isFinite(waterY) ? waterY : RIVER_WATER_Y_M;
    const apex = parseFloat(params.get('jumpApex'));
    this.jumpApexM = apex > 0 && apex < 10 ? apex : JUMP_APEX_HEIGHT_M;

    if (this.el.sceneEl.hasLoaded) this.start();
    else this.el.sceneEl.addEventListener('loaded', () => this.start(), { once: true });
  },

  start: function () {
    // Keeps #ground under the visitor's feet as 8th Wall's height drifts
    // (MathUtils.trackGround) — every drop below lands at floorY(), not y = 0.
    if (window.MathUtils && window.MathUtils.trackGround) {
      window.MathUtils.trackGround(document.getElementById('camera'), document.getElementById('ground'));
    }
    this.watchCalibration();
    this.ensureStatusUi();
    this.ensureDropBar();

    const ground = document.getElementById('ground');
    if (ground) ground.addEventListener('click', (e) => this.onGroundTap(e));

    // Photo / Goalie own the ground tap and the bottom of the screen.
    window.addEventListener('sharksWayModeChanged', () => this.renderDropBar());

    // Console / debug-panel helpers: drop without GPS or a tap.
    window.SharksWayDrops = {
      selected: () => this.selected,
      available: () => this.available.slice(),
      select: (id) => this.select(id),
      dropAhead: (id, distanceM) => this.dropAhead(id || this.selected, distanceM),
      clear: () => this.clearAll(),
      partyActive: () => !!document.querySelector('[data-drop-root="party"]')
    };

    this.startGpsWhenReady();
    this.refreshAvailable();
  },

  /**
   * GPS only gates what's offered, so it can start as soon as the scene
   * exists. realityready is the usual moment, with a timer for the iOS /
   * WebView paths where that event has already gone by.
   */
  startGpsWhenReady: function () {
    this.startGps();
    window.addEventListener('realityready', () => this.startGps(), { once: true });
    setTimeout(() => this.startGps(), 4000);
  },

  ensureStatusUi: function () {
    if (document.getElementById('location-status')) {
      this.statusEl = document.getElementById('location-status');
      return;
    }
    const el = document.createElement('div');
    el.id = 'location-status';
    el.setAttribute('aria-live', 'polite');
    el.textContent = 'Location: waiting for GPS…';
    document.body.appendChild(el);
    this.statusEl = el;
  },

  setStatus: function (text) {
    if (!this.statusEl) this.ensureStatusUi();
    if (this.statusEl) this.statusEl.textContent = text;
  },

  startGps: function () {
    if (!('geolocation' in navigator)) {
      this.setStatus('Location: GPS unavailable');
      return;
    }
    if (this.watchId != null) return;
    this.setStatus('Location: acquiring GPS…');
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onGps(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      (err) => {
        console.warn('[location-experiences] GPS', err && err.code, err && err.message);
        // 1 = permission denied (stays that way); 2 / 3 = no fix yet or a
        // timeout, and watchPosition keeps trying — not "blocked".
        if (err && err.code === 1) {
          this.setStatus('Location off — allow it for the Little Italy, river & SAP drops');
        } else if (this.userLat == null) {
          this.setStatus('Location: searching for GPS…');
        }
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 }
    );
  },

  haversineM: function (lat1, lng1, lat2, lng2) {
    if (window.MathUtils && window.MathUtils.haversineMeters) {
      return window.MathUtils.haversineMeters(lat1, lng1, lat2, lng2);
    }
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  /** Distance to the nearest pin of a location, in metres. */
  distanceTo: function (loc, lat, lng) {
    return Math.min(...loc.pins.map((p) => this.haversineM(lat, lng, p.lat, p.lng)));
  },

  onGps: function (lat, lng, accuracy) {
    this.userLat = lat;
    this.userLng = lng;
    this.accuracy = accuracy;
    this.logFix(lat, lng, accuracy);
    this.refreshAvailable();
  },

  /** A fix every 15 s, or sooner after moving 10 m or a big accuracy change. */
  logFix: function (lat, lng, accuracy) {
    const t = performance.now();
    const last = this._lastLoggedFix;
    const moved = last ? this.haversineM(last.lat, last.lng, lat, lng) : Infinity;
    if (last && t - last.t < 15000 && moved < 10 && Math.abs((accuracy || 0) - (last.acc || 0)) < 10) return;
    this._lastLoggedFix = { t, lat, lng, acc: accuracy };
    fieldLog('gps', `${lat.toFixed(6)},${lng.toFixed(6)} ±${Math.round(accuracy || 0)}m`);
  },

  /** Recompute which drops are on offer from the latest fix. */
  refreshAvailable: function () {
    const available = ['shark'];
    let near = null;
    let nearest = null;

    LOCATIONS.forEach((loc) => {
      const d = this.userLat == null ? Infinity : this.distanceTo(loc, this.userLat, this.userLng);
      if (!nearest || d < nearest.d) nearest = { loc, d };
      const radius = this.data.nearRadiusM + (this.nearIds.has(loc.id) ? NEAR_EXIT_MARGIN_M : 0);
      const isNear = d <= radius;
      if (isNear) this.nearIds.add(loc.id);
      else this.nearIds.delete(loc.id);
      if (this.unlockAll || isNear) {
        loc.drops.forEach((id) => available.push(id));
        if (isNear) near = loc;
      }
    });

    const changed = available.join() !== this.available.join();
    this.available = available;
    this.nearLabel = near ? near.label : null;
    if (!available.includes(this.selected)) this.selected = 'shark';
    // Start downloading what's on offer now, so the tap doesn't wait on it.
    if (changed) available.forEach((id) => prefetchModels(DROP_MODELS[id]));

    const acc = typeof this.accuracy === 'number' ? ` ±${Math.round(this.accuracy)}m` : '';
    if (this.userLat == null) {
      this.setStatus(this.unlockAll ? 'Demo: all drops unlocked' : 'Location: acquiring GPS…');
    } else if (near) {
      this.setStatus(`Near ${near.label}${acc}`);
    } else if (nearest) {
      this.setStatus(`${nearest.loc.label} ${Math.round(nearest.d)}m${acc}`);
    }

    if (changed) {
      if (this.userLat != null) {
        fieldLog('loc', `${near ? 'near ' + near.label : 'not near a location'} · ` +
          LOCATIONS.map((l) => `${l.id} ${Math.round(this.distanceTo(l, this.userLat, this.userLng))}m`).join(', '));
      }
      this.renderDropBar();
      if (near) this.flashHint(`${near.label} — pick a drop below, then tap the ground`);
      // Photo Mode offers Athena only here; it listens for this.
      window.dispatchEvent(new CustomEvent('sharksWayDropsChanged', {
        detail: { available: available.slice() }
      }));
    }
  },

  // ---- Drop picker ----------------------------------------------------------

  ensureDropBar: function () {
    if (document.getElementById('drop-bar')) {
      this.barEl = document.getElementById('drop-bar');
      return;
    }
    const bar = document.createElement('div');
    bar.id = 'drop-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Choose what to drop');
    document.body.appendChild(bar);
    this.barEl = bar;
    this.renderDropBar();
  },

  renderDropBar: function () {
    const bar = this.barEl;
    if (!bar) return;
    const wayfinding = !window.SharksWayMode || window.SharksWayMode.isWayfinding();
    // Only worth a bar when there is a choice to make.
    const show = wayfinding && this.available.length > 1;
    bar.classList.toggle('visible', show);
    if (!show) return;

    bar.innerHTML = this.available.map((id) => `
      <button type="button" class="sw-chip${id === this.selected ? ' active' : ''}"
        data-drop="${id}">${DROP_LABELS[id]}</button>`).join('');
    bar.querySelectorAll('[data-drop]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(btn.getAttribute('data-drop'));
      });
    });
  },

  select: function (id) {
    if (!this.available.includes(id)) return false;
    this.selected = id;
    this.renderDropBar();
    this.flashHint(DROP_HINTS[id]);
    return true;
  },

  /**
   * Real-world scale (xrweb="scale: absolute") measures scale from the phone's
   * motion before it's ready — 8th Wall reports tracking LIMITED, reason
   * INITIALIZING, until then. Without a nudge people stand still and wait.
   * Only reacts to a status it actually receives, so if this build never
   * sends one nothing is shown.
   */
  watchCalibration: function () {
    let shown = false;
    const onStatus = (e) => {
      const d = (e && e.detail) || {};
      const calibrating = d.status === 'LIMITED' && d.reason === 'INITIALIZING';
      if (calibrating && !shown) {
        shown = true;
        this.flashHint('Move your phone slowly side to side to get started', 20000);
      } else if (d.status === 'NORMAL' && shown) {
        shown = false;
        const el = document.getElementById('tap-instruction');
        if (el) el.classList.remove('visible');
        fieldLog('xr', 'tracking ready (real-world scale)');
      }
    };
    window.addEventListener('realitytrackingstatus', onStatus);
    window.addEventListener('trackingstatus', onStatus);
  },

  flashHint: function (text, ms = 3500) {
    const el = document.getElementById('tap-instruction');
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => el.classList.remove('visible'), ms);
  },

  // ---- Tap handling ---------------------------------------------------------

  onGroundTap: function (e) {
    if (window.SharksWayMode && !window.SharksWayMode.isWayfinding()) return;
    // 'shark' is shark-animator's drop; it reads SharksWayDrops.selected().
    if (this.selected === 'shark') return;
    let pt = e.detail && e.detail.intersection && e.detail.intersection.point;
    if (!pt) return;
    if (this.selected === 'river') pt = this.onWater(pt);
    const k = this.unitsPerMetre();
    this.drop(this.selected, this.clampDrop(pt, this.selected, k), k);
  },

  /**
   * Scene units per real metre right now (MathUtils.unitsPerMetre): 8th Wall's
   * default scale isn't metric, so every size and distance below — written in
   * metres — is multiplied by this at the moment of the drop.
   */
  unitsPerMetre: function () {
    const cam = document.getElementById('camera');
    return window.MathUtils && window.MathUtils.unitsPerMetre
      ? window.MathUtils.unitsPerMetre(cam) : 1;
  },

  /**
   * Where the tap's line of sight meets the water, not the pavement. The water
   * is below the ground plane, so the tap ray crosses the floor well short of it.
   */
  onWater: function (groundPoint) {
    const cam = document.getElementById('camera');
    if (!cam || !(this.riverWaterY < 0)) return groundPoint;
    const y = groundPoint.y + this.riverWaterY;
    const c = cam.object3D.getWorldPosition(new THREE.Vector3());
    const d = new THREE.Vector3().subVectors(groundPoint, c);
    if (d.y >= -1e-3) return groundPoint;
    return c.addScaledVector(d, (y - c.y) / d.y);
  },

  /**
   * Keep a drop between its minimum distance and MAX_DROP_DISTANCE_M from the
   * visitor, along the line they tapped. Returns a point on the floor.
   */
  clampDrop: function (point, id, k = 1) {
    const cam = document.getElementById('camera');
    const floor = floorY();
    if (!cam) return new THREE.Vector3(point.x, floor, point.z);
    const origin = cam.object3D.getWorldPosition(new THREE.Vector3());
    const flat = new THREE.Vector3(point.x - origin.x, 0, point.z - origin.z);
    const d = flat.length();
    const min = (MIN_DROP_DISTANCE_M[id] || 0) * k;
    let target = Math.min(Math.max(d, min), MAX_DROP_DISTANCE_M * k);
    if (d < 0.01) {
      // Straight down at the feet: go the way the visitor is facing.
      if (window.MathUtils) window.MathUtils.cameraForward(cam, flat);
      else flat.set(0, 0, -1);
      target = Math.max(min, 0);
    } else {
      flat.divideScalar(d);
    }
    return new THREE.Vector3(origin.x + flat.x * target, floor, origin.z + flat.z * target);
  },

  /** Drop at a point straight ahead — for the debug panel and console. */
  dropAhead: function (id, distanceM) {
    const cam = document.getElementById('camera');
    if (!cam || !window.MathUtils) return false;
    const origin = cam.object3D.getWorldPosition(new THREE.Vector3());
    const fwd = window.MathUtils.cameraForward(cam);
    const k = this.unitsPerMetre();
    const d = (distanceM || (id === 'tower' ? 14 : id === 'river' ? 10 : 5)) * k;
    this.drop(id, new THREE.Vector3(origin.x + fwd.x * d, floorY(), origin.z + fwd.z * d), k);
    return true;
  },

  drop: function (id, point, k = this.unitsPerMetre()) {
    const cam = document.getElementById('camera');
    const from = cam ? cam.object3D.getWorldPosition(new THREE.Vector3()) : null;
    fieldLog('drop', `${id}` + (from
      ? ` ${(Math.hypot(point.x - from.x, point.z - from.z) / k).toFixed(1)}m from camera` +
        ` · scale ${k.toFixed(2)} units/m (camera ${(from.y - point.y).toFixed(2)} units above the floor at ${point.y.toFixed(2)})`
      : ''));
    // Normally prefetched on arrival; this covers demo unlocks and debug drops.
    prefetchModels(DROP_MODELS[id]);
    if (id === 'athena') this.placeAthena(point, k);
    else if (id === 'tower') this.placeTower(point, k);
    else if (id === 'river') this.playJump(point, this.riverWaterY, k);
    else if (id === 'party') this.dropParty(point, k);
    else if (id === 'shark') {
      const sr = document.getElementById('shark-root');
      const anim = sr && sr.components['shark-animator'];
      if (anim) anim.dropShark(point);
    }
  },

  clearAll: function () {
    Object.keys(this.placed).forEach((k) => this.clearPlaced(k));
    document.querySelectorAll('[data-drop-root]').forEach((el) => el.remove());
    clearTimeout(this.partyTimer);
    this.jumpBusy = false;
  },

  clearPlaced: function (key) {
    const el = this.placed[key];
    if (el && el.parentNode) el.parentNode.removeChild(el);
    delete this.placed[key];
  },

  /**
   * Root at a ground point, turned so its local +Z faces the camera. Children
   * placed at the origin with no rotation therefore face the visitor, and a
   * debug-panel override saved on them is an offset from wherever the tap was.
   */
  makeDropRoot: function (id, point, k = 1) {
    const root = document.createElement('a-entity');
    root.setAttribute('data-drop-root', id);
    root.setAttribute('position', `${point.x} ${point.y} ${point.z}`);
    // Everything under the root is authored in metres; this makes them metres.
    root.setAttribute('scale', `${k} ${k} ${k}`);
    const cam = document.getElementById('camera');
    if (cam) {
      const c = cam.object3D.getWorldPosition(new THREE.Vector3());
      const yaw = Math.atan2(c.x - point.x, c.z - point.z) * 180 / Math.PI;
      root.setAttribute('rotation', `0 ${yaw} 0`);
    }
    return root;
  },

  /**
   * Ask for a metre-based size. If model-normalize.js failed to load, an
   * unknown-component setAttribute is a silent no-op and the model renders at
   * its raw GLB size — which for Athena is 206 m. Fall back to normalizing here
   * so a missing script tag can't put a skyscraper on the sidewalk.
   */
  sizeTo: function (el, spec) {
    if (AFRAME.components['model-normalize']) {
      el.setAttribute('model-normalize', spec);
      return;
    }
    if (!this._warnedNoNormalize) {
      this._warnedNoNormalize = true;
      console.warn('[location-experiences] model-normalize not registered — ' +
        'check the <script> for src/components/model-normalize.js. Using inline fallback.');
    }
    const parsed = {};
    String(spec).split(';').forEach((part) => {
      const [k, v] = part.split(':').map((s) => s && s.trim());
      if (k && v !== undefined) parsed[k] = v;
    });
    el.addEventListener('model-loaded', () => {
      const mesh = el.getObject3D('mesh');
      if (!mesh) return;
      const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
      const h = Number(parsed.height);
      const m = Number(parsed.maxDim);
      let f = 1;
      if (h > 0) f = h / Math.max(size.y, 0.001);
      else if (m > 0) f = m / Math.max(size.x, size.y, size.z, 0.001);
      mesh.scale.multiplyScalar(f);
      if (parsed.ground !== 'false') {
        mesh.updateMatrixWorld(true);
        mesh.position.y -= new THREE.Box3().setFromObject(mesh).min.y /
          (el.object3D.getWorldScale(new THREE.Vector3()).y || 1);
      }
      el.emit('model-normalized', { factor: f });
    }, { once: true });
  },

  place: function (el, key, defaults) {
    if (window.PlacementOverrides) return window.PlacementOverrides.apply(el, key, defaults);
    if (defaults.position) el.setAttribute('position', defaults.position);
    if (defaults.rotation) el.setAttribute('rotation', defaults.rotation);
    if (defaults.scale) el.setAttribute('scale', defaults.scale);
    return el;
  },

  /**
   * Say what's happening to a placed model: "Loading…" while its file is still
   * downloading (a first tap near a location can beat the prefetch), then
   * `doneText`; and a retry hint if it fails, instead of an empty spot.
   */
  announce: function (el, assetId, name, doneText) {
    const item = document.getElementById(assetId);
    const pending = item && !item.hasLoaded;
    const t0 = performance.now();
    this.flashHint(pending ? `Loading ${name}…` : doneText, pending ? 30000 : undefined);
    el.addEventListener('model-loaded', () => {
      fieldLog('drop', `${name} on screen ${Math.round(performance.now() - t0)}ms after the tap` +
        (pending ? ' (was still downloading)' : ''));
      if (pending) this.flashHint(doneText);
    }, { once: true });
    el.addEventListener('model-error', () => {
      console.warn(`[location-experiences] ${name} failed to load`);
      this.flashHint(`${name} didn't load — check your connection and tap again`);
    }, { once: true });
  },

  // ---- Little Italy: Athena + tower -----------------------------------------

  /**
   * Rise out of the ground: start the model a little more than its own height
   * below the floor and ease it up, clipping everything under the floor line
   * so the buried part doesn't show through the camera image. (Sept 30 test
   * run: "Athena does not have an animation coming out of the ground".)
   */
  riseFromGround: function (ent, heightM, durMs, floorAt = 0) {
    // A wrapper does the moving, so the model's own position (placement
    // overrides included) is never read or touched. Reading it before the
    // entity is attached returns junk — the first version floated Athena
    // 2.6 m up instead of raising her to the ground.
    const lift = document.createElement('a-entity');
    lift.setAttribute('position', `0 ${-(heightM * 1.05)} 0`);
    lift.appendChild(ent);
    const scene = this.el.sceneEl;
    const floor = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorAt)];   // keep world y >= floor
    const setClip = (planes) => {
      const mesh = ent.getObject3D('mesh');
      if (!mesh) return;
      if (scene.renderer) scene.renderer.localClippingEnabled = true;
      mesh.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.clippingPlanes = planes;
          m.clipShadows = !!planes;
          m.needsUpdate = true;
        });
      });
    };
    ent.addEventListener('model-loaded', () => {
      setClip(floor);
      lift.setAttribute('animation__rise', { property: 'position', to: '0 0 0', dur: durMs, easing: 'easeOutCubic' });
      lift.addEventListener('animationcomplete__rise', () => setClip(null), { once: true });
    }, { once: true });
    return lift;
  },

  /** One Athena; tapping again moves her. */
  placeAthena: function (point, k = 1) {
    this.clearPlaced('athena');
    const root = this.makeDropRoot('athena', point, k);

    const ent = document.createElement('a-entity');
    // shared-gltf, not gltf-model: one parse per file, with the texture cap as
    // a guard — the original export's 4K maps are what crashed older phones.
    ent.setAttribute('shared-gltf', `src: #athena-point-right; maxTexture: ${STATUE_MAX_TEXTURE_PX}`);
    ent.setAttribute('shadow', 'cast: true');
    // Raw GLB is 206 m tall.
    this.sizeTo(ent, `height: ${STATUE_HEIGHT_M}`);
    // Athena faces +Z like the mascots (checked in the desktop sim — at 180°
    // you get her back), so the drop root already turns her to the visitor.
    this.place(ent, 'little-italy/athena', {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: '1 1 1'
    });
    root.appendChild(this.riseFromGround(ent, STATUE_HEIGHT_M, 1600, point.y));
    this.el.appendChild(root);
    this.placed.athena = root;
    this.announce(ent, 'athena-point-right', 'Athena', 'Athena placed — tap again to move her');
  },

  /** One tower; tapping again moves it. Stays until moved so visitors can walk around it. */
  placeTower: function (point, k = 1) {
    this.clearPlaced('tower');
    const root = this.makeDropRoot('tower', point, k);

    const tower = document.createElement('a-entity');
    tower.setAttribute('id', 'leaning-tower');
    tower.setAttribute('gltf-model', '#leaning-tower-model');
    tower.setAttribute('shadow', 'cast: true');
    // Raw GLB is 47.5 m tall.
    // centerBase: the base, not the file origin, goes on the tap (the lean puts
    // the two ~1 m apart).
    this.sizeTo(tower, `height: ${TOWER_HEIGHT_M}; centerBase: true`);
    // New key: tuning saved under 'leaning-tower' was an offset from the old
    // GPS pin and would shove a tapped tower away from the tap.
    this.place(tower, 'leaning-tower/drop', {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      // Negative X mirrors the model; see TOWER_MIRROR_X.
      scale: TOWER_MIRROR_X ? '-1 1 1' : '1 1 1'
    });

    // A mirrored transform inverts winding, so the tower would light and cull
    // inside-out without this.
    if (TOWER_MIRROR_X) {
      tower.addEventListener('model-loaded', () => {
        tower.object3D.traverse((o) => {
          if (o.isMesh && o.material) {
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((mat) => {
              mat.side = THREE.DoubleSide;
              mat.needsUpdate = true;
            });
          }
        });
      }, { once: true });
    }
    root.appendChild(this.riseFromGround(tower, TOWER_HEIGHT_M, 2600, point.y));
    this.el.appendChild(root);
    this.placed.tower = root;
    this.announce(tower, 'leaning-tower-model', 'the Leaning Tower', 'Leaning Tower placed — walk around it');
  },

  // ---- Jumping shark --------------------------------------------------------

  /**
   * A splash where the shark breaks or re-enters the surface: two flat rings
   * spreading on the water and a burst of droplets thrown up and falling back.
   * Sized in metres under a root scaled by k, like everything else.
   *
   * Replaces a placeholder whose torus was scaled on the wrong axes (the ring
   * swelled into a fat pale capsule) and was 2–3 m wide next to a 2 m shark —
   * Sept 30: "water splashes look malformed". Still a stand-in for Rhonda's
   * splash model: swap the primitives for the GLB and keep the call site.
   */
  spawnSplash: function (x, y, z, k = 1) {
    const group = document.createElement('a-entity');
    group.setAttribute('position', `${x} ${y + 0.02} ${z}`);
    group.setAttribute('scale', `${k} ${k} ${k}`);

    [0, 140].forEach((delay, i) => {
      const ring = document.createElement('a-ring');
      ring.setAttribute('radius-inner', 0.16);
      ring.setAttribute('radius-outer', 0.22);
      ring.setAttribute('rotation', '-90 0 0');     // flat on the water
      ring.setAttribute('material', 'color: #e6f7ff; opacity: 0.85; transparent: true; side: double; depthWrite: false; shader: flat');
      // a-ring lies in its local XY plane, so grow X and Y, never Z.
      ring.setAttribute('animation__grow', {
        property: 'scale', from: '0.3 0.3 1', to: `${i ? 4 : 5.5} ${i ? 4 : 5.5} 1`,
        dur: 900, delay, easing: 'easeOutQuad'
      });
      ring.setAttribute('animation__fade', {
        property: 'material.opacity', from: 0.85, to: 0, dur: 900, delay, easing: 'easeInQuad'
      });
      group.appendChild(ring);
    });

    for (let i = 0; i < 14; i++) {
      const drop = document.createElement('a-sphere');
      // Big enough to read at the 8 m+ a jump happens at.
      drop.setAttribute('radius', 0.07 + Math.random() * 0.05);
      drop.setAttribute('segments-width', 6);
      drop.setAttribute('segments-height', 4);
      drop.setAttribute('material', 'color: #f2fbff; opacity: 0.9; transparent: true; shader: flat');
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const out = 0.7 + Math.random() * 0.8;
      drop.setAttribute('splash-drop', { vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: 2.2 + Math.random() * 1.2 });
      group.appendChild(drop);
    }

    this.el.appendChild(group);
    setTimeout(() => {
      if (group.parentNode) group.parentNode.removeChild(group);
    }, 1300);
  },

  /**
   * One breach, peaking over `point` and crossing the visitor's view left to
   * right so the whole arc is in frame.
   *
   * The jump itself is the artist's animation in maria-shark-jump-jimmy-txtr.glb
   * (swim, breach, land, swim on). Sized to a 3 m shark its baked path climbs
   * 12.6 m and runs 85 m, and it used to loop underneath a second, code-driven
   * arc — "I can see the shadow but not the shark". dive-clip (shark-motion.js)
   * now puts the apex on the tap, the water line at `waterY`, and scales the
   * path to JUMP_APEX_HEIGHT_M high and JUMP_RUN_M long.
   */
  playJump: function (point, waterY, k = 1) {
    if (this.jumpBusy) return;
    this.jumpBusy = true;

    const cam = document.getElementById('camera');
    const right = cam && window.MathUtils
      ? window.MathUtils.cameraRight(cam)
      : new THREE.Vector3(1, 0, 0);
    const yaw = Math.atan2(right.x, right.z) * 180 / Math.PI;

    const root = document.createElement('a-entity');
    root.setAttribute('data-drop-root', 'jump');
    root.setAttribute('position', `${point.x} ${point.y + (waterY || 0)} ${point.z}`);
    root.setAttribute('rotation', `0 ${yaw} 0`);
    root.setAttribute('scale', `${k} ${k} ${k}`);

    const ent = document.createElement('a-entity');
    ent.setAttribute('gltf-model', '#diving-shark');
    this.sizeTo(ent, `maxDim: ${JUMP_SHARK_MAX_DIM_M}; ground: false`);
    ent.setAttribute('animation-mixer', 'loop: once; clampWhenFinished: true');
    // Splash as the body breaks the surface and as it drops back in — at the
    // default 0.5 m the "exit" splash fired near the top of a 0.7 m hop, well
    // after the shark had left the water ("doesn't match the animation").
    ent.setAttribute('dive-clip', { apexHeightM: this.jumpApexM, runM: JUMP_RUN_M, splashAboveM: 0.15 });
    // A shadow belongs on the water, not on the pavement plane metres above it.
    if (!(waterY < 0)) ent.setAttribute('shadow', 'cast: true');
    root.appendChild(ent);
    this.el.appendChild(root);

    const splashAt = (evt) => {
      const p = evt.detail && evt.detail.position;
      if (p) this.spawnSplash(p.x, p.y, p.z, k);
    };
    ent.addEventListener('shark-breach-exit', splashAt);
    ent.addEventListener('shark-breach-entry', splashAt);

    // Each jump finishes once. Without the flag, the fallback timer of a jump
    // that had already ended cleared jumpBusy halfway through the *next* one.
    let done = false;
    const t0 = performance.now();
    const finish = (how) => {
      if (done) return;
      done = true;
      fieldLog('drop', `jump ended (${how}) after ${Math.round(performance.now() - t0)}ms`);
      if (root.parentNode) root.parentNode.removeChild(root);
      this.jumpBusy = false;
    };
    ent.addEventListener('animation-finished', () => setTimeout(() => finish('animation done'), 300), { once: true });
    ent.addEventListener('model-error', () => finish('model error'), { once: true });
    // Never strand the jump busy if the clip doesn't report finishing. Timed
    // from the model arriving, so a slow first download can't cut it short.
    ent.addEventListener('model-loaded', () => {
      fieldLog('drop', `jump shark on screen ${Math.round(performance.now() - t0)}ms after the tap`);
      setTimeout(() => finish('9 s fallback'), 9000);
    }, { once: true });
    setTimeout(() => finish('30 s fallback — model never arrived'), 30000);
  },

  // ---- SAP party ------------------------------------------------------------

  /**
   * Dancing Sharkie + Sammy where the visitor tapped, a pod of sharks circling
   * the visitor, and a jumping shark over the tap. A second tap restarts it
   * around wherever they're standing now.
   */
  dropParty: function (point, k = 1) {
    document.querySelectorAll('[data-drop-root="party"]').forEach((el) => el.remove());
    clearTimeout(this.partyTimer);

    const cam = document.getElementById('camera');
    if (!cam) return;

    // Circle centred on the visitor — "User is in 'center' of party".
    const me = cam.object3D.getWorldPosition(new THREE.Vector3());
    const circleRoot = document.createElement('a-entity');
    circleRoot.setAttribute('data-drop-root', 'party');
    circleRoot.setAttribute('position', `${me.x} ${point.y} ${me.z}`);
    circleRoot.setAttribute('scale', `${k} ${k} ${k}`);

    // Maria and Jimmy are the wayfinding swimmers the page already loaded.
    const sharks = [
      { id: 'maria', model: '#maria-swimmer', phase: 0, lane: 0 },
      // Stella's GLB faces −Z, the others +Z — without the 180° she swam the
      // ring tail-first (Sept 30: "one of the party sharks is swimming backwards").
      { id: 'stella', model: '#circle-stella', phase: 120, lane: -1.2, yaw: 180 },
      { id: 'jimmy', model: '#jimmy-swimmer', phase: 240, lane: 1.2 }
    ];
    sharks.forEach((s) => {
      const ent = document.createElement('a-entity');
      ent.setAttribute('gltf-model', s.model);
      // Centred, so the body rides the circle nose-first instead of trailing
      // 2–3 m off it and crabbing round the ring.
      this.sizeTo(ent, `maxDim: ${SHARK_MAX_DIM_M}; ground: false; center: true`);
      ent.setAttribute('animation-mixer', 'loop: repeat; timeScale: 1.0');
      // No shadows for the ring: at 1.6 m up and 8 m out they're barely seen,
      // and every caster is drawn a second time into the shadow map — the
      // party ran at 0–6 fps on site (Sept 29 log).
      // Spread around the ring so one is always in view wherever you look.
      ent.setAttribute('shark-circle-swim', {
        radius: PARTY_CIRCLE_RADIUS_M + s.lane,
        period: PARTY_CIRCLE_PERIOD_MS,
        phaseDeg: s.phase,
        height: 1.6 + s.lane * 0.2,
        yawOffset: s.yaw || 0
      });
      ent.setAttribute('data-placement-key', `party/circle-${s.id}`);
      circleRoot.appendChild(ent);
    });
    this.el.appendChild(circleRoot);

    // Dancers at the tap, facing the visitor.
    const danceRoot = this.makeDropRoot('party', point, k);
    [{ id: 'sharkie', model: '#photo-sharkie', offset: -1.2 },
      { id: 'sammy', model: '#photo-sammy', offset: 1.2 }].forEach((d) => {
      const ent = document.createElement('a-entity');
      ent.setAttribute('gltf-model', d.model);
      this.sizeTo(ent, `height: ${MASCOT_HEIGHT_M}`);
      ent.setAttribute('shadow', 'cast: true');
      this.place(ent, `party/dancer-${d.id}`, {
        position: { x: d.offset, y: 0.02, z: 0 },
        scale: '1 1 1'
      });
      // Placeholder dance until the mascots are animated: a spin and a bounce.
      ent.setAttribute('animation__spin', {
        property: 'rotation', to: '0 360 0', loop: true, dur: 4000, easing: 'linear'
      });
      danceRoot.appendChild(ent);
    });
    this.el.appendChild(danceRoot);

    // The jump peaks just behind the dancers so it doesn't clip through them.
    const fwd = window.MathUtils ? window.MathUtils.cameraForward(cam) : new THREE.Vector3(0, 0, -1);
    this.jumpBusy = false;
    setTimeout(() => this.playJump(point.clone().addScaledVector(fwd, 3 * k), 0, k), 1200);

    this.flashHint('Party! Look around — the sharks are circling you');
    this.partyTimer = setTimeout(() => {
      document.querySelectorAll('[data-drop-root="party"]').forEach((el) => el.remove());
    }, PARTY_DURATION_MS);
  },

  remove: function () {
    if (this.watchId != null) {
      try { navigator.geolocation.clearWatch(this.watchId); } catch (e) { /* ignore */ }
    }
    this.clearAll();
  }
});

// Ensure the component attaches even if the a-scene attribute was parsed before
// this module finished registering (ES module defer race).
function ensureLocationExperiencesAttached() {
  const scene = document.querySelector('a-scene');
  if (!scene || !window.AFRAME) return;
  if (!scene.components || !scene.components['location-experiences']) {
    scene.setAttribute('location-experiences', '');
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(ensureLocationExperiencesAttached, 0));
} else {
  setTimeout(ensureLocationExperiencesAttached, 0);
}
