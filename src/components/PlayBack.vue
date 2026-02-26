<template>
  <div class="playback">
    <!-- Play/Pause Button -->
    <button class="playback__play-btn" @click="togglePlay" :aria-label="isPlaying ? 'Pause' : 'Play'">
      <IconPause v-if="isPlaying" :size="18" />
      <IconPlay v-else :size="18" />
    </button>

    <!-- Speed Toggle -->
    <button class="playback__speed-btn" @click="cycleSpeed">
      {{ currentSpeed }}x
    </button>

    <!-- Mini Elevation Chart / Progress Bar — click or drag to scrub -->
    <div
      class="playback__track"
      ref="progressTrack"
      @mousedown="onScrubStart"
      @touchstart.prevent="onTouchScrubStart"
    >
      <ElevationChart
        :elevationProfile="elevationProfile"
        :totalDistance="totalDistance"
        :progress="progress"
      />
      <!-- Progress bar beneath elevation -->
      <div class="playback__bar-track">
        <div class="playback__bar-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
    </div>

    <!-- Stats — second row on mobile -->
    <div class="playback__info">
      <div class="playback__stats">
        <div class="playback__stat">
          <span class="playback__stat-label">DISTANCE</span>
          <span class="playback__stat-value">{{ formattedDistance }} <small>km</small></span>
        </div>
        <!--div class="playback__stat">
          <span class="playback__stat-label">ELEVATION</span>
          <span class="playback__stat-value">{{ formattedElevation }} <small>m</small></span>
        </div-->
      </div>
      <div class="playback__stats playback__stats--right">
        <div class="playback__stat">
          <span class="playback__stat-label">GRADE</span>
          <span class="playback__stat-value" :style="{ color: gradeColor }">{{ formattedSlope }}</span>
        </div>
        <!-- Under discussion: Total Ascent and Time stats
        <div class="playback__stat">
          <span class="playback__stat-label">TOTAL ASC.</span>
          <span class="playback__stat-value">{{ formattedTotalAscent }}<small>m</small></span>
        </div>
        <div class="playback__stat">
          <span class="playback__stat-label">TIME</span>
          <span class="playback__stat-value">{{ formattedTime }}</span>
        </div>
        -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlaybackStore } from '@/stores/playbackStore';
import IconPlay from '@/components/icons/IconPlay.vue';
import IconPause from '@/components/icons/IconPause.vue';
import ElevationChart from '@/components/ElevationChart.vue';
import { useScrub } from '@/composables/useScrub';
import { usePlaybackStats } from '@/composables/usePlaybackStats';

const store = usePlaybackStore();
const { progress, isPlaying, elevationProfile, totalDistance } = storeToRefs(store);

// --- Composables (now receive store instead of emit/props) ---
const { progressTrack, onScrubStart, onTouchScrubStart } = useScrub(store);
const {
  currentProfilePoint,
  formattedDistance,
  formattedElevation,
  formattedSlope,
  formattedTotalAscent,
  formattedTime,
} = usePlaybackStats(store);

/** Dynamic color for the grade stat: green when positive, red when negative */
const gradeColor = computed(() => {
  const slope = currentProfilePoint.value?.slope_percent ?? 0;
  if (slope > 0) return '#E64A19';
  if (slope < 0) return '#00c853';
  return null;
});

// --- Local state ---
const speedOptions = [1, 1.5, 2, 3, 5];
const speedIndex = ref(0);

// --- Computed ---
const progressPercent = computed(() => Math.min(progress.value * 100, 100));

const currentSpeed = computed(() => {
  const speed = speedOptions[speedIndex.value];
  return Number.isInteger(speed) ? speed : speed.toFixed(1);
});

// --- Methods ---
function togglePlay() {
  store.togglePlay();
}

function cycleSpeed() {
  speedIndex.value = (speedIndex.value + 1) % speedOptions.length;
  store.setSpeed(speedOptions[speedIndex.value]);
}
</script>

<style scoped>
.playback {
  position: absolute;
  bottom: var(--spacing-overlay-bottom);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--color-bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  z-index: var(--z-overlay);
  font-family: var(--font-family);
  color: var(--color-text);
  box-shadow: 0 8px 32px var(--color-shadow);
  min-width: 680px;
  max-width: 95vw;
  transition: var(--transition-theme);
}

/* Play/Pause Button */
.playback__play-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--color-accent);
  color: #0a0a0a;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s ease, transform 0.15s ease;
}

.playback__play-btn:hover {
  background: var(--color-accent-hover);
  transform: scale(1.08);
}

.playback__play-btn:active {
  transform: scale(0.95);
}

/* Speed Button */
.playback__speed-btn {
  min-width: 36px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-speed-btn-border);
  background: var(--color-speed-btn-bg);
  color: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.playback__speed-btn:hover {
  background: var(--color-speed-btn-hover-bg);
}

/* Layout wrapper — transparent on desktop (children join parent flex),
   becomes a real flex row on mobile for the stats row */
.playback__info {
  display: contents;
}

/* Desktop flex order: play → speed → track → stats-left → stats-right */
.playback__play-btn  { order: 0; }
.playback__speed-btn { order: 1; }
.playback__track     { order: 2; }
.playback__stats     { order: 3; }
.playback__stats--right { order: 4; }

/* Stats Groups */
.playback__stats {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
}

.playback__stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}

.playback__stats--right .playback__stat {
  align-items: flex-end;
}

.playback__stat-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  opacity: 0.5;
}

.playback__stat-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.playback__stat-value small {
  font-size: 11px;
  font-weight: 500;
  opacity: 0.6;
  margin-left: 2px;
}

.playback__stat-value--accent {
  color: var(--color-accent);
}

/* Progress Track */
.playback__track {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

/* Progress Bar */
.playback__bar-track {
  height: 3px;
  background: var(--color-progress-track);
  border-radius: 2px;
  overflow: hidden;
}

.playback__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-dark));
  border-radius: 2px;
  transition: width 0.1s linear;
}

/* ─── Responsive: two-row layout on mobile ─── */
@media (max-width: 768px) {
  .playback {
    min-width: unset;
    width: calc(100% - 32px);
    flex-wrap: wrap;
    padding: 6px 12px;
    gap: 6px;
    bottom: var(--spacing-overlay-bottom);
  }

  /* Row 1: play, speed, elevation chart */
  .playback__play-btn,
  .playback__speed-btn,
  .playback__track {
    order: unset;
  }

  .playback__track {
    min-width: 80px;
  }

  /* Row 2: all stats — wrapper becomes a real flex row */
  .playback__info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    order: 5; /* push below controls row */
  }

  .playback__stats {
    gap: 10px;
    order: unset;
  }

  .playback__stats--right {
    order: unset;
  }

  .playback__stat-value {
    font-size: 13px;
  }
}
</style>
