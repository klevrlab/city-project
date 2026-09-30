/**
 * model-normalize — size a GLB in real-world metres instead of guessed scale factors.
 *
 * The GLBs in this repo come from wildly different sources and have no shared
 * unit convention. Measured with debug mode (`?debug=1`, MODELS tab):
 *
 *   Athena_Statue-point-left/right.glb   102 × 206 × 67 m   (!)
 *   Augustus_of_Prima_Porta.glb          0.53 × 1.02 × 0.44 m
 *   Leaning_Tower_of_Pisa.glb            23.6 × 47.5 × 23.5 m
 *   sharkie_final_pose.glb               1.08 × 1.95 × 2.27 m, floating 1.01 m up
 *   sammy_final_pose.glb                 1.68 × 2.96 × 2.67 m, floating 0.42 m up
 *
 * A hand-tuned `scale="1.1 1.1 1.1"` therefore means something different for
 * every asset, and breaks the moment an artist re-exports. This component
 * measures the model on load and scales it to a stated height (or longest
 * dimension), then drops it onto the ground plane.
 *
 *   model-normalize="height: 2.5"     → 2.5 m tall, feet at y=0
 *   model-normalize="maxDim: 3"       → longest axis 3 m (for long, low things
 *                                       like sharks, where height is the wrong
 *                                       axis to pin)
 *   model-normalize="height: 2.5; ground: false"  → size only, keep the pivot
 *
 * Scaling is applied to the *mesh*, not the entity, so an entity's own
 * position/rotation/scale — and anything debug mode saves into
 * data/placement-overrides.json — stack on top of the normalized size rather
 * than being overwritten by it.
 */
AFRAME.registerComponent('model-normalize', {
  schema: {
    height: { type: 'number', default: 0 },
    maxDim: { type: 'number', default: 0 },
    ground: { type: 'boolean', default: true },
    // Put the model's body (bounding-box centre) over the entity in X/Z. For
    // models whose file origin sits off the body — the shark GLBs are ~1.8 m
    // off at swim scale — so a path or a turn is followed by the body itself.
    center: { type: 'boolean', default: false }
  },

  init: function () {
    this.applied = false;
    if (this.el.getObject3D('mesh')) this.normalize();
    // A new model-loaded is a new mesh (Photo Mode swaps Sharkie <-> Sammy on
    // the same entity), so it needs sizing afresh. Returning early here left
    // the swapped-in mascot at its raw GLB size — "small sometimes".
    this.el.addEventListener('model-loaded', () => {
      this.applied = false;
      this.normalize();
    });
  },

  update: function () {
    // Re-normalize when height/maxDim is changed live (debug tweaks).
    this.applied = false;
    if (this.el.getObject3D('mesh')) this.normalize();
  },

  /**
   * World-space bounds of the model *as it will render*.
   *
   * Box3.setFromObject on a rigged (skinned) model uses a bounding box that
   * three computes once and caches — and on model-loaded that happens before
   * the skeleton has ever been posed, so it measures garbage. Measured in the
   * desktop sim: Sharkie "normalized" to 1.9 m actually rendered ~7 m tall and
   * half below the ground, and the result varied with load timing — the
   * mascots that were too big on one visit and "small sometimes" on the next.
   * Posing the skeleton and measuring the vertices makes it real.
   */
  measure: function (mesh) {
    // Parents first, then updateMatrixWorld down the model: SkinnedMesh only
    // refreshes its bind-matrix inverse in updateMatrixWorld, not in
    // updateWorldMatrix, and a stale one skews the skinned bounds.
    this.el.object3D.updateWorldMatrix(true, false);
    mesh.updateMatrixWorld(true);
    mesh.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
    });
    // precise: measure the vertices where they actually are, not each part's
    // bounding box rotated into place. The Leaning Tower's parts are rotated
    // in the file, and the rotated box of its thin base plate reaches ~0.5 m
    // below the plate — so "grounding" that box left the tower floating half a
    // metre up (test run, Sept 30; likely the Sept 29 "placed in air" mark).
    return new THREE.Box3().setFromObject(mesh, true);
  },

  normalize: function () {
    if (this.applied) return;
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;

    const box = this.measure(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (!isFinite(size.y) || size.y <= 0) return;
    // Size in the entity's own units, not the world's: drops scale their root
    // to real metres (MathUtils.unitsPerMetre), and measuring in world space
    // would quietly undo that. Identical to before for unscaled parents.
    const ws = this.el.object3D.getWorldScale(new THREE.Vector3());
    size.set(size.x / (Math.abs(ws.x) || 1), size.y / (Math.abs(ws.y) || 1), size.z / (Math.abs(ws.z) || 1));

    let factor = 1;
    if (this.data.height > 0) {
      factor = this.data.height / size.y;
    } else if (this.data.maxDim > 0) {
      factor = this.data.maxDim / Math.max(size.x, size.y, size.z);
    }

    if (factor !== 1) mesh.scale.multiplyScalar(factor);

    if (this.data.center) {
      const c = this.measure(mesh).getCenter(new THREE.Vector3());
      this.el.object3D.worldToLocal(c);
      mesh.position.x -= c.x;
      mesh.position.z -= c.z;
    }

    if (this.data.ground) {
      // Feet on the *entity's* floor (local y = 0), not the world's. Grounding
      // to world y = 0 was wrong for anything that loads away from the floor:
      // Athena and the tower load buried (they rise out of the ground), got
      // pushed up by exactly that depth, and finished the rise 2.6 m / 8.4 m
      // in the air. Same result as before for entities standing at y = 0.
      const grounded = this.measure(mesh);
      const low = this.el.object3D.getWorldPosition(new THREE.Vector3());
      low.y = grounded.min.y;
      this.el.object3D.worldToLocal(low);
      mesh.position.y -= low.y;
    }

    this.applied = true;
    this.el.emit('model-normalized', { factor });
  }
});
