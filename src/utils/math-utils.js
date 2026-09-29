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

  global.MathUtils = {
    haversineMeters: haversineMeters,
    cameraForward: cameraForward,
    cameraRight: cameraRight
  };
})(typeof window !== 'undefined' ? window : globalThis);
