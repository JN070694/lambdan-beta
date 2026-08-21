import { convertFileSrc } from '@tauri-apps/api/core';
import { useStore } from '@/store';

export default function MediaOverlay() {
  const { session, closeMedia, setMediaVariant } = useStore();
  const q = session.questions[session.currentIndex];
  if (!q) return null;

  const variants = q.nidVariants;
  const idx = session.mediaVariantIndex;
  const current = variants[idx];
  const src = current ? convertFileSrc(current) : null;
  const variantLabel = (path: string) =>
    path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '').toLowerCase() ?? '';

  return (
    <div className="side-panel-inner left-side" role="region" aria-label="Media viewer">
      <div className="overlay-header">
        <span>MEDIA — {q.nid}</span>
        <button className="btn btn-secondary btn-sm" onClick={closeMedia}>✕ Close</button>
      </div>
      <div className="overlay-body">
        <div className="overlay-image">
          {src ? <img src={src} alt={`nid image ${variantLabel(current)}`} />
               : <span style={{ color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No image found</span>}
        </div>
        {variants.length > 1 && (
          <div className="overlay-nav">
            <button className="diamond-btn" disabled={idx === 0} onClick={() => setMediaVariant(idx - 1)} aria-label="Previous image">
              <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="8,0 0,5 8,10" fill="var(--inverse-fg)"/></svg>
            </button>
            <span className="overlay-label">
              {current ? variantLabel(current) : '—'}<br/>
              <span style={{ fontSize: 10, color: 'var(--grey-500)' }}>{idx + 1} / {variants.length}</span>
            </span>
            <button className="diamond-btn" disabled={idx === variants.length - 1} onClick={() => setMediaVariant(idx + 1)} aria-label="Next image">
              <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,0 10,5 2,10" fill="var(--inverse-fg)"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
