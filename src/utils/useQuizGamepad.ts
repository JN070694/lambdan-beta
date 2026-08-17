import { useEffect, useRef } from 'react';
import { useStore } from '@/store';
import { gamepadPoller } from './gamepadPoller';

/**
 * In-quiz gamepad controls.
 * - D-pad / left stick up/down: move focus between answer options
 * - A (mapped: select): confirm/select focused option, or advance once answered
 * - B (mapped: back): close media/refs overlay, or prompt to quit
 * - X (mapped: skipCorrect): skip + mark correct
 * - Y (mapped: skipIncorrect): skip + mark incorrect
 * - LB (mapped: media): toggle media panel
 * - RB (mapped: references): toggle refs panel
 * - Start (mapped: pause): toggle pause
 * - Select/View (mapped: score): toggle score display
 *
 * The mapping is sourced entirely from Settings > Gamepad. It's read fresh
 * from the store on every poll tick via useStore.getState() rather than
 * through React's render cycle, so a remap takes effect immediately and
 * unconditionally everywhere — not just wherever happens to re-render.
 * The navigation direction handling (D-pad / left stick) is fixed and not
 * configurable.
 */

interface UseQuizGamepadOptions {
  optionFocusIndex: number;
  setOptionFocusIndex: (i: number) => void;
  optionCount: number;
  onSelectFocused: () => void;
  onAdvance: () => void;
  onToggleScore?: () => void;
  onResume?: () => void;
  onQuitRequest?: () => void;
  pauseMenuIndex?: number;
  setPauseMenuIndex?: (i: number) => void;
  /** When true, this hook does nothing — use while a modal (e.g. quit-confirm) is
   * up front-and-center, so it doesn't fight with that modal's own input handling. */
  suppressed?: boolean;
}

export function useQuizGamepad(opts: UseQuizGamepadOptions) {
  const lastAxisDir = useRef(0);
  const lastAxisTime = useRef(0);

  useEffect(() => {
    return gamepadPoller.subscribe(state => {
      if (!state.connected) return;
      if (opts.suppressed) return;
      const { justPressed, axes } = state;

      const store = useStore.getState();
      const { session, gamepadMapping } = store;
      if (!session.quiz || session.finished) return;

      const m = gamepadMapping;
      const q = session.questions[session.currentIndex];

      // Pause toggles regardless of other state
      if (justPressed(m.pause)) {
        store.setPaused(!session.paused);
        return;
      }
      if (session.paused) {
        if (justPressed(m.back) || justPressed(m.pause)) {
          if (opts.onResume) opts.onResume();
        }
        const axisX = axes[0] ?? 0;
        if (justPressed(14) || axisX < -0.5) {
          if (opts.setPauseMenuIndex) opts.setPauseMenuIndex(0);
        } else if (justPressed(15) || axisX > 0.5) {
          if (opts.setPauseMenuIndex) opts.setPauseMenuIndex(1);
        }
        if (justPressed(m.select)) {
          if ((opts.pauseMenuIndex ?? 0) === 0) {
            if (opts.onResume) opts.onResume();
          } else {
            if (opts.onQuitRequest) opts.onQuitRequest();
          }
        }
        return;
      }

      if (justPressed(m.media)) { store.toggleMedia(); return; }
      if (justPressed(m.references)) { store.toggleRefs(); return; }

      if (justPressed(m.score) && opts.onToggleScore) {
        opts.onToggleScore();
        return;
      }

      if (justPressed(m.back)) {
        if (session.mediaOpen) { store.closeMedia(); return; }
        if (session.refsOpen) { store.closeRefs(); return; }
        if (opts.onQuitRequest) opts.onQuitRequest();
        return;
      }

      if (!q) return;

      // Overlay navigation (media variant / ref index) via D-pad left/right
      if (session.mediaOpen) {
        const axisX = axes[0] ?? 0;
        const left = justPressed(14) || (axisX < -0.5 && lastAxisDir.current >= 0);
        const right = justPressed(15) || (axisX > 0.5 && lastAxisDir.current <= 0);
        if (left && session.mediaVariantIndex > 0) store.setMediaVariant(session.mediaVariantIndex - 1);
        else if (right && session.mediaVariantIndex < q.nidVariants.length - 1) store.setMediaVariant(session.mediaVariantIndex + 1);
        lastAxisDir.current = axisX < -0.5 ? -1 : axisX > 0.5 ? 1 : 0;
        return;
      }
      if (session.refsOpen) {
        const refs = session.quiz?.referenceImages ?? [];
        const axisX = axes[0] ?? 0;
        const left = justPressed(14) || (axisX < -0.5 && lastAxisDir.current >= 0);
        const right = justPressed(15) || (axisX > 0.5 && lastAxisDir.current <= 0);
        if (left && session.refIndex > 0) store.setRefIndex(session.refIndex - 1);
        else if (right && session.refIndex < refs.length - 1) store.setRefIndex(session.refIndex + 1);
        lastAxisDir.current = axisX < -0.5 ? -1 : axisX > 0.5 ? 1 : 0;
        return;
      }

      const answered = session.answers[q.id] !== undefined;

      // ── D-pad / stick navigation ────────────────────────────────────────
      // Essays with show answer: LEFT/RIGHT moves between Correct(0)/Incorrect(1)
      // MC/TF: UP/DOWN moves between answer options
      const axisY = axes[1] ?? 0;
      const now = Date.now();
      const REPEAT_DELAY = 200;
      const THRESHOLD = 0.5;

      let dir = 0;
      if (justPressed(12) || (axisY < -THRESHOLD && lastAxisDir.current >= 0)) dir = -1;
      else if (justPressed(13) || (axisY > THRESHOLD && lastAxisDir.current <= 0)) dir = 1;
      const axisActive = Math.abs(axisY) > THRESHOLD;
      const canRepeat = now - lastAxisTime.current > REPEAT_DELAY;

      if (q.questionType === 'ESSAY' && session.showAnswer && !answered) {
        const axisX = axes[0] ?? 0;
        const leftPressed = justPressed(14) || (axisX < -0.5 && lastAxisDir.current >= 0);
        const rightPressed = justPressed(15) || (axisX > 0.5 && lastAxisDir.current <= 0);
        const axisXActive = Math.abs(axisX) > 0.5;
        const canRepeatX = now - lastAxisTime.current > REPEAT_DELAY;
        if ((leftPressed || rightPressed) && (justPressed(14) || justPressed(15) || (axisXActive && canRepeatX))) {
          opts.setOptionFocusIndex(leftPressed ? 0 : 1);
          lastAxisTime.current = now;
        }
        lastAxisDir.current = axisXActive ? (axisX < 0 ? -1 : 1) : 0;
      } else if (!answered && dir !== 0 && opts.optionCount > 0 &&
          (justPressed(12) || justPressed(13) || (axisActive && canRepeat))) {
        const next = Math.max(0, Math.min(opts.optionCount - 1, opts.optionFocusIndex + dir));
        opts.setOptionFocusIndex(next);
        lastAxisTime.current = now;
        lastAxisDir.current = axisActive ? (axisY < 0 ? -1 : 1) : 0;
      } else {
        lastAxisDir.current = axisActive ? (axisY < 0 ? -1 : 1) : 0;
      }

      // ── Select / confirm ────────────────────────────────────────────────
      if (justPressed(m.select)) {
        if (answered) {
          opts.onAdvance();
        } else if (q.questionType === 'ESSAY') {
          if (!session.showAnswer) {
            store.setShowAnswer(true);
            opts.setOptionFocusIndex(0); // default to Correct
          } else {
            if (opts.optionFocusIndex === 0) store.setAnswer(q.id, 'CORRECT');
            else store.setAnswer(q.id, 'INCORRECT');
          }
        } else {
          opts.onSelectFocused();
        }
      }

      // Skip-mark buttons
      if (q.questionType === 'ESSAY' && !answered) {
        if (justPressed(m.skipCorrect)) {
          if (!session.showAnswer) store.setShowAnswer(true);
          store.setAnswer(q.id, 'CORRECT');
        }
        if (justPressed(m.skipIncorrect)) {
          if (!session.showAnswer) store.setShowAnswer(true);
          store.setAnswer(q.id, 'INCORRECT');
        }
      } else if (q.questionType !== 'ESSAY' && !answered) {
        if (justPressed(m.skipCorrect)) store.setAnswer(q.id, 'SKIP_CORRECT');
        if (justPressed(m.skipIncorrect)) store.setAnswer(q.id, 'SKIP_INCORRECT');
      }
    });
  }, [
    opts.optionFocusIndex, opts.optionCount,
    opts.onSelectFocused, opts.onAdvance, opts.onToggleScore,
    opts.onResume, opts.onQuitRequest, opts.pauseMenuIndex, opts.setPauseMenuIndex,
    opts.suppressed,
  ]);
}
