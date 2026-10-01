/**
 * A-Frame component to manage the Tour UI (navigation, event info, map).
 */
AFRAME.registerComponent('tour-ui', {
  schema: {
    autoShow: { type: 'boolean', default: false }
  },
  init: function () {
    this.eventInfo = document.getElementById('event-info');
    this.learnMoreBtn = document.getElementById('learn-more');
    this.modelOverlay = document.getElementById('model-overlay');
    this.sharkLabel = document.getElementById('shark-label-8w');

    // Bind event handlers
    this.onSharkFound = this.onSharkFound.bind(this);
    this.onLearnMore = this.onLearnMore.bind(this);
    this.onDismiss = this.onDismiss.bind(this);

    // Setup listeners
    this.el.sceneEl.addEventListener('sharkFound', this.onSharkFound);
    
    // The menu belongs to navigation.js (initNavigation). This used to bind
    // its own hamburger/close handlers too; their touchend preventDefault
    // swallowed the click, so on a phone navigation.js never ran — its
    // aria state and leftover-position reset were skipped (Oct 1).

    if (this.learnMoreBtn) {
      this.learnMoreBtn.addEventListener('click', this.onLearnMore);
    }

    const dismissBtn = document.getElementById('dismiss-event');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', this.onDismiss);
    }

    // Map initialization logic can also be here or in a separate component
    this.initMap();

    if (this.data.autoShow) {
      this.el.sceneEl.addEventListener('loaded', () => {
        const eventSystem = this.el.sceneEl.systems['event-system'];
        if (eventSystem) {
          this.showEvent(eventSystem.getCurrentEvent());
        }
      });
    }
  },

  onSharkFound: function () {
    const eventSystem = this.el.sceneEl.systems['event-system'];
    if (eventSystem) {
      this.showEvent(eventSystem.getCurrentEvent());
    }
    
    if (this.modelOverlay) this.modelOverlay.classList.add('visible');
    if (this.sharkLabel) this.sharkLabel.classList.add('visible');
  },

  /**
   * Fill the event card. Not every page that fires `sharkFound` carries this
   * markup — shark-ar-8thwall.html has none of these ids — and an unguarded
   * write threw a TypeError out of the detection callback on every single
   * detection there, vision or GPS.
   */
  showEvent: function (event) {
    if (!event) return;
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    const setHtml = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = value;
    };

    setText('event-title', event.title);
    setHtml('event-date', `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>${event.date} &bull; ${event.time}`);
    setHtml('event-location', `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${event.location}`);
    setText('event-description', event.description);
    setText('sharkey-message', event.sharkeyMessage);
    const icon = document.getElementById('event-icon');
    if (icon) icon.src = event.icon;

    if (this.eventInfo) this.eventInfo.classList.add('visible');
  },

  onLearnMore: function () {
    if (window.AudioUtils) window.AudioUtils.playSound('tap');
    
    const eventSystem = this.el.sceneEl.systems['event-system'];
    const currentEvent = eventSystem.getCurrentEvent();
    
    alert(`Ready to attend ${currentEvent.title}?\n\nIn the full version, this would:\n- Show ticket options\n- Add to calendar\n- Share with friends\n- Get directions`);
    
    this.dismissUi();
    eventSystem.getNextEvent();
  },

  onDismiss: function () {
    if (window.AudioUtils) window.AudioUtils.playSound('tap');
    this.dismissUi();
  },

  dismissUi: function () {
    if (this.eventInfo) this.eventInfo.classList.remove('visible');
    if (this.modelOverlay) this.modelOverlay.classList.remove('visible');
    if (this.sharkLabel) this.sharkLabel.classList.remove('visible');
    this.el.sceneEl.emit('dismissSharkUi');
  },

  initMap: function () {
    // Simplified map integration for the component
    // In a real refactor, this might be its own 'tour-map' component
    if (typeof L === 'undefined') return;
    
    this.map = null;
    this.userMarker = null;
    this.userLat = null;
    this.userLng = null;

    const initialize = () => {
      if (this.map) return;
      const mapContainer = document.getElementById('mini-map');
      if (!mapContainer) return;

      this.map = L.map(mapContainer, {
        zoomControl: false,
        attributionControl: true
      }).setView([37.3352, -121.8811], 13);

      // OSM tile policy: credit "OpenStreetMap contributors", no {s} subdomains.
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(this.map);
    };

    const update = () => {
      if (!this.map || !this.userLat || !this.userLng) return;
      this.map.setView([this.userLat, this.userLng], 16);
      const mapWrapper = document.getElementById('map-container');
      const isExpanded = mapWrapper.classList.contains('expanded');
      if (window.updateMapMarkers) {
        this.userMarker = window.updateMapMarkers(this.map, this.userLat, this.userLng, this.userMarker, isExpanded);
      }
    };

    const toggleBtn = document.getElementById('toggle-map');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const mapWrapper = document.getElementById('map-container');
        mapWrapper.classList.toggle('expanded');
        setTimeout(() => {
          if (this.map) {
            this.map.invalidateSize();
            update();
          }
        }, 400);
      });
    }

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          this.userLat = position.coords.latitude;
          this.userLng = position.coords.longitude;
          initialize();
          update();
        },
        (error) => { console.error('Geolocation error:', error); },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    }

    setTimeout(initialize, 1000);
  }
});
