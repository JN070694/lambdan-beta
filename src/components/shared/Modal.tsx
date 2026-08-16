import { useEffect, useRef } from 'react';
import { useStore } from '@/store';
import { gamepadPoller } from '@/utils/gamepadPoller';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Base modal for non-confirm popups (details, new folder, rename, etc).
 * Every popup in the app closes on B — this is that one shared rule,
 * built in here so it never has to be wired per-page.
 */
export default function Modal({ title, onClose, children }: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    return gamepadPoller.subscribe(state => {
      if (!state.connected) return;
      const m = useStore.getState().gamepadMapping;
      // A and B both close for now, since most popups using this base Modal
      // only have one action (Close). If a future popup adds more fields/
      // actions, this can be narrowed to B-only for that specific instance.
      if (state.justPressed(m.back) || state.justPressed(m.select)) onCloseRef.current();
    });
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
