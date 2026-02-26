import { defineStore } from 'pinia';
import { parseElevationCsv } from '@/utils/parseElevationCsv';
import { flattenGeoJson } from '@/utils/flattenGeoJson';
import eventData from '@/assets/event.json';

/**
 * Lookup map from route id → route config object (from event.json).
 * @type {Record<string, Object>}
 */
const ROUTE_MAP = Object.fromEntries(
  eventData.routes.map(r => [r.id, r])
);

/**
 * Playback store — single source of truth for the route playback state,
 * route data and route config.  Replaces the local refs that previously
 * lived in RouteMapView.
 */
export const usePlaybackStore = defineStore('playback', {
  state: () => ({
    // --- Playback controls ---
    /** @type {number} Animation progress 0–1 */
    progress: 0,
    /** @type {boolean} Whether the animation is currently playing */
    isPlaying: false,
    /** @type {number} Playback speed multiplier (1 = normal) */
    speed: 1,
    /** @type {string|null} Currently loaded route id */
    routeId: null,

    // --- Route data ---
    /** @type {Object|null} GeoJSON FeatureCollection with the route LineString */
    pathData: null,
    /** @type {Object|null} Marks FeatureCollection (KM markers, hydration, etc.) */
    marksData: null,
    /** @type {Array<Object>} Parsed elevation profile rows */
    elevationProfile: [],
    /** @type {number} Total distance in km (from last elevation row) */
    totalDistance: 0,
    /** @type {number} Animation duration in ms (from route config) */
    duration: 300000,
    /** @type {Object|null} Route config object from event.json */
    routeConfig: null,

    // --- Loading / error ---
    /** @type {boolean} Whether route data is being loaded */
    loading: false,
    /** @type {string|null} Error message if loading failed */
    error: null,
  }),

  getters: {
    /** City name from the centralized event config */
    eventCity: () => eventData.city || '',

    /**
     * True when pathData has been loaded successfully and there is no error.
     * Components can use this to know if the map is ready to render.
     */
    isReady: (state) => state.pathData !== null && !state.error,
  },

  actions: {
    /**
     * Load all assets for the given route (geojson, elevation CSV, marks).
     * Resets playback state before loading.
     *
     * @param {string} routeId - The route identifier (must match an id in event.json)
     */
    async loadRoute(routeId) {
      // Reset all state
      this.loading = true;
      this.error = null;
      this.pathData = null;
      this.marksData = null;
      this.elevationProfile = [];
      this.totalDistance = 0;
      this.routeConfig = null;
      this.progress = 0;
      this.isPlaying = false;
      this.speed = 1;
      this.routeId = routeId;

      const config = ROUTE_MAP[routeId];
      if (!config) {
        this.error = `Route "${routeId}" not found.`;
        this.loading = false;
        return;
      }

      this.routeConfig = config;

      try {
        if (config.legacy) {
          // Legacy route: separate path + marks JSON files
          const [pathModule, marksModule] = await Promise.all([
            import(`@/assets/routes/${routeId}.json`),
            import(`@/assets/marks/${routeId}.json`),
          ]);
          this.pathData = pathModule.default || pathModule;
          this.marksData = marksModule.default || marksModule;
          this.elevationProfile = [];
          this.totalDistance = 0;
        } else {
          // Standard route: GeoJSON + elevation CSV + marks (optional)
          const [geojsonModule, csvModule] = await Promise.all([
            import(`@/assets/routes/${routeId}.geojson`),
            import(`@/assets/elevation/${routeId}.csv?raw`),
          ]);

          const rawGeojson = geojsonModule.default || geojsonModule;
          const csvText = csvModule.default || csvModule;

          // Flatten GeoJSON: strip Z (elevation) values from coordinates and
          // normalise MultiLineString → LineString so Mapbox only receives 2D data.
          const geojson = flattenGeoJson(rawGeojson);

          // Extract the LineString (route geometry) for pathData
          const lineFeature = geojson.features.find(f => f.geometry.type === 'LineString');

          this.pathData = {
            type: 'FeatureCollection',
            features: lineFeature ? [lineFeature] : [],
          };

          // Load named marks from marks/{id}.json (KM markers, hydration, start/finish)
          // Falls back to GeoJSON Point features if marks file is unavailable.
          try {
            const marksModule = await import(`@/assets/marks/${routeId}.json`);
            this.marksData = marksModule.default || marksModule;
          } catch {
            const pointFeatures = geojson.features.filter(f => f.geometry.type === 'Point');
            this.marksData = {
              type: 'FeatureCollection',
              features: pointFeatures,
            };
          }

          // Parse elevation CSV into numeric-typed array
          this.elevationProfile = parseElevationCsv(csvText);

          // Total distance from the last profile point
          if (this.elevationProfile.length > 0) {
            this.totalDistance = this.elevationProfile[this.elevationProfile.length - 1].distance_km_cum;
          }
        }

        this.duration = config.duration;
      } catch (err) {
        console.error('Failed to load route data:', err);
        this.error = 'Failed to load route data.';
      } finally {
        this.loading = false;
      }
    },

    /**
     * Set the animation progress (0–1).
     * @param {number} val
     */
    setProgress(val) {
      this.progress = val;
    },

    /** Toggle between playing and paused. */
    togglePlay() {
      this.isPlaying = !this.isPlaying;
    },

    /**
     * Set the playback speed multiplier.
     * @param {number} speed
     */
    setSpeed(speed) {
      this.speed = speed;
    },

    /** Reset playback to initial state (beginning of route, paused). */
    reset() {
      this.progress = 0;
      this.isPlaying = false;
      this.speed = 1;
    },
  },
});
