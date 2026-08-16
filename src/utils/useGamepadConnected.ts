import { useEffect, useState } from 'react';
import { gamepadPoller } from './gamepadPoller';

export function useGamepadConnected(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    return gamepadPoller.subscribe(state => setConnected(state.connected));
  }, []);

  return connected;
}
