// Shared GPS Tracking Component
// This file provides GPS-based checkpoint tracking across all pages

(function() {
    'use strict';

    // Checkpoint coordinates
    const CHECKPOINTS = {
        A: { lat: 37.336861, lng: -121.894361, name: 'Label A' },
        B: { lat: 37.334222, lng: -121.900417, name: 'Label B' }
    };

    const GPS_CONFIG = {
        proximityThreshold: 50, // meters
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
    };

    // State
    const STATE = {
        gpsWatchId: null,
        currentPosition: null,
        checkpointA: { visited: false, active: false },
        checkpointB: { visited: false, active: false }
    };

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGPSTracking);
    } else {
        initGPSTracking();
    }

    function initGPSTracking() {
        const checkpointA = document.getElementById('checkpoint-a');
        const checkpointB = document.getElementById('checkpoint-b');

        if (!checkpointA || !checkpointB) {
            console.warn('Checkpoint elements not found');
            return;
        }

        startGPSTracking();

        // Cleanup on page unload
        window.addEventListener('beforeunload', stopGPSTracking);
    }

    // Haversine formula to calculate distance between two coordinates
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    // GPS logging
    function addGPSLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[GPS ${timestamp}] ${message}`;
        
        switch(type) {
            case 'checkpoint':
                console.log('%c' + logMessage, 'color: #00FF88; font-weight: bold');
                break;
            case 'error':
                console.error(logMessage);
                break;
            default:
                console.log(logMessage);
                break;
        }
    }

    // Update checkpoint UI
    function updateCheckpointUI() {
        const checkpointAEl = document.getElementById('checkpoint-a');
        const checkpointBEl = document.getElementById('checkpoint-b');
        
        console.log('[GPS] Updating UI - A visited:', STATE.checkpointA.visited, 'active:', STATE.checkpointA.active, '| B visited:', STATE.checkpointB.visited, 'active:', STATE.checkpointB.active);
        
        // Update Checkpoint A
        checkpointAEl.classList.remove('visited', 'active');
        if (STATE.checkpointA.visited) {
            checkpointAEl.classList.add('visited');
            console.log('[GPS] Checkpoint A marked with checkmark');
        }
        if (STATE.checkpointA.active) {
            checkpointAEl.classList.add('active');
        }
        
        // Update Checkpoint B
        checkpointBEl.classList.remove('visited', 'active');
        if (STATE.checkpointB.visited) {
            checkpointBEl.classList.add('visited');
            console.log('[GPS] Checkpoint B marked with checkmark');
        }
        if (STATE.checkpointB.active) {
            checkpointBEl.classList.add('active');
        }
    }

    // Evaluate checkpoint status based on GPS position
    function evaluateCheckpoints(position) {
        const { latitude, longitude, accuracy } = position.coords;
        
        addGPSLog(`Position: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${accuracy.toFixed(1)}m)`);
        
        // Calculate distances to both checkpoints
        const distToA = calculateDistance(latitude, longitude, CHECKPOINTS.A.lat, CHECKPOINTS.A.lng);
        const distToB = calculateDistance(latitude, longitude, CHECKPOINTS.B.lat, CHECKPOINTS.B.lng);
        
        addGPSLog(`Distance to A: ${distToA.toFixed(1)}m, to B: ${distToB.toFixed(1)}m`);
        
        // Determine if we're at either checkpoint
        const atA = distToA <= GPS_CONFIG.proximityThreshold;
        const atB = distToB <= GPS_CONFIG.proximityThreshold;
        
        // Calculate which checkpoint is closer
        const closerToA = distToA < distToB;
        
        // Determine position relative to checkpoints
        let status = '';
        
        if (atA && atB) {
            // At both (unlikely unless they're very close)
            status = 'At both checkpoints';
            STATE.checkpointA.visited = true;
            STATE.checkpointA.active = true;
            STATE.checkpointB.visited = true;
            STATE.checkpointB.active = true;
            addGPSLog('✓ At both checkpoints!', 'checkpoint');
        } else if (atA) {
            // At checkpoint A
            status = 'At Checkpoint A';
            STATE.checkpointA.visited = true;
            STATE.checkpointA.active = true;
            STATE.checkpointB.active = false;
            addGPSLog('✓ At Checkpoint A', 'checkpoint');
        } else if (atB) {
            // At checkpoint B
            status = 'At Checkpoint B';
            STATE.checkpointB.visited = true;
            STATE.checkpointB.active = true;
            
            // If we're at B, we must have passed A
            if (!STATE.checkpointA.visited) {
                STATE.checkpointA.visited = true;
                addGPSLog('✓ Checkpoint A marked as passed', 'checkpoint');
            }
            STATE.checkpointA.active = false;
            addGPSLog('✓ At Checkpoint B', 'checkpoint');
        } else {
            // Not at either checkpoint - determine if between them
            const totalDist = calculateDistance(CHECKPOINTS.A.lat, CHECKPOINTS.A.lng, CHECKPOINTS.B.lat, CHECKPOINTS.B.lng);
            const sumDist = distToA + distToB;
            const tolerance = totalDist * 0.3; // 30% tolerance
            
            const isBetween = Math.abs(sumDist - totalDist) <= tolerance;
            
            if (isBetween) {
                // Between checkpoints
                status = 'Between A and B';
                
                if (closerToA) {
                    // Approaching A
                    STATE.checkpointA.active = true;
                    STATE.checkpointA.visited = false;
                    STATE.checkpointB.active = false;
                    STATE.checkpointB.visited = false;
                    addGPSLog('→ Between checkpoints (closer to A, A is active)');
                } else {
                    // Crossed A, approaching B
                    STATE.checkpointA.visited = true;
                    STATE.checkpointA.active = false;
                    STATE.checkpointB.active = true;
                    STATE.checkpointB.visited = false;
                    addGPSLog('→ Between checkpoints (closer to B, A marked done, B is active)');
                }
            } else {
                // Away from both
                if (closerToA) {
                    status = 'Before Checkpoint A';
                    STATE.checkpointA.active = false;
                    STATE.checkpointB.active = false;
                    addGPSLog('← Away from checkpoints (before A)');
                } else {
                    status = 'After Checkpoint B';
                    STATE.checkpointA.visited = true;
                    STATE.checkpointA.active = false;
                    STATE.checkpointB.visited = true;
                    STATE.checkpointB.active = false;
                    addGPSLog('→ Away from checkpoints (after B)');
                }
            }
        }
        
        // Update UI
        updateCheckpointUI();
        
        // Update GPS status if element exists
        const gpsStatus = document.getElementById('gps-status');
        if (gpsStatus) {
            gpsStatus.textContent = `GPS: ${status}`;
        }
    }

    // Handle GPS errors
    function handleGPSError(error) {
        let errorMsg = 'GPS Error: ';
        switch(error.code) {
            case error.PERMISSION_DENIED:
                errorMsg += 'Permission denied';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMsg += 'Position unavailable';
                break;
            case error.TIMEOUT:
                errorMsg += 'Request timeout';
                break;
            default:
                errorMsg += 'Unknown error';
        }
        addGPSLog(errorMsg, 'error');
        
        const gpsStatus = document.getElementById('gps-status');
        if (gpsStatus) {
            gpsStatus.textContent = 'GPS: Error';
        }
    }

    // Start GPS tracking
    function startGPSTracking() {
        if (!navigator.geolocation) {
            addGPSLog('Geolocation not supported', 'error');
            return;
        }
        
        // Initialize UI
        updateCheckpointUI();
        
        addGPSLog('Starting GPS tracking...');
        addGPSLog(`Checkpoint A: ${CHECKPOINTS.A.lat.toFixed(6)}, ${CHECKPOINTS.A.lng.toFixed(6)}`);
        addGPSLog(`Checkpoint B: ${CHECKPOINTS.B.lat.toFixed(6)}, ${CHECKPOINTS.B.lng.toFixed(6)}`);
        
        STATE.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                STATE.currentPosition = position;
                evaluateCheckpoints(position);
            },
            handleGPSError,
            {
                enableHighAccuracy: GPS_CONFIG.enableHighAccuracy,
                timeout: GPS_CONFIG.timeout,
                maximumAge: GPS_CONFIG.maximumAge
            }
        );
    }

    // Stop GPS tracking
    function stopGPSTracking() {
        if (STATE.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(STATE.gpsWatchId);
            STATE.gpsWatchId = null;
            addGPSLog('GPS tracking stopped');
        }
    }

    // Export for external use if needed
    window.GPSTracking = {
        start: startGPSTracking,
        stop: stopGPSTracking,
        getState: () => STATE
    };
})();
