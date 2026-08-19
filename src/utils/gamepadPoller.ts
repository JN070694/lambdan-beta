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
  // Ghost-gamepad detection: some browser/OS/dongle combinations leave a
  // stale Gamepad entry behind after a physical disconnect — still
  // reporting connected:true, with its last axis/button reading frozen in
  // place (e.g. a stick that was pushed at the moment of disconnect stays
  // "held" forever). Genuine hardware advances `timestamp` on every poll;
  // a frozen timestamp while a stick reads off-center is the signature of
  // a ghost entry, not a real held stick. Tracked so it can be force-
  // dropped rather than trusted indefinitely.
  private lastTimestamp: number | null = null;
  private stuckSince: number | null = null;

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
    this.lastTimestamp = null;
    this.stuckSince = null;
  }

  private onDisconnect = () => {
    // Unconditionally clear on ANY disconnect event, rather than only when
    // it matches our locked index — some platforms don't reliably populate
    // event.gamepad, and re-locking onto whatever's actually still present
    // next poll is always cheap and correct either way.
    this.lockedIndex = null;
    this.lastButtons = [];
    this.lastTimestamp = null;
    this.stuckSince = null;
  };

  private forceDisconnected() {
    this.lockedIndex = null;
    this.lastButtons = [];
    this.lastTimestamp = null;
    this.stuckSince = null;
    const state: GamepadPollState = {
      connected: false,
      justPressed: () => false,
      pressed: () => false,
      axes: [],
    };
    this.listeners.forEach(l => { try { l(state); } catch {} });
  }

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
        this.lastTimestamp = null;
        this.stuckSince = null;
        return;
      }

      // Ghost-gamepad check — see field comment above.
      const axisMagnitude = gp.axes.reduce((max, a) => Math.max(max, Math.abs(a)), 0);
      if (axisMagnitude > 0.2 && gp.timestamp === this.lastTimestamp) {
        if (this.stuckSince === null) this.stuckSince = Date.now();
        if (Date.now() - this.stuckSince > 800) {
          this.forceDisconnected();
          return;
        }
      } else {
        this.stuckSince = null;
      }
      this.lastTimestamp = gp.timestamp;

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
