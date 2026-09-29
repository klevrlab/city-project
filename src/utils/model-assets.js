/**
 * Which GLB each asset id points at, and loading the location-only ones on demand.
 *
 * Every model used to be an <a-asset-item> in shark-ar-8thwall.html, so every
 * visitor downloaded all of them the moment the page opened — ~57 MB, most of
 * it Athena, the Leaning Tower and Stella — on a phone, usually on cellular,
 * wherever on the corridor they happened to be. Only the two wayfinding
 * swimmers are needed the instant a painted shark is scanned; they stay in the
 * markup. Everything else is declared here and added to <a-assets> just before
 * it's used:
 *
 *   - prefetched when GPS puts the visitor near the location that offers it
 *     (location-experiences) or when Photo Mode opens (sharks-way-modes)
 *   - ensured again at the tap, for the paths where no prefetch ran
 *     (`?demoLocations=1`, debug-panel drops)
 *
 * An <a-asset-item> added after the scene started loads like one in the markup:
 * `#id` selectors resolve, and A-Frame turns on THREE.Cache, so gltf-model and
 * shared-gltf reuse its bytes instead of fetching the file a second time.
 *
 * Callers must ensureModel() *before* setting `gltf-model="#id"` — A-Frame
 * resolves the selector once, and a missing element means no model.
 */

const LAZY_MODELS = {
  'photo-sharkie': './assets/3D-models/sharkie_final_pose.glb',
  'photo-sammy': './assets/3D-models/sammy_final_pose.glb',
  'athena-point-right': './assets/3D-models/Athena_Statue-point-right.glb',
  'leaning-tower-model': './assets/3D-models/Leaning_Tower_of_Pisa.glb',
  'diving-shark': './assets/3D-models/maria-shark-jump-jimmy-txtr.glb',
  'circle-stella': './assets/3D-models/STELLA_CAI_SHARK_SJSU_TEST1.glb'
};

/** The file behind an asset id, whether it's declared here or in the markup. */
export function modelSrc(id) {
  const el = document.getElementById(id);
  if (el && el.getAttribute('src')) return el.getAttribute('src');
  return LAZY_MODELS[id] || null;
}

/** The <a-asset-item> for `id`, created (and so starting to download) if needed. */
export function ensureModel(id) {
  const existing = document.getElementById(id);
  if (existing) return existing;
  const src = LAZY_MODELS[id];
  const assets = document.querySelector('a-assets');
  if (!src || !assets) {
    console.warn(`[model-assets] no model registered for "${id}"`);
    return null;
  }
  const item = document.createElement('a-asset-item');
  item.setAttribute('id', id);
  item.setAttribute('src', src);
  assets.appendChild(item);
  return item;
}

export function prefetchModels(ids) {
  (ids || []).forEach((id) => ensureModel(id));
}

/** Resolves true once the file is downloaded, false if it failed. */
export function whenModelReady(id) {
  const item = ensureModel(id);
  if (!item) return Promise.resolve(false);
  if (item.hasLoaded) return Promise.resolve(true);
  return new Promise((resolve) => {
    item.addEventListener('loaded', () => resolve(true), { once: true });
    item.addEventListener('error', () => resolve(false), { once: true });
  });
}

window.SharksWayAssets = {
  src: modelSrc,
  ensure: ensureModel,
  prefetch: prefetchModels,
  ready: whenModelReady,
  lazy: () => Object.keys(LAZY_MODELS)
};
