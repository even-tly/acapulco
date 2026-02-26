/**
 * useMarkPopup — Reusable composable that manages a single Mapbox GL popup
 * for displaying race mark icons during animation.
 *
 * Features:
 *  - Single popup instance (only one visible at a time)
 *  - Themed styling via CSS custom properties (inherits from the app theme)
 *  - Mark icons ordered by hierarchy when multiple marks are grouped
 *  - Labels shown for KM, Salida and Llegada marks
 *
 * @module useMarkPopup
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @returns {{ show: Function, hide: Function }}
 */

import mapboxgl from 'mapbox-gl';

/* ── Icon URLs (Vite-compatible static imports) ─────────────── */

const ICON_URLS = {
  km:       new URL('../assets/km-mark.png', import.meta.url).href,
  agua:     new URL('../assets/water-mark.png', import.meta.url).href,
  gatorade: new URL('../assets/gatorade-mark.png', import.meta.url).href,
  going:    new URL('../assets/going-mark.png', import.meta.url).href,
  salida:   new URL('../assets/start-mark.png', import.meta.url).href,
  llegada:  new URL('../assets/finish-mark.png', import.meta.url).href,
};

/**
 * Display priority — lower number appears first in the popup.
 * Matches the user-defined hierarchy: KM → Agua → Gatorade → Going.
 */
const MARK_PRIORITY = {
  km:       1,
  agua:     2,
  gatorade: 3,
  going:    4,
  salida:   5,
  llegada:  6,
};

/**
 * Classify a mark name string into a normalized type key.
 * @param {string} name - Feature property name (e.g. "KM5", "Agua", "Gatorade")
 * @returns {string|null} Type key or null if unrecognized
 */
export function classifyMark(name) {
  if (name.startsWith('KM')) return 'km';
  if (name === 'Agua') return 'agua';
  if (name === 'Gatorade') return 'gatorade';
  if (name === 'Gel Going') return 'going';
  if (name === 'Salida') return 'salida';
  if (name === 'Llegada') return 'llegada';
  return null;
}

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
      width: 32px;
      height: 32px;
      object-fit: contain;
    }

    .mark-popup__label {
      font-family: var(--font-family);
      font-size: 10px;
      font-weight: 700;
      color: var(--color-text);
      line-height: 1;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Build HTML content for the popup given a list of classified marks.
 * Marks are sorted by hierarchy priority; KM / Salida / Llegada include labels.
 *
 * @param {Array<{name: string, type: string}>} marks
 * @returns {string} HTML string
 */
function buildPopupHTML(marks) {
  const sorted = [...marks].sort(
    (a, b) => (MARK_PRIORITY[a.type] ?? 99) - (MARK_PRIORITY[b.type] ?? 99)
  );

  const items = sorted
    .map((m) => {
      const iconUrl = ICON_URLS[m.type];
      if (!iconUrl) return '';

      const showLabel = m.type === 'km' || m.type === 'salida' || m.type === 'llegada';
      const label = showLabel
        ? `<span class="mark-popup__label">${m.name}</span>`
        : '';

      return `<div class="mark-popup__item"><img class="mark-popup__icon" src="${iconUrl}" alt="${m.name}" />${label}</div>`;
    })
    .join('');

  return `<div class="mark-popup">${items}</div>`;
}

/**
 * Create a reusable mark popup bound to a Mapbox map.
 *
 * @param {mapboxgl.Map} map
 * @returns {{ show: (lngLat: [number, number], marks: Array) => void, hide: () => void }}
 */
export function useMarkPopup(map) {
  injectPopupStyles();

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

  /**
   * Show the popup at the given coordinates with the provided marks.
   * If the popup is already showing at the SAME lngLat (same cluster), the
   * call is a no-op — avoids repositioning / DOM rebuild every frame which
   * caused visible vibration.
   *
   * @param {[number, number]} lngLat - [lng, lat] where the popup should anchor
   * @param {Array<{name: string, type: string}>} marks - Classified marks to display
   */
  function show(lngLat, marks) {
    // Build a lightweight cache key from the cluster coordinates
    const key = `${lngLat[0]},${lngLat[1]}`;

    if (isVisible && key === currentKey) {
      // Same cluster already displayed — skip repositioning entirely
      return;
    }

    const html = buildPopupHTML(marks);
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
