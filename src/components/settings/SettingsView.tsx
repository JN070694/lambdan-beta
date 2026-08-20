import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { exit } from '@tauri-apps/plugin-process';
import { useStore } from '@/store';
import type { AppSettings, GamepadMapping } from '@/types';
import { useMenuGamepad, type SettingsSubTab } from '@/utils/useMenuGamepad';
import { gamepadPoller } from '@/utils/gamepadPoller';
import ConfirmModal from '@/components/shared/ConfirmModal';

const DEFAULT_MAPPING: GamepadMapping = {
  select: 0, back: 1, skipCorrect: 3, skipIncorrect: 2,
  media: 4, references: 5, pause: 9, score: 8,
  lt: 6, rt: 7, ls: 10, rs: 11,
};

const ACTIONS: { key: keyof GamepadMapping; label: string; note?: string }[] = [
  { key: 'select',        label: 'A — Select / Confirm' },
  { key: 'back',          label: 'B — Back' },
  { key: 'skipCorrect',   label: 'X — Skip Correct / Secondary' },
  { key: 'skipIncorrect', label: 'Y — Skip Incorrect / Tertiary' },
  { key: 'media',         label: 'LB — Media / Tab Left' },
  { key: 'references',    label: 'RB — References / Tab Right' },
  { key: 'lt',            label: 'LT — Page Left', note: 'main menus only' },
  { key: 'rt',            label: 'RT — Page Right', note: 'main menus only' },
  { key: 'score',         label: 'Select/View — See Score', note: 'active quizzes only' },
  { key: 'pause',         label: 'Start — Pause', note: 'active quizzes only' },
  { key: 'ls',            label: 'LS — Expand Media', note: 'active quizzes, media panel open' },
  { key: 'rs',            label: 'RS — Expand References', note: 'active quizzes, refs panel open' },
];

const TAB_LABELS: Record<SettingsSubTab, string> = {
  quiz: 'Quiz',
  gamepad: 'Gamepad',
  display: 'Display',
  about: 'About',
  version: 'Version',
};

const DISPLAY_SCALE_HELP: Record<AppSettings['displayScale'], string> = {
  auto: 'Scales up automatically as the window grows past its default size — good for most monitors.',
  compact: 'Always stays at 1x, regardless of window size. Best for small or high-density screens (e.g. a tablet).',
  comfortable: 'Mild auto-scaling, capped lower — for a laptop or desktop viewed at normal arm\'s-length distance.',
  large: 'Stronger auto-scaling — for a big monitor or TV viewed from across a room.',
};

const DISPLAY_SCALE_ORDER: AppSettings['displayScale'][] = ['auto', 'compact', 'comfortable', 'large'];

const THEME_HELP: Record<AppSettings['theme'], string> = {
  default: 'Clean black-on-white — the original look.',
  'ultra-luxe': 'Black background, pearl text and borders, pewter-gold accents.',
};

const THEME_ORDER: AppSettings['theme'][] = ['default', 'ultra-luxe'];

function TriggerIcon({ side, label }: { side: 'left' | 'right'; label: string }) {
  const flip = side === 'right';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width="28" height="22" viewBox="0 0 28 22" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
        <path d="M4 6 C8 2 16 1 24 3 L24 17 C16 19 8 18 4 14 Z" fill="var(--black)"/>
      </svg>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--black)' }}>{label}</span>
    </div>
  );
}

export default function SettingsView() {
  const [tab, setTab] = useState<SettingsSubTab>('quiz');
  const { settings, setSettings, gamepadMapping, setGamepadMapping } = useStore();
  const [localMapping, setLocalMapping] = useState<GamepadMapping>(DEFAULT_MAPPING);
  const [remapWizardIndex, setRemapWizardIndex] = useState(0);
  const [remapAllActive, setRemapAllActive] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [livePressed, setLivePressed] = useState<number | null>(null);
  const [showQuitAppConfirm, setShowQuitAppConfirm] = useState(false);
  const [testModeActive, setTestModeActive] = useState(false);
  const [aboutCopied, setAboutCopied] = useState(false);
  const aboutCardRef = useRef<HTMLDivElement | null>(null);

  const handleCopyAbout = useCallback(async () => {
    const text = aboutCardRef.current?.innerText ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setAboutCopied(true);
      setTimeout(() => setAboutCopied(false), 1500);
    } catch {
      // clipboard write failed (e.g. no permission) — button just won't
      // flip to "Copied", no crash either way
    }
  }, []);
  const navigate = useNavigate();

  useEffect(() => {
    invoke<AppSettings>('get_settings').then(setSettings).catch(() => {});
    invoke<GamepadMapping>('get_gamepad_mapping').then(m => {
      setLocalMapping(m);
      setGamepadMapping(m);
    }).catch(() => {});
  }, []);

  useEffect(() => { setLocalMapping(gamepadMapping); }, [gamepadMapping]);
  useEffect(() => { setFocusedIndex(0); setTestModeActive(false); }, [tab]);

  // Live highlight: show which action row corresponds to whatever button
  // is currently pressed. Only runs while Test Controller mode is active —
  // outside test mode, pressing buttons still drives normal menu navigation
  // (B = quit, LT/RT = switch tabs, etc.), so highlighting them here without
  // being in test mode would wrongly suggest it's safe to press freely.
  useEffect(() => {
    if (tab !== 'gamepad' || remapAllActive || !testModeActive) { setLivePressed(null); return; }
    return gamepadPoller.subscribe(state => {
      if (!state.connected) { setLivePressed(null); return; }
      let found: number | null = null;
      for (let i = 0; i < 20; i++) {
        if (state.pressed(i)) { found = i; break; }
      }
      setLivePressed(found);
    });
  }, [tab, remapAllActive, testModeActive]);

  const saveSettings = async (s: AppSettings) => {
    setSettings(s);
    await invoke('save_settings', { settings: s });
  };

  const saveMapping = async (mapping: GamepadMapping) => {
    setGamepadMapping(mapping);
    await invoke('save_gamepad_mapping', { mapping });
  };

  const startRemapAll = () => {
    setRemapWizardIndex(0);
    setRemapAllActive(true);
    waitForRelease(() => listenForNextButton(0, {}));
  };

  // Don't arm the next capture until every button is released — prevents a
  // still-held button from a previous step bleeding into the next capture.
  const waitForRelease = (onReleased: () => void) => {
    const unsub = gamepadPoller.subscribe(state => {
      if (!state.connected) { unsub(); onReleased(); return; }
      for (let i = 0; i < 20; i++) {
        if (state.pressed(i)) return; // still holding something — keep waiting
      }
      unsub();
      onReleased();
    });
  };

  const listenForNextButton = (idx: number, acc: Partial<GamepadMapping>) => {
    if (idx >= ACTIONS.length) {
      const finalMapping = { ...localMapping, ...acc } as GamepadMapping;
      setLocalMapping(finalMapping);
      setRemapAllActive(false);
      saveMapping(finalMapping); // apply immediately — no separate Save click needed
      return;
    }
    const unsub = gamepadPoller.subscribe(state => {
      if (!state.connected) return;
      for (let i = 0; i < 20; i++) {
        if (state.justPressed(i)) {
          const newAcc = { ...acc, [ACTIONS[idx].key]: i };
          unsub();
          setRemapWizardIndex(idx + 1);
          waitForRelease(() => listenForNextButton(idx + 1, newAcc));
          return;
        }
      }
    });
  };

  const onNavigateSubTab = useCallback((t: SettingsSubTab) => setTab(t), []);
  const itemCountForTab = tab === 'quiz' ? 4 : tab === 'display' ? 3 : 0;

  const onConfirm = useCallback(() => {
    if (tab === 'quiz') {
      if (focusedIndex === 0) saveSettings({ ...settings, instantFeedback: !settings.instantFeedback });
      if (focusedIndex === 1) saveSettings({ ...settings, shuffleQuestions: !settings.shuffleQuestions });
      if (focusedIndex === 2) saveSettings({ ...settings, shuffleAnswers: !settings.shuffleAnswers });
      if (focusedIndex === 3) {
        const next = !settings.untilCorrectMode;
        saveSettings({
          ...settings,
          untilCorrectMode: next,
          instantFeedback: next ? true : settings.instantFeedback,
          shuffleQuestions: next ? true : settings.shuffleQuestions,
        });
      }
    } else if (tab === 'display') {
      if (focusedIndex === 0) {
        saveSettings({
          ...settings,
          buttonIconStyle: settings.buttonIconStyle === 'xbox' ? 'playstation' : 'xbox',
        });
      }
      if (focusedIndex === 1) {
        const idx = DISPLAY_SCALE_ORDER.indexOf(settings.displayScale);
        saveSettings({ ...settings, displayScale: DISPLAY_SCALE_ORDER[(idx + 1) % DISPLAY_SCALE_ORDER.length] });
      }
      if (focusedIndex === 2) {
        const idx = THEME_ORDER.indexOf(settings.theme);
        saveSettings({ ...settings, theme: THEME_ORDER[(idx + 1) % THEME_ORDER.length] });
      }
    }
  }, [tab, focusedIndex, settings]);

  const onBack = useCallback(() => {
    if (showQuitAppConfirm) { setShowQuitAppConfirm(false); return; }
    setShowQuitAppConfirm(true); // B on Settings — prompt to quit the app
  }, [showQuitAppConfirm]);

  useMenuGamepad({
    currentPage: 'settings',
    onNavigatePage: (page) => navigate(`/${page}`),
    currentSubTab: tab,
    onNavigateSubTab,
    itemCount: itemCountForTab,
    focusedIndex,
    onFocusChange: setFocusedIndex,
    onConfirm,
    onBack,
    enabled: !remapAllActive && !showQuitAppConfirm && !testModeActive,
  });

  const TABS: SettingsSubTab[] = ['quiz', 'gamepad', 'display', 'about', 'version'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24,
        opacity: testModeActive ? 0.35 : 1, pointerEvents: testModeActive ? 'none' : 'auto',
        transition: 'opacity 0.15s ease' }}>
        <TriggerIcon side="left" label="LB" />
        <div className="settings-tabs" style={{ flex: 1, marginBottom: 0 }}>
          {TABS.map(t => (
            <div key={t} className={`settings-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </div>
          ))}
        </div>
        <TriggerIcon side="right" label="RB" />
      </div>

      {tab === 'quiz' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-label">Quiz Behaviour</div>

          <div className="card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            outline: focusedIndex === 0 ? '2px solid var(--black)' : 'none', outlineOffset: 2,
            opacity: settings.untilCorrectMode ? 0.45 : 1,
            pointerEvents: settings.untilCorrectMode ? 'none' : 'auto',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Instant Feedback</div>
              <div style={{ fontSize: 12, color: 'var(--grey-500)', marginTop: 3 }}>
                Show correct / incorrect immediately after each answer
                {settings.untilCorrectMode && <span style={{ color: 'var(--grey-500)' }}> — locked by Until Correct</span>}
              </div>
            </div>
            <button className={`toggle ${settings.instantFeedback ? 'on' : 'off'}`}
              onClick={() => saveSettings({ ...settings, instantFeedback: !settings.instantFeedback })}
              aria-label="Toggle instant feedback">
              <div className="toggle-knob" />
            </button>
          </div>

          <div className="card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            outline: focusedIndex === 1 ? '2px solid var(--black)' : 'none', outlineOffset: 2,
            opacity: settings.untilCorrectMode ? 0.45 : 1,
            pointerEvents: settings.untilCorrectMode ? 'none' : 'auto',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Shuffle Questions</div>
              <div style={{ fontSize: 12, color: 'var(--grey-500)', marginTop: 3 }}>
                Randomise question order each time you start a quiz
                {settings.untilCorrectMode && <span style={{ color: 'var(--grey-500)' }}> — locked by Until Correct</span>}
              </div>
            </div>
            <button className={`toggle ${settings.shuffleQuestions ? 'on' : 'off'}`}
              onClick={() => saveSettings({ ...settings, shuffleQuestions: !settings.shuffleQuestions })}
              aria-label="Toggle shuffle questions">
              <div className="toggle-knob" />
            </button>
          </div>

          <div className="card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            outline: focusedIndex === 2 ? '2px solid var(--black)' : 'none', outlineOffset: 2,
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Shuffle Answers</div>
              <div style={{ fontSize: 12, color: 'var(--grey-500)', marginTop: 3 }}>
                Randomise multiple-choice answer order for each question
              </div>
            </div>
            <button className={`toggle ${settings.shuffleAnswers ? 'on' : 'off'}`}
              onClick={() => saveSettings({ ...settings, shuffleAnswers: !settings.shuffleAnswers })}
              aria-label="Toggle shuffle answers">
              <div className="toggle-knob" />
            </button>
          </div>

          <div className="card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: settings.untilCorrectMode ? 'var(--black)' : 'var(--grey-100)',
            borderColor: 'var(--black)',
            outline: focusedIndex === 3 ? '2px solid var(--black)' : 'none', outlineOffset: 2,
            transition: 'background 0.15s ease',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: settings.untilCorrectMode ? 'var(--white)' : 'var(--black)' }}>
                "Until Correct" Mode
              </div>
              <div style={{ fontSize: 12, marginTop: 3, color: settings.untilCorrectMode ? 'var(--grey-400)' : 'var(--grey-600)' }}>
                Repeats each question until you answer it correctly. Forces Instant Feedback and
                Shuffle Questions on. Attempts are not saved to history.
              </div>
            </div>
            <button className={`toggle ${settings.untilCorrectMode ? 'on' : 'off'}`}
              onClick={() => {
                const next = !settings.untilCorrectMode;
                saveSettings({
                  ...settings,
                  untilCorrectMode: next,
                  instantFeedback: next ? true : settings.instantFeedback,
                  shuffleQuestions: next ? true : settings.shuffleQuestions,
                });
              }}
              aria-label="Toggle until correct mode">
              <div className="toggle-knob" />
            </button>
          </div>
        </div>
      )}

      {tab === 'gamepad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              opacity: testModeActive ? 0.35 : 1, pointerEvents: testModeActive ? 'none' : 'auto',
              transition: 'opacity 0.15s ease' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: navigator.getGamepads().some(g => g) ? 'var(--black)' : 'var(--grey-400)',
                border: '1.5px solid var(--grey-500)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {navigator.getGamepads().some(g => g) ? 'Gamepad Connected' : 'No Gamepad Detected'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {navigator.getGamepads().some(g => g) ? 'Ready to use' : 'Connect via USB or Bluetooth'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn btn-sm ${testModeActive ? '' : 'btn-primary'}`}
                onClick={() => setTestModeActive(v => !v)}
                disabled={remapAllActive}
                style={testModeActive ? { background: 'var(--black)', color: 'var(--white)', border: '1px solid var(--black)' } : undefined}>
                {testModeActive ? 'End Test' : 'Test Controller'}
              </button>
              <div style={{ display: 'flex', gap: 8,
                opacity: testModeActive ? 0.35 : 1, pointerEvents: testModeActive ? 'none' : 'auto',
                transition: 'opacity 0.15s ease' }}>
                <button className="btn btn-secondary btn-sm" onClick={startRemapAll} disabled={remapAllActive}>
                  Remap Controller
                </button>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => { setLocalMapping(DEFAULT_MAPPING); saveMapping(DEFAULT_MAPPING); }}
                  disabled={remapAllActive}>
                  Reset Defaults
                </button>
              </div>
            </div>
          </div>

          {remapAllActive && (
            <div className="card" style={{ background: 'var(--black)', color: 'var(--white)', textAlign: 'center', padding: 20 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>Press button for:</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                {ACTIONS[remapWizardIndex]?.label ?? 'Done'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--grey-500)' }}>
                {remapWizardIndex + 1} / {ACTIONS.length}
              </div>
              <button className="btn btn-secondary" style={{ marginTop: 16 }}
                onClick={() => setRemapAllActive(false)}>Cancel</button>
            </div>
          )}

          <div>
            <div className="section-label">Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ACTIONS.map((action, actionIndex) => {
                const btnIndex = localMapping[action.key];
                const pressed = livePressed === btnIndex;
                const displayNumber = actionIndex + 1; // cosmetic only — A=1, B=2, X=3, Y=4, ... — actual input mapping is unaffected
                return (
                  <div key={action.key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 6,
                    background: pressed ? 'var(--black)' : 'var(--grey-100)',
                    border: `1px solid ${pressed ? 'var(--black)' : 'var(--grey-300)'}`,
                    transition: 'background 0.1s ease',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: pressed ? 'var(--white)' : 'var(--black)' }}>
                        {action.label}
                      </div>
                      {action.note && (
                        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)',
                          color: pressed ? 'var(--grey-400)' : 'var(--grey-500)' }}>{action.note}</div>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                      color: pressed ? 'var(--white)' : 'var(--grey-600)' }}>
                      {`Button ${displayNumber}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'display' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-label">Appearance</div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            outline: focusedIndex === 0 ? '2px solid var(--black)' : 'none', outlineOffset: 2 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Controller Button Icons</div>
              <div style={{ fontSize: 12, color: 'var(--grey-500)', marginTop: 3 }}>
                Choose how button labels are displayed — Xbox style (A/B/X/Y) or PlayStation style (✕/○/□/△).
                Purely visual, does not affect controls.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)',
                fontWeight: settings.buttonIconStyle === 'xbox' ? 700 : 400,
                color: settings.buttonIconStyle === 'xbox' ? 'var(--black)' : 'var(--grey-500)' }}>
                Xbox
              </span>
              <button
                className={`toggle ${settings.buttonIconStyle === 'playstation' ? 'on' : 'off'}`}
                onClick={() => saveSettings({
                  ...settings,
                  buttonIconStyle: settings.buttonIconStyle === 'xbox' ? 'playstation' : 'xbox',
                })}
                aria-label="Toggle controller icon style">
                <div className="toggle-knob" />
              </button>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)',
                fontWeight: settings.buttonIconStyle === 'playstation' ? 700 : 400,
                color: settings.buttonIconStyle === 'playstation' ? 'var(--black)' : 'var(--grey-500)' }}>
                PlayStation
              </span>
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 8 }}>Display Size</div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            outline: focusedIndex === 1 ? '2px solid var(--black)' : 'none', outlineOffset: 2 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Display Size</div>
              <div style={{ fontSize: 12, color: 'var(--grey-500)', marginTop: 3, maxWidth: 380 }}>
                {DISPLAY_SCALE_HELP[settings.displayScale]}
              </div>
            </div>
            <select
              value={settings.displayScale}
              onChange={(e) => saveSettings({ ...settings, displayScale: e.target.value as AppSettings['displayScale'] })}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 12px',
                border: '1.5px solid var(--black)', borderRadius: 6,
                background: 'var(--white)', color: 'var(--black)',
                cursor: 'pointer', flexShrink: 0,
              }}>
              <option value="auto">Auto (recommended)</option>
              <option value="compact">Compact — small / tablet screens</option>
              <option value="comfortable">Comfortable — laptop / desktop</option>
              <option value="large">Large — TV / distance viewing</option>
            </select>
          </div>

          <div className="section-label" style={{ marginTop: 8 }}>Theme</div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            outline: focusedIndex === 2 ? '2px solid var(--black)' : 'none', outlineOffset: 2 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Theme</div>
              <div style={{ fontSize: 12, color: 'var(--grey-500)', marginTop: 3, maxWidth: 380 }}>
                {THEME_HELP[settings.theme]}
              </div>
            </div>
            <select
              value={settings.theme}
              onChange={(e) => saveSettings({ ...settings, theme: e.target.value as AppSettings['theme'] })}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 12px',
                border: '1.5px solid var(--black)', borderRadius: 6,
                background: 'var(--white)', color: 'var(--black)',
                cursor: 'pointer', flexShrink: 0,
              }}>
              <option value="default">Default White</option>
              <option value="ultra-luxe">Ultra-Luxe</option>
            </select>
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--grey-300)', paddingBottom: 6, marginBottom: -2,
          }}>
            <span className="section-label" style={{ border: 'none', margin: 0, padding: 0 }}>How to Use</span>
            <button className="btn btn-secondary btn-sm" onClick={handleCopyAbout}
              style={{ background: 'var(--black)', color: 'var(--white)', border: '1px solid var(--black)' }}>
              {aboutCopied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div ref={aboutCardRef} className="card" data-stick-scroll style={{ maxHeight: 520, overflowY: 'auto', fontSize: 13, lineHeight: 1.7 }}>
            <p style={{ marginBottom: 10 }}>
              <strong>LAMBDAn</strong> is an offline quiz app. Import question packs, take quizzes,
              and track your results — all stored locally with no internet required.
            </p>

            <p style={{ fontWeight: 700, marginBottom: 4 }}>Importing material</p>
            <p style={{ marginBottom: 10 }}>
              Go to <strong>Library</strong> and click <strong>+ Import</strong>. You can import:
            </p>
            <ul style={{ marginLeft: 18, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>A standalone <strong>.csv</strong> file — becomes a single quiz</li>
              <li>A <strong>.tar.gz</strong> pack with multiple CSVs — auto-creates a folder with one quiz per CSV</li>
            </ul>

            <p style={{ fontWeight: 700, marginBottom: 4 }}>Adding media to a pack</p>
            <p style={{ marginBottom: 6 }}>
              Inside your .tar.gz, place a <strong>media</strong> folder alongside your CSVs:
            </p>
            <pre style={{ background: 'var(--grey-100)', padding: '8px 10px', borderRadius: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 10, overflowX: 'auto' }}>
{`pack.tar.gz
├── Quiz1.csv
├── Quiz2.csv
└── media/
    ├── [Diagram].png  ← reference image
    ├── n17.png        ← matches nid "n17"
    └── n17a.png       ← variant of n17`}
            </pre>
            <ul style={{ marginLeft: 18, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Filenames in <strong>[brackets]</strong> become reference images (REFS tab, whole quiz)</li>
              <li>Filenames matching an <strong>nid</strong> value (e.g. <code>n17</code>) attach to that question</li>
            </ul>

            <p style={{ fontWeight: 700, marginBottom: 4 }}>CSV question formats</p>
            <p style={{ marginBottom: 6 }}>
              Each row has 11 comma-separated fields:
            </p>
            <pre style={{ background: 'var(--grey-100)', padding: '8px 10px', borderRadius: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 10, overflowX: 'auto' }}>
{`[1] Q#  [2] Question text  [3] A  [4] B  [5] C  [6] D  [7] E  [8] Answer  [9] Explanation  [10] Group  [11] nid`}
            </pre>

            <div style={{ background: '#fff8e1', border: '1px solid #e8d38a', borderRadius: 6,
              padding: '8px 10px', marginBottom: 14, fontSize: 12, lineHeight: 1.6 }}>
              <strong>Note:</strong> field 8 (Answer) holds the correct option's letter (<code>A</code>–<code>E</code>)
              for Multiple Choice and True/False questions — for True/False, that means <code>A</code> for
              True and <code>B</code> for False, the same A/B fields used by Multiple Choice. For Essay
              questions, field 8 instead holds the full model answer text rather than a letter.
            </div>

            <p style={{ fontWeight: 600, marginBottom: 4, marginTop: 8 }}>Multiple Choice</p>
            <p style={{ marginBottom: 6 }}>Fill in options A–E (at least A and B). Set field 8 to the correct letter.</p>
            <pre style={{ background: 'var(--grey-100)', padding: '8px 10px', borderRadius: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 10, overflowX: 'auto' }}>
{`1,What is 2+2?,One,Two,Three,Four,,D,2 + 2 counts four total units.,Math,`}
            </pre>

            <p style={{ fontWeight: 600, marginBottom: 4 }}>True / False</p>
            <p style={{ marginBottom: 6 }}>
              Set field 3 to <code>True</code>, field 4 to <code>False</code>, leave C–E empty.
              Set field 8 to <code>A</code> (true) or <code>B</code> (false).
            </p>
            <pre style={{ background: 'var(--grey-100)', padding: '8px 10px', borderRadius: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 10, overflowX: 'auto' }}>
{`2,The sky is blue.,True,False,,,,A,Rayleigh scattering makes short blue wavelengths visible.,Science,`}
            </pre>

            <p style={{ fontWeight: 600, marginBottom: 4 }}>Essay / Short Answer</p>
            <p style={{ marginBottom: 6 }}>
              Leave all option fields (A–E) empty. Put the model answer in field 8.
              The app will show a "Show Answer" prompt — you then mark yourself correct or incorrect.
            </p>
            <pre style={{ background: 'var(--grey-100)', padding: '8px 10px', borderRadius: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 10, overflowX: 'auto' }}>
{`3,Explain supply and demand.,,,,,,The law of supply and demand describes how price and quantity interact in a market.,,Economics,`}
            </pre>

            <p style={{ fontWeight: 700, marginBottom: 4, marginTop: 8 }}>Explanation field</p>
            <p style={{ marginBottom: 0 }}>
              Field 9 is optional but common — a short paragraph or formula showing how to arrive
              at the answer. When filled in, it appears beneath the correct/incorrect feedback
              after you answer a question during a quiz.
            </p>
          </div>
        </div>
      )}

      {tab === 'version' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-label">Version</div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Developer', 'Jonathan Nicholson'],
              ['Version', '1.0.0-beta'],
              ['Built with', 'Tauri v2 · React · TypeScript'],
              ['Database', 'SQLite (rusqlite)'],
              ['License', 'AGPL-3.0'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', borderBottom: '1px solid var(--grey-200)', paddingBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--grey-600)' }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showQuitAppConfirm && (
        <ConfirmModal
          title="Quit LAMBDAn"
          message="Are you sure you want to quit LAMBDAn?"
          onConfirm={() => exit(0)}
          onCancel={() => setShowQuitAppConfirm(false)}
          confirmLabel="Yes, Quit"
          cancelLabel="No"
        />
      )}
    </div>
  );
}
