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
   * Scene units per real metre, estimated from how high the phone is now.
   *
   * 8th Wall's default ("responsive") scale does not work in metres: it puts
   * the camera 1.6 units above the floor on the first frame, however high the
   * phone really was. Open the page with the phone at waist height and a unit
   * is ~0.65 m, so a "1.9 m" Sharkie stands ~1.2 m tall — the Sept 30 test run
   * read the camera at 2.4 units ("Sharkie is kinda small"), and Rhonda's
   * "mascot small (sometimes)" is the same thing: it depends on the pose the
   * page happened to start in.
   *
   * People view AR with the phone at roughly PHONE_HEIGHT_M, so the camera's
   * height in units right now divided by that is units-per-metre. Multiply a
   * real-world size or distance by this. Clamped, so a crouch or an arm held
   * overhead can't make content absurd. In the desktop sim (camera at 1.6)
   * it's ~1.1.
   */
  const PHONE_HEIGHT_M = 1.45;
  function unitsPerMetre(cameraEl) {
    if (!cameraEl || !cameraEl.object3D) return 1;
    const y = cameraEl.object3D.getWorldPosition(new THREE.Vector3()).y;
    if (!(y > 0)) return 1;
    return Math.min(Math.max(y / PHONE_HEIGHT_M, 0.8), 2.2);
  }

  global.MathUtils = {
    haversineMeters: haversineMeters,
    cameraForward: cameraForward,
    cameraRight: cameraRight,
    unitsPerMetre: unitsPerMetre,
    PHONE_HEIGHT_M: PHONE_HEIGHT_M
  };
})(typeof window !== 'undefined' ? window : globalThis);
