<template>
  <!-- PlayBack removed from here — now a sibling in the parent view for proper progress sync -->
  <div class="map-wrapper">
    <div ref="mapContainer" class="map"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import mapboxgl from 'mapbox-gl';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useRouteAnimation } from '@/composables/useRouteAnimation';
import { mapboxConfig } from '@/config/mapbox';

const props = defineProps({
  // DOM element to use as fullscreen container (defaults to map container)
  fullscreenContainer: {
    type: Object,
    default: null,
  },
});

const store = usePlaybackStore();

// Template ref
const mapContainer = ref(null);

// Map instance (non-reactive to avoid Vue proxy overhead on Mapbox internals)
let map = null;

// Composable — watchers are registered immediately; setup() called after map loads
const { setup: setupAnimation } = useRouteAnimation(store);

function initMap() {
  // Mapbox configuration from centralized config
  mapboxgl.accessToken = mapboxConfig.accessToken;
  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: mapboxConfig.style,
    center: mapboxConfig.center,
    zoom: mapboxConfig.zoom,
    pitch: mapboxConfig.pitch,
    fadeDuration: 0,  // Skip tile fade-in for smoother animation performance
  });

  // Add navigation control with a compass and zoom controls.
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  // Add fullscreen control — use parent container so overlays (PlayBack, RaceTitle) stay visible
  const fullscreenOptions = props.fullscreenContainer ? { container: props.fullscreenContainer } : {};
  map.addControl(new mapboxgl.FullscreenControl(fullscreenOptions), 'top-right');

  map.on('load', () => {
    setupAnimation(map);
  });
}

onMounted(() => {
  initMap();
});

onBeforeUnmount(() => {
  if (map) {
    map.remove();
  }
});
</script>

<style scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100vh;
}
.map {
  width: 100%;
  height: 100%;
}
</style>
