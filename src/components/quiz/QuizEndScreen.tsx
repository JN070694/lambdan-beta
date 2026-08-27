import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { useStore } from '@/store';
import { formatTime } from '@/utils/quiz';
import { useState, useEffect, useRef } from 'react';
import { gamepadPoller } from '@/utils/gamepadPoller';

export default function QuizEndScreen({ onRetakeQuiz }: { onRetakeQuiz?: () => void }) {
  const navigate = useNavigate();
  const { session, clearSession, history, folders } = useStore();
  const { quiz } = session;
  const backPath = quiz?.folderId ? `/library/folder/${quiz.folderId}` : '/library';
  const [focusIdx, setFocusIdx] = useState(0);
  const lastAxisDir = useRef(0);
  const lastAxisTime = useRef(0);

  if (!quiz) return null;
  const entry = history.find(h => h.quizId === quiz.id);
  if (!entry) return null;

  const hasMissed = entry.questionResults.some(r => !r.correct);
  const returnLabel = quiz.folderId ? 'Back to Folder' : 'Return to Library';
  const buttons = [
    returnLabel,
    ...(onRetakeQuiz ? ['Retake Quiz'] : []),
    ...(hasMissed ? ['Retake Missed', 'Export Missed'] : []),
  ];

  const handleSelect = (idx: number) => {
    const label = buttons[idx];
    if (label === returnLabel) { clearSession(); navigate(backPath); return; }
    if (label === 'Retake Quiz') { onRetakeQuiz?.(); return; }
    if (label === 'Retake Missed') {
      const missed = entry.questionResults.filter(r => !r.correct).map(r => r.questionId);
      navigate(`/quiz/${quiz.id}/retake`, { state: { missedIds: missed } });
      return;
    }
    if (label === 'Export Missed') {
      const folder = quiz.folderId ? folders.find(f => f.id === quiz.folderId) : null;
      const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim();
      const parts = [
        folder ? sanitize(folder.name) : null,
        sanitize(quiz.title),
        `${entry.percentage}%`,
      ].filter(Boolean);
      const defaultPath = parts.join('_') + '.csv';
      save({ defaultPath, filters: [{ name: 'CSV', extensions: ['csv'] }] })
        .then(p => p && invoke('export_missed', { entryId: entry.id, outputPath: p }))
        .catch(console.error);
    }
  };

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
        setFocusIdx(i => Math.max(0, Math.min(buttons.length - 1, i + dir)));
        lastAxisTime.current = now;
      }
      lastAxisDir.current = Math.abs(axisX) > 0.5 ? (axisX < 0 ? -1 : 1) : 0;

      if (justPressed(m.select)) setFocusIdx(i => { handleSelect(i); return i; });
      if (justPressed(m.back)) { clearSession(); navigate(backPath); }
    });
  }, [focusIdx, buttons.length, backPath]);

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>Quiz Complete</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{quiz.title}</div>
        <div style={{ display: 'flex', gap: 32, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <div>
            <div style={{ color: 'var(--grey-500)', fontSize: 11, marginBottom: 2 }}>Score</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{entry.percentage}%</div>
          </div>
          <div>
            <div style={{ color: 'var(--grey-500)', fontSize: 11, marginBottom: 2 }}>Correct</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{entry.score} / {entry.total}</div>
          </div>
          <div>
            <div style={{ color: 'var(--grey-500)', fontSize: 11, marginBottom: 2 }}>Time</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatTime(entry.timeSeconds)}</div>
          </div>
        </div>
      </div>

      {entry.questionResults.filter(r => !r.correct).length > 0 && (
        <div>
          <div className="section-label">Missed Questions ({entry.questionResults.filter(r => !r.correct).length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entry.questionResults.filter(r => !r.correct).map(r => (
              <div key={r.questionId} className="card-muted" style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.questionText}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--grey-500)' }}>
                  Answer: {r.correctAnswerText || r.correctAnswer}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {buttons.map((label, i) => (
          <button
            key={label}
            className={i === 0 ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => handleSelect(i)}
            style={focusIdx === i ? { outline: '2px solid var(--black)', outlineOffset: 2 } : undefined}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
