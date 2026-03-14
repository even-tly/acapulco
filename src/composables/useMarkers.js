/**
 * useMarkers — Composable for race marks layer management and popup interaction.
 *
 * Behavior:
 *  - "Dist" circle markers (orange dots) are always visible on the map in pause/overview.
 *  - A second layer shows ALL marks (with `name !== null && path_l !== null`) when playing,
 *    visible only above a configurable `minzoom` threshold.
 *  - During animation, a route-fraction geofence popup appears when the race
 *    head reaches each mark's position along the route.
 *  - Each mark triggers its popup individually (no clustering).
 *  - Only one popup is visible at a time.
 *  - Trigger is based on exact route-fraction projection (turf.pointOnLine),
 *    not spatial proximity, so route self-intersections don't cause false triggers.
 *
 * @param {mapboxgl.Map} map           - Mapbox map instance
 * @param {Object}       marksData     - GeoJSON FeatureCollection of Point features
 * @param {boolean}      showMarks     - Whether to activate marks rendering
 * @param {Object}       lineFeature   - GeoJSON LineString feature of the route
 * @param {number}       totalDistance - Total route distance (km, from turf.lineDistance)
 * @returns {{ updateHeadPosition: Function, resetPopup: Function, showPlayMarks: Function, showPauseMarks: Function }}
 */

import turf from 'turf';
import { useMarkPopup } from '@/composables/useMarkPopup';
import tokens from '@/theme/tokens';

/**
 * Mapbox expression filter: features whose name starts with "Dist"
 * (matches "Dist" and "Dist, Service").
 */
const DIST_FILTER = ['==', ['slice', ['coalesce', ['get', 'name'], ''], 0, 4], 'Dist'];

/**
 * Mapbox expression filter: all features with name !== null and path_l !== null.
 */
const ALL_MARKS_FILTER = [
  'all',
  ['!=', ['get', 'name'], null],
  ['has', 'path_l'],
];

/**
 * Phase buffer before a mark's route-fraction where the popup appears.
 * 0.004 = 0.4% of route (~170 m on 42 km, ~60 m on 15 km).
 */
const PHASE_LEAD = 0.004;

/**
 * Phase buffer after a mark's route-fraction where the popup disappears.
 * 0.004 = 0.4% of route.
 */
const PHASE_TRAIL = 0.004;

/**
 * Minimum phase delta before re-evaluating mark proximity.
 * Decouples the popup logic from the 60 fps frame loop.
 * 0.0005 = 0.05% of route (~21 m on 42 km, ~7.5 m on 15 km).
 */
const MIN_PHASE_DELTA = 0.0005;

/**
 * Calculate the distance along `lineFeature` to the `snapped` point returned
 * by turf.pointOnLine.
 *
 * @param {Object} lineFeature - GeoJSON LineString Feature (the route)
 * @param {Object} snapped     - Point Feature returned by turf.pointOnLine
 * @returns {number} Distance in km along the route to the snapped point.
 */
function distanceAlongRoute(lineFeature, snapped) {
  const coords = lineFeature.geometry.coordinates;
  const segIdx = snapped.properties.index;
  let dist = 0;

  for (let i = 0; i < segIdx; i++) {
    dist += turf.distance(turf.point(coords[i]), turf.point(coords[i + 1]));
  }

  dist += turf.distance(turf.point(coords[segIdx]), snapped);
  return dist;
}

export function useMarkers(map, marksData, showMarks, lineFeature, totalDistance) {
  const noop = () => {};
  if (
    !showMarks || !marksData || !marksData.features || marksData.features.length === 0
    || !lineFeature || !totalDistance
  ) {
    return { updateHeadPosition: noop, resetPopup: noop, showPlayMarks: noop, showPauseMarks: noop };
  }

  // -- Filter marks: only features with name !== null and path_l !== null --
  const safeTotalDistance = totalDistance || 1;
  const marks = marksData.features
    .filter((f) => f.properties.name != null && f.properties.path_l != null)
    .map((f, index) => {
      const props = f.properties;
      const lng = f.geometry.coordinates[0];
      const lat = f.geometry.coordinates[1];
      const pt = turf.point([lng, lat]);
      const snapped = turf.pointOnLine(lineFeature, pt);
      const alongKm = distanceAlongRoute(lineFeature, snapped);
      const routeFraction = alongKm / safeTotalDistance;

      return {
        lng,
        lat,
        name: props.name,
        label: props.label,
        path_l: props.path_l,
        path_d: props.path_d,
        sequence: props.sequence ?? index,
        routeFraction,
      };
    });

  // Sort by sequence (or natural order if sequence absent)
  marks.sort((a, b) => a.sequence - b.sequence);

  // Dev-mode validation: warn if sequence doesn't match ordinal position
  if (import.meta.env.DEV) {
    marks.forEach((m, i) => {
      if (m.sequence !== i) {
        console.warn(
          `[useMarkers] Mark "${m.name}" (label="${m.label}") has sequence=${m.sequence} but ordinal position=${i}`
        );
      }
    });
  }

  // -- GeoJSON source (shared by all layers) --
  map.addSource('marks', { type: 'geojson', data: marksData });

  // -- Dist circle layer — visible in pause/overview, orange dots --
  map.addLayer({
    id: 'marks-dist-dots',
    type: 'circle',
    source: 'marks',
    filter: DIST_FILTER,
    paint: {
      'circle-radius': 5,
      'circle-color': tokens.colors.route.markDot,
      'circle-opacity': 1,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-opacity': 1,
    },
  });

  // -- All marks circle layer — visible during play, zoom-dependent --
  map.addLayer({
    id: 'marks-all-dots',
    type: 'circle',
    source: 'marks',
    filter: ALL_MARKS_FILTER,
    minzoom: 14,
    layout: {
      'visibility': 'none',
    },
    paint: {
      'circle-radius': 4,
      'circle-color': tokens.colors.route.markDot,
      'circle-opacity': 0.8,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-opacity': 0.8,
    },
  });

  /**
   * Show play-mode marks: both dist dots and all-marks layer visible.
   */
  function showPlayMarks() {
    map.setLayoutProperty('marks-dist-dots', 'visibility', 'visible');
    map.setLayoutProperty('marks-all-dots', 'visibility', 'visible');
  }

  /**
   * Show pause-mode marks: only dist dots visible, all-marks hidden.
   */
  function showPauseMarks() {
    map.setLayoutProperty('marks-dist-dots', 'visibility', 'visible');
    map.setLayoutProperty('marks-all-dots', 'visibility', 'none');
  }

  // -- Popup instance --
  const { show: showPopup, hide: hidePopup } = useMarkPopup(map);

  /** Index of the mark whose popup is currently showing (-1 = none). */
  let activeMarkIdx = -1;

  /** Phase at which marks were last evaluated (for debounce). */
  let lastCheckedPhase = -1;

  /**
   * Called every animation frame with the current head position.
   * Uses route-fraction geofencing: each mark has a phase window
   * [routeFraction - LEAD, routeFraction + TRAIL]. The popup shows when
   * `phase` enters that window and hides when it exits.
   *
   * @param {number}  lng    - Head longitude
   * @param {number}  lat    - Head latitude
   * @param {number}  phase  - Animation phase (0–1)
   * @param {boolean} active - false when paused
   */
  function updateHeadPosition(lng, lat, phase, active = true) {
    if (!active) {
      if (activeMarkIdx >= 0) {
        hidePopup();
        activeMarkIdx = -1;
        lastCheckedPhase = -1;
      }
      return;
    }

    // Debounce: skip evaluation if the phase hasn't changed enough
    if (Math.abs(phase - lastCheckedPhase) < MIN_PHASE_DELTA) {
      return;
    }
    lastCheckedPhase = phase;

    // If a popup is showing, check if phase has exited its window
    if (activeMarkIdx >= 0) {
      const am = marks[activeMarkIdx];
      if (phase >= am.routeFraction - PHASE_LEAD && phase <= am.routeFraction + PHASE_TRAIL) {
        return;
      }
      hidePopup();
      activeMarkIdx = -1;
    }

    // Find the mark whose window contains the current phase
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (phase >= m.routeFraction - PHASE_LEAD && phase <= m.routeFraction + PHASE_TRAIL) {
        showPopup([m.lng, m.lat], m);
        activeMarkIdx = i;
        return;
      }
    }
  }

  /**
   * Hide the popup and reset state.
   */
  function resetPopup() {
    hidePopup();
    activeMarkIdx = -1;
    lastCheckedPhase = -1;
  }

  return { updateHeadPosition, resetPopup, showPlayMarks, showPauseMarks };
}
