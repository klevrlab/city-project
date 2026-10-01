# Sharks Way — Immersion 2026

WebAR platform for the Sharks Way corridor between downtown San José and SAP Center, built by SJSU students and faculty as part of **Immersion 2026**.

**Live:** https://klevrlab.github.io/city-project/ — every push to `main` deploys there (GitHub Actions → GitHub Pages).

## About Immersion 2026

Immersion 2026 is a multi-phase augmented reality (AR) public art experience connecting San José State University, downtown San José, and major cultural events. The web-based AR platform links SJSU, City Hall, SAP Center, and downtown districts through animated AR public art and murals, interactive selfies with mascots and characters, and location-based storytelling and event activations — no app required.

Built by SJSU students under the guidance of faculty in collaboration with the City of San José Downtown Business Association and the City of San José Office of Cultural Affairs, the project transforms sidewalks, murals, and public spaces into interactive digital storytelling environments.

## About Sharks Way

Sharks Way is part of the larger **Stitching Districts** initiative, a collaboration between the San Jose Downtown Association, artist Jimmy Paints, the City of San José Office of Cultural Affairs, San José State University, the San Jose Sharks, and community partners. Artist-painted sharks line the sidewalk along the corridor, "swimming" toward SAP Center to create a playful visual path.

Visitors scan a shark or QR code with their phone to unlock animated digital content, wayfinding, maps, event information, and highlights of public art and neighborhood culture — all in a mobile browser.

The project is proudly supported by **Reimagining the Civic Commons**.

## Quick Start

### Local Development
```bash
npm install
npm run dev        # Vite dev server
npm run build      # production build into dist/ (what gets deployed)
```

The pages also run served straight from the repo, with no build step:
```bash
python3 -m http.server 8080
```

### Testing on a laptop
8th Wall needs a phone, but everything around it runs on a desktop with the built-in simulator
(WASD + mouse, fake GPS):
```
shark-ar-8thwall.html?desktop=1&at=littleitaly     # or at=river | sap | underpass
```
Add `&debug=1` for the placement/debug panel and `&demoLocations=1` to unlock every location drop.

### Testing on a Phone
Camera and GPS need HTTPS, so `http://[LOCAL_IP]:8080` loads but the AR can't start. Use a free
Cloudflare quick tunnel instead (no account; one-time `brew install cloudflared`):
```bash
npm run phone            # dev server — edit, then refresh on the phone
npm run phone -- --dist  # the production build, as GitHub Pages will serve it
```
It prints a QR code (scan with the phone camera) and links to every page with the field log on.
While it runs, the phone's field log streams back to the laptop — `logs/phone/YYYY-MM-DD.log`
(gitignored; contains GPS), with errors, ★ marks and test steps also printed in the terminal.
The `https://….trycloudflare.com` address is new each run; Ctrl+C stops it.

## AR Experiences

### 1. Sharks Way (8th Wall)
**File:** `shark-ar-8thwall.html` (also served at the legacy `sharks-way.html` URL via redirect)
**Tech:** 8th Wall WebAR + A-Frame + TensorFlow.js (MobileNet) + MediaPipe Pose
- **Wayfinding** — point the camera at a painted shark on the sidewalk and Maria or Jimmy (alternating) swims up, pauses and swims off. Tapping the ground "drops" a Jimmy that loops in place so visitors can walk around it.
- **Location drops** — near Little Italy, the Guadalupe River and SAP Center, a bar at the bottom offers extra tap-to-place content: Athena and the 8 m Leaning Tower, a shark jumping from the river, and a party (dancing mascots, sharks circling the visitor, a jumping shark). GPS only decides what's offered; everything lands where the visitor taps.
- **Photo Mode** — place Sharkie or Sammy (and Athena, near Little Italy) and snap a photo, or flip to the front camera for a selfie with the character on your shoulder.
- **Goalie Mode** — drop a goal and hockey puck; Sharkie defends.

### 2. Location Tour
**File:** `location-tour.html`
**Tech:** Geolocation API + Leaflet.js
GPS-based checkpoint tracking with interactive map and directional navigation along the Sharks Way corridor.

### 3. Selfie AR
**File:** `selfie-ar.html`
**Tech:** MediaPipe Pose
Shoulder tracking to position Sammy Spartan or Sharkie on the user's shoulder for selfie capture.

### 4. Japantown Living Mural
**File:** `mural-ar.html`
**Tech:** MindAR image tracking + GPS gate
Open-source image-target AR over the Japanese American Internment Memorial reliefs — point the camera at a panel to play an animated overlay.

### 5. Soccer AR
**File:** `soccer-ar-8thwall.html`
**Tech:** 8th Wall WebAR + A-Frame
Swipe-to-kick soccer mini-game with a procedural net, post/crossbar bounce, and a Sharkie goalie.

## Field Testing

Add `?debug=1` to the AR page URL on a phone (`?log=1` for just a small LOG button) and the app keeps
a log of everything it does — errors, downloads, GPS, drops, scan scores, photos, fps/memory. Tap
**MARK A MOMENT** when something looks wrong, then **SHARE LOG** and send the `.txt` to the dev team.
The log survives crashes and reloads, and never leaves the phone unless you share it. `?scanModel=f32`
compares painted-shark scanning with the full-precision model.

## Requirements

- **HTTPS:** Required for camera and GPS access
- **Browser:** iOS Safari 13+ or Android Chrome 80+
- **Permissions:** Camera and location access
- **Network:** the wayfinding sharks (under 1 MB) and the scan model (~14 MB) load at start; each location's models download as the visitor approaches it

## Project Structure

```
City-Project/
├── assets/
│   ├── 3D-models/          # GLB files
│   ├── Markers/            # AR patterns
│   ├── SharkLogo.png
│   └── video.mp4
├── data/
│   ├── shark-locations.json
│   └── shark-embeddings-browser.json
├── src/
│   ├── components/         # A-Frame components (animator, detector, tour-ui)
│   ├── systems/            # event-system
│   └── utils/              # GPS, audio, math, embedding helpers
├── index.html              # Landing page
├── shark-ar-8thwall.html   # Main Sharks Way experience
├── sharks-way.html         # Redirect → shark-ar-8thwall.html
├── soccer-ar-8thwall.html
├── mural-ar.html
├── location-tour.html
├── selfie-ar.html
└── shark-ar-demo.html
```

## Tech Stack

**AR & 3D:** 8th Wall WebAR, AR.js, A-Frame, model-viewer, Three.js
**AI:** TensorFlow.js, MobileNet v2, MediaPipe Pose
**Maps:** Leaflet.js, Geolocation API, Haversine formula
**Frontend:** Vanilla JavaScript, CSS3, HTML5

## March 2026 Activations

- **Free Throw at SAP Center** — Mar 26 & 28, 2026 · 7:30 PM – 10:00 PM
  Projection mapping at SAP Center by G. Craig Hobbs with students from SJSU's CADRE Media Lab. A San Jose Sports Authority + City of San José + SJSU + SAP Center collaboration.
- **Minis & Trophy at Arena Green West** — Mar 26 & 28, 2026 · 1:00 PM – 10:00 PM
  Portable interactive light sculptures by SJSU Professor Esteban Garcia Bravo with the CADRE Media Lab, Digital Media Art, and Spatial Art programs.
- **International Football – Watch Together** — Jun–Jul 2026 · San Pedro Square Market

## Credits

**Faculty Leads:** Rhonda Holberton (Associate Professor, Art & Art History, SJSU) · Marjan Khatibi (Assistant Professor of Design, SJSU) · Lacey Nein (Emerging Technology Lab Coordinator, SJSU)

**Student Team:** Chris Velez · Maria (Phuong-Trang) Vu · Ganesh Nagavenkatasai Mohan Kancherla · Antony Cucina · Sean Cruz-Colatriano · Andrea Oppliger-Delgado · Tharun Chunchu

## Documentation

- `ARCHITECTURE.md` — System design and data flow
- `DEPLOYMENT.md` — Setup and hosting guide

---

**Version:** 2.0
**Immersion 2026** — SJSU CADRE + KLEVR Labs · San José, CA
