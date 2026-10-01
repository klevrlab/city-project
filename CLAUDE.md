# CLAUDE.md — city-project memory

## Project Identity
**Sharks Way — Immersion 2026**
WebAR platform for the Sharks Way corridor between downtown San José and SAP Center, built by SJSU students/faculty for **Immersion 2026**.

- Repo: `klevrlab/city-project` (GitHub)
- Version: 2.0 (`src/app.js` global `App.version = '2.0.0'`)
- Stack: Vanilla JS / HTML5 / CSS3 — **no framework, no backend**
- Build tool: Vite (`vite.config.js`), `npm run dev` / `npm run build`
- Local dev server: `python3 -m http.server 8080` (no build needed for plain HTML pages)

## Repo Layout

```
city-project/
├── index.html                  # Landing / hub page
├── sharks-way.html             # Redirect → shark-ar-8thwall.html (MobileNet page retired)
├── shark-ar-8thwall.html       # 8th Wall WebAR (GPS-triggered, 5 shark experiences)
├── shark-ar-demo.html          # Demo / sandbox
├── location-tour.html          # GPS checkpoint tour (Leaflet.js)
├── selfie-ar.html              # MediaPipe selfie AR (Sammy / Sharkie on shoulder)
├── marker-demo.html            # AR.js marker demo
├── debug-8thwall.html          # 8th Wall debug page
├── soccer-ar-8thwall.html      # Soccer AR variant
├── sharks-way-v0.html          # Legacy v0
├── src/
│   ├── app.js                  # 8th Wall entry point — registers A-Frame components/systems
│   ├── components/
│   │   ├── shark-animator.js
│   │   ├── shark-detector.js
│   │   ├── tour-ui.js
│   │   ├── navigation.js
│   │   └── soccer-game.js
│   ├── systems/
│   │   └── event-system.js
│   ├── utils/
│   │   ├── shark-embedding-detector.js   # TensorFlow MobileNet cosine similarity
│   │   ├── shared-gps-tracking.js        # Haversine GPS distance
│   │   ├── shared-map-markers.js
│   │   ├── shared-navigation.js
│   │   ├── checkpoint-loader.js
│   │   ├── xr8-shark-video-bridge.js     # 8th Wall ↔ video bridge
│   │   ├── xr8-scene-bootstrap.js
│   │   ├── audio-utils.js
│   │   └── math-utils.js
│   └── css/                    # Per-page stylesheets + shared-styles.css
├── assets/
│   ├── 3D-models/              # GLB files (SHAUN, STELLA, SEAN, Maria, Sharkie, etc.)
│   ├── Markers/                # AR marker images (hiro, shark-pattern)
│   ├── SharkLogo.png
│   └── video.mp4
├── data/
│   ├── shark-locations.json        # GPS coordinates for checkpoints
│   └── shark-embeddings-browser.json  # Pre-computed MobileNet v2 embeddings
├── 8w-distributed-engine/      # Placeholder for 8th Wall distributed engine
├── pattern-shark.patt          # AR.js custom shark marker pattern
├── sammy_final_pose.glb        # Sammy Spartan (SJSU mascot)
├── sharkie_final_pose.glb      # Sharkie (Sharks mascot)
├── vite.config.js
└── package.json
```

## Tech Stack (CDN-loaded, no npm install needed at runtime)

| Layer | Library | Version |
|---|---|---|
| WebAR | 8th Wall engine-binary + xrextras | 1.0.0 (pinned) |
| WebAR fallback | AR.js | 3.4.5 |
| 3D scenes | A-Frame — 8th Wall's 8frame fork on the 8th Wall pages | 1.5.0, vendored in `assets/vendor/8frame/` |
| AI detection | TensorFlow.js + MobileNet v2 | 4.22.0 |
| 3D model viewer | model-viewer | 3.4.0 |
| Maps | Leaflet.js | 1.9.4 |
| Pose tracking | MediaPipe Pose | 0.5.1675469404 (pinned) |
| Build | Vite | ^8.0.13 |

## Key Design Decisions

- **All processing is client-side** — no backend, no analytics, no PII collected.
- **GPS checkpoint radius:** 50 meters; Haversine formula in `shared-gps-tracking.js`.
- **Shark AI detection threshold:** cosine similarity ≥ 0.45 (`visionThreshold` in `shark-detector.js`; `&visionThreshold=` on site) against pre-computed MobileNet embeddings in `data/shark-embeddings-browser.json`.
- **Scan model:** the app loads `assets/models/mobilenet_v2_100_224_f16/` — the same weights stored as
  float16 (7 MB instead of 14; TF.js decodes to float32 on load). Checked against full precision:
  embeddings cos ≥ 0.9997, same best match, scores within ±0.003. `?scanModel=f32` loads the
  full-precision copy for comparing on site. Regenerate with `node tools/model-to-f16.mjs <src> <dst>` if the
  model ever changes (new directory name each time — a phone can cache model.json and shards
  separately for 10 min). `data/shark-embeddings-browser.json` values are rounded to 7 significant
  digits (float32 precision; 0.5 MB gzipped instead of 1).
- **MobileNet weights are self-hosted** in `assets/models/mobilenet_v2_100_224/` — byte-for-byte the TF Hub `mobilenet_v2_100_224/classification/2` files (TF Hub now serves them via Kaggle redirects; it's kept as the fallback). Load with `inputRange: [0, 1]`: with a `modelUrl` the package otherwise assumes [-1, 1] and every embedding drifts off the enrolled set. Verified identical embeddings (cos 1.0, max diff 0) against the Hub model.
- **Selfie AR shoulder target:** MediaPipe landmark 12 (right shoulder), offset X+50px / Y-70px.
- **8th Wall Wayfinding cycle (June 10 redline):** Maria + Jimmy alternating swim-throughs on camera detection of the painted sharks; ground-tap "drops" a stationary looping Jimmy, or — near a location — whatever is picked in the drop bar. Nothing is placed automatically from GPS (Sept 28).
- **HTTPS required** for camera and GPS. Phone testing: `npm run phone` (`tools/phone.mjs`) — Vite +
  a free Cloudflare quick tunnel (`brew install cloudflared`), QR code + links printed (and a big QR
  at `logs/phone/qr.html`); `npm run phone:test` points the QR at `?test=1`; `-- --dist` for the
  production build. The dev server serves the whole repo to the internet through the tunnel, so
  the log plugin 404s anything under `logs/` (GPS), however the path is spelled. `vite.config.js` allows `.trycloudflare.com` hosts. The script waits
  for the name on 1.1.1.1 before probing it: asking the Mac too early caches "not found" for minutes.

## AR Experiences

1. ~~**sharks-way.html** — TF.js + MobileNet AI shark painting detection~~ — **retired**; the MobileNet page now redirects to `shark-ar-8thwall.html` (the public `sharks-way.html` URL is preserved for the SJSU landing-page link).
2. **shark-ar-8thwall.html** — 8th Wall Wayfinding. Per the **June 10, 2026 redline**, the cycle is **Maria + Jimmy only**, appearing alternately when the camera recognises a painted shark (approach from behind → pause → swim off, no tap). Tapping the ground "drops a shark" — a single Jimmy that loops in place and stays so visitors can walk around it. Stella, Sharkie Waving, and the Diving Shark were removed from this cycle (Sharkie → selfie feature; Diving → jump drops; Stella → retired).
   **Sept 28 "final touches" (Rhonda): no more automatic location-based placements.** GPS no longer spawns or plants anything; scanning works everywhere (it used to be switched off in Little Italy). GPS only decides which extra *tap-to-drop* options the bottom drop bar offers (`src/components/location-experiences.js`, 75 m radius): Little Italy → Athena + Leaning Tower, Guadalupe River → river jump, SAP Center → "Drop a Party" (dancing mascots at the tap, a pod of sharks circling the visitor at 8 m, a jumping shark). Drops land where the visitor taps — no compass involved.
3. **location-tour.html** — Leaflet.js GPS checkpoint tour along the corridor (AR.js 3.4.8 location-based,
   pinned on jsDelivr). Stops come from `data/shark-locations.json`;
   "Free Throw at SAP Center" event as of Sept 29; update it when the next event is set.
4. **selfie-ar.html** — standalone MediaPipe shoulder-mount selfie with Sammy / Sharkie (`?character=sharkey`).
   Its placement, capture and share are a copy of Photo Mode's selfie in `sharks-way-modes.js`
   (cover-crop mapping, box sized to the screen, photo = what's on screen) — change them together.
5. **mural-ar.html** — Japantown Living Mural: open-source MindAR image tracking + GPS gate (single compiled target — the front relief — in `assets/targets/japan-am.mind`; multiple similar bronze panels cross-matched and caused phantom locks). Loads a **custom loose-threshold MindAR build** (`assets/vendor/mindar-image-aframe.custom.js`, rebuilt via `npm run build-tracker` in `tools/mind-compile/`) — detection/tracking confidence gates are deliberately permissive ("always shows something" > "always the right panel"), and `mural-plane.js` holds the last pose for 2.5s after tracking drops.

> Note: the AR.js marker demo (`marker-demo.html`) was removed during the Phase II consolidation.

## Model Loading

Only the wayfinding swimmers (Maria, Jimmy) are `<a-asset-item>`s in `shark-ar-8thwall.html`.
Everything else (Photo Mode mascots, Athena, tower, jump shark, Stella) is registered in
`src/utils/model-assets.js` and fetched when GPS puts the visitor near the location that uses it
(or Photo Mode opens); call `ensureModel(id)` before setting `gltf-model="#id"`. Startup model
download went from ~57 MB to ~0.84 MB (lazy loading, then Draco on the two swimmers).

Optimized GLBs (originals in git history): Athena textures resized to 1024
(`npx @gltf-transform/cli resize in.glb out.glb --width 1024 --height 1024`); tower and Stella
Draco-compressed (`npx @gltf-transform/cli draco in.glb out.glb`); Sharkie's 3000 px textures
capped at 2048 (root and `assets/` copies are the same file); swimmers Draco-compressed and Jimmy's
PNG texture converted to JPEG (`jpeg --formats png`) — Jimmy 3.82 → 0.43 MB, Maria 2.34 → 0.41 MB.

**Draco decoder is vendored** in `assets/vendor/draco/` (1.5.6, the version A-Frame loads by default)
and wired via `gltf-model="dracoDecoderPath: ./assets/vendor/draco/"` on the `<a-scene>` and
`window.ModelViewerElement.dracoDecoderLocation` for the selfie's model-viewer — which must be the
*global config object set before the library loads*; the class's static setter is reset by every
new `<model-viewer>`. With the swimmers compressed, decoding is on the startup path, so it must not
depend on gstatic. **`resize` drops Draco on write** —
run `draco` again afterwards on a file that had it, or a 3.6 MB Sharkie becomes 17.8 MB. Re-run
after any re-export from Blender.

**Athena in Photo Mode:** a third chip appears only while the Little Italy drop is on offer;
2.5 m tall, placed 2.5–5 m out, and on the shoulder in front-camera selfie.

## 3D Models (assets/3D-models/)

- `SHAUN_SHARK_ANIMATED.glb` / `SHAUN_SHARK.glb` — Shaun shark character
- `SEAN_ANIMATED_WiTH_MARIA_SHARK.glb` — Sean + Maria animated
- `STELLA_CAI_SHARK_SJSU_TEST1.glb` — Stella shark
- `maria-shark-jump-jimmy-txtr.glb` — Maria jumping with Jimmy texture
- `basketball_animation.glb` — Basketball
- `plushie_shark.glb` — Plushie shark
- `Pose_sharky_01.glb`, `Pose_sharky_01._no_glass.glb`, `Pose_sharky_02.glb`, `sharkie_pose_02.glb`
- Root-level: `sammy_final_pose.glb`, `sharkie_final_pose.glb`

## Team

**Faculty:** Rhonda Holberton, Marjan Khatibi, Lacey Nein (SJSU)
**Students:** Chris Velez, Maria (Phuong-Trang) Vu, Ganesh Nagavenkatasai Mohan Kancherla, Antony Cucina, Sean Cruz-Colatriano, Andrea Oppliger-Delgado, Tharun Chunchu
**Partners:** San Jose Downtown Association, City of San José Office of Cultural Affairs, San Jose Sharks, artist Jimmy Paints, KLEVR Labs, Reimagining the Civic Commons

## Upcoming Events (as of scan date 2026-05-21)

- Free Throw at SAP Center — Mar 26 & 28, 2026 (past)
- Minis & Trophy at Arena Green West — Mar 26 & 28, 2026 (past)
- International Football Watch Together — Jun–Jul 2026, San Pedro Square Market

## Shark Motion (hand-coded paths)

The GLBs carry only a swim cycle — no path animation — so travel is evaluated per frame in
`src/components/shark-motion.js`. The notes ask for a Blender follow-path constraint with offset
frames; this is the same idea in code, which keeps radius, speed and phase tunable on site.

- `shark-circle-swim` — orbits its parent's origin. `radius`, `period`, `phaseDeg` (the "offset the
  frames" trick), `height`, bob and bank. Finale uses 30 m radius / 60 s laps, two sharks 180° apart.
- `shark-arc-jump` — one breach: swims in along a **compass bearing** at water level, arcs up,
  lands, keeps going. Emits `shark-breach-exit` / `shark-breach-entry` for the splash (Rhonda's
  splash model is still TBD, so those fire the existing placeholder). Currently unused.
- `dive-clip` — for `maria-shark-jump-jimmy-txtr.glb`, which is **not** an in-place swim cycle:
  its bones carry the whole breach (~18 m forward, ~2.7 m up once sized). Reads the `spine`
  track and shifts the mesh so the apex sits on the entity origin and the swim line at y=0.
  Never put this model under `shark-arc-jump` — the two paths stack and the shark leaves frame
  (the Sept 28 "I see the shadow but not the shark" bug). The water is the floor the visitor taps
  (`RIVER_WATER_Y_M` = 0; `&waterY=-3` only for experiments).
  **Sizing:** Sept 28–29 said "too high" (the raw clip climbed 12.6 m); the 0.7 m cut that followed
  was "could honestly be higher" on Sept 30. The clip turns the shark near-vertical at the top, so
  its *length* adds to the apex — 2.5 m long (`JUMP_SHARK_MAX_DIM_M`), body centre peaking 1.6 m up
  (`JUMP_APEX_HEIGHT_M`), ~10 m run (`JUMP_RUN_M`, scaled separately from height). Measured: nose
  2.36 m, tail 1.04 m clear of the water at the top, mid-frame at 8 m with the phone level.
  **Frustum culling is off for this mesh** — three culls rigged meshes by bind-pose bounds, and
  this clip carries the body far from them, so the shark vanished mid-breach while the splash drew.

Both drive the entity's local transform, so the parent is the frame of reference — under a geo root
(−Z north, +X east) the bearings are real. Spec bearings: underpass east→west, river south→north,
finale east→west toward SAP.

**These models face +Z**, matching the existing `atan2(dx, dz)` yaw math. A model whose nose is not
+Z needs `yawOffset`.

Numbers worth knowing when they look wrong: `FINALE_CIRCLE_RADIUS_M` (30 — the notes say "60 meter
circle", read as diameter) and `FINALE_CIRCLE_PERIOD_MS` in `location-experiences.js`.

## Geo Anchoring

> **Not used for placement since Sept 28.** Rhonda: "No more automatic location based placements
> (too unreliable)" — everything is tap-to-drop now. `geo-anchor.js` still loads; the notes below
> describe why compass placement was unreliable, which is the reason not to bring it back.

Little Italy statues and the tower were placed at their **real coordinates** (`src/utils/geo-anchor.js`).
GPS alone can't do this — it gives position but not facing — so the anchor needs a heading:

```
scene yaw of north = camera's scene yaw + compass bearing the camera faces
```

Sources, in order of trust: a manual `calibrate()` (debug panel → "calibrate: facing SAP", which
substitutes the known corridor bearing of **87°**), iOS `webkitCompassHeading`, Android
`deviceorientationabsolute`. Compass samples are low-passed and only used once `GeoAnchor.stable`
(≥6 samples), because the first readings are junk and would plant the corridor at a random angle.

Fallback is the old camera-relative layout, used when there's no fix or no heading yet — and since
the compass usually settles *after* the first plant, `location-experiences` re-anchors itself once
automatically when it does. `?geo=0` forces camera-relative.

Error budget: downtown GPS ±5–15 m with multipath, magnetometer ±10–20°. At 30 m, 15° of heading
error is ~8 m sideways. So geo placement is right for fixed landmarks and wrong for "3 m in front
of you" — the wayfinding swim-throughs stay camera-relative on purpose.

Each pin gets its own sub-anchor at its true coordinate, so a saved placement override is an offset
**from the pin** and stays valid on the next visit, when the visitor stands somewhere else.

## Desktop Testing (no phone)

8th Wall itself needs a phone — SLAM and the camera feed have no desktop path, and XRExtras
replaces the page with a QR wall. Everything around it is ordinary A-Frame, so
`?desktop=1` (`src/utils/desktop-sim.js`) makes the rest testable on a laptop:

- clears the XRExtras QR / "almost there" overlays
- gives the camera WASD + mouse-look, a reference grid, and a 1 m wireframe cube for scale
- fakes `navigator.geolocation`, so geofences fire where you say they do

```
shark-ar-8thwall.html?desktop=1&debug=1&at=littleitaly
```

`at=` accepts `littleitaly | athena | tower | river | sap | underpass`, or pass `&lat=&lng=`. From the
console: `SimGps.teleport('sap')`, `SimGps.nudge(northM, eastM)`, `SimGps.where()`.
Drops without tapping: `SharksWayDrops.dropAhead('party')` (`shark | athena | tower | river | party`),
`SharksWayDrops.clear()`. `&demoLocations=1` offers every drop regardless of GPS.

A laptop has no magnetometer, so the sim also fakes an absolute compass (default 87°, the corridor
bearing). `&heading=200` starts it wrong on purpose; `SimCompass.set(deg)` moves it — that's how to
exercise geo placement and calibration without walking anywhere.

Not simulated: SLAM drift, real lighting, phone GPU limits, how content sits against an actual
street. Walk the corridor for those.

**Camera forward:** use `MathUtils.cameraForward(camEl)` — never
`camEl.object3D.getWorldDirection()`. The latter is `THREE.Object3D`'s method and returns the
object's **+Z**, i.e. out the *back* of the camera. (`THREE.Camera` overrides it to return −Z, but
`entity.object3D` is a Group; the camera is `entity.getObject3D('camera')`.) This is why Little
Italy statues and the tower planted *behind* the visitor. `shark-animator.js` and
`soccer-game.js` compensate with their own `* -1`.

## Model Sizing

The GLBs share no unit convention — measured raw heights: Athena **206 m**, Augustus **1.0 m**,
Leaning Tower **47.5 m**, Sharkie **1.95 m** (floating 1.01 m above its origin), Sammy **2.96 m**
(floating 0.42 m). Hand-tuned `scale="1.1 1.1 1.1"` values therefore meant something different per
asset and broke on every re-export.

`src/components/model-normalize.js` sizes a model in metres on load and drops it on the ground:
`model-normalize="height: 2.5"` or `maxDim: 3` for long, low shapes (sharks). It scales the *mesh*,
so entity transforms and saved placement overrides stack on top instead of being clobbered.

Current targets (ceiling ≈ one storey):

| Content | Size | Why |
|---|---|---|
| Athena (Little Italy tap drop) | 2.5 m tall | street statue, above human, under a storey |
| Sharkie / Sammy (Photo Mode + party dancers) | 1.9 m tall | person-scale for photos (was briefly 1.425 m; Rhonda found it too small) |
| Party circle sharks, jump diving shark | 3.0 m longest axis | height is the wrong axis to pin on a shark |
| Leaning Tower | 8 m tall | deliberate exception — the June 10 redline spec's 8 m |

Wayfinding swim-through sharks (`shark-animator.js`, ~0.4 scale) are intentionally left as tuned.

**Triangle budget (Sept 29 field log: the SAP party ran at 0–6 fps).** Sharkie (347k tris),
Sammy (241k), Stella (135k) and the Leaning Tower (244k) were simplified with glTF-Transform +
meshoptimizer to 69k / 57k / 60k / 60k and re-Draco'd — visually identical at phone scale. A
party is now ~225k tris instead of ~720k. Re-simplify any re-export of those four the same way.
The swimmers and jump shark are 15k each and need nothing.

## Field Log (on-device debugging)

`assets/js/sharks-way-log.js` — a classic script loaded **first** in every page's `<head>` (modules
run too late to see a CDN script fail). Inert unless the URL has `?debug=1` or `?log=1`; the choice
sticks for the tab session, `?log=0` turns it off.

Records: console output, JS errors, failed script/image loads, every file fetched (size, time,
cache), 8th Wall events (`xrloaded`, `realityready`, `realityerror`, `camerastatuschange`), model
loads/errors, page lifecycle, and a stats line every 5 s (fps, JS heap, GPU textures/geometries,
draw calls, XR state, mode, scan status + best score vs threshold, drops on offer). App code adds
lines with `SharksWayLog.add(category, message)` — GPS fixes (throttled), near/far changes with
distances, drops and time-to-screen, on-demand model fetches, photo placements, captures (with a
brightness/transparency sample to catch black photos), selfie camera/pose events.

Kept in localStorage (current page load + 2 earlier), so a crash or reload doesn't lose it; a load
that never reached `pagehide` is flagged **ENDED WITHOUT UNLOADING** (on iPhone, usually the tab
killed for memory). Nothing leaves the phone until someone taps Share/Download. Contains GPS.

**Exception — `npm run phone`:** a page served through a `*.trycloudflare.com` tunnel also posts its
lines every 2 s to the laptop's dev server (`tools/phone-log-plugin.mjs`), which writes
`logs/phone/YYYY-MM-DD.log` (gitignored) and echoes errors / ★ marks / test steps / drops to the
terminal. To read a phone test, read that file. Batches are numbered and written in order (a
`sendBeacon` from a backgrounded page can land late); gaps are noted after 10 s. github.io never
streams; `?logStream=1` / `0` forces it on / off.

To get a log: `shark-ar-8thwall.html?debug=1` → 🛠 → **LOG** → SHARE LOG (AirDrop / Messages /
Files) or DOWNLOAD; **MARK A MOMENT** drops a note into the log when something looks wrong. On other
pages (or with `?log=1`) a small **LOG** button sits bottom-left with the same actions.

## Real-world scale (read this before sizing anything)

8th Wall's default ("responsive") scale is **not metres**: it puts the camera 1.6 units above the
floor on the first frame, however high the phone really was. Open the page holding the phone at
waist height and a unit is ~0.65 m — the Sept 30 test run read the camera at 2.4 units, and
"Sharkie is kinda small" / Rhonda's "mascot small (sometimes)" is exactly this. So sizes and
distances written in metres are multiplied by `MathUtils.unitsPerMetre(camera)` (camera height in
units ÷ 1.45 m typical phone height, clamped 0.8–2.2) **at the moment of the drop**: drop roots,
Photo Mode mascots, drop distances, the jump and the party. The field log prints it on every drop
("scale 1.66 units/m (camera 2.40 units up)"). `model-normalize` sizes in the entity's *local*
units so a scaled parent isn't undone, and grounds to the entity's own floor (local y = 0).
Wayfinding swim-throughs and the dropped Jimmy are not rescaled (tuned as they are).

The scale is taken **once per session** (median camera height over the first ~10 s of tracking,
or the first drop if sooner) and kept — the scale doesn't change after tracking starts, but the
height does.

**The floor drifts.** 8th Wall's floor is y = 0 for the whole session and its height estimate
wanders as you walk: the Sept 30 corridor log went from camera 1.84 units up at the river to 0.35
at SAP and 0.08 in Little Italy — y = 0 ended up a metre above the pavement, so the party was "in
the sky" and taps near your feet landed a step out (then got pushed to the minimum distance).
`MathUtils.trackGround` (started by `location-experiences`) re-bases the floor to 1.45 m × k
below the camera when the camera spends ~3 s less than 0.5 m above the current floor, and moves
`#ground` there — taps, shadows and every drop follow. (More than 2.2 m above it re-takes the
scale instead: that's a page opened with the phone held low, not a sunken floor.) **Never hard-code y = 0 for a
drop**: use the tap point's y or `MathUtils.floorY()`. The log's stats line carries
`cam= floor= k=`, and each re-base is a `[ground]` line.

## No native dialogs on the AR pages

Never `window.prompt` / `confirm` / `alert` on the 8th Wall page: on iPhone a native dialog stalls
the camera feed until the phone is locked and unlocked. Every "camera froze" in the Sept 29–30 logs
followed a note prompt. Notes use `SharksWayLog.askNote(title, cb)` (an in-page box); destructive
buttons take a second tap. `src/utils/camera-watchdog.js` restarts the camera (XR8.pause/resume)
if the 8th Wall video's currentTime stops for 3 s while the page is visible — the log line is
"camera feed stalled … restarting camera".

## At-home Test Run (`?test=1`)

`shark-ar-8thwall.html?test=1` — a guided checklist card (`src/components/test-run.js`) over every
mode that doesn't need the corridor, all on this one page: camera, summon, drop a shark, Athena,
tower, river jump, party, Photo Mode place + snap, front-camera selfie + snap, Goalie, and an
automatic freeze/soak run (5 summons + 3 towers, GPU memory before/after). Each step's **Set it
up** button switches mode / picks the drop itself. ✓ / ✗ (prompts for a note) / Skip are logged
with measurements taken at that moment — distance, rendered height, base/top vs eye height, fps,
GPU memory — failures as `★ TEST FAIL` marks. `?test=1` also turns the field log on and unlocks
every drop without GPS. Progress survives a reload (sessionStorage). Share the log at the end.
Measurements print ≈metres (units ÷ unitsPerMetre) plus the raw units, eye height and scale.
Not covered: painted-shark scanning (needs the paintings).

## Placement Debug Mode

`shark-ar-8thwall.html?debug=1` loads `src/components/debug-placement.js` — an on-device HUD for
testing placements without walking the corridor. (Add `&demoLocations=1` to plant Little Italy +
tower with no GPS.)

- **STATUS** — XR/GPS/FPS, geofence distances with a "fire" button per jump pin, and every
  `<a-asset-item>` with its load state *and* HTTP status. A 404 GLB shows up here first.
- **MODELS** — spawn any GLB from the manifest 3 m ahead (or all of them in a grid). Each spawn
  logs its bounding-box size, which is how you tell "didn't load" from "loaded at 200 m tall".
- **OBJECTS** — every placed entity: key, loaded/ERROR, size, distance, visibility. Tap to select,
  or arm tap-to-select and tap the model in the camera view.
- **MOVE** — nudge/rotate/scale in camera-relative axes, drag along the ground, then SAVE.

Saves are keyed by `data-placement-key` (`little-italy/athena`, `leaning-tower/drop`,
`party/dancer-sammy`, …) and stored by `src/utils/placement-overrides.js`:

1. `data/placement-overrides.json` — committed baseline (optional; 404 is fine)
2. `localStorage['sharksway.placement']` — this device's tuning, wins over the baseline

EXPORT downloads the merged JSON; commit it as `data/placement-overrides.json` to make a tweak
everyone's. Saved transforms are **local to the drop root** (an entity at the tap point, turned
so its +Z faces the visitor), not world coordinates — so a saved tweak is "relative to wherever
you tapped" and carries over to the next drop. `window.SharksWayDebug` exposes the same
operations to the console.

**Facing:** mascots, Maria, Jimmy and Athena face **+Z**; **Stella faces −Z** (party ring uses
`yawOffset: 180` for her — she swam tail-first before). Dropped Jimmy points the way the visitor
faces, hovering at swim-through height (0.35).

**Rise from the ground:** Athena and the tower rise out of the floor on drop
(`riseFromGround`: a wrapper entity eases up from below, materials clipped at world y = 0 during
the rise so the buried part doesn't show).

**Splash:** `spawnSplash` — flat rings + droplets (`splash-drop`), sized in metres. Timed off the
jump shark's `jaw` bone (dive-clip `headBone`): it leads; the `spine` bone is near the tail and
fired ~0.5 s / 0.9 s late. Bone names lose their dots on load (`spine.007` → `spine007`).

**Drop distances:** taps are pushed out to a minimum distance along the tapped line
(`MIN_DROP_DISTANCE_M`: river 8 m, tower 4 m, Athena / party 3 m) and pulled in to 25 m. The
tower was 12 m until Sept 30 — it overrode ordinary taps ("visibly offset forward").

**Tower base on the tap:** its file origin is ~1 m from its base (the lean), so it's sized with
`model-normalize="…; centerBase: true"` — the centre of the bottom 3% of vertices goes on the tap.

**GPU memory:** `src/components/gltf-dispose.js` patches A-Frame's `gltf-model` to free geometry,
textures and skeletons on remove. Without it every swim-through and drop leaked, and long field
sessions froze. `shared-gltf` instances are not disposed (shared master).

**Scanning:** one swim-through per recognised painting (or Summon); then `sharkSwimDone` re-arms
the detector after a 5 s cooldown. It used to loop Maria/Jimmy forever and never scan again.
Scanning pauses while a party is running.

**Rigged models:** `model-normalize` poses the skeleton before measuring. Without that, three's
cached skinned bounding box is computed before the first pose and the "normalized" size is
wrong — Sharkie at "1.9 m" rendered ~7 m tall, half underground.

**Measure vertices, not boxes:** `model-normalize` uses `Box3.setFromObject(mesh, true)` (precise).
The default takes each part's bounding box rotated into place, which over-reaches for rotated
parts — the Leaning Tower's thin base plate read ~0.5 m lower than it is, so "grounding" left the
tower floating half a metre up (always had; found by the Sept 30 test run).

## Development Notes

- No test suite (`npm test` is a placeholder).
- `vite.config.js` has a `copyStaticAssets` plugin that copies `assets/`, `data/`, and root GLB/patt files into `dist/` — vite can't trace runtime fetches (GLBs, `.mind`, JSON), so without it the deployed site 404s on all of them.
- CSS is per-page (e.g. `src/css/shark-ar-8thwall-styles.css` for `shark-ar-8thwall.html`) plus `shared-styles.css`.
- **Hamburger menu** (`navigation.js`): open/close it with the `open` / `visible` classes only — never an
  inline `style.right`. One did (`closeNavIfOpen` on Summon), and inline beats `.open`, so the
  hamburger only greyed the screen from then on (Oct 1). The on-screen "Summon a Shark" button is
  gone; `window.manualSharkSpawn()` stays for the test run and the console.
  `navigation.js` is the menu's only owner — `tour-ui.js` used to bind the hamburger too, and its
  `touchend` preventDefault meant navigation.js never ran on a phone. Pages whose `#topbar` has
  `pointer-events: none` (mural, soccer) need the button switched back on — `navigation.css` does it
  for `#hamburger-btn`; the menu was dead on both pages until Oct 1. The open menu sits above the
  debug panel and test card (z 10010+).
- `src/app.js` is the 8th Wall entry point; other HTML pages inline or script-tag their own logic.
- `8w-distributed-engine/` is currently a placeholder (`.gitkeep`).
- Deploy: `.github/workflows/deploy-pages.yml` builds **main** and publishes it to GitHub Pages
  (Pages source = GitHub Actions since Sept 29, 2026; other branches can't deploy).
- The site also still works **served raw** (useful for `python3 -m http.server`): no `import './x.css'` in JS (link the
  stylesheet in the HTML — Vite bundles it the same), no bare npm imports, and `.nojekyll` stays at
  the root. Test with the `sharks-way-static` launch config (plain `python3 -m http.server`).
- `sharks-way-dist` launch config serves the production build (`vite preview`, :4173).
- Docs: `ARCHITECTURE.md` (system design), `DEPLOYMENT.md` (hosting guide).

## Git Workflow

- **Always push to `claude/scan-repo-memory-VYvsv`** (the soccer branch). Never push to main or any other branch without explicit permission from Chris.
- Commits should be attributed to Christopher Anthony Velez <lilvelezcav@gmail.com>.
