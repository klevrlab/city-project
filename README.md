# Sharks Way AR Tour

WebAR experience platform for Super Bowl LX 2026 in San Jose featuring AI-powered shark detection, GPS navigation, and interactive 3D mascot encounters.

## Overview

Browser-based AR tour guide with 5 distinct experiences requiring no app installation. Users explore San Jose landmarks during major sporting events through marker detection, AI vision, GPS tracking, and pose estimation.

## Quick Start

### Local Development
```bash
python3 -m http.server 8080
```

### Mobile Testing
Access on phone via local IP (same WiFi):
```
http://[YOUR_LOCAL_IP]:8080
```

### Public Tunnel
```bash
npx localtunnel --port 8080
```

## AR Experiences

### 1. Marker Demo
**File:** `marker-demo.html`  
**Tech:** AR.js + A-Frame  
Point camera at Hiro marker to see 3D shark with event info.

### 2. Sharks Way
**File:** `sharks-way.html`  
**Tech:** TensorFlow.js + MobileNet  
AI-powered shark painting detection with real-time camera analysis.

### 3. Location Tour
**File:** `location-tour.html`  
**Tech:** Geolocation API + Leaflet.js  
GPS-based checkpoint tracking with interactive map and directional navigation.

### 4. Selfie AR
**File:** `selfie-ar.html`  
**Tech:** MediaPipe Pose  
Shoulder tracking to position 3D shark on user's shoulder with selfie capture.

### 5. Shark AR Demo
**File:** `shark-ar-demo.html`  
**Tech:** TensorFlow.js + model-viewer  
Enhanced shark detection with advanced 3D viewer and event integration.

## Requirements

- **HTTPS:** Required for camera and GPS access
- **Browser:** iOS Safari 13+ or Android Chrome 80+
- **Permissions:** Camera and location access
- **Network:** ~8MB initial load from CDNs

## Project Structure

```
City-Project/
├── assets/
│   ├── 3D-models/          # GLB files
│   ├── Markers/            # AR patterns
│   ├── the-big-game.svg
│   └── video.mp4
├── data/
│   ├── shark-locations.json
│   └── shark-embeddings-browser.json
├── index.html              # Landing page
├── marker-demo.html
├── sharks-way.html
├── location-tour.html
├── selfie-ar.html
└── shark-ar-demo.html
```

## Tech Stack

**AR & 3D:** AR.js, A-Frame, model-viewer, Three.js  
**AI:** TensorFlow.js, MobileNet v2, MediaPipe Pose  
**Maps:** Leaflet.js, Geolocation API, Haversine formula  
**Frontend:** Vanilla JavaScript, CSS3, HTML5

## Events

- **The Big Game** - Feb 9, 2026 @ SAP Center
- **March Madness** - Mar 15 - Apr 6, 2026 @ Downtown SJ
- **World Cup 2026** - Jun-Jul 2026 @ San Pedro Square

## Browser Compatibility

| Platform | Browser | Version |
|----------|---------|---------|
| iOS | Safari | 13+ |
| Android | Chrome | 80+ |
| Android | Firefox | 75+ |
| Desktop | Chrome/Firefox/Edge | Development only |

## Documentation

- `ARCHITECTURE.md` - System design and data flow
- `DEPLOYMENT.md` - Setup and hosting guide

---

**Version:** 1.0  
**Super Bowl LX 2026** - San Jose, CA
