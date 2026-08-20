import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HistoryEntry, Quiz } from '@/types';
import Modal from '@/components/shared/Modal';
import { formatTime } from '@/utils/quiz';

interface Props {
  quiz: Quiz;
  onClose: () => void;
}

export default function QuizHistoryPeek({ quiz, onClose }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    invoke<HistoryEntry[]>('get_history', { quizId: quiz.id }).then(setEntries).catch(() => setEntries([]));
  }, [quiz.id]);

  return (
    <Modal title={`${quiz.title} — Last 5 Scores`} onClose={onClose}>
      {entries === null ? (
        <div style={{ fontSize: 13, color: 'var(--grey-500)', textAlign: 'center', padding: '12px 0' }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--grey-500)', textAlign: 'center', padding: '12px 0' }}>
          No attempts yet for this quiz.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(e => (
            <div key={e.id} className="card" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--grey-500)' }}>
                  {new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--grey-500)', marginTop: 2 }}>
                  {formatTime(e.timeSeconds)}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }}>
                {e.percentage}%
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
