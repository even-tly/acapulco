/**
 * useScrub — Composable for scrub (seek) interaction on the playback track.
 *
 * Handles mouse and touch-based scrubbing on the progress track element.
 * Writes progress updates (0–1) directly to the Pinia playbackStore.
 *
 * @param {import('pinia').Store} store - The playback Pinia store instance
 * @returns {{ progressTrack: Ref, isScrubbing: Ref, onScrubStart: Function, onTouchScrubStart: Function }}
 */

import { ref, onBeforeUnmount } from 'vue';

export function useScrub(store) {
  /** Template ref for the scrub track element */
  const progressTrack = ref(null);
  /** Whether the user is currently scrubbing */
  const isScrubbing = ref(false);

  // Private scrub handlers (non-reactive, captured in closures)
  let _onScrubMove = null;
  let _onScrubEnd = null;

  /**
   * Compute progress (0–1) from pointer X position on the track.
   * @param {MouseEvent|Touch} event
   */
  function updateScrubProgress(event) {
    const track = progressTrack.value;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    store.setProgress(progress);
  }

  /** Start mouse-based scrub interaction */
  function onScrubStart(event) {
    isScrubbing.value = true;
    updateScrubProgress(event);

    _onScrubMove = (e) => {
      if (isScrubbing.value) {
        updateScrubProgress(e);
      }
    };
    _onScrubEnd = () => {
      isScrubbing.value = false;
      document.removeEventListener('mousemove', _onScrubMove);
      document.removeEventListener('mouseup', _onScrubEnd);
    };
    document.addEventListener('mousemove', _onScrubMove);
    document.addEventListener('mouseup', _onScrubEnd);
  }

  /** Start touch-based scrub interaction */
  function onTouchScrubStart(event) {
    isScrubbing.value = true;
    updateScrubProgress(event.touches[0]);

    const onTouchMove = (e) => {
      if (isScrubbing.value) {
        updateScrubProgress(e.touches[0]);
      }
    };
    const onTouchEnd = () => {
      isScrubbing.value = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
  }

  // Cleanup global listeners on unmount
  onBeforeUnmount(() => {
    if (_onScrubMove) {
      document.removeEventListener('mousemove', _onScrubMove);
    }
    if (_onScrubEnd) {
      document.removeEventListener('mouseup', _onScrubEnd);
    }
  });

  return {
    progressTrack,
    isScrubbing,
    onScrubStart,
    onTouchScrubStart,
  };
}
