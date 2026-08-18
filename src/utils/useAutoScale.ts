import { useEffect } from 'react';
import type { AppSettings } from '@/types';

// The window opens at 1200x800 by default (see tauri.conf.json). When the
// user resizes or maximizes it wider than that — e.g. to study from a
// distance — scale the whole UI up proportionally via CSS zoom. Unlike
// transform: scale, zoom also reflows layout, so content actually grows to
// fill the extra space instead of just floating in more empty whitespace.
// Never shrinks below the default size. How aggressively it scales (or
// whether it scales at all) is controlled by the Display Size setting,
// since window width alone can't tell a small high-density screen (e.g. a
// rugged tablet) apart from a large monitor reporting the same CSS pixels.
const BASE_WIDTH = 1200;

const PRESETS: Record<AppSettings['displayScale'], number | null> = {
  compact: null,       // null = always 1x, ignores window size entirely
  comfortable: 1.3,
  auto: 1.6,
  large: 2.0,
};

export function useAutoScale(displayScale: AppSettings['displayScale']) {
  useEffect(() => {
    const maxScale = PRESETS[displayScale] ?? PRESETS.auto;
    let frame: number | null = null;

    const apply = () => {
      frame = null;
      const scale = maxScale === null
        ? 1
        : Math.min(maxScale, Math.max(1, window.innerWidth / BASE_WIDTH));
      // `zoom` isn't in the standard CSSStyleDeclaration typings but is
      // supported by every engine Tauri ships on (Chromium/WebView2,
      // WebKitGTK, WKWebView).
      (document.documentElement.style as unknown as { zoom: string }).zoom = String(scale);
    };

    const onResize = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    if (maxScale !== null) window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [displayScale]);
}
