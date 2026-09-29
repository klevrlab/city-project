/**
 * Keep the shadow-casting light over the visitor.
 *
 * The directional light used to sit at a fixed world point (5, 10, 5) while
 * aiming at the camera. Walk 100 m down the corridor and it was shining in
 * almost sideways from 100 m back: shadows stretched across the whole ground
 * plane and broke into moiré stripes (shadow acne). That's the "funny striped
 * overlay that appears sometimes" — sometimes, because it gets worse the
 * farther you are from where the page loaded.
 *
 * Moving the light with the camera keeps the sun angle constant, and the small
 * negative bias removes the acne that remains at grazing angles.
 */
AFRAME.registerComponent('sun-follow', {
  schema: {
    target: { type: 'selector', default: '#camera' },
    offset: { type: 'vec3', default: { x: 5, y: 10, z: 5 } }
  },

  init: function () {
    this.pos = new THREE.Vector3();
  },

  tick: function () {
    const t = this.data.target;
    if (!t || !t.object3D) return;
    t.object3D.getWorldPosition(this.pos);
    const o = this.data.offset;
    this.el.object3D.position.set(this.pos.x + o.x, o.y, this.pos.z + o.z);
  }
});
