# Sharks Way AR Tour - Super Bowl LX

AR-powered tour guide featuring Sharkey discovering San Jose during Super Bowl LX 2026.

## Quick Start

### Local Development
```bash
python3 -m http.server 8080
```

### Mobile Testing (Same WiFi)
Access on your phone using your Mac's local IP:
```
http://[YOUR_LOCAL_IP]:8080
```

### Public Tunnel (Optional)
```bash
npx localtunnel --port 8080
```

## AR Experiences

### 1. Marker Demo (`/marker-demo.html`)
- Marker-based AR with custom shark pattern
- Point camera at Hiro marker to see 3D shark
- Interactive event information
- **Requirements:** Printed marker, camera access

### 2. Sharks Way (`/sharks-way.html`)
- AI-powered shark painting detection using TensorFlow.js
- Real-time camera feed with MobileNet embeddings
- Automatic shark recognition and 3D model display
- **Requirements:** Camera access, shark painting/image

### 3. Location Tour (`/location-tour.html`)
- GPS-based AR tour with checkpoint tracking
- Real-time navigation with directional arrows
- Interactive map with shark locations
- Progress tracker for checkpoints A & B
- **Requirements:** HTTPS, GPS/location permissions, mobile device

### 4. Selfie AR (`/selfie-ar.html`)
- MediaPipe Pose detection for shoulder tracking
- 3D shark positioned on right shoulder
- Real-time pose tracking and AR overlay
- Selfie capture functionality
- **Requirements:** Camera access (front-facing)

### 5. Shark AR Demo (`/shark-ar-demo.html`)
- Enhanced shark detection with TensorFlow.js
- 3D model viewer with auto-rotation
- Event information integration
- **Requirements:** Camera access

## Project Structure

```
City-Project/
├── assets/
│   ├── 3D-models/          # All .glb 3D model files
│   ├── Markers/            # AR marker patterns
│   ├── the-big-game.svg    # Event icon
│   └── video.mp4           # Demo video
├── CSS/
│   └── shared-styles.css   # Shared UI styles
├── JS/
│   ├── shared-gps-tracking.js    # GPS tracking component
│   └── shared-navigation.js      # Navigation menu component
├── data/
│   ├── shark-locations.json           # GPS coordinates
│   └── shark-embeddings-browser.json  # AI embeddings
├── docs/                   # Documentation
├── *.html                  # AR experience pages
└── index.html             # Landing page
```

## Tech Stack

### AR & 3D
- **AR.js** - Marker-based and GPS-based AR
- **A-Frame** - WebXR 3D rendering framework
- **model-viewer** - 3D model display and interaction

### AI & Computer Vision
- **TensorFlow.js** - Browser-based machine learning
- **MobileNet** - Image classification and embeddings
- **MediaPipe Pose** - Real-time pose detection

### Mapping & Location
- **Leaflet.js** - Interactive maps
- **Geolocation API** - GPS tracking
- **Haversine formula** - Distance calculations

### UI & Styling
- **Vanilla JavaScript** - No framework dependencies
- **CSS3** - Glass morphism, animations
- **Responsive Design** - Mobile-first approach

## Architecture

### Component-Based Structure
- **Shared GPS Tracking** (`JS/shared-gps-tracking.js`)
  - Reusable checkpoint evaluation
  - Distance calculations
  - UI state management

- **Shared Navigation** (`JS/shared-navigation.js`)
  - Hamburger menu functionality
  - Touch and keyboard support
  - Consistent across all pages

- **Shared Styles** (`CSS/shared-styles.css`)
  - Glass morphism components
  - SJ Sharks color palette
  - Responsive breakpoints

### Data Management
- **shark-locations.json** - GPS coordinates for checkpoints A & B
- **shark-embeddings-browser.json** - AI model embeddings for shark detection
- **3D Models** - Organized in `assets/3D-models/`

### AI-Powered Detection
- MobileNet v2 for feature extraction
- Cosine similarity for shark matching
- Browser-based inference (no server required)
- Real-time camera feed processing

## Features

### ✅ V1.0 Completed

**AR Experiences:**
- ✅ Marker-based AR with custom shark pattern
- ✅ AI-powered shark painting detection (TensorFlow.js)
- ✅ GPS-based location tour with checkpoint tracking
- ✅ Pose-based selfie AR with shoulder tracking
- ✅ Enhanced shark AR demo with event integration

**UI/UX:**
- ✅ Unified navigation menu across all pages
- ✅ Glass morphism design with SJ Sharks branding
- ✅ Mobile-responsive layouts
- ✅ Interactive maps with real-time GPS
- ✅ Progress tracking for checkpoints
- ✅ Directional navigation arrows

**Technical:**
- ✅ Organized project structure (assets, CSS, JS, data folders)
- ✅ Shared components (GPS tracking, navigation)
- ✅ JSON-based data management
- ✅ 1080p camera quality (upgraded from 720p)
- ✅ Optimized 3D model loading
- ✅ Local and tunnel-based testing support

**Camera Improvements:**
- ✅ Upgraded to 1920x1080 resolution
- ✅ Fixed aspect ratio (16:9)
- ✅ Removed zoom/stretching issues
- ✅ Front camera mirror fix for selfie mode

**Selfie AR Enhancements:**
- ✅ Default shark: Pose_sharky_02.glb
- ✅ Size: 210px (optimized)
- ✅ Position: Right shoulder with offsets
- ✅ Y-offset: -70px (higher positioning)
- ✅ Dev panel hidden for production

## Development

### Testing on Mobile

**Option 1: Local Network**
```bash
# Start server
python3 -m http.server 8080

# Find your local IP
ipconfig getifaddr en0

# Access on phone (same WiFi)
http://[YOUR_IP]:8080
```

**Option 2: Public Tunnel**
```bash
npx localtunnel --port 8080
# Use the provided URL on any device
```

### Browser Compatibility
- **iOS**: Safari (required for AR.js)
- **Android**: Chrome, Firefox
- **Desktop**: Chrome, Firefox, Edge (for development)

### Camera Permissions
All AR experiences require camera access. Allow permissions when prompted.

## Documentation

See `/docs` folder for:
- Custom marker setup instructions
- Server deployment guides
- GitHub Pages configuration

## Credits

Developed for Super Bowl LX 2026 - San Jose Sharks AR Experience

**Technologies:**
- AR.js by AR.js Org
- A-Frame by Mozilla
- TensorFlow.js by Google
- MediaPipe by Google
- Leaflet.js by Vladimir Agafonkin

---

**Version:** 1.0  
**Last Updated:** March 2026
