/**
 * useMarkers  Composable for race marks layer management and popup interaction.
 *
 * Behavior:
 *  - Orange KM circle markers are always visible on the map (no play/pause mode switching).
 *  - During animation, a route-fraction geofence popup appears when the race
 *    head reaches each mark's position along the route.
 *  - Nearby consecutive marks are clustered and shown together.
 *  - Only one popup is visible at a time.
 *  - Trigger is based on exact route-fraction projection (turf.pointOnLine),
 *    not spatial proximity, so route self-intersections don't cause false triggers.
 *
 * @param {mapboxgl.Map} map           - Mapbox map instance
 * @param {Object}       marksData     - GeoJSON FeatureCollection of Point features
 * @param {boolean}      showMarks     - Whether to activate marks rendering
 * @param {Object}       lineFeature   - GeoJSON LineString feature of the route
 * @param {number}       totalDistance - Total route distance (km, from turf.lineDistance)
 * @returns {{ updateHeadPosition: Function, resetPopup: Function }}
 */

import turf from 'turf';
import { useMarkPopup, classifyMark } from '@/composables/useMarkPopup';
import tokens from '@/theme/tokens';

/** Mapbox expression filter: only features whose name starts with "KM". */
const KM_FILTER = ['match', ['slice', ['get', 'name'], 0, 2], ['KM'], true, false];

/**
 * Distance threshold (degrees) for grouping nearby consecutive marks into one cluster.
 * ~0.0008 deg  90 m at the equator.
 */
const CLUSTER_THRESHOLD = 0.0008;

/**
 * Phase buffer before a cluster's route-fraction where the popup appears.
 * 0.004 = 0.4% of route (~170 m on 42 km, ~60 m on 15 km).
 */
const PHASE_LEAD = 0.004;

/**
 * Phase buffer after a cluster's route-fraction where the popup disappears.
 * 0.004 = 0.4% of route.
 */
const PHASE_TRAIL = 0.004;

/**
 * Minimum phase delta before re-evaluating cluster proximity.
 * Decouples the popup logic from the 60 fps frame loop — only checks
 * when the animation has advanced enough for a cluster transition to matter.
 * 0.0005 = 0.05% of route (~21 m on 42 km, ~7.5 m on 15 km).
 */
const MIN_PHASE_DELTA = 0.0005;

/**
 * Calculate the distance along `lineFeature` to the `snapped` point returned
 * by turf.pointOnLine.  The legacy `turf` package only provides
 * `snapped.properties.index` (the segment index) and
 * `snapped.properties.dist` (Euclidean distance from the original point to
 * the line), but NOT a `location` (distance along the line) property.
 *
 * We therefore sum segment lengths up to `index` and add the partial
 * distance from the segment start to the snapped point.
 *
 * @param {Object} lineFeature - GeoJSON LineString Feature (the route)
 * @param {Object} snapped     - Point Feature returned by turf.pointOnLine
 * @returns {number} Distance in km along the route to the snapped point.
 */
function distanceAlongRoute(lineFeature, snapped) {
  const coords = lineFeature.geometry.coordinates;
  const segIdx = snapped.properties.index;
  let dist = 0;

  // Sum full segment lengths up to the target segment
  for (let i = 0; i < segIdx; i++) {
    dist += turf.distance(turf.point(coords[i]), turf.point(coords[i + 1]));
  }

  // Add partial distance within the target segment
  dist += turf.distance(turf.point(coords[segIdx]), snapped);
  return dist;
}

/** Squared Euclidean distance between two coordinate pairs (degrees). */
function sqDist(lng1, lat1, lng2, lat2) {
  const dLng = lng1 - lng2;
  const dLat = lat1 - lat2;
  return dLng * dLng + dLat * dLat;
}

/**
 * Group marks into clusters of consecutive entries that are spatially close.
 * Only adjacent marks (by array order) are merged.
 *
 * @param {Array} marks
 * @returns {Array<{center:[number,number], marks:Array, startFraction:number, endFraction:number}>}
 */
function computeClusters(marks) {
  if (marks.length === 0) return [];

  const threshold2 = CLUSTER_THRESHOLD * CLUSTER_THRESHOLD;
  const clusters = [];
  let group = [marks[0]];

  for (let i = 1; i < marks.length; i++) {
    const prev = marks[i - 1];
    const curr = marks[i];

    if (sqDist(prev.lng, prev.lat, curr.lng, curr.lat) < threshold2) {
      group.push(curr);
    } else {
      clusters.push(finaliseCluster(group));
      group = [curr];
    }
  }
  clusters.push(finaliseCluster(group));
  return clusters;
}

/**
 * Compute cluster center and route-fraction window from a group of marks.
 * Each mark must already have a `routeFraction` property.
 */
function finaliseCluster(group) {
  const center = [
    group.reduce((s, m) => s + m.lng, 0) / group.length,
    group.reduce((s, m) => s + m.lat, 0) / group.length,
  ];
  const fractions = group.map((m) => m.routeFraction);
  return {
    center,
    marks: group,
    startFraction: Math.min(...fractions),
    endFraction: Math.max(...fractions),
  };
}

export function useMarkers(map, marksData, showMarks, lineFeature, totalDistance) {
  const noop = () => {};
  if (
    !showMarks || !marksData || !marksData.features || marksData.features.length === 0
    || !lineFeature || !totalDistance
  ) {
    return { updateHeadPosition: noop, resetPopup: noop };
  }

  // -- Classify marks and project each onto the route to get routeFraction --
  const safeTotalDistance = totalDistance || 1;
  const marks = marksData.features
    .map((f) => {
      const type = classifyMark(f.properties.name);
      if (!type) return null;

      const lng = f.geometry.coordinates[0];
      const lat = f.geometry.coordinates[1];
      const pt = turf.point([lng, lat]);
      const snapped = turf.pointOnLine(lineFeature, pt);
      const alongKm = distanceAlongRoute(lineFeature, snapped);
      const routeFraction = alongKm / safeTotalDistance;

      return { lng, lat, name: f.properties.name, type, routeFraction };
    })
    .filter(Boolean);

  // Sort marks by routeFraction so clustering respects route-traversal order.
  // Without this, marks that are spatially close but at opposite ends of the
  // route (e.g. Salida fraction≈0 and Llegada fraction≈1) would form a single
  // cluster spanning the entire animation.
  marks.sort((a, b) => a.routeFraction - b.routeFraction);

  // -- Pre-compute clusters (consecutive spatially-close marks) --
  const clusters = computeClusters(marks);

  // -- GeoJSON source (shared by all layers) --
  map.addSource('marks', { type: 'geojson', data: marksData });

  // -- KM circle layer  always visible, orange dots --
  map.addLayer({
    id: 'marks-km-dots',
    type: 'circle',
    source: 'marks',
    filter: KM_FILTER,
    paint: {
      'circle-radius': 5,
      'circle-color': tokens.colors.route.markDot,
      'circle-opacity': 1,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-opacity': 1,
    },
  });

  // -- Popup instance --
  const { show: showPopup, hide: hidePopup } = useMarkPopup(map);

  /** Index of the cluster whose popup is currently showing (-1 = none). */
  let activeClusterIdx = -1;

  /** Phase at which clusters were last evaluated (for debounce). */
  let lastCheckedPhase = -1;

  /**
   * Called every animation frame with the current head position.
   * Uses route-fraction geofencing: each cluster has a phase window
   * [startFraction - LEAD, endFraction + TRAIL]. The popup shows when
   * `phase` enters that window and hides when it exits.
   *
   * Because activation is purely phase-based (not spatial), route
   * self-intersections cannot cause false triggers.
   *
   * @param {number}  lng    - Head longitude (used only for popup anchor if needed)
   * @param {number}  lat    - Head latitude
   * @param {number}  phase  - Animation phase (01), equals distance fraction along route
   * @param {boolean} active - false when paused
   */
  function updateHeadPosition(lng, lat, phase, active = true) {
    if (!active) {
      if (activeClusterIdx >= 0) {
        hidePopup();
        activeClusterIdx = -1;
        lastCheckedPhase = -1;
      }
      return;
    }

    // Debounce: skip cluster evaluation if the phase has not changed enough.
    // This decouples the popup from the 60 fps frame loop — cluster
    // transitions only matter when the head has moved a meaningful distance.
    if (Math.abs(phase - lastCheckedPhase) < MIN_PHASE_DELTA) {
      return;
    }
    lastCheckedPhase = phase;

    // If a popup is showing, check if phase has exited its window
    if (activeClusterIdx >= 0) {
      const ac = clusters[activeClusterIdx];
      if (phase >= ac.startFraction - PHASE_LEAD && phase <= ac.endFraction + PHASE_TRAIL) {
        // Still inside the active cluster window — showPopup is a no-op
        // when the same cluster coords are already displayed (see useMarkPopup).
        return;
      }
      // Exited → hide
      hidePopup();
      activeClusterIdx = -1;
    }

    // Find the cluster whose window contains the current phase
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      if (phase >= c.startFraction - PHASE_LEAD && phase <= c.endFraction + PHASE_TRAIL) {
        // showPopup uses fixed pre-computed cluster center coords and
        // skips repositioning if the same cluster is already showing.
        showPopup(c.center, c.marks);
        activeClusterIdx = i;
        return;
      }
    }
  }

  /**
   * Hide the popup and reset state.
   */
  function resetPopup() {
    hidePopup();
    activeClusterIdx = -1;
    lastCheckedPhase = -1;
  }

  return { updateHeadPosition, resetPopup };
}
