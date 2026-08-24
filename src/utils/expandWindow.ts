import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';

/**
 * Opens a new, separate OS window running a minimal expanded-image viewer.
 * Used from an active quiz when LS (media) or RS (refs) is pressed while
 * the corresponding side panel is open — lets a hard-to-see image be
 * viewed larger, on its own, without leaving the quiz behind it.
 *
 * The new window loads the same app bundle at its entry file with query
 * params attached (rather than a client-side route path), since that's
 * the one URL guaranteed to resolve correctly for a freshly-opened window
 * in both dev and a packaged build — a deep react-router path wouldn't
 * have anything to fall back to it without a real server doing rewrites.
 *
 * Opens maximized by default (maximized: true) so the image is immediately
 * as large and legible as possible — that's the whole point of "expand".
 * width/height are kept as the size the window restores to if the user
 * un-maximizes it via the title bar; resizable stays on so that's a real,
 * usable option rather than a fixed full-screen window.
 *
 * ONE WINDOW PER TYPE: only a single 'media' expanded-viewer window and a
 * single 'refs' expanded-viewer window are ever open at once, tracked in
 * `openWindows` below by a fixed label ('expand-media' / 'expand-refs')
 * rather than a unique-per-call label. If RS/LS is pressed again while a
 * window of that type is already open — e.g. the player pressed RS on one
 * reference image, then navigated to another and pressed RS again — the
 * existing window is focused and told (via emitTo + a listener in
 * ExpandedViewer.tsx) to show the new image, instead of a second native
 * window being spawned alongside the first. Without this, every RS press
 * opened another full OS window, which is expensive and gets out of hand
 * fast if the player is browsing through several references.
 */

type ViewerType = 'media' | 'refs';

const openWindows: Record<ViewerType, { label: string; win: WebviewWindow } | null> = {
  media: null,
  refs: null,
};

export interface ExpandViewerUpdatePayload {
  quizId: string;
  questionId: string;
  index: number;
}

export function openExpandedViewer(params: {
  type: ViewerType;
  quizId: string;
  questionId?: string;
  index: number;
}) {
  const existing = openWindows[params.type];
  if (existing) {
    // Already open — bring it to front and tell it to switch content
    // rather than opening a second window on top of it.
    existing.win.setFocus().catch(() => {});
    const payload: ExpandViewerUpdatePayload = {
      quizId: params.quizId,
      questionId: params.questionId ?? '',
      index: params.index,
    };
    emitTo(existing.label, 'expand-viewer-update', payload).catch(() => {});
    return;
  }

  const search = new URLSearchParams({
    expand: params.type,
    quizId: params.quizId,
    ...(params.questionId ? { questionId: params.questionId } : {}),
    index: String(params.index),
  }).toString();

  const label = `expand-${params.type}`;

  const win = new WebviewWindow(label, {
    url: `index.html?${search}`,
    title: params.type === 'media' ? 'LAMBDAn — Media' : 'LAMBDAn — References',
    width: 1000,
    height: 800,
    minWidth: 400,
    minHeight: 300,
    resizable: true,
    maximized: true,
  });

  openWindows[params.type] = { label, win };

  const clearIfCurrent = () => {
    if (openWindows[params.type]?.label === label) openWindows[params.type] = null;
  };
  win.once('tauri://destroyed', clearIfCurrent);
  win.once('tauri://error', clearIfCurrent);
}
