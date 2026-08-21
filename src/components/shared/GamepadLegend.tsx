import { useGamepadConnected } from '@/utils/useGamepadConnected';
import { useStore } from '@/store';

interface LegendItem {
  button: 'A' | 'B' | 'X' | 'Y';
  label: string;
}

interface Props {
  items: LegendItem[];
  /** Distance from the top of the viewport, in px, to align this box's top
   * edge with. When omitted, falls back to the original vertically-centered
   * placement (used by Quiz/Retake views). */
  top?: number;
}

const PLAYSTATION_GLYPHS: Record<string, string> = {
  A: '✕', B: '○', X: '□', Y: '△',
};

export default function GamepadLegend({ items, top }: Props) {
  const connected = useGamepadConnected();
  const { settings } = useStore();
  const isPS = settings.buttonIconStyle === 'playstation';
  const topAligned = top !== undefined;

  return (
    <div style={{
      position: 'fixed',
      top: topAligned ? top : '50%',
      right: 16,
      transform: topAligned ? 'none' : 'translateY(-50%)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      background: 'var(--white)',
      border: `1.5px solid ${connected ? 'var(--black)' : 'var(--grey-400)'}`,
      borderRadius: 10,
      padding: '12px 14px',
      // When top-aligned (Library), the box sits in the narrow margin to the
      // right of the centered 900px-wide content column — width shrinks
      // responsively so it never overlaps that column regardless of window
      // size, instead of assuming a fixed 160px will always fit.
      width: topAligned ? 'clamp(90px, calc((100vw - 900px) / 2 - 24px), 160px)' : 160,
      maxHeight: topAligned ? `calc(100vh - ${top}px - 16px)` : undefined,
      overflowY: topAligned ? 'auto' : undefined,
      opacity: connected ? 1 : 0.45,
      transition: 'opacity 0.3s ease, border-color 0.3s ease',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: connected ? 'var(--grey-500)' : 'var(--grey-400)', marginBottom: 2,
      }}>
        {connected ? 'Gamepad' : 'No Gamepad'}
      </div>
      {items.map(item => {
        const inactive = item.label === '—';
        const glyph = isPS ? PLAYSTATION_GLYPHS[item.button] ?? item.button : item.button;
        return (
          <div key={item.button} style={{ display: 'flex', alignItems: 'center', gap: 10,
            opacity: inactive ? 0.4 : 1 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: connected ? 'var(--inverse-bg)' : 'var(--grey-400)',
              color: 'var(--inverse-fg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: isPS ? 16 : 12, fontWeight: 700, flexShrink: 0,
              transition: 'background 0.3s ease',
            }}>
              {glyph}
            </div>
            <span style={{ fontSize: 12, color: connected ? 'var(--grey-600)' : 'var(--grey-500)' }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
