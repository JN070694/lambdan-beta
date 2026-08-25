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
               : <span style={{ color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No reference images</span>}
        </div>
        {refs.length > 1 && (
          <div className="overlay-nav">
            <button className="diamond-btn" disabled={idx === 0} onClick={() => setRefIndex(idx - 1)}>
              <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="8,0 0,5 8,10" fill="var(--inverse-fg)"/></svg>
            </button>
            <span className="overlay-label">
              {current?.displayLabel ?? '—'}<br/>
              <span style={{ fontSize: 10, color: 'var(--grey-500)' }}>{idx + 1} / {refs.length}</span>
            </span>
            <button className="diamond-btn" disabled={idx === refs.length - 1} onClick={() => setRefIndex(idx + 1)}>
              <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,0 10,5 2,10" fill="var(--inverse-fg)"/></svg>
            </button>
          </div>
        )}
        {refs.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            No reference images in this pack
          </div>
        )}
        {refs.length > 0 && (
          <div style={{ borderTop: '1.5px solid var(--black)', flexShrink: 0, overflowY: 'auto', maxHeight: 140 }}>
            {refs.map((r, i) => (
              <button key={r.key} onClick={() => setRefIndex(i)}
                style={{ display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', background: i === idx ? 'var(--black)' : 'var(--white)',
                  color: i === idx ? 'var(--white)' : 'var(--black)', border: 'none',
                  borderBottom: '1px solid var(--grey-300)', cursor: 'pointer',
                  fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                {r.displayLabel}
              </button>
            ))}
          </div>
        )}
      </div>
      {refs.length > 0 && (
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: 8, padding: '10px 0', borderTop: '1px solid var(--grey-300)' }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', background: 'var(--inverse-bg)', color: 'var(--inverse-fg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, flexShrink: 0,
          }}>
            RS
          </div>
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--grey-600)' }}>Expand</span>
        </div>
      )}
    </div>
  );
}
