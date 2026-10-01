/**
 * Shared math utilities for the 8th Wall project.
 */
(function (global) {
  'use strict';

  /**
   * Calculates the distance between two points in meters using the Haversine formula.
   */
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dq = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dq / 2) * Math.sin(dq / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Ground-plane direction the camera is *looking*, as a normalized vector.
   *
   * Do not use `cameraEl.object3D.getWorldDirection()` for this. That method is
   * THREE.Object3D's, and it returns the object's +Z axis — for a camera, the
   * direction out of the *back* of its head. (THREE.Camera overrides it to
   * return −Z, but `entity.object3D` is a Group, not the camera; the camera
   * itself is `entity.getObject3D('camera')`.) Content placed with the raw
   * result lands behind the visitor, which is exactly what used to happen to
   * the Little Italy statues.
   *
   * @param {Element} cameraEl - the A-Frame camera entity
   * @param {THREE.Vector3} [target] - optional vector to write into
   */
  function cameraForward(cameraEl, target) {
    const out = target || new THREE.Vector3();
    out.set(0, 0, -1);
    if (!cameraEl || !cameraEl.object3D) return out;
    const q = cameraEl.object3D.getWorldQuaternion(new THREE.Quaternion());
    out.applyQuaternion(q);
    out.y = 0;
    // Pointed straight at the pavement (scanning a painted shark), the lens
    // axis has no horizontal part left. The top edge of the phone then points
    // the way the visitor faces, so use camera-up instead of a fixed −Z.
    if (out.lengthSq() < 0.01) {
      out.set(0, 1, 0).applyQuaternion(q);
      out.y = 0;
    }
    if (out.lengthSq() < 0.0001) out.set(0, 0, -1);
    return out.normalize();
  }

  /** Camera-right on the ground plane (forward × up). */
  function cameraRight(cameraEl, target) {
    const fwd = cameraForward(cameraEl);
    const out = target || new THREE.Vector3();
    return out.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  }

  /**
   * Scene units per real metre for this session.
   *
   * 8th Wall's default ("responsive") scale does not work in metres: it puts
   * the camera 1.6 units above the floor on the first frame, however high the
   * phone really was. Open the page with the phone at waist height and a unit
   * is ~0.65 m, so a "1.9 m" Sharkie stands ~1.2 m tall — the Sept 30 test run
   * read the camera at 2.4 units ("Sharkie is kinda small"), and Rhonda's
   * "mascot small (sometimes)" is the same thing: it depends on the pose the
   * page happened to start in.
   *
   * People view AR with the phone at roughly PHONE_HEIGHT_M, so camera height
   * in units over that is units-per-metre. The scale is fixed once tracking
   * starts, but the height is not — it drifts as you walk (Sept 30 corridor
   * log: 1.84 units at the river, 0.08 at Little Italy five minutes later), so
   * the estimate is taken once and kept: the median of the first ~10 s of
   * tracking (trackGround), or the first drop if that comes sooner. Clamped,
   * so a crouch or an arm held overhead can't make content absurd. In the
   * desktop sim (camera at 1.6, never "tracking") it's ~1.1.
   */
  const PHONE_HEIGHT_M = 1.45;
  const clampScale = (y) => Math.min(Math.max(y / PHONE_HEIGHT_M, 0.8), 2.2);
  const camY = (cameraEl) => cameraEl.object3D.getWorldPosition(new THREE.Vector3()).y;
  const ground = { k: null, kFrom: '', kAt: 0, retaken: false, floorY: 0, rebases: 0, timer: null };

  function unitsPerMetre(cameraEl) {
    if (ground.k) return ground.k;
    if (!cameraEl || !cameraEl.object3D) return 1;
    const y = camY(cameraEl) - ground.floorY;
    if (!(y > 0)) return 1;
    ground.k = clampScale(y);
    ground.kAt = Date.now();
    ground.kFrom = `first drop, camera ${y.toFixed(2)} units up`;
    note(`scale ${ground.k.toFixed(2)} units/m (${ground.kFrom})`);
    return ground.k;
  }

  function note(message) {
    if (global.SharksWayLog) global.SharksWayLog.add('ground', message);
  }

  const median = (a) => {
    const s = a.slice().sort((x, y) => x - y);
    return s[s.length >> 1];
  };

  /**
   * Keep the tap plane (#ground) under the visitor's feet.
   *
   * The floor 8th Wall starts with is y = 0 for the whole session, and its
   * height estimate drifts as you walk: in the Sept 30 corridor log the camera
   * went from 1.84 units above it to 0.35 at SAP and 0.08 in Little Italy,
   * i.e. y = 0 ended up a metre or more above the real pavement. Everything
   * dropped on it floated — "party mode offset in the sky" — and taps at your
   * feet hit it a step away, so drops were pushed out to their minimum.
   *
   * So the floor is re-estimated from the phone. While the camera stays a
   * plausible height above the current floor nothing moves (y = 0 stays put
   * on a good session). The band is wide because the scale itself is a guess
   * (±20%) and people hold phones anywhere from waist to eye:
   *  - below FLOOR_DRIFT_M for ~3 s: the floor has drifted up to the phone
   *    (the corridor case) — re-base it PHONE_HEIGHT_M below the camera, and
   *    move #ground there, so taps, shadows and every drop follow;
   *  - above FLOOR_HIGH_M for ~3 s: the floor has sunk away from the phone —
   *    re-base it the same way. Sept 30 evening test run, at home: the camera
   *    climbed from 2.3 to 36 units in two minutes (~16 m "up"), drops landed
   *    on a floor far below and everything read as "looks really small", the
   *    party 13 m away, Photo Mode taps 10–15 m out. Climbing stairs ends up
   *    in the same place, which is also right: content lands at your feet;
   *  - above SCALE_LOW_M soon after the scale was taken, with the phone held
   *    steady: the page opened with the phone low and the scale came out too
   *    small (Sept 30 morning run, camera 2.4 units) — re-take the scale, once.
   *    Only once, only in the first RETAKE_WINDOW_MS, only when steady: the
   *    evening run's slow climb was read as this at 47 s and the scale jumped
   *    1.52 → 2.20 (45% too big) — drift is a creep, raising the phone is a
   *    step and then still.
   * Things already placed stay where they are.
   */
  const FLOOR_DRIFT_M = 0.5;
  const FLOOR_HIGH_M = 2.3;          // above any phone in a hand, arm up included
  const SCALE_LOW_M = 2.2;
  const RETAKE_WINDOW_MS = 25000;
  const STEADY_M = 0.1;              // spread of the last ~3 s of camera heights
  const SETTLE_MS = 4000;            // how long a raise gets to come to rest
  function trackGround(cameraEl, groundEl) {
    if (ground.timer || !cameraEl) return;
    let untracked = null;
    let tracking = false;
    const first = [];
    const recent = [];
    let highSince = 0;
    ground.timer = setInterval(() => {
      if (!cameraEl.object3D) return;
      const y = camY(cameraEl);
      // Until 8th Wall moves the camera, its y is the scene's 1.6 placeholder.
      if (untracked === null) { untracked = y; return; }
      if (!tracking) {
        if (Math.abs(y - untracked) < 1e-4) return;
        tracking = true;
      }
      if (!ground.k) {
        first.push(y);
        if (first.length >= 20) {
          const m = median(first);
          ground.k = clampScale(m - ground.floorY);
          ground.kAt = Date.now();
          ground.kFrom = `first 10 s of tracking, camera ~${m.toFixed(2)} units up`;
          note(`scale ${ground.k.toFixed(2)} units/m (${ground.kFrom})`);
        }
        return;
      }
      recent.push(y);
      if (recent.length > 6) recent.shift();       // ~3 s at 500 ms
      if (recent.length < 6) return;
      const yNow = median(recent);
      const h = (yNow - ground.floorY) / ground.k;
      const steady = (Math.max(...recent) - Math.min(...recent)) / ground.k < STEADY_M;
      if (h > SCALE_LOW_M) {
        if (!highSince) highSince = Date.now();
        // Early on, a raise that comes to rest means the scale was taken low.
        // Give it SETTLE_MS to stop moving; a creep never does, and falls
        // through to a floor re-base.
        if (ground.k < 2.2 && !ground.retaken && highSince - ground.kAt < RETAKE_WINDOW_MS) {
          if (steady) {
            const was = ground.k;
            ground.k = clampScale(yNow - ground.floorY);
            ground.retaken = true;
            highSince = 0;
            ground.kFrom = `re-taken: camera ${(yNow - ground.floorY).toFixed(2)} units above the floor`;
            note(`scale ${was.toFixed(2)} → ${ground.k.toFixed(2)} units/m (camera ${h.toFixed(2)} m up at the old scale — page opened with the phone low)`);
            return;
          }
          if (Date.now() - highSince < SETTLE_MS) return;
        }
      } else {
        highSince = 0;
      }
      if (h >= FLOOR_DRIFT_M && h <= FLOOR_HIGH_M) return;
      const was = ground.floorY;
      ground.floorY = yNow - PHONE_HEIGHT_M * ground.k;
      ground.rebases++;
      highSince = 0;
      recent.length = 0;   // judge the new floor on fresh samples
      if (groundEl && groundEl.object3D) groundEl.object3D.position.y = ground.floorY;
      note(`floor re-based ${was.toFixed(2)} → ${ground.floorY.toFixed(2)} units ` +
        `(camera ${yNow.toFixed(2)} units up = ${h.toFixed(2)} m above the old floor; tracking drifted ` +
        `${h < FLOOR_DRIFT_M ? 'up to the phone' : 'away below it'})`);
    }, 500);
  }

  /** World y of the floor drops land on (see trackGround). */
  function floorY() {
    return ground.floorY;
  }

  /** For the log's stats line and the debug panel. */
  function groundState() {
    return { k: ground.k, kFrom: ground.kFrom, floorY: ground.floorY, rebases: ground.rebases };
  }

  global.MathUtils = {
    haversineMeters: haversineMeters,
    cameraForward: cameraForward,
    cameraRight: cameraRight,
    unitsPerMetre: unitsPerMetre,
    trackGround: trackGround,
    floorY: floorY,
    groundState: groundState,
    PHONE_HEIGHT_M: PHONE_HEIGHT_M
  };
})(typeof window !== 'undefined' ? window : globalThis);
