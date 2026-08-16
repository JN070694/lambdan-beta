import { useGamepadConnected } from '@/utils/useGamepadConnected';
import { useStore } from '@/store';

interface LegendItem {
  button: 'A' | 'B' | 'X' | 'Y';
  label: string;
}

interface Props {
  items: LegendItem[];
}

const PLAYSTATION_GLYPHS: Record<string, string> = {
  A: '✕', B: '○', X: '□', Y: '△',
};

export default function GamepadLegend({ items }: Props) {
  const connected = useGamepadConnected();
  const { settings } = useStore();
  const isPS = settings.buttonIconStyle === 'playstation';

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      right: 16,
      transform: 'translateY(-50%)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      background: '#fff',
      border: `1.5px solid ${connected ? '#000' : '#ccc'}`,
      borderRadius: 10,
      padding: '12px 14px',
      width: 160,
      opacity: connected ? 1 : 0.45,
      transition: 'opacity 0.3s ease, border-color 0.3s ease',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: connected ? '#999' : '#bbb', marginBottom: 2,
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
              background: connected ? '#000' : '#ccc',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: isPS ? 16 : 12, fontWeight: 700, flexShrink: 0,
              transition: 'background 0.3s ease',
            }}>
              {glyph}
            </div>
            <span style={{ fontSize: 12, color: connected ? '#333' : '#aaa' }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
