/**
 * Cycles through multiple shark "experiences" on each detection.
 */
AFRAME.registerComponent('shark-animator', {
  schema: {
    triggerDelayMs: { type: 'number', default: 1200 },
    minPingCount: { type: 'number', default: 1 },
    scale: { type: 'vec3', default: { x: 0.4, y: 0.4, z: 0.4 } }
  },

  init: function () {
    this.currentIndex = 0;
    this.isRunning = false;
    this.alwaysOn = false;
    this.activeEntity = null;
    this.targetMarker = null;
    this.lastTriggerAt = 0;
    this.currentTarget = null;
    this.timers = [];

    // Keep the requested west/east Little Italy coordinates documented for future geo-anchoring.
    this.littleItalyCoords = {
      west: { lat: 37.334778, lng: -121.899222 },
      east: { lat: 37.335444, lng: -121.896778 }
    };

    // Extra world-space lift so geometry stays clearly above the shadow receiver.
    this.FLOOR_CLEARANCE = 0.03;

    // June 10, 2026 redline — Wayfinding Shark Mode is Maria & Jimmy only,
    // appearing alternately each time a shark is detected: they approach as if
    // from behind the viewer, pause in front, then swim off (no tap needed).
    // Stella, Sharkie Waving, and the Diving Shark were removed from this cycle
    // (Sharkie → selfie feature, Diving → select jump locations, Stella → retired).
    // Only the 'enterCenter' motion branch is exercised now; the other branches
    // in runAnimationPhases are kept for the upcoming jump-location experiences.
    this.experiences = [
      {
        label: 'Maria Swimmer',
        model: '#maria-swimmer',
        motion: 'enterCenter',
        y: 0.28,
        scale: '0.42 0.42 0.42',
        rotationOffsetY: 0
      },
      {
        label: 'Jimmy Swimmer',
        model: '#jimmy-swimmer',
        motion: 'enterCenter',
        y: 0.28,
        scale: '0.40 0.40 0.40',
        rotationOffsetY: 0
      }
    ];

    this.createMarker();

    // Tapping the ground "drops" a single Jimmy that loops its swim animation in
    // place and stays put so visitors can walk around it (redline "drop a shark").
    // Auto-detection still drives the alternating Maria/Jimmy swim-through cycle.
    // Photo / Goalie modes own the ground tap — skip drop while those are active.
    const ground = document.getElementById('ground');
    if (ground) {
      ground.addEventListener('click', (e) => {
        if (window.SharksWayMode && !window.SharksWayMode.isWayfinding()) return;
        // Near a location the drop bar can switch the tap to Athena, the tower,
        // the river jump or the party — location-experiences handles those.
        if (window.SharksWayDrops && window.SharksWayDrops.selected() !== 'shark') return;
        const pt = e.detail.intersection.point;
        this.dropShark(pt);
      });
    }

    window.addEventListener('realityready', () => {
      const instruction = document.getElementById('tap-instruction');
      if (instruction && !this.isRunning) instruction.classList.add('visible');
    });

    window.manualSharkSpawn = () => {
      if (window.SharksWayMode && !window.SharksWayMode.isWayfinding()) return;
      const pt = this.getForwardTarget(4);
      this.spawnAtTarget(pt);
      this.closeNavIfOpen();
    };

    this.el.sceneEl.addEventListener('sharkFound', (e) => {
      // Wayfinding-only: Photo / Goalie modes suppress auto swim-throughs.
      if (window.SharksWayMode && !window.SharksWayMode.isWayfinding()) return;

      const detail = (e && e.detail) || {};
      const now = performance.now();
      const pingCount = Number(detail.pingCount || 0);
      const delayReady = now - this.lastTriggerAt >= this.data.triggerDelayMs;
      const pingReady = pingCount === 0 || pingCount >= this.data.minPingCount;

      // Little Italy always-on bypasses the delay/ping gate so the cycle reseats
      // immediately when the user enters the zone.
      const isAlwaysOn = Boolean(detail.alwaysOn);
      this.alwaysOn = isAlwaysOn;

      if (!isAlwaysOn && (!delayReady || !pingReady)) return;
      this.lastTriggerAt = now;
      this.spawnAtTarget(this.getForwardTarget(4.2));
    });

    this.el.sceneEl.addEventListener('sharkAlwaysOnExit', () => {
      this.alwaysOn = false;
    });

    this.el.sceneEl.addEventListener('dismissSharkUi', () => {
      if (this.alwaysOn) return; // never dismiss while in Little Italy
      this.stopCycle();
    });
  },

  closeNavIfOpen: function () {
    const navMenu = document.getElementById('nav-menu');
    const navOverlay = document.getElementById('nav-overlay');
    if (navMenu) {
      navMenu.style.right = '-100%';
      navMenu.classList.remove('open');
    }
    if (navOverlay) navOverlay.classList.remove('visible');
  },

  /**
   * A ground point `distanceMeters` ahead, measured along the ground. The old
   * version stepped along the camera's full 3D forward and then dropped to
   * y=0, so with the phone pointed down at a painted shark — the exact moment
   * a scan fires — the target landed almost under the visitor's feet. From
   * there the swim direction degenerated to world −Z, unrelated to where they
   * faced: the "swimming at a funny angle" on site.
   */
  getForwardTarget: function (distanceMeters) {
    const cam = document.getElementById('camera');
    const pt = cam.object3D.getWorldPosition(new THREE.Vector3());
    pt.addScaledVector(window.MathUtils.cameraForward(cam), distanceMeters);
    pt.y = 0;
    return pt;
  },

  createMarker: function () {
    this.targetMarker = document.createElement('a-entity');
    this.targetMarker.setAttribute('geometry', 'primitive: ring; radiusInner: 0.6; radiusOuter: 0.8;');
    this.targetMarker.setAttribute('material', 'color: #00A9E0; shader: flat; transparent: true; opacity: 0.8;');
    this.targetMarker.setAttribute('rotation', '-90 0 0');
    this.targetMarker.setAttribute('position', '0 -1000 0');
    this.targetMarker.setAttribute('animation__scale', 'property: scale; to: 1.2 1.2 1.2; dir: alternate; loop: true; dur: 1000');
    this.targetMarker.setAttribute('animation__fade', 'property: material.opacity; to: 0.2; dir: alternate; loop: true; dur: 1000');
    this.el.sceneEl.appendChild(this.targetMarker);
  },

  clearTimers: function () {
    this.timers.forEach((timerId) => clearTimeout(timerId));
    this.timers = [];
  },

  queue: function (fn, ms) {
    const timerId = setTimeout(fn, ms);
    this.timers.push(timerId);
    return timerId;
  },

  stopCycle: function () {
    this.isRunning = false;
    this.clearTimers();
    if (this.activeEntity && this.activeEntity.parentNode === this.el) {
      this.el.removeChild(this.activeEntity);
    }
    this.activeEntity = null;
    if (this.targetMarker) this.targetMarker.setAttribute('position', '0 -1000 0');
  },

  /**
   * One swim-through per detection, then hand scanning back.
   *
   * This used to queue the next shark straight away, forever: after the first
   * painted shark was recognised, Maria and Jimmy alternated every ~10 s for
   * the rest of the visit while the detector — still marked "shark visible" —
   * never scanned again. Field log, Sept 29: two dozen swim-throughs from a
   * single match, marked "Not auto scanning". Now each match (or Summon) gets
   * one shark, and the next scan brings the other one.
   */
  finishSwim: function () {
    this.stopCycle();
    this.el.sceneEl.emit('sharkSwimDone');
  },

  spawnAtTarget: function (targetPoint) {
    if (!targetPoint) return;
    this.currentTarget = targetPoint.clone ? targetPoint.clone() : new THREE.Vector3(targetPoint.x, targetPoint.y, targetPoint.z);
    this.isRunning = true;

    const root = document.getElementById('shark-root');
    if (root) root.setAttribute('visible', 'true');

    // Once a shark is detected, surface the "drop a shark" prompt rather than
    // hiding the overlay — tapping the ground places a Jimmy that stays put.
    const instruction = document.getElementById('tap-instruction');
    if (instruction) {
      instruction.textContent = 'Tap the ground to drop your own shark';
      instruction.classList.add('visible');
    }

    if (this.targetMarker) {
      this.targetMarker.setAttribute('position', `${this.currentTarget.x} ${this.currentTarget.y + 0.05} ${this.currentTarget.z}`);
    }

    this.cycleNext(this.currentTarget);
  },

  // "Drop a shark" (redline): place a single Jimmy at the tapped point that rises
  // out of the ground and loops its swim animation in place — it never swims away,
  // so visitors can circle it. Replaces any running swim-through cycle.
  dropShark: function (targetPoint) {
    if (!targetPoint) return;
    if (window.SharksWayLog) window.SharksWayLog.add('drop', 'shark (looping Jimmy)');
    this.stopCycle();          // clear any active swim-through + its timers
    this.isRunning = false;    // dropped shark is standalone, not part of the cycle
    // A swim-through cut short by the drop never reaches finishSwim, so hand
    // scanning back here or it stays paused.
    this.el.sceneEl.emit('sharkSwimDone');

    const root = document.getElementById('shark-root');
    if (root) root.setAttribute('visible', 'true');

    const instruction = document.getElementById('tap-instruction');
    if (instruction) instruction.classList.remove('visible');
    if (this.targetMarker) this.targetMarker.setAttribute('position', '0 -1000 0');

    const x = targetPoint.x;
    const z = targetPoint.z;
    const startY = -0.6;
    const hoverY = 0.95;

    // Side-on to the viewer, nose to their right: a shark swimming forward in
    // place. Nose-on it read as a shark swimming at you that never arrives.
    let facingYaw = 0;
    const cam = document.getElementById('camera');
    if (cam && window.MathUtils) {
      const right = window.MathUtils.cameraRight(cam);
      facingYaw = Math.atan2(right.x, right.z) * (180 / Math.PI);
    }

    const ent = document.createElement('a-entity');
    ent.addEventListener('model-loaded', () => {
      this.alignGltfBottomToOrigin(ent);
      ent.setAttribute('visible', 'true');
      ent.setAttribute('animation__rise', {
        property: 'position',
        from: `${x} ${startY} ${z}`,
        to: `${x} ${hoverY} ${z}`,
        dur: 1600,
        easing: 'easeOutCubic'
      });
      // Gentle hover bob in place once risen — loops forever, never swims off.
      this.queue(() => {
        if (this.activeEntity !== ent) return;
        ent.setAttribute('animation__hoverBob', {
          property: 'position',
          from: `${x} ${(hoverY - 0.1).toFixed(3)} ${z}`,
          to: `${x} ${(hoverY + 0.1).toFixed(3)} ${z}`,
          dir: 'alternate',
          loop: true,
          dur: 1400,
          easing: 'easeInOutSine'
        });
      }, 1600);
    }, { once: true });

    ent.addEventListener('model-error', () => {
      console.warn('Failed to load dropped Jimmy model');
    }, { once: true });

    ent.setAttribute('gltf-model', '#jimmy-swimmer');
    ent.setAttribute('animation-mixer', 'loop: repeat; timeScale: 1.0; crossFadeDuration: 0.35;');
    ent.setAttribute('scale', '0.40 0.40 0.40');
    ent.setAttribute('position', `${x} ${startY} ${z}`);
    ent.setAttribute('rotation', `0 ${facingYaw} 0`);
    ent.setAttribute('visible', 'false');
    ent.setAttribute('shadow', 'cast: true');
    ent.setAttribute('data-experience', 'Dropped Jimmy');

    this.el.appendChild(ent);
    this.activeEntity = ent;
  },

  cycleNext: function (targetPoint) {
    if (!this.isRunning) return;
    this.clearTimers();

    if (this.activeEntity && this.activeEntity.parentNode === this.el) {
      this.el.removeChild(this.activeEntity);
      this.activeEntity = null;
    }

    const experience = this.experiences[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.experiences.length;
    if (window.SharksWayLog) {
      window.SharksWayLog.add('swim', `swim-through ${experience.label}`);
    }

    const ent = document.createElement('a-entity');
    ent.addEventListener('model-loaded', () => {
      if (experience.motion !== 'diveArc') {
        this.alignGltfBottomToOrigin(ent);
      }
      if (experience.motion === 'wavePose' || experience.motion === 'enterCenter') {
        this.fixGltfTransparentSorting(ent);
      }
      ent.setAttribute('visible', 'true');
      this.runAnimationPhases(ent, targetPoint, experience);
    }, { once: true });

    ent.addEventListener('model-error', () => {
      console.warn('Failed to load shark experience model:', experience.model);
      this.queue(() => this.finishSwim(), 500);
    }, { once: true });

    ent.setAttribute('gltf-model', experience.model);
    ent.setAttribute('animation-mixer', 'loop: repeat; timeScale: 1.0; crossFadeDuration: 0.35;');
    ent.setAttribute('scale', experience.scale || `${this.data.scale.x} ${this.data.scale.y} ${this.data.scale.z}`);
    ent.setAttribute('visible', 'false');
    ent.setAttribute('shadow', 'cast: true');
    ent.setAttribute('data-experience', experience.label);

    this.el.appendChild(ent);
    this.activeEntity = ent;
  },

  runAnimationPhases: function (ent, targetPoint, experience) {
    const cam = document.getElementById('camera');
    const camPos = cam.object3D.position.clone();
    const dirToTarget = new THREE.Vector3().subVectors(targetPoint, camPos);
    dirToTarget.y = 0;
    if (dirToTarget.lengthSq() < 0.1) window.MathUtils.cameraForward(cam, dirToTarget);
    dirToTarget.normalize();
    const baseYaw = Math.atan2(dirToTarget.x, dirToTarget.z) * (180 / Math.PI);
    const facingYaw = baseYaw + (experience.rotationOffsetY || 0);
    const baseY = Number(experience.y || 0.5);
    const y = baseY + (this.FLOOR_CLEARANCE || 0);

    if (experience.motion === 'riseFromGround') {
      // Jimmy: emerges smoothly from below ground, hovers above the painting long
      // enough for the viewer to walk around it, then sinks back.
      const startY = -0.6;
      const hoverY = y + 0.35;
      const sinkY = -0.4;
      const x = targetPoint.x;
      const z = targetPoint.z;

      ent.setAttribute('position', `${x} ${startY} ${z}`);
      ent.setAttribute('rotation', `0 ${facingYaw} 0`);

      ent.setAttribute('animation__rise', {
        property: 'position',
        from: `${x} ${startY} ${z}`,
        to: `${x} ${hoverY} ${z}`,
        dur: 1800,
        easing: 'easeOutCubic'
      });

      // Gentle hover bob once the rise completes.
      this.queue(() => {
        if (!this.isRunning || this.activeEntity !== ent) return;
        ent.setAttribute('animation__hoverBob', {
          property: 'position',
          from: `${x} ${(hoverY - 0.12).toFixed(3)} ${z}`,
          to: `${x} ${(hoverY + 0.12).toFixed(3)} ${z}`,
          dir: 'alternate',
          loop: true,
          dur: 1100,
          easing: 'easeInOutSine'
        });
      }, 1800);

      // Linger so visitors can circle the model.
      const lingerMs = 6000;

      // Sink back into the ground as the cycle ends.
      this.queue(() => {
        if (!this.isRunning || this.activeEntity !== ent) return;
        ent.removeAttribute('animation__hoverBob');
        ent.setAttribute('animation__sink', {
          property: 'position',
          from: `${x} ${hoverY} ${z}`,
          to: `${x} ${sinkY} ${z}`,
          dur: 1500,
          easing: 'easeInCubic'
        });
      }, 1800 + lingerMs);

      this.queue(() => this.finishSwim(), 1800 + lingerMs + 1500 + 200);
      return;
    }

    if (experience.motion === 'wavePose') {
      // Sharkie rises smoothly out of the ground (no fade), holds the pose long
      // enough for a selfie, then sinks back.
      const x = targetPoint.x;
      const z = targetPoint.z - 0.35;
      const startY = -0.6;
      const poseY = y;
      const sinkY = -0.4;

      ent.setAttribute('position', `${x} ${startY} ${z}`);
      ent.setAttribute('rotation', `0 ${facingYaw} 0`);

      ent.setAttribute('animation__rise', {
        property: 'position',
        from: `${x} ${startY} ${z}`,
        to: `${x} ${poseY} ${z}`,
        dur: 1800,
        easing: 'easeOutCubic'
      });

      // Start the wave sway once Sharkie is up.
      this.queue(() => {
        if (!this.isRunning || this.activeEntity !== ent) return;
        ent.setAttribute('animation__poseSway', {
          property: 'rotation',
          from: `0 ${(facingYaw - 8).toFixed(3)} 0`,
          to: `0 ${(facingYaw + 8).toFixed(3)} 0`,
          dir: 'alternate',
          loop: true,
          dur: 1800,
          easing: 'easeInOutSine'
        });
      }, 1800);

      const lingerMs = 5500;

      // Sink back into the ground before handing off to the next cycle.
      this.queue(() => {
        if (!this.isRunning || this.activeEntity !== ent) return;
        ent.removeAttribute('animation__poseSway');
        ent.setAttribute('animation__sink', {
          property: 'position',
          from: `${x} ${poseY} ${z}`,
          to: `${x} ${sinkY} ${z}`,
          dur: 1500,
          easing: 'easeInCubic'
        });
      }, 1800 + lingerMs);

      this.queue(() => this.finishSwim(), 1800 + lingerMs + 1500 + 200);
      return;
    }

    if (experience.motion === 'diveArc') {
      // The diving-shark GLB has its own dive animation baked in, so just plant it
      // at the painting and let animation-mixer drive the motion. Anchored above
      // the ground at the painting's anchor point with a gentle bob.
      const x = targetPoint.x;
      const z = targetPoint.z;
      const anchorY = y;

      ent.setAttribute('position', `${x} ${anchorY} ${z}`);
      ent.setAttribute('rotation', `0 ${facingYaw} 0`);

      // Subtle bob so it doesn't look frozen if the GLB animation has a quiet moment.
      ent.setAttribute('animation__diveBob', {
        property: 'position',
        from: `${x} ${(anchorY - 0.08).toFixed(3)} ${z}`,
        to: `${x} ${(anchorY + 0.08).toFixed(3)} ${z}`,
        dir: 'alternate',
        loop: true,
        dur: 1200,
        easing: 'easeInOutSine'
      });

      this.queue(() => this.finishSwim(), 7000);
      return;
    }

    // Default motion (Maria / Jimmy): one straight line, nose first — in from
    // behind the viewer, a pause in front, then on out the same way.
    //
    // The exit used to bend ~35° toward camera-left (a "head west toward SAP"
    // guess that had no compass behind it) and turn into the bend, so every
    // shark veered off at an angle after its pause — Sept 29: "they should only
    // swim forward". Keeping one heading for the whole pass means the shark is
    // always swimming the way it points.
    const swimInDur = 2500;
    const centerDwellDur = 4500;
    const swimOutDur = 2500;

    const startPos = new THREE.Vector3().copy(camPos).sub(dirToTarget.clone().multiplyScalar(3.4));
    startPos.y = y;
    const centerPos = new THREE.Vector3(targetPoint.x, y, targetPoint.z);
    const endPos = new THREE.Vector3().copy(targetPoint).add(dirToTarget.clone().multiplyScalar(10.5));
    endPos.y = y;

    ent.setAttribute('position', `${startPos.x} ${startPos.y} ${startPos.z}`);
    ent.setAttribute('rotation', `0 ${facingYaw} 0`);
    ent.setAttribute('animation__swimIn', {
      property: 'position',
      from: `${startPos.x} ${startPos.y} ${startPos.z}`,
      to: `${centerPos.x} ${centerPos.y} ${centerPos.z}`,
      dur: swimInDur,
      easing: 'easeOutSine'
    });

    this.queue(() => {
      if (!this.isRunning || this.activeEntity !== ent) return;
      ent.setAttribute('animation__hover', {
        property: 'position',
        from: `${centerPos.x} ${(centerPos.y - 0.06).toFixed(3)} ${centerPos.z}`,
        to: `${centerPos.x} ${(centerPos.y + 0.06).toFixed(3)} ${centerPos.z}`,
        dir: 'alternate',
        loop: true,
        dur: 900,
        easing: 'easeInOutSine'
      });
    }, swimInDur);

    this.queue(() => {
      if (!this.isRunning || this.activeEntity !== ent) return;
      ent.removeAttribute('animation__hover');
      ent.setAttribute('animation__swimOut', {
        property: 'position',
        from: `${centerPos.x} ${centerPos.y} ${centerPos.z}`,
        to: `${endPos.x} ${endPos.y} ${endPos.z}`,
        dur: swimOutDur,
        easing: 'easeInSine'
      });
    }, swimInDur + centerDwellDur);

    this.queue(() => this.finishSwim(), swimInDur + centerDwellDur + swimOutDur + 200);
  },

  // Reduces "see-through" face sorting (back of mouth / inner shell drawing on top of
  // the snout) by forcing front faces only and writing depth for semi-transparent parts.
  fixGltfTransparentSorting: function (ent) {
    const root = ent.getObject3D('mesh');
    if (!root || typeof THREE === 'undefined') return;
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.FrontSide;
        mat.depthTest = true;
        const isTransparent = mat.transparent === true ||
          (mat.opacity != null && mat.opacity < 0.999);
        if (isTransparent) {
          mat.depthWrite = true;
          mat.needsUpdate = true;
        }
      });
    });
  },

  // Shift loaded GLTF mesh so the world-space bottom of its bounding box sits at
  // local y=0 on this entity. Stops belly/center pivots from clipping the floor plane.
  // Also centres the body over the entity horizontally — see centerGltfOnOrigin.
  alignGltfBottomToOrigin: function (ent) {
    const mesh = ent.getObject3D('mesh');
    if (!mesh || typeof THREE === 'undefined') return;
    try {
      this.centerGltfOnOrigin(ent);
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      mesh.position.y += -box.min.y;
    } catch (e) {
      /* ignore bbox errors */
    }
  },

  /**
   * Put the body, not the file's origin, on the entity's position.
   *
   * The swimmer GLBs sit ~4.5 model units behind their origin (nose at z −2.7,
   * tail at −6.5), which is 1.8 m at 0.4 scale. So a swim-through "arrived"
   * with its body 1.8 m short of the target, a dropped shark landed 1.8 m past
   * the tap, and any yaw swung the body around an invisible point in front of
   * it. X/Z only — the tuned heights stay as they were.
   *
   * Rigged meshes are measured posed (skeleton updated, bounds recomputed);
   * three's cached skinned bounds are taken before the first pose and are junk.
   */
  centerGltfOnOrigin: function (ent) {
    const mesh = ent.getObject3D('mesh');
    if (!mesh) return;
    ent.object3D.updateWorldMatrix(true, false);
    mesh.updateMatrixWorld(true);
    mesh.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton && typeof o.computeBoundingBox === 'function') {
        o.skeleton.update();
        o.computeBoundingBox();
      }
    });
    const world = new THREE.Box3().setFromObject(mesh);
    if (world.isEmpty()) return;
    const c = world.getCenter(new THREE.Vector3());
    ent.object3D.worldToLocal(c);
    mesh.position.x -= c.x;
    mesh.position.z -= c.z;
  },

});
