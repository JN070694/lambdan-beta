import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { exit } from '@tauri-apps/plugin-process';
import { useStore } from '@/store';
import type { HistoryEntry, Question } from '@/types';
import { formatTime } from '@/utils/quiz';
import Modal from '@/components/shared/Modal';
import ConfirmModal from '@/components/shared/ConfirmModal';
import { useMenuGamepad } from '@/utils/useMenuGamepad';

export default function HistoryView() {
  const { history, setHistory, quizzes, folders } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterQuizId = searchParams.get('quizId');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [detailEntry, setDetailEntry] = useState<HistoryEntry | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<HistoryEntry | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [showQuitAppConfirm, setShowQuitAppConfirm] = useState(false);
  const [validQuestionIds, setValidQuestionIds] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    invoke<HistoryEntry[]>('get_history', { quizId: filterQuizId }).then(setHistory);
  }, [filterQuizId]);

  useEffect(() => { setFocusedIndex(0); }, [filterQuizId]);

  // Fetch current question IDs for each quiz referenced in history so we
  // can tell if an entry is "stale" (quiz was reimported/replaced since).
  useEffect(() => {
    const uniqueQuizIds = Array.from(new Set(history.map(h => h.quizId)));
    (async () => {
      const map: Record<string, Set<string>> = {};
      for (const qid of uniqueQuizIds) {
        try {
          const questions = await invoke<Question[]>('get_questions', { quizId: qid });
          map[qid] = new Set(questions.map(q => q.id));
        } catch {
          map[qid] = new Set();
        }
      }
      setValidQuestionIds(map);
    })();
  }, [history]);

  const isEntryStale = useCallback((entry: HistoryEntry) => {
    const valid = validQuestionIds[entry.quizId];
    if (!valid) return false; // not loaded yet — assume fresh, don't flicker
    return entry.questionResults.some(r => !valid.has(r.questionId));
  }, [validQuestionIds]);

  const buildExportFilename = (entry: HistoryEntry) => {
    const quiz = quizzes.find(q => q.id === entry.quizId);
    const folder = quiz?.folderId ? folders.find(f => f.id === quiz.folderId) : null;
    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim();
    const parts = [
      folder ? sanitize(folder.name) : null,
      sanitize(entry.quizTitle),
      `${entry.percentage}%`,
    ].filter(Boolean);
    return parts.join('_') + '.csv';
  };

  const handleExport = async (entry: HistoryEntry) => {
    const path = await save({
      defaultPath: buildExportFilename(entry),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (path) await invoke('export_missed', { entryId: entry.id, outputPath: path }).catch(console.error);
  };

  const handleDeleteHistory = async (entryId: string) => {
    await invoke('delete_history_entry', { entryId });
    setHistory(history.filter(h => h.id !== entryId));
  };

  const handleClearAllHistory = async () => {
    await invoke('clear_all_history', { quizId: null });
    setHistory([]);
  };

  const entries = filterQuizId ? history.filter(h => h.quizId === filterQuizId) : history;

  const onConfirm = useCallback(() => {
    const entry = entries[focusedIndex];
    if (!entry || isEntryStale(entry)) return;
    const missed = entry.questionResults.filter(r => !r.correct);
    if (missed.length === 0) return;
    navigate(`/quiz/${entry.quizId}/retake`, { state: { missedIds: missed.map(r => r.questionId) } });
  }, [entries, focusedIndex, navigate, isEntryStale]);

  const onSecondary = useCallback(() => {
    const entry = entries[focusedIndex];
    if (entry && !isEntryStale(entry)) setDetailEntry(entry);
  }, [entries, focusedIndex, isEntryStale]);

  const onTertiary = useCallback(() => {
    const entry = entries[focusedIndex];
    if (entry) setConfirmDeleteEntry(entry);
  }, [entries, focusedIndex]);

  const onBack = useCallback(() => {
    if (confirmDeleteEntry) { setConfirmDeleteEntry(null); return; }
    if (confirmClearAll) { setConfirmClearAll(false); return; }
    if (detailEntry) { setDetailEntry(null); return; }
    if (showQuitAppConfirm) { setShowQuitAppConfirm(false); return; }
    setShowQuitAppConfirm(true); // B on History root — prompt to quit the app
  }, [confirmDeleteEntry, confirmClearAll, detailEntry, showQuitAppConfirm]);

  useMenuGamepad({
    currentPage: 'history',
    onNavigatePage: (page) => navigate(`/${page}`),
    itemCount: entries.length,
    focusedIndex,
    onFocusChange: setFocusedIndex,
    onConfirm,
    onSecondary,
    onTertiary,
    onBack,
    enabled: !detailEntry && !confirmDeleteEntry && !confirmClearAll && !showQuitAppConfirm,
  });

  return (
    <div>
      {entries.length === 0 ? (
        <div className="empty-state">
          <h2>No history yet</h2>
          <p>Complete a quiz to see your results here.</p>
          <button className="btn btn-primary" onClick={() => navigate('/library')}>Go to Library</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
              Showing last 5 per quiz · most recent first · A retake · X details · Y delete (confirm)
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmClearAll(true)}>
              Clear All History
            </button>
          </div>
          {entries.map((entry, i) => (
            <HistoryCard key={entry.id} entry={entry} focused={i === focusedIndex}
              isStale={isEntryStale(entry)}
              onRetake={() => navigate(`/quiz/${entry.quizId}/retake`, {
                state: { missedIds: entry.questionResults.filter(r => !r.correct).map(r => r.questionId) }
              })}
              onExport={() => handleExport(entry)}
              onDetails={() => setDetailEntry(entry)}
              onDelete={() => setConfirmDeleteEntry(entry)}
            />
          ))}
        </div>
      )}

      {detailEntry && (
        <Modal title={`${detailEntry.quizTitle} — Details`} onClose={() => setDetailEntry(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: 24, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <div>Score: <strong>{detailEntry.percentage}%</strong></div>
              <div>Time: <strong>{formatTime(detailEntry.timeSeconds)}</strong></div>
            </div>
            {detailEntry.questionResults.map(r => (
              <div key={r.questionId} style={{
                fontSize: 12, padding: '8px 10px', borderRadius: 6,
                background: r.correct ? 'var(--grey-100)' : 'var(--grey-100)',
                border: `1px solid ${r.correct ? 'var(--grey-300)' : 'var(--black)'}`,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {r.correct ? '✓' : '✗'} {r.questionText}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--grey-500)' }}>
                  Your answer: {r.userAnswer || '—'} · Correct: {r.correctAnswer}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {confirmDeleteEntry && (
        <ConfirmModal
          title="Delete History Entry"
          message={<>Delete this attempt of <strong>{confirmDeleteEntry.quizTitle}</strong> from{' '}{new Date(confirmDeleteEntry.date).toLocaleDateString()}? This cannot be undone.</>}
          onConfirm={async () => { await handleDeleteHistory(confirmDeleteEntry.id); setConfirmDeleteEntry(null); }}
          onCancel={() => setConfirmDeleteEntry(null)}
          confirmLabel="Yes, Delete"
          cancelLabel="No"
        />
      )}

      {confirmClearAll && (
        <ConfirmModal
          title="Clear All History"
          message="Delete every history entry for every quiz? This cannot be undone."
          onConfirm={async () => { await handleClearAllHistory(); setConfirmClearAll(false); }}
          onCancel={() => setConfirmClearAll(false)}
          confirmLabel="Yes, Clear All"
          cancelLabel="No"
        />
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

function HistoryCard({ entry, focused, isStale, onRetake, onExport, onDetails, onDelete }: {
  entry: HistoryEntry; focused: boolean; isStale: boolean; onRetake: () => void; onExport: () => void;
  onDetails: () => void; onDelete: () => void;
}) {
  const missed = entry.questionResults.filter(r => !r.correct).length;
  const date = new Date(entry.date).toLocaleDateString(undefined,
    { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0,
      outline: focused ? '2px solid var(--black)' : 'none', outlineOffset: 2 }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.quizTitle}</div>
          <div style={{ fontSize: 11, color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {date} · {entry.total} questions
            {isStale && <span style={{ color: 'var(--grey-500)' }}> · quiz has since been updated</span>}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700 }}>{entry.percentage}%</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isStale && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={onDetails}>Details</button>
              {missed > 0 && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={onRetake}>Retake Missed</button>
                  <button className="btn btn-secondary btn-sm" onClick={onExport}>Export</button>
                </>
              )}
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onDelete}>✕</button>
        </div>
      </div>
      <div style={{ background: 'var(--grey-100)', borderTop: '1px solid var(--grey-300)', padding: '8px 16px', display: 'flex', gap: 24 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--grey-600)' }}>✓ {entry.score} correct</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--grey-600)' }}>✗ {missed} missed</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--grey-500)' }}>{formatTime(entry.timeSeconds)}</span>
      </div>
    </div>
  );
}
