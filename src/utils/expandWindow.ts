import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

let counter = 0;

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
 */
export function openExpandedViewer(params: {
  type: 'media' | 'refs';
  quizId: string;
  questionId?: string;
  index: number;
}) {
  const search = new URLSearchParams({
    expand: params.type,
    quizId: params.quizId,
    ...(params.questionId ? { questionId: params.questionId } : {}),
    index: String(params.index),
  }).toString();

  const label = `expand-${Date.now()}-${counter++}`;

  new WebviewWindow(label, {
    url: `index.html?${search}`,
    title: params.type === 'media' ? 'LAMBDAn — Media' : 'LAMBDAn — References',
    width: 1000,
    height: 800,
    minWidth: 400,
    minHeight: 300,
  });
}
