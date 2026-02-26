/**
 * usePlaybackStats — Composable for computed playback statistics.
 *
 * Derives formatted distance, elevation, slope, total ascent, and time
 * from the current progress and elevation profile data in the Pinia playbackStore.
 *
 * @param {import('pinia').Store} store - The playback Pinia store instance
 * @returns {{ formattedDistance, formattedElevation, formattedSlope, formattedTotalAscent, formattedTime, currentProfilePoint }}
 */

import { computed } from 'vue';

/**
 * Binary search for the nearest elevation profile point by cumulative distance.
 * @param {Array} profile - Parsed elevation profile data
 * @param {number} distanceKm - Target distance in km
 * @returns {Object|null} Nearest profile point or null
 */
function findNearestPoint(profile, distanceKm) {
  if (!profile || profile.length === 0) return null;

  let lo = 0;
  let hi = profile.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (profile[mid].distance_km_cum < distanceKm) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return profile[lo];
}

export function usePlaybackStats(store) {
  /** Current elevation profile point based on progress */
  const currentProfilePoint = computed(() => {
    if (!store.elevationProfile || store.elevationProfile.length === 0) {
      return null;
    }
    const currentDist = store.progress * store.totalDistance;
    return findNearestPoint(store.elevationProfile, currentDist);
  });

  /** Current distance in km, formatted to 1 decimal place */
  const formattedDistance = computed(() => {
    const dist = store.progress * store.totalDistance;
    return dist.toFixed(1);
  });

  /** Current elevation in meters, rounded to integer */
  const formattedElevation = computed(() => {
    if (!currentProfilePoint.value) return '0';
    return Math.round(currentProfilePoint.value.ele);
  });

  /** Current slope percentage with sign prefix */
  const formattedSlope = computed(() => {
    if (!currentProfilePoint.value) return '+0.0%';
    const slope = currentProfilePoint.value.slope_percent;
    const sign = slope >= 0 ? '+' : '';
    return `${sign}${slope.toFixed(1)}%`;
  });

  /** Cumulative positive elevation gain in meters, rounded */
  const formattedTotalAscent = computed(() => {
    if (!currentProfilePoint.value) return '0';
    return Math.round(currentProfilePoint.value.elev_gain_pos_cum_m);
  });

  /** Elapsed time in HH:MM:SS format */
  const formattedTime = computed(() => {
    if (!store.elevationProfile || store.elevationProfile.length === 0 || !currentProfilePoint.value) {
      return '00:00:00';
    }
    const startTime = new Date(store.elevationProfile[0].time).getTime();
    const currentTime = new Date(currentProfilePoint.value.time).getTime();
    const totalSeconds = Math.max(0, Math.floor((currentTime - startTime) / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [
      String(h).padStart(2, '0'),
      String(m).padStart(2, '0'),
      String(s).padStart(2, '0'),
    ].join(':');
  });

  return {
    currentProfilePoint,
    formattedDistance,
    formattedElevation,
    formattedSlope,
    formattedTotalAscent,
    formattedTime,
  };
}
