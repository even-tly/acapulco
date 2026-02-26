/**
 * useMapLayers — Composable that manages Mapbox sources and layers for route rendering.
 *
 * Creates two layer groups plus an HTML head marker:
 *  1. Full route (dashed, visible initially and when paused)
 *  2. Animated line (gradient, visible during playback)
 *  3. Head marker (HTML mapboxgl.Marker, updated via setLngLat for zero-lag positioning)
 *
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {Object} lineFeature - GeoJSON LineString feature
 * @returns {{ showAnimationLayers: Function, showOverviewLayers: Function, headMarker: mapboxgl.Marker }}
 */

import mapboxgl from 'mapbox-gl';
import tokens from '@/theme/tokens';

export function useMapLayers(map, lineFeature) {
  const coordinates = lineFeature.geometry.coordinates;

  // --- Full route layer (visible initially and when paused) ---
  map.addSource('full-route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
    },
  });
  map.addLayer({
    id: 'fullRouteLayer',
    type: 'line',
    source: 'full-route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
      'visibility': 'visible',
    },
    paint: {
      'line-color': tokens.colors.route.full,
      'line-width': 5,
      'line-opacity': 0.8,
      'line-dasharray': [2, 2],
    },
  });

  // --- Animated route line source (initially hidden) ---
  map.addSource('line', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
    },
    lineMetrics: true,
  });
  map.addLayer({
    id: 'lineLayer',
    type: 'line',
    source: 'line',
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
      'visibility': 'none',
    },
    paint: {
      'line-color': tokens.colors.route.animatedLine,
      'line-width': 8,
    },
  });

  // --- Animated head marker (HTML Marker — bypasses Mapbox render pipeline) ---
  const headEl = document.createElement('div');
  headEl.className = 'route-head-marker';
  headEl.style.cssText = [
    `width: 30px`,
    `height: 30px`,
    `border-radius: 50%`,
    `background: ${tokens.colors.route.head}`,
    `border: 2px solid #fff`,
    `box-shadow: 0 0 6px rgba(0,0,0,0.4)`,
    `pointer-events: none`,
    `will-change: transform`,
    `display: none`,    // hidden until animation starts
  ].join(';');

  const headMarker = new mapboxgl.Marker({ element: headEl, anchor: 'center' })
    .setLngLat(coordinates[0])
    .addTo(map);

  /**
   * Show animated layers (line + head) and hide full route.
   * Used when animation starts or resumes.
   */
  function showAnimationLayers() {
    map.setLayoutProperty('lineLayer', 'visibility', 'visible');
    headEl.style.display = 'block';
    map.setLayoutProperty('fullRouteLayer', 'visibility', 'none');
  }

  /**
   * Show full route layer (overview mode when paused).
   * Head marker stays hidden in overview.
   */
  function showOverviewLayers() {
    map.setLayoutProperty('fullRouteLayer', 'visibility', 'visible');
    headEl.style.display = 'none';
  }

  return {
    showAnimationLayers,
    showOverviewLayers,
    headMarker,
  };
}
