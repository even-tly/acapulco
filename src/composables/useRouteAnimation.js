/**
 * useRouteAnimation — Composable that encapsulates the route animation logic.
 *
 * Manages:
 *  - `requestAnimationFrame` loop (frame → updateDisplay → camera)
 *  - Play / pause / speed / seek controls (driven by the Pinia playbackStore)
 *
 * Delegates layer management to useMapLayers and marks to useMarkers.
 *
 * Captured closure variables (startTime, isPaused, speed, …) avoid Vue
 * reactivity overhead for high-frequency animation state.
 *
 * @param {import('pinia').Store} store - The playback Pinia store instance
 * @returns {{ setup: (map: mapboxgl.Map) => void }}
 */

import { watch, onBeforeUnmount } from 'vue';
import mapboxgl from 'mapbox-gl';
import turf from 'turf';
import tokens from '@/theme/tokens';
import { useMapLayers } from '@/composables/useMapLayers';
import { useMarkers } from '@/composables/useMarkers';

export function useRouteAnimation(store) {
  // Control closures — assigned inside setup() once the map + data are ready
  let _seekToPhase = null;
  let _togglePause = null;
  let _setSpeed = null;
  let _internalPhase = 0;
  let _animationFrame = null;
  let _restartTimeout = null;

  // --- External-control watchers (reference mutable closures) ----------------

  watch(() => store.progress, (newVal) => {
    if (_seekToPhase && Math.abs(newVal - _internalPhase) > 0.002) {
      _seekToPhase(newVal);
    }
  });

  watch(() => store.isPlaying, (newVal) => {
    if (_togglePause) _togglePause(newVal);
  });

  watch(() => store.speed, (newVal) => {
    if (_setSpeed) _setSpeed(newVal);
  });

  onBeforeUnmount(() => {
    if (_animationFrame) cancelAnimationFrame(_animationFrame);
    if (_restartTimeout) clearTimeout(_restartTimeout);
  });

  // ---------------------------------------------------------------------------
  // setup(map) — called once after map 'load' fires
  // ---------------------------------------------------------------------------

  function setup(map) {
    const pathData = store.pathData;
    const marksData = store.marksData;
    const duration = store.duration;
    const showMarks = true;

    // Extract the LineString feature (first feature in the FeatureCollection)
    const lineFeature = pathData.features[0];

    // Pre-calculate the total distance of the path (2D; turf ignores the 3rd coordinate)
    const totalDistance = turf.lineDistance(lineFeature);

    // --- Pre-compute sampled coordinates lookup table (T12) -----------------
    // Instead of calling turf.along() every frame (O(n) per call), we sample
    // NUM_SAMPLES points along the route once during setup and store them.
    // The frame loop then does a simple array index lookup: O(1).
    const NUM_SAMPLES = 1000;
    const sampledCoords = new Array(NUM_SAMPLES + 1);
    for (let i = 0; i <= NUM_SAMPLES; i++) {
      const d = (i / NUM_SAMPLES) * totalDistance;
      const pt = turf.along(lineFeature, d);
      sampledCoords[i] = pt.geometry.coordinates; // [lng, lat]
    }

    /**
     * Fast coordinate lookup by animation phase (0–1).
     * Uses the pre-computed sampledCoords array with linear interpolation
     * between the two nearest samples for sub-sample accuracy.
     *
     * @param {number} phase - Animation phase 0–1
     * @returns {[number, number]} [lng, lat]
     */
    function coordAtPhase(phase) {
      const t = Math.max(0, Math.min(1, phase)) * NUM_SAMPLES;
      const idx = Math.min(Math.floor(t), NUM_SAMPLES - 1);
      const frac = t - idx;
      const a = sampledCoords[idx];
      const b = sampledCoords[idx + 1];
      return [
        a[0] + (b[0] - a[0]) * frac,
        a[1] + (b[1] - a[1]) * frac,
      ];
    }

    /**
     * Compute bearing from the route tangent at the given phase (T8).
     * Uses turf.bearing between the current point and a point slightly ahead
     * on the route for a natural camera orientation.
     *
     * @param {number} phase - Animation phase 0–1
     * @returns {number} Bearing in degrees
     */
    function bearingAtPhase(phase) {
      const lookAhead = Math.min(phase + 0.005, 1); // ~5 m ahead on the lookup
      const current = coordAtPhase(phase);
      const ahead = coordAtPhase(lookAhead);
      // turf.bearing returns degrees (-180 to 180)
      return turf.bearing(turf.point(current), turf.point(ahead));
    }

    // Animation state variables (plain JS — no reactivity needed)
    let startTime;
    let isPaused = true;       // Always start paused — user must press play
    let pauseTimestamp = performance.now();
    let speed = store.speed;
    let hasStarted = false;    // Whether the animation has ever been started
    let savedCameraState = null;

    // Camera lerp state (T7) — smooth interpolation eliminates jumpTo jitter
    let camCenter = null;      // Current interpolated camera center [lng, lat]
    let camBearing = 0;        // Current interpolated bearing

    // Throttle state for store.setProgress (T11)
    let lastProgressTimestamp = 0;
    /** Minimum ms between store.setProgress calls (~20 fps) */
    const PROGRESS_THROTTLE_MS = 50;

    _internalPhase = 0;

    // --- Compute route bounds for fit operations ---
    const routeBounds = new mapboxgl.LngLatBounds();
    lineFeature.geometry.coordinates.forEach(coord => {
      routeBounds.extend([coord[0], coord[1]]);
    });

    // --- Initialize map layers and marks ---
    const { showAnimationLayers, showOverviewLayers, headMarker } = useMapLayers(map, lineFeature);
    const { updateHeadPosition, resetPopup } = useMarkers(map, marksData, showMarks, lineFeature, totalDistance);

    // --- Speed control (called from speed watcher) ---
    _setSpeed = (newSpeed) => {
      const now = performance.now();
      const effectiveNow = isPaused ? pauseTimestamp : now;
      if (startTime !== undefined) {
        const elapsed = effectiveNow - startTime;
        const currentPhase = Math.min(elapsed / (duration / speed), 1);
        speed = newSpeed;
        startTime = effectiveNow - currentPhase * (duration / speed);
      } else {
        speed = newSpeed;
      }
    };

    // --- Camera position computation (T7: lerp interpolation) ----------------
    // Camera lerp factor: 0 = no movement, 1 = instant snap.
    // 0.08 gives a smooth "camera with inertia" effect that eliminates
    // the motion-blur caused by the old frame-by-frame jumpTo.
    const CAM_LERP_ALPHA = 0.08;

    /**
     * Linear interpolation helper.
     * @param {number} a - Start value
     * @param {number} b - End value
     * @param {number} t - Interpolation factor 0–1
     * @returns {number}
     */
    const lerp = (a, b, t) => a + (b - a) * t;

    /**
     * Interpolate bearing accounting for the ±180° wraparound.
     * Ensures the camera always takes the shortest rotation path.
     */
    const lerpBearing = (a, b, t) => {
      let diff = b - a;
      // Normalise to -180..180
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      return a + diff * t;
    };

    /**
     * Compute the ideal camera center (offset from target by pitch/bearing/altitude)
     * and apply smooth lerp interpolation before sending to the map.
     *
     * Replaces the old jumpTo with a lerp that converges toward the target
     * each frame, producing a fluid "inertia camera" effect.
     *
     * @param {number} pitch
     * @param {number} targetBearing
     * @param {[number,number]} targetPosition - [lng, lat] of the route head
     * @param {number} altitude
     */
    const computeCameraPosition = (pitch, targetBearing, targetPosition, altitude) => {
      const bearingInRadian = targetBearing / 57.29;
      const pitchInRadian = (90 - pitch) / 57.29;

      const lngDiff =
        ((altitude * Math.tan(pitchInRadian)) * Math.sin(-bearingInRadian)) / 70000;
      const latDiff =
        ((altitude * Math.tan(pitchInRadian)) * Math.cos(-bearingInRadian)) / 110000;

      const idealCenter = [
        targetPosition[0] + lngDiff,
        targetPosition[1] - latDiff,
      ];

      // First frame or after seek: snap instantly, then lerp from there
      if (!camCenter) {
        camCenter = idealCenter;
        camBearing = targetBearing;
      } else {
        camCenter = [
          lerp(camCenter[0], idealCenter[0], CAM_LERP_ALPHA),
          lerp(camCenter[1], idealCenter[1], CAM_LERP_ALPHA),
        ];
        camBearing = lerpBearing(camBearing, targetBearing, CAM_LERP_ALPHA);
      }

      map.jumpTo({
        center: camCenter,
        zoom: 17,
        pitch,
        bearing: camBearing,
      });
    };

    // --- Display update helper (used by both animation frame and seek) ---
    // Batches all visual updates (head marker, popup, camera, line gradient)
    // into a single function to minimize repaints (T10).
    const updateDisplay = (phase, moveCamera = true) => {
      // Fast O(1) coordinate lookup from the pre-computed table (T12)
      const [lng, lat] = coordAtPhase(phase);

      // ── Batch 1: DOM updates (no Mapbox GL render pipeline) ──────────
      // Update the head marker BEFORE the camera to keep them in sync
      headMarker.setLngLat([lng, lat]);

      // Update mark popup (proximity-based, debounced by phase delta)
      updateHeadPosition(lng, lat, phase, !isPaused);

      // ── Batch 2: Mapbox GL state updates ─────────────────────────────
      if (moveCamera) {
        // Bearing derived from route tangent for natural camera orientation (T8)
        const bearing = bearingAtPhase(phase);
        // Lerp-smoothed camera positioning (T7)
        computeCameraPosition(45, bearing, [lng, lat], 50);
      }

      // Two-tone gradient on the route line (single Mapbox paint call)
      const safePhase = Math.max(phase, 0.0001);
      map.setPaintProperty('lineLayer', 'line-gradient', [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        tokens.colors.route.gradientStart,
        safePhase,
        tokens.colors.route.gradientEnd,
        Math.min(safePhase + 0.0001, 1),
        'rgba(0, 0, 0, 0)',
      ]);
    };

    // --- Animation frame loop ---
    const frame = (time) => {
      if (!startTime) startTime = time;

      // Safety: if paused between RAF schedule and execution, stop
      if (isPaused) return;

      // Clamp animationPhase to 1 to avoid overshooting
      let animationPhase = Math.min((time - startTime) / (duration / speed), 1);

      // Track internal phase for seek-detection in the progress watcher
      _internalPhase = animationPhase;

      // Throttled store progress update (T11): ~20 emissions/sec instead of ~60.
      // Sufficient for PlayBack UI reactivity without saturating Vue.
      if (time - lastProgressTimestamp >= PROGRESS_THROTTLE_MS || animationPhase >= 1) {
        store.setProgress(animationPhase);
        lastProgressTimestamp = time;
      }

      updateDisplay(animationPhase);

      if (animationPhase < 1) {
        _animationFrame = window.requestAnimationFrame(frame);
      } else {
        // Animation complete — hide popup and restart after a short delay
        resetPopup();
        _restartTimeout = setTimeout(() => {
          startTime = undefined;
          _internalPhase = 0;
          camCenter = null; // Reset lerp for clean restart
          store.setProgress(0);
          _animationFrame = window.requestAnimationFrame(frame);
        }, 1500);
      }
    };

    // --- Pause / resume / first-play control (called from playing watcher) ---
    _togglePause = (playing) => {
      if (playing && !hasStarted) {
        // ── FIRST PLAY ──────────────────────────────────────────────
        hasStarted = true;
        isPaused = false;
        pauseTimestamp = null;

        // Initialize the animated progress display at phase 0
        updateDisplay(0, false);

        // Show animated layers, hide full route
        showAnimationLayers();

        // Fly to start point of route (pitch 45, zoom 17)
        // Reduced duration (T9) + essential:true to prevent user interruption
        const startCoords = lineFeature.geometry.coordinates[0];
        camCenter = null; // Reset lerp state for clean start
        map.flyTo({
          center: [startCoords[0], startCoords[1]],
          zoom: 17,
          pitch: 45,
          bearing: 0,
          duration: 2000,
          essential: true,
        });

        map.once('moveend', () => {
          startTime = undefined;
          _animationFrame = window.requestAnimationFrame(frame);
        });

      } else if (playing && isPaused) {
        // ── RESUME FROM PAUSE ───────────────────────────────────────
        isPaused = false;

        // Show animated layers, hide full route
        showAnimationLayers();

        if (savedCameraState) {
          // Reduced duration (T9) + essential:true for snappier resume
          camCenter = null; // Reset lerp state so it re-converges smoothly
          map.flyTo({
            ...savedCameraState,
            duration: 2000,
            essential: true,
          });

          map.once('moveend', () => {
            if (startTime !== undefined && pauseTimestamp !== null) {
              startTime += performance.now() - pauseTimestamp;
            }
            pauseTimestamp = null;
            savedCameraState = null;
            _animationFrame = window.requestAnimationFrame(frame);
          });
        } else {
          if (startTime !== undefined && pauseTimestamp !== null) {
            startTime += performance.now() - pauseTimestamp;
          }
          pauseTimestamp = null;
          _animationFrame = window.requestAnimationFrame(frame);
        }

      } else if (!playing && !isPaused) {
        // ── PAUSE ───────────────────────────────────────────────────
        isPaused = true;
        pauseTimestamp = performance.now();
        if (_animationFrame) {
          cancelAnimationFrame(_animationFrame);
        }
        if (_restartTimeout) {
          clearTimeout(_restartTimeout);
        }

        // Save current camera state for resume fly-back
        savedCameraState = {
          center: map.getCenter().toArray(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        };

        // Show full route in gray behind animated progress; hide popup
        showOverviewLayers();
        resetPopup();

        // Fly to fit route extent, top-down view
        // Reduced duration (T9) + essential:true + easeOutQuad easing
        const fitCamera = map.cameraForBounds(routeBounds, { padding: 50 });
        map.flyTo({
          center: fitCamera.center,
          zoom: fitCamera.zoom,
          pitch: 0,
          bearing: 0,
          duration: 2000,
          essential: true,
          easing: (t) => t * (2 - t),  // easeOutQuad — smooth deceleration
        });
      }
    };

    // --- Seek control (called from progress watcher) ---
    _seekToPhase = (targetPhase) => {
      if (!hasStarted) return; // Cannot seek before animation starts

      const clampedPhase = Math.max(0, Math.min(1, targetPhase));
      const now = performance.now();
      const effectiveNow = isPaused ? (pauseTimestamp || now) : now;

      // Adjust startTime so animation phase matches the target
      startTime = effectiveNow - clampedPhase * (duration / speed);
      _internalPhase = clampedPhase;

      // Reset camera lerp state so it snaps to the new position on seek
      camCenter = null;

      // Update display — skip camera movement when paused (overview mode)
      updateDisplay(clampedPhase, !isPaused);

      // If animation had stopped (phase ≥ 1), restart the frame loop
      if (!isPaused && clampedPhase < 1) {
        if (_animationFrame) cancelAnimationFrame(_animationFrame);
        if (_restartTimeout) clearTimeout(_restartTimeout);
        _animationFrame = window.requestAnimationFrame(frame);
      }
    };

    // --- Fit map to full route extent, top-down view (initial state) ---
    map.fitBounds(routeBounds, {
      padding: 50,
      pitch: 0,
      bearing: 0,
    });

    // Do NOT start animation automatically — wait for user to press play
  }

  return { setup };
}
