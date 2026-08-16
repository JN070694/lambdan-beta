import { convertFileSrc } from '@tauri-apps/api/core';
import { useStore } from '@/store';

export default function RefsOverlay() {
  const { session, closeRefs, setRefIndex } = useStore();
  const quiz = session.quiz;
  if (!quiz) return null;

  const refs = quiz.referenceImages;
  const idx = session.refIndex;
  const current = refs[idx];
  const src = current ? convertFileSrc(current.filePath) : null;

  return (
    <div className="side-panel-inner" role="region" aria-label="References viewer">
      <div className="overlay-header">
        <span>REFS</span>
        <button className="btn btn-secondary btn-sm" onClick={closeRefs}>Close ✕</button>
      </div>
      <div className="overlay-body">
        <div className="overlay-image">
          {src ? <img src={src} alt={current.displayLabel} />
               : <span style={{ color: '#999', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No reference images</span>}
        </div>
        {refs.length > 1 && (
          <div className="overlay-nav">
            <button className="diamond-btn" disabled={idx === 0} onClick={() => setRefIndex(idx - 1)}>
              <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="8,0 0,5 8,10" fill="#fff"/></svg>
            </button>
            <span className="overlay-label">
              {current?.displayLabel ?? '—'}<br/>
              <span style={{ fontSize: 10, color: '#888' }}>{idx + 1} / {refs.length}</span>
            </span>
            <button className="diamond-btn" disabled={idx === refs.length - 1} onClick={() => setRefIndex(idx + 1)}>
              <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,0 10,5 2,10" fill="#fff"/></svg>
            </button>
          </div>
        )}
        {refs.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#999', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            No reference images in this pack
          </div>
        )}
        {refs.length > 0 && (
          <div style={{ borderTop: '1.5px solid #000', flexShrink: 0, overflowY: 'auto', maxHeight: 140 }}>
            {refs.map((r, i) => (
              <button key={r.key} onClick={() => setRefIndex(i)}
                style={{ display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', background: i === idx ? '#000' : '#fff',
                  color: i === idx ? '#fff' : '#000', border: 'none',
                  borderBottom: '1px solid #e0e0e0', cursor: 'pointer',
                  fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                {r.displayLabel}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
