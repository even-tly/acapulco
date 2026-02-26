<template>
  <div class="route-view" ref="routeViewContainer">
    <LoadingSpinner v-if="loading" message="Loading route…" />
    <ErrorMessage
      v-else-if="error"
      :message="error"
      retryable
      @retry="retryLoad"
    />
    <!--
      RouteMap, PlayBack and RaceTitle are siblings.
      All shared playback state lives in the Pinia playbackStore.
      Children read/write directly from the store — no prop drilling.
    -->
    <template v-else>
      <RouteMap :fullscreenContainer="routeViewContainer" />
      <RaceTitle v-if="routeConfig" />
      <PlayBack />
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onErrorCaptured } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { usePlaybackStore } from '@/stores/playbackStore';
import RouteMap from '@/components/RouteMap.vue';
import PlayBack from '@/components/PlayBack.vue';
import RaceTitle from '@/components/RaceTitle.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';

const route = useRoute();
const store = usePlaybackStore();

// --- Reactive refs from the store (used in template conditionals) ---
const { routeConfig, loading, error } = storeToRefs(store);

// --- Template ref for fullscreen container ---
const routeViewContainer = ref(null);

// --- Retry handler ---
function retryLoad() {
  store.loadRoute(route.params.routeId);
}

// --- Error boundary — catch unexpected errors from child components ---
onErrorCaptured((err) => {
  console.error('RouteMapView caught child error:', err);
  store.$patch({
    error: 'An unexpected error occurred. Please try again.',
    loading: false,
  });
  return false; // prevent further propagation
});

// --- Route change watcher — delegates loading to the store ---
watch(() => route.params.routeId, (routeId) => {
  store.loadRoute(routeId);
}, { immediate: true });
</script>

<style scoped>
.route-view {
  width: 100%;
  height: 100vh;
  position: relative;
  background: var(--color-bg);
}

/* Ensure the container fills the screen when Mapbox fullscreen control is active */
.route-view:fullscreen {
  width: 100%;
  height: 100%;
}

</style>
