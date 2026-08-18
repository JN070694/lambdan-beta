import { useEffect, useRef } from 'react';
import { useStore } from '@/store';
import { gamepadPoller } from './gamepadPoller';

export type TopNavPage = 'library' | 'history' | 'settings';
export type SettingsSubTab = 'quiz' | 'gamepad' | 'about' | 'display' | 'version';

interface MenuGamepadOptions {
  currentPage: TopNavPage;
  onNavigatePage: (page: TopNavPage) => void;
  currentSubTab?: SettingsSubTab;
  onNavigateSubTab?: (tab: SettingsSubTab) => void;
  itemCount: number;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onConfirm?: () => void;
  onBack?: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
  enabled: boolean;
}

const TOP_PAGES: TopNavPage[] = ['library', 'history', 'settings'];
const SUB_TABS: SettingsSubTab[] = ['quiz', 'gamepad', 'display', 'about', 'version'];

/**
 * Main-menu gamepad navigation. Behavior (what each button does) is fixed —
 * LT/RT switch top pages, LB/RB switch settings sub-tabs, D-pad/stick moves
 * focus, A confirms, B backs out, X/Y are secondary/tertiary actions.
 *
 * WHICH PHYSICAL BUTTON maps to A/B/X/Y/LB/RB/LT/RT is sourced entirely from
 * Settings > Gamepad, read fresh from the store on every poll tick via
 * useStore.getState() — not passed in as a prop — so every page always uses
 * the exact same, always-current mapping with no risk of staleness.
 */
export function useMenuGamepad(opts: MenuGamepadOptions) {
  const lastAxisDir = useRef(0);
  const lastAxisTime = useRef(0);

  useEffect(() => {
    if (!opts.enabled) return;

    return gamepadPoller.subscribe(state => {
      if (!state.connected) return;
      const { justPressed, axes } = state;
      const m = useStore.getState().gamepadMapping;

      if (justPressed(m.lt)) {
        const idx = TOP_PAGES.indexOf(opts.currentPage);
        const next = Math.max(0, idx - 1);
        if (next !== idx) opts.onNavigatePage(TOP_PAGES[next]);
      }
      if (justPressed(m.rt)) {
        const idx = TOP_PAGES.indexOf(opts.currentPage);
        const next = Math.min(TOP_PAGES.length - 1, idx + 1);
        if (next !== idx) opts.onNavigatePage(TOP_PAGES[next]);
      }

      if (opts.currentPage === 'settings' && opts.currentSubTab && opts.onNavigateSubTab) {
        if (justPressed(m.media)) {
          const idx = SUB_TABS.indexOf(opts.currentSubTab);
          const next = Math.max(0, idx - 1);
          if (next !== idx) opts.onNavigateSubTab(SUB_TABS[next]);
        }
        if (justPressed(m.references)) {
          const idx = SUB_TABS.indexOf(opts.currentSubTab);
          const next = Math.min(SUB_TABS.length - 1, idx + 1);
          if (next !== idx) opts.onNavigateSubTab(SUB_TABS[next]);
        }
      }

      if (justPressed(m.select) && opts.onConfirm) opts.onConfirm();
      if (justPressed(m.back) && opts.onBack) opts.onBack();
      if (justPressed(m.skipCorrect) && opts.onSecondary) opts.onSecondary();
      if (justPressed(m.skipIncorrect) && opts.onTertiary) opts.onTertiary();

      const axisY = axes[1] ?? 0;
      const now = Date.now();
      const axisThreshold = 0.5;
      const repeatDelay = 220;

      let dir = 0;
      if (justPressed(12) || (axisY < -axisThreshold && lastAxisDir.current >= 0)) dir = -1;
      else if (justPressed(13) || (axisY > axisThreshold && lastAxisDir.current <= 0)) dir = 1;

      const axisActive = Math.abs(axisY) > axisThreshold;
      const canRepeat = now - lastAxisTime.current > repeatDelay;

      if (dir !== 0 && opts.itemCount > 0 && (justPressed(12) || justPressed(13) || (axisActive && canRepeat))) {
        const next = Math.max(0, Math.min(opts.itemCount - 1, opts.focusedIndex + dir));
        opts.onFocusChange(next);
        lastAxisTime.current = now;
      }
      lastAxisDir.current = axisActive ? (axisY < 0 ? -1 : 1) : 0;
    });
  }, [
    opts.enabled, opts.currentPage, opts.currentSubTab,
    opts.itemCount, opts.focusedIndex,
    opts.onNavigatePage, opts.onNavigateSubTab, opts.onFocusChange,
    opts.onConfirm, opts.onBack, opts.onSecondary, opts.onTertiary,
  ]);
}
