import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '@/store';
import type { Question, Quiz } from '@/types';
import { prepareQuestions } from '@/utils/quiz';
import QuestionCard from './QuestionCard';
import MediaOverlay from './MediaOverlay';
import RefsOverlay from './RefsOverlay';
import GamepadLegend from '@/components/shared/GamepadLegend';
import { useQuizGamepad } from '@/utils/useQuizGamepad';

export default function RetakeView() {
  const { quizId } = useParams<{ quizId: string }>();
  const { state } = useLocation() as { state: { missedIds: string[] } };
  const navigate = useNavigate();
  const { startSession, setAnswer, next, clearSession, session, toggleMedia, toggleRefs, settings } = useStore();
  const [loading, setLoading] = useState(true);
  const [optionFocusIndex, setOptionFocusIndex] = useState(0);
  const backPath = (fid: string | undefined | null) => fid ? `/library/folder/${fid}` : '/library';

  useEffect(() => {
    if (!quizId || !state?.missedIds) { navigate('/library'); return; }
    (async () => {
      try {
        const [allQuizzes, allQs] = await Promise.all([
          invoke<Quiz[]>('get_all_quizzes'),
          invoke<Question[]>('get_questions', { quizId }),
        ]);
        const quiz = allQuizzes.find(q => q.id === quizId);
        if (!quiz) { navigate('/library'); return; }
        const missed = allQs.filter(q => state.missedIds.includes(q.id));
        startSession(quiz, prepareQuestions(missed));
      } finally { setLoading(false); }
    })();
    return () => clearSession();
  }, [quizId]);

  const { questions, currentIndex, answers, mediaOpen, refsOpen } = session;
  const currentQ = questions[currentIndex];

  useEffect(() => { setOptionFocusIndex(0); }, [currentIndex]);

  const onSelectFocused = () => {
    if (!currentQ) return;
    const opt = currentQ.shuffledOptions[optionFocusIndex];
    if (opt) setAnswer(currentQ.id, opt.label);
  };

  const onAdvance = () => {
    const isLast = currentIndex === questions.length - 1;
    if (isLast) { clearSession(); navigate(backPath(session.quiz?.folderId)); }
    else next();
  };

  useQuizGamepad({
    optionFocusIndex,
    setOptionFocusIndex,
    optionCount: currentQ?.shuffledOptions.length ?? 0,
    onSelectFocused,
    onAdvance,
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;

  const isLast = currentIndex === questions.length - 1;
  const showLegend = !mediaOpen && !refsOpen;
  const legendItems = [
    { button: 'A' as const, label: 'Select' },
    { button: 'B' as const, label: 'Back' },
    { button: 'X' as const, label: 'Skip, Mark Correct' },
    { button: 'Y' as const, label: 'Skip, Mark Incorrect' },
  ];

  return (
    <div style={{ position: 'relative' }}>
      {showLegend && <GamepadLegend items={legendItems} />}
      <div className="pull-tab-bar">
        <button className="pull-tab" onClick={toggleMedia}>◀ MEDIA</button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa', padding: '0 16px', alignSelf: 'center' }}>
          RETAKE — not saved to history
        </span>
        <button className="pull-tab" onClick={toggleRefs}>REFS ▶</button>
      </div>

      <div className="quiz-split-layout">
        {mediaOpen && <div className="quiz-side-pane open"><MediaOverlay /></div>}
        <div className="quiz-question-pane">
          <div style={{ padding: '24px 20px' }}>
            {currentQ && (
              <QuestionCard
                question={currentQ}
                answer={answers[currentQ.id]}
                onAnswer={(ans) => setAnswer(currentQ.id, ans)}
                onNext={next}
                onFinish={() => { clearSession(); navigate(backPath(session.quiz?.folderId)); }}
                isLast={isLast}
                instantFeedback={settings.instantFeedback}
                optionFocusIndex={optionFocusIndex}
              />
            )}
          </div>
        </div>
        {refsOpen && <div className="quiz-side-pane open"><RefsOverlay /></div>}
      </div>
    </div>
  );
}
