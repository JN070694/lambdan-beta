export interface GamepadPollState {
  connected: boolean;
  justPressed: (buttonIndex: number) => boolean;
  pressed: (buttonIndex: number) => boolean;
  axes: number[];
}

type Listener = (state: GamepadPollState) => void;

/**
 * Singleton gamepad poller. Runs exactly one requestAnimationFrame loop for
 * the whole app, shared by every hook/component that needs controller input.
 *
 * Once a gamepad is found, its browser-assigned `index` is locked in and
 * reused every tick — we do NOT re-pick "whichever comes first" each frame.
 * Some controllers (especially over certain wireless dongles) expose more
 * than one Gamepad API entry for the same physical device, and re-scanning
 * every frame can silently flip between them, producing exactly the kind of
 * "button mapping randomly reverses" symptom this was causing. Locking to
 * one index for the whole session eliminates that.
 */
class GamepadPoller {
  private listeners = new Set<Listener>();
  private rafId: number | null = null;
  private lastButtons: boolean[] = [];
  private lockedIndex: number | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.ensureRunning();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private ensureRunning() {
    if (this.rafId !== null) return;
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
    const tick = () => {
      this.poll();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
    this.lastButtons = [];
    this.lockedIndex = null;
  }

  private onDisconnect = (e: Event) => {
    const ge = e as GamepadEvent;
    if (this.lockedIndex !== null && ge.gamepad && ge.gamepad.index === this.lockedIndex) {
      // Our locked controller specifically disconnected — release the lock
      // so the next poll can pick (and lock onto) whichever is available.
      this.lockedIndex = null;
    }
    this.lastButtons = [];
  };

  private poll() {
    try {
      const gamepads = navigator.getGamepads();

      let gp: Gamepad | null = null;
      if (this.lockedIndex !== null) {
        const candidate = gamepads[this.lockedIndex];
        if (candidate && candidate.connected) gp = candidate;
        else this.lockedIndex = null; // locked device vanished — allow re-lock below
      }
      if (!gp) {
        for (const g of gamepads) {
          if (g && g.connected) { gp = g; this.lockedIndex = g.index; break; }
        }
      }

      if (!gp) {
        const state: GamepadPollState = {
          connected: false,
          justPressed: () => false,
          pressed: () => false,
          axes: [],
        };
        this.listeners.forEach(l => { try { l(state); } catch {} });
        this.lastButtons = [];
        return;
      }

      const buttons = gp.buttons.map(b => b.pressed);
      const prev = this.lastButtons;
      const axes = Array.from(gp.axes);

      const state: GamepadPollState = {
        connected: true,
        pressed: (i) => buttons[i] ?? false,
        justPressed: (i) => (buttons[i] ?? false) && !(prev[i] ?? false),
        axes,
      };
      this.listeners.forEach(l => { try { l(state); } catch {} });

      this.lastButtons = buttons;
    } catch {
      /* getGamepads() failed — skip this tick */
    }
  }
}

export const gamepadPoller = new GamepadPoller();
