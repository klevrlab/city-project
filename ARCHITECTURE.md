# System Architecture

## Overview

Client-side WebAR platform with 4-layer architecture processing camera feeds, GPS data, AR markers, and pose data through AI/AR engines to render interactive 3D experiences in mobile browsers.

## Architecture Layers

### 1. Input Layer
- **Camera Feed:** Real-time video stream (1920x1080 @ 30-60 FPS)
- **GPS Location:** Geolocation API with ±5-10m accuracy
- **AR Markers:** Hiro and custom pattern detection
- **Pose Data:** MediaPipe shoulder tracking

### 2. Processing Layer
- **AI Detection:** TensorFlow.js + MobileNet v2 embeddings
- **GPS Tracking:** Haversine distance calculations
- **AR.js Engine:** Marker tracking and NFT processing
- **Pose Tracking:** Real-time shoulder position detection

### 3. Rendering Layer
- **A-Frame WebXR:** 3D scene management
- **model-viewer:** GLB model display with auto-rotation
- **Video Textures:** Dynamic content mapping
- **Glass Morphism UI:** CSS3-based overlay components

### 4. Output Layer
- **Browser AR Experience:** iOS Safari / Android Chrome
- **Interactive UI:** Touch-optimized controls
- **Event Information:** Contextual overlays
- **Navigation Guidance:** Directional arrows and maps

## Data Flow Pipeline

```
INPUT → PROCESS → DECISION → OUTPUT
  ↑                              ↓
  └──────── Feedback Loop ───────┘
          (60 FPS continuous)
```

### Stage 1: Input
- Camera stream capture
- GPS coordinate acquisition
- Marker pattern scanning
- Pose landmark detection

### Stage 2: Process
- AI inference (MobileNet embeddings)
- Distance calculations (Haversine)
- Pattern matching (AR.js)
- Pose tracking (MediaPipe)

### Stage 3: Decision
- Threshold checks (0.55 similarity)
- Proximity tests (50m radius)
- Marker found validation
- Pose validity confirmation

### Stage 4: Output
- 3D model rendering
- Event info display
- Navigation UI updates
- AR overlay composition

## Component Architecture

### AI Shark Detection Module
```
Camera → TensorFlow.js → MobileNet → Embeddings → Cosine Similarity → Match
```
- **Input:** 224x224 preprocessed frames
- **Model:** MobileNet v2 (browser-optimized)
- **Threshold:** 0.55 similarity score
- **Output:** Shark identification + confidence

### GPS Navigation Module
```
Geolocation API → Coordinates → Haversine → Distance/Bearing → UI Update
```
- **Update Rate:** 1-5 seconds
- **Checkpoint Radius:** 50 meters
- **Calculation:** Great-circle distance
- **Output:** Distance, direction, proximity alerts

### Marker AR Module
```
Camera → AR.js → Pattern Match → Pose Estimation → 3D Anchor → Render
```
- **Markers:** Hiro pattern, custom shark patterns
- **Tracking:** 6DOF pose estimation
- **Stability:** Marker loss recovery
- **Output:** Anchored 3D models

### Pose AR Module
```
Camera → MediaPipe → Landmarks → Shoulder Position → 3D Placement → Render
```
- **Landmarks:** 33-point body pose
- **Target:** Right shoulder (landmark 12)
- **Offset:** X+50px, Y-70px
- **Output:** Shoulder-mounted 3D shark

## Technology Stack Details

### Core Libraries
- **AR.js 3.4.5:** Marker-based and location-based AR
- **A-Frame 1.6.0:** WebXR framework for 3D scenes
- **TensorFlow.js 4.22.0:** Browser-based ML inference
- **model-viewer 3.4.0:** 3D model display component
- **Leaflet.js 1.9.4:** Interactive mapping
- **MediaPipe Pose:** Real-time pose estimation

### 3D Assets
- **Format:** GLB (binary glTF)
- **Size Range:** 500KB - 5MB per model
- **Polygons:** 10K-50K triangles
- **Textures:** 1024x1024 - 2048x2048
- **Animations:** Skeletal animations supported

### Data Storage
- **shark-locations.json:** GPS coordinates for checkpoints
- **shark-embeddings-browser.json:** Pre-computed MobileNet embeddings
- **Local Storage:** User progress and visited checkpoints
- **Session Storage:** Temporary state management

## Performance Characteristics

### Camera Processing
- **Resolution:** 1920x1080 (1080p)
- **Frame Rate:** 30-60 FPS
- **Inference Time:** <50ms per frame
- **Processing:** Client-side only

### GPS Accuracy
- **Precision:** ±5-10 meters
- **Update Rate:** 1-5 seconds
- **Battery Impact:** Moderate (continuous tracking)
- **Fallback:** Manual location entry

### 3D Rendering
- **Target FPS:** 60 FPS
- **Model Load Time:** 1-3 seconds
- **Memory Usage:** 50-200MB
- **WebGL Required:** Yes

### Network
- **Initial Load:** ~8MB (CDN libraries)
- **Asset Loading:** On-demand (lazy loading)
- **Caching:** Browser cache for models
- **Offline:** Not supported (CDN dependencies)

## Security & Privacy

### Camera Access
- **Permission:** Explicit user consent required
- **Processing:** Local only, no server upload
- **Storage:** No video recording or storage
- **Privacy:** Compliant with browser security policies

### Location Data
- **Permission:** Explicit user consent required
- **Precision:** Coarse location sufficient
- **Storage:** Session-only, not persisted
- **Privacy:** No location tracking or logging

### Data Collection
- **Analytics:** None implemented
- **User Data:** No PII collected
- **Cookies:** None used
- **Third-party:** CDN libraries only

## Scalability Considerations

### Client-Side Processing
- **Advantage:** No server costs, infinite scale
- **Limitation:** Device performance dependent
- **Optimization:** Lazy loading, asset compression
- **Fallback:** Graceful degradation on low-end devices

### Asset Delivery
- **CDN:** All libraries from public CDNs
- **Models:** Served from static hosting
- **Caching:** Aggressive browser caching
- **Compression:** Gzip/Brotli for text assets

### Future Enhancements
- **PWA:** Offline support with service workers
- **WebXR Device API:** Native AR on ARCore/ARKit
- **Multi-language:** i18n support
- **Analytics:** Privacy-respecting usage metrics
