import { useEffect, useRef } from 'react';
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
 * Confirm sits on the left, Cancel on the right — and each maps straight to
 * its own button (A = confirm, B = cancel, Esc = cancel) with no need to
 * navigate/scroll between them first.
 */
export default function ConfirmModal({
  title, message, onConfirm, onCancel,
  confirmLabel = 'Yes', cancelLabel = 'No',
}: Props) {
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
      const { justPressed } = state;
      if (justPressed(m.select)) onConfirmRef.current();
      if (justPressed(m.back)) onCancelRef.current();
    });
  }, []);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div style={{ fontSize: 14, marginBottom: 16 }}>{message}</div>
        <div style={{ fontSize: 11, color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', marginBottom: 14 }}>
          A to confirm · B to cancel
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
          <button className="btn btn-secondary" autoFocus onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className="btn btn-primary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
