import { useEffect } from 'react';
import { gamepadPoller } from './gamepadPoller';

/**
 * Right stick scrolling — hardcoded, not remappable, available app-wide.
 * Vertical (axes[3]) scrolls up/down. Horizontal (axes[2]) scrolls
 * left/right — mainly useful for wide content like code blocks or tables
 * that overflow horizontally (currently used on the About page's CSV
 * format examples, but works anywhere a horizontally-scrollable element
 * exists — no per-page wiring needed).
 *
 * Priority for both axes: an element explicitly marked with
 * data-stick-scroll, else the topmost scrollable element currently in
 * view, else the page itself.
 */
export function useRightStickScroll() {
  useEffect(() => {
    const SPEED = 14;
    const DEADZONE = 0.35; // widened to tolerate stick drift
    // The full-DOM scan below is expensive (walks every element in the
    // document), so it's cached and only re-run at most this often —
    // never on every animation frame. Without this, a stuck/off-center
    // stick reading (e.g. from a controller that disconnects mid-frame
    // and leaves a stale, frozen axis value behind) would re-run the
    // full scan 60 times a second forever, pegging the main thread and
    // making the whole app — mouse included — appear to freeze.
    const RESCAN_INTERVAL_MS = 400;
    // On top of that throttle: if a page genuinely has nothing scrollable
    // in that direction (e.g. no horizontally-scrollable content anywhere
    // on a Settings page), a stuck axis would otherwise keep retrying that
    // scan forever — a much smaller ongoing cost than before, but still
    // nonzero, still forever. Give up entirely after a few misses instead,
    // converging to zero cost, until the stick is seen back at center.
    const MAX_MISSES = 3;

    let cachedVTarget: HTMLElement | null = null;
    let cachedHTarget: HTMLElement | null = null;
    let lastVScanAt = 0;
    let lastHScanAt = 0;
    let vMisses = 0;
    let hMisses = 0;

    const isVScrollable = (el: Element): el is HTMLElement => {
      if (!(el instanceof HTMLElement) || !el.isConnected) return false;
      const style = getComputedStyle(el);
      return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
    };

    const isHScrollable = (el: Element): el is HTMLElement => {
      if (!(el instanceof HTMLElement) || !el.isConnected) return false;
      const style = getComputedStyle(el);
      return (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2;
    };

    const scanForTarget = (predicate: (el: Element) => el is HTMLElement): HTMLElement | null => {
      try {
        const marked = document.querySelector('[data-stick-scroll]') as HTMLElement | null;
        if (marked && predicate(marked)) return marked;
        const candidates = Array.from(document.querySelectorAll('*')).filter(predicate) as HTMLElement[];
        for (let i = candidates.length - 1; i >= 0; i--) {
          const el = candidates[i];
          const rect = el.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < window.innerHeight) return el;
        }
        return null;
      } catch { return null; }
    };

    const scale = (raw: number) => {
      const sign = raw < 0 ? -1 : 1;
      const scaled = (Math.abs(raw) - DEADZONE) / (1 - DEADZONE);
      return sign * scaled * SPEED;
    };

    return gamepadPoller.subscribe(state => {
      if (!state.connected) return;
      const now = Date.now();

      const rawY = state.axes[3] ?? 0;
      if (Math.abs(rawY) <= DEADZONE) {
        vMisses = 0;
      } else {
        const delta = scale(rawY);
        if ((!cachedVTarget || !isVScrollable(cachedVTarget)) && vMisses < MAX_MISSES) {
          if (now - lastVScanAt > RESCAN_INTERVAL_MS) {
            lastVScanAt = now;
            const found = scanForTarget(isVScrollable);
            if (found) cachedVTarget = found;
            else { cachedVTarget = null; vMisses++; }
          } else {
            cachedVTarget = null;
          }
        }
        // .main-content is a cheap, always-present fallback (a single
        // class-selector query, not the expensive full-DOM scan above),
        // so scrolling keeps working smoothly even once vMisses caps out.
        const target = cachedVTarget ?? (document.querySelector('.main-content') as HTMLElement | null);
        if (target) target.scrollTop += delta;
        else window.scrollBy(0, delta);
      }

      const rawX = state.axes[2] ?? 0;
      if (Math.abs(rawX) <= DEADZONE) {
        hMisses = 0;
      } else if (hMisses < MAX_MISSES) {
        const delta = scale(rawX);
        if (!cachedHTarget || !isHScrollable(cachedHTarget)) {
          if (now - lastHScanAt > RESCAN_INTERVAL_MS) {
            lastHScanAt = now;
            const found = scanForTarget(isHScrollable);
            if (found) cachedHTarget = found;
            else { cachedHTarget = null; hMisses++; }
          } else {
            cachedHTarget = null;
          }
        }
        if (cachedHTarget) cachedHTarget.scrollLeft += delta;
      }
    });
  }, []);
}
