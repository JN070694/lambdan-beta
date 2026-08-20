import { useEffect, useRef, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { gamepadPoller } from '@/utils/gamepadPoller';
import { useTheme } from '@/utils/useTheme';
import type { AppSettings, Question, Quiz, GamepadMapping } from '@/types';

interface ImageItem {
  path: string;
  label: string;
}

/**
 * Runs in its own separate OS window (opened via openExpandedViewer), not as
 * part of the normal routed app. Shows one image at a time, large, with
 * prev/next navigation — mirrors MediaOverlay/RefsOverlay's own nav, just
 * bigger. Closes itself on B (gamepad), Escape (keyboard), or the on-screen
 * close button. Reads its own gamepad mapping fresh from the backend since
 * this window doesn't share the main window's in-memory store state.
 */
export default function ExpandedViewer() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('expand') === 'refs' ? 'refs' : 'media';
  const quizId = params.get('quizId') ?? '';
  const questionId = params.get('questionId') ?? '';
  const initialIndex = Number(params.get('index') ?? 0) || 0;

  const [images, setImages] = useState<ImageItem[]>([]);
  const [idx, setIdx] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [backButton, setBackButton] = useState(1); // sensible default (standard "B") until fetched
  const [theme, setTheme] = useState<AppSettings['theme']>('default');
  useTheme(theme);
  const lenRef = useRef(0);
  lenRef.current = images.length;

  useEffect(() => {
    (async () => {
      try {
        const mapping = await invoke<GamepadMapping>('get_gamepad_mapping');
        setBackButton(mapping.back);
      } catch { /* keep default */ }

      try {
        const s = await invoke<AppSettings>('get_settings');
        setTheme(s.theme);
      } catch { /* keep default */ }

      try {
        if (type === 'media') {
          const questions = await invoke<Question[]>('get_questions', { quizId });
          const q = questions.find(qq => qq.id === questionId);
          const variants = q?.nidVariants ?? [];
          setImages(variants.map(v => ({
            path: v,
            label: v.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '').toLowerCase() ?? '',
          })));
        } else {
          const quizzes = await invoke<Quiz[]>('get_all_quizzes');
          const quiz = quizzes.find(qz => qz.id === quizId);
          const refs = quiz?.referenceImages ?? [];
          setImages(refs.map(r => ({ path: r.filePath, label: r.displayLabel })));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [type, quizId, questionId]);

  useEffect(() => {
    const lastAxisDir = { current: 0 };
    return gamepadPoller.subscribe(state => {
      if (!state.connected) return;
      if (state.justPressed(backButton)) {
        getCurrentWindow().close();
        return;
      }
      const axisX = state.axes[0] ?? 0;
      const left = state.justPressed(14) || (axisX < -0.5 && lastAxisDir.current >= 0);
      const right = state.justPressed(15) || (axisX > 0.5 && lastAxisDir.current <= 0);
      if (left) setIdx(i => Math.max(0, i - 1));
      else if (right) setIdx(i => Math.min(lenRef.current - 1, i + 1));
      lastAxisDir.current = axisX < -0.5 ? -1 : axisX > 0.5 ? 1 : 0;
    });
  }, [backButton]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') getCurrentWindow().close();
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => Math.min(lenRef.current - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = images[idx];
  const src = current ? convertFileSrc(current.path) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--white)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1.5px solid var(--black)', fontFamily: 'var(--font-mono)',
        fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0 }}>
        <span>{type === 'media' ? 'MEDIA (EXPANDED)' : 'REFS (EXPANDED)'}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => getCurrentWindow().close()}>
          ✕ Close (B)
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--grey-100)', overflow: 'hidden', minHeight: 0 }}>
        {loading ? (
          <span style={{ color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading…</span>
        ) : src ? (
          <img src={src} alt={current?.label ?? ''}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No image found</span>
        )}
      </div>
      {images.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
          padding: 16, borderTop: '1.5px solid var(--black)', flexShrink: 0 }}>
          <button className="diamond-btn" disabled={idx === 0} onClick={() => setIdx(i => i - 1)} aria-label="Previous image">
            <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="8,0 0,5 8,10" fill="var(--white)"/></svg>
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center' }}>
            {current?.label ?? '—'}<br/>
            <span style={{ fontSize: 10, color: 'var(--grey-500)' }}>{idx + 1} / {images.length}</span>
          </span>
          <button className="diamond-btn" disabled={idx === images.length - 1} onClick={() => setIdx(i => i + 1)} aria-label="Next image">
            <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,0 10,5 2,10" fill="var(--white)"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
