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

    const isVScrollable = (el: Element): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const style = getComputedStyle(el);
      return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
    };

    const isHScrollable = (el: Element): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const style = getComputedStyle(el);
      return (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2;
    };

    const findTarget = (predicate: (el: Element) => el is HTMLElement): HTMLElement | null => {
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

      const rawY = state.axes[3] ?? 0;
      if (Math.abs(rawY) > DEADZONE) {
        const delta = scale(rawY);
        const target = findTarget(isVScrollable) ?? (document.querySelector('.main-content') as HTMLElement | null);
        if (target) target.scrollTop += delta;
        else window.scrollBy(0, delta);
      }

      const rawX = state.axes[2] ?? 0;
      if (Math.abs(rawX) > DEADZONE) {
        const delta = scale(rawX);
        const target = findTarget(isHScrollable);
        if (target) target.scrollLeft += delta;
      }
    });
  }, []);
}
