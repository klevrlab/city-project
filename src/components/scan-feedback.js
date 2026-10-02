/**
 * "You found one!" — a short burst on screen when the camera recognises a
 * painted shark, before the swimmer arrives (Oct 1: "can we have a sorta
 * animation play when a shark's scanned to signify to the user").
 *
 * Plain DOM over the camera view, not 3D: a scan fires while the phone points
 * at the pavement, so anything placed in the scene would be under the
 * visitor's feet. Viewfinder corners snap in around the centre, a ring pulses
 * out, a "Shark found!" badge pops, the phone buzzes where it can (Android —
 * iOS Safari has no vibrate); shark-detector already plays the "found" chime. Styles in
 * src/css/shark-ar-8thwall-styles.css (#scan-burst).
 *
 * Only for camera recognitions (trigger "vision") in Wayfinding — the test
 * run's Summon and console spawns are not "found".
 */
const SHOW_MS = 1900;

let el = null;
let hideTimer = null;

function ensureEl() {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'scan-burst';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="sb-frame"><i></i><i></i><i></i><i></i></div>
    <div class="sb-ring"></div>
    <div class="sb-badge"><span class="sb-icon">🦈</span><span class="sb-text">Shark found!</span>
      <span class="sb-sub">Look up — here it comes</span></div>`;
  document.body.appendChild(el);
  return el;
}

function show(detail) {
  const box = ensureEl();
  const n = detail && detail.name && detail.name.match(/shark(\d+)/i);
  box.querySelector('.sb-text').textContent = n ? `Shark #${parseInt(n[1], 10)} found!` : 'Shark found!';
  // Restart the CSS animations even if the last burst is still showing.
  box.classList.remove('play');
  void box.offsetWidth;
  box.classList.add('play');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => box.classList.remove('play'), SHOW_MS);

  try { if (navigator.vibrate) navigator.vibrate([40, 60, 90]); } catch (e) { /* not supported */ }
}

function attach() {
  const scene = document.querySelector('a-scene');
  if (!scene) return;
  scene.addEventListener('sharkFound', (e) => {
    const d = (e && e.detail) || {};
    if (d.trigger !== 'vision') return;
    if (window.SharksWayMode && !window.SharksWayMode.isWayfinding()) return;
    show(d);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
else attach();

window.SharksWayScanBurst = { show };
