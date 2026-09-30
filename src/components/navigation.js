// Styles: each page links src/css/navigation.css. Not `import '...css'` —
// that only works through Vite, and the site must also run served straight
// from the repo (a GitHub Pages branch build publishes it without a build).

export function initNavigation() {
  // Inject HTML if it doesn't exist
  if (!document.getElementById('nav-menu')) {
    const navHTML = `
      <div id="nav-overlay"></div>
      <div id="nav-menu">
          <button class="close-btn" id="close-menu" aria-label="Close menu">&times;</button>
          <h2>Navigation</h2>
          <a href="./index.html" class="nav-link">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z" />
              </svg>
              Home
          </a>
          <a href="./shark-ar-8thwall.html" class="nav-link">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
              </svg>
              Sharks Way
          </a>
          <a href="./location-tour.html" class="nav-link">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <circle cx="12" cy="10" r="3" />
                  <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
              </svg>
              Location Tour
          </a>
          <a href="./mural-ar.html" class="nav-link">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
              </svg>
              Living Mural
          </a>
          <a href="./soccer-ar-8thwall.html" class="nav-link">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7l4.5 3.3-1.7 5.3h-5.6L7.5 10.3z" />
              </svg>
              Soccer AR
          </a>
          <a href="./selfie-ar.html" class="nav-link">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
              </svg>
              Selfie with Sammy
          </a>
          <a href="./selfie-ar.html?character=sharkey" class="nav-link">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
              </svg>
              Selfie with Sharkie
          </a>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', navHTML);
  }

  // Inject hamburger button into topbar if it doesn't exist
  const topbar = document.getElementById('topbar');
  if (topbar && !document.getElementById('hamburger-btn')) {
    const hamburgerHTML = `
      <button id="hamburger-btn" aria-label="Menu" aria-controls="nav-menu" aria-expanded="false">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
      </button>
    `;
    topbar.insertAdjacentHTML('beforeend', hamburgerHTML);
  }

  // Highlight the page you're on (selfie links differ only by ?character).
  const here = location.pathname.split('/').pop() || 'index.html';
  const hereCharacter = new URLSearchParams(location.search).get('character') || '';
  document.querySelectorAll('#nav-menu a.nav-link').forEach((a) => {
    const url = new URL(a.getAttribute('href'), location.href);
    const page = url.pathname.split('/').pop() || 'index.html';
    if (page === here && (url.searchParams.get('character') || '') === hereCharacter) {
      a.setAttribute('aria-current', 'page');
    }
  });

  const navMenu = document.getElementById('nav-menu');
  const navOverlay = document.getElementById('nav-overlay');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const closeMenuBtn = document.getElementById('close-menu');

  if (!navMenu || !navOverlay || !hamburgerBtn || !closeMenuBtn) {
    console.warn('Navigation elements not found');
    return;
  }

  function openMenu() {
    navMenu.classList.add('open');
    navOverlay.classList.add('visible');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    if (typeof window.playSound === 'function') {
      window.playSound('tap');
    }
  }

  function closeMenu() {
    navMenu.classList.remove('open');
    navOverlay.classList.remove('visible');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    if (typeof window.playSound === 'function') {
      window.playSound('tap');
    }
  }

  hamburgerBtn.addEventListener('click', openMenu);
  closeMenuBtn.addEventListener('click', closeMenu);
  navOverlay.addEventListener('click', closeMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('open')) {
      closeMenu();
    }
  });
}
