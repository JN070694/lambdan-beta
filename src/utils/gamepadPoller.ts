export interface GamepadPollState {
  connected: boolean;
  justPressed: (buttonIndex: number) => boolean;
  pressed: (buttonIndex: number) => boolean;
  axes: number[];
}

type Listener = (state: GamepadPollState) => void;

// While a gamepad is connected we poll every frame (~16ms) for responsive
// controls. While none is connected we poll far less often — there's
// nothing to read, and it cuts the number of navigator.getGamepads() calls
// (see IDLE_POLL_MS below for why that matters) by roughly 30x.
const ACTIVE_POLL_MS = 16;
const IDLE_POLL_MS = 500;
// After a 'gamepaddisconnected' event, on some WebKitGTK builds (the engine
// Tauri uses on Linux) the platform's gamepad backend does synchronous work
// tearing the device down. Calling navigator.getGamepads() again immediately
// — which a 60Hz rAF loop does by design — can land inside that window and
// hang the render thread, which is indistinguishable from the whole app
// freezing. Pausing polling entirely for a short settle window right after
// a disconnect event avoids ever making that call while the backend is
// mid-teardown, rather than trying to detect the hang after the fact (which
// isn't possible — a synchronous hang blocks the very thread that would
// need to notice it).
const DISCONNECT_SETTLE_MS = 300;

/**
 * Singleton gamepad poller. Runs exactly one polling loop for the whole app,
 * shared by every hook/component that needs controller input.
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
  private timerId: ReturnType<typeof setTimeout> | null = null;
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
  // See DISCONNECT_SETTLE_MS above — while set, poll() skips calling
  // navigator.getGamepads() entirely and just reports disconnected.
  private settleUntil: number | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.ensureRunning();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private ensureRunning() {
    if (this.timerId !== null) return;
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
    const tick = () => {
      const wasConnected = this.lockedIndex !== null;
      this.poll();
      const delay = wasConnected ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      this.timerId = setTimeout(tick, delay);
    };
    this.timerId = setTimeout(tick, 0);
  }

  private stop() {
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.timerId = null;
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
    this.lastButtons = [];
    this.lockedIndex = null;
    this.lastTimestamp = null;
    this.stuckSince = null;
    this.settleUntil = null;
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
    this.settleUntil = Date.now() + DISCONNECT_SETTLE_MS;
  };

  private forceDisconnected() {
    this.lockedIndex = null;
    this.lastButtons = [];
    this.lastTimestamp = null;
    this.stuckSince = null;
    this.settleUntil = Date.now() + DISCONNECT_SETTLE_MS;
    this.emitDisconnected();
  }

  private emitDisconnected() {
    const state: GamepadPollState = {
      connected: false,
      justPressed: () => false,
      pressed: () => false,
      axes: [],
    };
    this.listeners.forEach(l => { try { l(state); } catch {} });
  }

  private poll() {
    if (this.settleUntil !== null) {
      if (Date.now() < this.settleUntil) {
        this.emitDisconnected();
        return;
      }
      this.settleUntil = null;
    }

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
        this.emitDisconnected();
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
