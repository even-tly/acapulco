/**
 * useMarkPopup — Reusable composable that manages a single Mapbox GL popup
 * for displaying race mark images during animation.
 *
 * Features:
 *  - Single popup instance (only one visible at a time)
 *  - Themed styling via CSS custom properties (inherits from the app theme)
 *  - Declarative image paths from GeoJSON (path_l / path_d)
 *  - Theme-aware: rebuilds popup when theme changes
 *
 * @module useMarkPopup
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @returns {{ show: Function, hide: Function }}
 */

import mapboxgl from 'mapbox-gl';
import { useTheme } from '@/theme/useTheme';
import { watch } from 'vue';

/* ── Popup styles (injected once into document head) ────────── */

let stylesInjected = false;

function injectPopupStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.setAttribute('data-mark-popup', '');
  style.textContent = `
    /* Override Mapbox default popup chrome */
    .mark-popup-container .mapboxgl-popup-content {
      background: transparent !important;
      padding: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    .mark-popup-container .mapboxgl-popup-tip {
      display: none !important;
    }

    /* ── Mark Popup — BEM ────────────────────────────────────── */
    .mark-popup {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 12px;
      background: var(--color-bg-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-btn);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 12px var(--color-shadow);
      pointer-events: none;
    }

    .mark-popup__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .mark-popup__icon {
      height: 32px;
      width: auto;
    }

    .mark-popup__label {
      font-family: var(--font-family);
      font-size: 15px;
      font-weight: 700;
      color: var(--color-text);
      line-height: 1;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Resolve an asset path (relative to src/assets/) to a Vite-compatible URL.
 * @param {string} path - Relative path like "assets/dist_mark.png"
 * @returns {string} Resolved URL
 */
function resolveAssetUrl(path) {
  return new URL('../' + path, import.meta.url).href;
}

/**
 * Build HTML content for the popup from a single mark's GeoJSON properties.
 * Selects the image path based on the current theme.
 *
 * @param {Object} mark - Mark properties (path_l, path_d, label)
 * @param {boolean} isLight - Whether the light theme is active
 * @returns {string} HTML string
 */
function buildPopupHTML(mark, isLight) {
  const imgPath = isLight ? mark.path_l : mark.path_d;
  if (!imgPath) return '';

  const imgUrl = resolveAssetUrl(imgPath);
  const label = mark.label
    ? `<span class="mark-popup__label">${mark.label}</span>`
    : '';

  return `<div class="mark-popup"><div class="mark-popup__item"><img class="mark-popup__icon" src="${imgUrl}" alt="${mark.label || ''}" />${label}</div></div>`;
}

/**
 * Create a reusable mark popup bound to a Mapbox map.
 * Theme-aware: invalidates cache when the theme changes.
 *
 * @param {mapboxgl.Map} map
 * @returns {{ show: (lngLat: [number, number], mark: Object) => void, hide: () => void }}
 */
export function useMarkPopup(map) {
  injectPopupStyles();

  const { isLightTheme } = useTheme();

  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    closeOnMove: false,
    trackPointer: false,
    anchor: 'bottom',
    offset: [0, -20],
    className: 'mark-popup-container',
  });

  let isVisible = false;

  /** Cache: serialised lngLat of the currently-displayed popup (or null). */
  let currentKey = null;

  /** Cached theme state for rebuild detection. */
  let cachedTheme = isLightTheme.value;

  // Invalidate popup cache when theme changes so the image updates
  watch(isLightTheme, (newVal) => {
    cachedTheme = newVal;
    if (isVisible) {
      // Force rebuild on next show() by clearing cache key
      currentKey = null;
    }
  });

  /**
   * Show the popup at the given coordinates with the provided mark.
   * If the popup is already showing at the SAME lngLat and theme hasn't changed,
   * the call is a no-op.
   *
   * @param {[number, number]} lngLat - [lng, lat] where the popup should anchor
   * @param {Object} mark - Mark properties from GeoJSON (path_l, path_d, label)
   */
  function show(lngLat, mark) {
    const key = `${lngLat[0]},${lngLat[1]}`;

    if (isVisible && key === currentKey) {
      return;
    }

    const html = buildPopupHTML(mark, cachedTheme);
    popup.setLngLat(lngLat).setHTML(html);
    currentKey = key;

    if (!isVisible) {
      popup.addTo(map);
      isVisible = true;
    }
  }

  /**
   * Hide the popup if currently visible.
   */
  function hide() {
    if (isVisible) {
      popup.remove();
      isVisible = false;
      currentKey = null;
    }
  }

  return { show, hide };
}
