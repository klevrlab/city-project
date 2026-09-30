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
  const ground = { k: null, kFrom: '', floorY: 0, timer: null };

  function unitsPerMetre(cameraEl) {
    if (ground.k) return ground.k;
    if (!cameraEl || !cameraEl.object3D) return 1;
    const y = camY(cameraEl) - ground.floorY;
    if (!(y > 0)) return 1;
    ground.k = clampScale(y);
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
   *  - above SCALE_LOW_M: far more likely the page opened with the phone held
   *    low and the scale was taken too small (the Sept 30 at-home run: camera
   *    2.4 units) than a floor that sank — re-take the scale instead.
   * Things already placed stay where they are.
   */
  const FLOOR_DRIFT_M = 0.5;
  const SCALE_LOW_M = 2.2;
  function trackGround(cameraEl, groundEl) {
    if (ground.timer || !cameraEl) return;
    let untracked = null;
    let tracking = false;
    const first = [];
    const recent = [];
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
      if (h > SCALE_LOW_M && ground.k < 2.2) {
        const was = ground.k;
        ground.k = clampScale(yNow - ground.floorY);
        ground.kFrom = `re-taken: camera ${(yNow - ground.floorY).toFixed(2)} units above the floor`;
        note(`scale ${was.toFixed(2)} → ${ground.k.toFixed(2)} units/m (camera ${h.toFixed(2)} m up at the old scale — page opened with the phone low)`);
        return;
      }
      if (h >= FLOOR_DRIFT_M) return;
      const was = ground.floorY;
      ground.floorY = yNow - PHONE_HEIGHT_M * ground.k;
      if (groundEl && groundEl.object3D) groundEl.object3D.position.y = ground.floorY;
      note(`floor re-based ${was.toFixed(2)} → ${ground.floorY.toFixed(2)} units ` +
        `(camera ${yNow.toFixed(2)} units up = ${h.toFixed(2)} m above the old floor; tracking drifted)`);
    }, 500);
  }

  /** World y of the floor drops land on (see trackGround). */
  function floorY() {
    return ground.floorY;
  }

  /** For the log's stats line and the debug panel. */
  function groundState() {
    return { k: ground.k, kFrom: ground.kFrom, floorY: ground.floorY };
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
