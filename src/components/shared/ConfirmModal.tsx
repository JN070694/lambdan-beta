import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';
import { gamepadPoller } from '@/utils/gamepadPoller';

interface Props {
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Confirm modal with built-in gamepad support.
 * Left/Right D-pad or stick navigates between No (left, default) and Yes (right).
 * A = confirm focused button. B = cancel. Esc = cancel.
 */
export default function ConfirmModal({
  title, message, onConfirm, onCancel,
  confirmLabel = 'Yes', cancelLabel = 'No',
}: Props) {
  const [focus, setFocus] = useState(0); // 0 = cancel (left/default), 1 = confirm (right)
  const lastAxisDir = useRef(0);
  const lastAxisTime = useRef(0);

  const onConfirmRef = useRef(onConfirm);
  const onCancelRef = useRef(onCancel);
  onConfirmRef.current = onConfirm;
  onCancelRef.current = onCancel;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelRef.current(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    return gamepadPoller.subscribe(state => {
      if (!state.connected) return;
      const m = useStore.getState().gamepadMapping;
      const { justPressed, axes } = state;
      const axisX = axes[0] ?? 0;
      const now = Date.now();

      let dir = 0;
      if (justPressed(14) || (axisX < -0.5 && lastAxisDir.current >= 0)) dir = -1;
      else if (justPressed(15) || (axisX > 0.5 && lastAxisDir.current <= 0)) dir = 1;
      if (dir !== 0 && now - lastAxisTime.current > 200) {
        setFocus(f => Math.max(0, Math.min(1, f + dir)));
        lastAxisTime.current = now;
      }
      lastAxisDir.current = Math.abs(axisX) > 0.5 ? (axisX < 0 ? -1 : 1) : 0;

      if (justPressed(m.select)) {
        setFocus(f => {
          if (f === 1) onConfirmRef.current();
          else onCancelRef.current();
          return f;
        });
      }
      if (justPressed(m.back)) onCancelRef.current();
    });
  }, []);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div style={{ fontSize: 14, marginBottom: 16 }}>{message}</div>
        <div style={{ fontSize: 11, color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', marginBottom: 14 }}>
          ◀ ▶ to select · A to confirm · B to cancel
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            className="btn btn-primary"
            autoFocus
            onClick={onCancel}
            style={focus === 0 ? { outline: '2px solid var(--black)', outlineOffset: 2 } : undefined}>
            {cancelLabel}
          </button>
          <button
            className="btn btn-secondary"
            onClick={onConfirm}
            style={focus === 1 ? { outline: '2px solid var(--black)', outlineOffset: 2 } : undefined}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
