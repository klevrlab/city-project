/**
 * Free a model's GPU memory when its entity goes away.
 *
 * A-Frame's gltf-model only detaches the mesh on remove; the geometry,
 * textures and skeleton stay uploaded. Every swim-through, dropped shark,
 * tower, jump and party builds a fresh entity, so a visit only ever grows.
 * The Sept 29 field logs show it plainly — `gpu tex` / `geo` climb with each
 * swim-through and never come down (tex 1 → 53, geo 1 → 190 in five
 * minutes), and the "Camera froze" / fps=0 moments land on top of it.
 *
 * Safe because gltf-model parses per entity: THREE.Cache shares the file's
 * bytes, not the parsed geometry or textures. shared-gltf instances are
 * deliberately *not* touched — their geometry belongs to a shared master.
 */
function disposeModel(root) {
  const textures = new Set();
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    mats.forEach((mat) => {
      Object.keys(mat).forEach((k) => {
        const v = mat[k];
        if (v && v.isTexture) textures.add(v);
      });
      mat.dispose();
    });
  });
  textures.forEach((tex) => {
    const img = tex.source && tex.source.data;
    tex.dispose();
    // Decoded ImageBitmaps hold CPU memory too until closed.
    if (img && typeof img.close === 'function') {
      try { img.close(); } catch (e) { /* already closed */ }
    }
  });
}

(function patchGltfModel() {
  const def = window.AFRAME && AFRAME.components['gltf-model'];
  if (!def || def.Component.prototype.__disposes) return;
  const proto = def.Component.prototype;
  const originalRemove = proto.remove;
  proto.remove = function () {
    const model = this.model;
    originalRemove.call(this);
    if (model) {
      disposeModel(model);
      this.model = null;
    }
  };
  proto.__disposes = true;
})();
