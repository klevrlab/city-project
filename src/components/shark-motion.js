/**
 * Hand-authored shark motion — circle swim and breaching jump.
 *
 * The GLBs only carry a swim-cycle (tail/body); they have no path animation, so
 * the travel is done here in code. The spec asks for a Blender follow-path
 * constraint with offset frames; this is the same idea evaluated per frame,
 * which also means radius, speed and phase stay tunable on site instead of
 * being baked into an export.
 *
 * Both components drive the entity's local transform, so the entity's parent is
 * the frame of reference: put the parent at the circle centre (or the jump's
 * start point) and, when that parent is a geo root, everything below is in real
 * compass bearings.
 *
 * Model convention: these sharks face **+Z**, matching the existing yaw math in
 * shark-animator and location-experiences (`atan2(dx, dz)`).
 */

const DEG = Math.PI / 180;

/**
 * Orbit the parent origin. Spec: "Maria & sharks swim in a 60 meter circle
 * around the intersection", with sharks placed at different points on the
 * circle by offsetting frames — `phaseDeg` here.
 */
AFRAME.registerComponent('shark-circle-swim', {
  schema: {
    radius: { type: 'number', default: 30 },
    period: { type: 'number', default: 48000 },  // ms per lap
    phaseDeg: { type: 'number', default: 0 },
    height: { type: 'number', default: 1.2 },    // cruise height above ground
    bobAmplitude: { type: 'number', default: 0.35 },
    bobCycles: { type: 'number', default: 3 },   // rises/dips per lap
    bankDeg: { type: 'number', default: 12 },    // roll into the turn
    clockwise: { type: 'boolean', default: true },
    yawOffset: { type: 'number', default: 0 }    // if a model's nose is not +Z
  },

  init: function () {
    this.t = 0;
  },

  tick: function (time, delta) {
    if (!delta) return;
    this.t += delta;

    const d = this.data;
    const dir = d.clockwise ? 1 : -1;
    const angle = (d.phaseDeg * DEG) + dir * (this.t / d.period) * Math.PI * 2;

    const x = Math.cos(angle) * d.radius;
    const z = Math.sin(angle) * d.radius;
    const bob = Math.sin(angle * d.bobCycles) * d.bobAmplitude;

    const obj = this.el.object3D;
    obj.position.set(x, d.height + bob, z);

    // Tangent of the circle is the travel direction; +Z-forward models want
    // atan2 of that tangent. Differentiating (cos, sin) gives (−sin, cos).
    const tx = -Math.sin(angle) * dir;
    const tz = Math.cos(angle) * dir;
    obj.rotation.y = Math.atan2(tx, tz) + d.yawOffset * DEG;

    // Bank into the turn, and pitch slightly with the bob so it reads as
    // swimming rather than sliding along a rail.
    obj.rotation.z = -dir * d.bankDeg * DEG;
    const climb = Math.cos(angle * d.bobCycles) * d.bobCycles * d.bobAmplitude;
    obj.rotation.x = -Math.atan2(climb, d.radius) * 2;
  }
});

/**
 * One breach: swim in along a bearing at water level, arc up out of the water,
 * come back down with a splash, keep swimming the same way.
 *
 * Spec, per location: underpass "swims into frame from the east heading west…
 * comes back down before the underpass and continues swimming west"; river
 * "from the south heading north… comes back down over the river with a splash";
 * finale "from the east heading west toward SAP… comes back down at the center
 * with a splash".
 *
 * Emits `shark-breach-exit` when it leaves the water and `shark-breach-entry`
 * when it lands, both with {position} — that's where the splash goes once
 * Rhonda's splash model lands.
 */
AFRAME.registerComponent('shark-arc-jump', {
  schema: {
    // Compass bearing of travel when under a north-aligned (geo) parent;
    // otherwise a plain local yaw in the parent's frame.
    bearing: { type: 'number', default: 270 },
    approachM: { type: 'number', default: 18 },   // distance travelled before the arc
    departM: { type: 'number', default: 18 },     // distance travelled after landing
    arcLengthM: { type: 'number', default: 14 },  // ground distance covered mid-air
    apexHeight: { type: 'number', default: 3.2 },
    swimY: { type: 'number', default: 0.35 },     // cruise height ("in the water")
    speed: { type: 'number', default: 6 },        // m/s
    yawOffset: { type: 'number', default: 0 },
    loop: { type: 'boolean', default: false },
    // Put the top of the arc exactly on the parent's origin, instead of
    // starting there. The finale wants the breach in the middle of the shark
    // circle, so the anchor is the circle centre and the shark peaks over it.
    apexAtOrigin: { type: 'boolean', default: false }
  },

  init: function () {
    this.t = 0;
    this.total = this.data.approachM + this.data.arcLengthM + this.data.departM;
    this.firedExit = false;
    this.firedEntry = false;

    // Travel direction in the parent's frame. Under a geo root (−Z north,
    // +X east) a compass bearing b is (sin b, 0, −cos b).
    const b = this.data.bearing * DEG;
    this.dir = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));

    // Distance travelled when the arc peaks.
    const apexAt = this.data.approachM + this.data.arcLengthM / 2;
    const back = this.data.apexAtOrigin ? apexAt : this.data.approachM;
    this.startOffset = this.dir.clone().multiplyScalar(-back);
  },

  tick: function (time, delta) {
    if (!delta) return;
    const d = this.data;
    this.t += delta / 1000;

    let travelled = this.t * d.speed;
    if (travelled > this.total) {
      if (!d.loop) {
        this.el.emit('shark-arc-complete');
        this.el.removeAttribute('shark-arc-jump');
        return;
      }
      this.t = 0;
      travelled = 0;
      this.firedExit = this.firedEntry = false;
    }

    const obj = this.el.object3D;
    const pos = this.startOffset.clone().add(this.dir.clone().multiplyScalar(travelled));

    // Height: flat while swimming, a sine hump while airborne. Using sine
    // rather than a parabola keeps the exit and entry angles shallow, which
    // looks like a breach instead of a mortar shell.
    const arcStart = d.approachM;
    const arcEnd = d.approachM + d.arcLengthM;
    let y = d.swimY;
    let climbRate = 0;

    if (travelled >= arcStart && travelled <= arcEnd) {
      const u = (travelled - arcStart) / d.arcLengthM;   // 0..1 through the arc
      y = d.swimY + Math.sin(u * Math.PI) * d.apexHeight;
      climbRate = Math.cos(u * Math.PI) * Math.PI * d.apexHeight / d.arcLengthM;

      if (!this.firedExit) {
        this.firedExit = true;
        this.el.emit('shark-breach-exit', { position: pos.clone().setY(d.swimY) });
      }
    } else if (travelled > arcEnd && !this.firedEntry) {
      this.firedEntry = true;
      const landing = this.startOffset.clone().add(this.dir.clone().multiplyScalar(arcEnd));
      this.el.emit('shark-breach-entry', { position: landing.setY(d.swimY) });
    }

    obj.position.copy(pos.setY(y));

    // Nose follows the velocity vector. A +Z-forward model pitches nose-up on
    // negative X rotation, hence the sign.
    obj.rotation.y = Math.atan2(this.dir.x, this.dir.z) + d.yawOffset * DEG;
    obj.rotation.x = -Math.atan2(climbRate, 1);
    // Roll a little at the top so the breach isn't perfectly rigid.
    obj.rotation.z = Math.sin(this.t * 1.6) * 4 * DEG;
  }
});

/**
 * Play a GLB's own baked jump, placed so it lands where you want it.
 *
 * maria-shark-jump-jimmy-txtr.glb is not an in-place swim cycle like the other
 * sharks: its bones carry the whole breach, and the path is huge next to the
 * body. Measured in the desktop sim with the shark sized to 3 m long, the baked
 * jump climbs 12.6 m and travels 85 m. Played on loop under shark-arc-jump
 * (which added its own arc on top), the shark was simply above and beyond the
 * frame — the river jump's "I see the shadow but not the shark, I think it's
 * too high".
 *
 * This reads the root bone's track from the clip, shifts the mesh so the top of
 * the jump sits on the entity's origin and the swim line at y=0, then scales
 * the *path* (not the shark) so the apex is `apexHeightM` above the water.
 * Put the entity where the apex should be, at water height, turned so local +Z
 * is the travel direction. Emits `shark-breach-exit` / `shark-breach-entry`
 * with a world {position} on the water line, for the splash.
 */
AFRAME.registerComponent('dive-clip', {
  schema: {
    bone: { type: 'string', default: 'spine' },
    // Splashes key off the head, which leads: 'spine' sits near the tail, and
    // keyed off it the splashes came ~0.5 s (out) and ~0.9 s (back in) after
    // the nose. (Bone names lose their dots on load — 'spine.007' is
    // 'spine007' — so use a dot-free name or it silently falls back.)
    headBone: { type: 'string', default: 'jaw' },
    apexHeightM: { type: 'number', default: 2.2 },  // 0 keeps the baked height
    // Ground covered from the first keyframe to the last. 0 scales it with the
    // height; set it to keep a low hop from turning into a slow crawl.
    runM: { type: 'number', default: 0 },
    splashAboveM: { type: 'number', default: 0.5 }  // counts as airborne above this
  },

  init: function () {
    this.ready = false;
    this.airborne = false;
    this.tmp = new THREE.Vector3();
    // Measure after model-normalize has scaled the mesh, not before.
    const evt = this.el.hasAttribute('model-normalize') ? 'model-normalized' : 'model-loaded';
    this.el.addEventListener(evt, () => this.setup(), { once: true });
  },

  setup: function () {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;
    const bone = mesh.getObjectByName(this.data.bone);
    const clip = (mesh.animations || [])[0];
    const track = clip && clip.tracks.find((t) => t.name === `${this.data.bone}.position`);
    if (!bone || !track) {
      console.warn('[dive-clip] no', this.data.bone, 'position track — playing clip unplaced');
      return;
    }

    const v = track.values;
    let apexIdx = 0;
    for (let i = 3; i < v.length; i += 3) if (v[i + 1] > v[apexIdx + 1]) apexIdx = i;

    this.el.object3D.updateMatrixWorld(true);
    const parentWorld = bone.parent.matrixWorld;
    const toLocal = (i) => this.el.object3D.worldToLocal(
      new THREE.Vector3(v[i], v[i + 1], v[i + 2]).applyMatrix4(parentWorld));
    const apex = toLocal(apexIdx);
    const start = toLocal(0);

    mesh.position.x -= apex.x;
    mesh.position.z -= apex.z;
    mesh.position.y -= start.y;

    // Always draw it. three decides whether a rigged mesh is on screen from its
    // bind-pose bounds, but this clip carries the body far from the bind pose
    // (and the path scaling above moves the mesh the other way), so mid-breach
    // the shark was culled as "off screen" while its splash rings drew — the
    // desktop sim shows it swim in and vanish the moment it leaves the water.
    // Very likely the field reports of "can't see it, just the shadow".
    mesh.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

    const rise = apex.y - start.y;
    this.pathScale = this.data.apexHeightM > 0 && rise > 0.01 ? this.data.apexHeightM / rise : 1;
    // Horizontal scale, separately: first-to-last keyframe along the ground.
    const end = toLocal(v.length - 3);
    const run = Math.hypot(end.x - start.x, end.z - start.z);
    this.runScale = this.data.runM > 0 && run > 0.01 ? this.data.runM / run : this.pathScale;
    this.base = mesh.position.clone();
    this.mesh = mesh;
    this.bone = bone;
    this.head = mesh.getObjectByName(this.data.headBone) ||
      mesh.getObjectByName(this.data.headBone.replace(/\./g, '')) || bone;
    this.headRest = null;   // the head's swim-line height, taken on the first tick
    this.ready = true;
  },

  tick: function () {
    if (!this.ready) return;
    const obj = this.el.object3D;

    // Where the clip alone puts the bone this frame, then pull the mesh so the
    // bone sits at pathScale × that instead. Moving the mesh moves the bone 1:1.
    this.mesh.position.copy(this.base);
    obj.updateMatrixWorld(true);
    const raw = obj.worldToLocal(this.bone.getWorldPosition(this.tmp));
    const kh = this.runScale - 1;
    const kv = this.pathScale - 1;
    this.mesh.position.set(this.base.x + raw.x * kh, this.base.y + raw.y * kv, this.base.z + raw.z * kh);
    // The mesh was just moved; measure the head where it will actually draw.
    this.mesh.updateMatrixWorld(true);
    const head = obj.worldToLocal(this.head.getWorldPosition(new THREE.Vector3()));
    if (this.headRest === null) this.headRest = head.y;
    const up = this.data.splashAboveM;
    const rise = head.y - this.headRest;

    let type = null;
    if (!this.airborne && rise > up) type = 'shark-breach-exit';
    else if (this.airborne && rise < up * 0.5) type = 'shark-breach-entry';
    if (!type) return;

    this.airborne = !this.airborne;
    head.y = 0;
    this.el.emit(type, { position: obj.localToWorld(head).clone() });
  }
});
