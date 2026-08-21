import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '@/store';
import type { Quiz, Question, QuestionResult, ShuffledQuestion } from '@/types';
import { prepareQuestions, formatTime } from '@/utils/quiz';
import { useQuizGamepad } from '@/utils/useQuizGamepad';
import QuestionCard from './QuestionCard';
import MediaOverlay from './MediaOverlay';
import RefsOverlay from './RefsOverlay';
import QuizEndScreen from './QuizEndScreen';
import GamepadLegend from '@/components/shared/GamepadLegend';
import ConfirmModal from '@/components/shared/ConfirmModal';
import { v4 as uuidv4 } from '@/utils/uuid';

export default function QuizView() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const store = useStore();
  const {
    session, startSession, setAnswer, next, finishSession,
    clearSession, settings, toggleMedia, toggleRefs, closeMedia, closeRefs, setPaused,
  } = store;
  const { quiz, questions, currentIndex, answers, finished, paused, mediaOpen, refsOpen } = session;
  const backPath = (q: Quiz | null) => q?.folderId ? `/library/folder/${q.folderId}` : '/library';

  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [optionFocusIndex, setOptionFocusIndex] = useState(0);
  const [pauseMenuIndex, setPauseMenuIndex] = useState(0);
  const savingRef = useRef(false);

  const untilCorrect = settings.untilCorrectMode;
  const [queue, setQueue] = useState<ShuffledQuestion[]>([]);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());
  const [totalUnique, setTotalUnique] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);

  const loadQuiz = useCallback(async () => {
    if (!quizId) return;
    setLoading(true);
    try {
      const [allQuizzes, allQs] = await Promise.all([
        invoke<Quiz[]>('get_all_quizzes'),
        invoke<Question[]>('get_questions', { quizId }),
      ]);
      const quizObj = allQuizzes.find(x => x.id === quizId);
      if (!quizObj) { navigate('/library'); return; }

      const prepared = settings.shuffleQuestions
        ? prepareQuestions(shuffle([...allQs]), settings.shuffleAnswers)
        : prepareQuestions(allQs, settings.shuffleAnswers);

      startSession(quizObj, prepared);

      if (untilCorrect) {
        setQueue(shuffle([...prepared]));
        setMasteredIds(new Set());
        setTotalUnique(prepared.length);
        setAttemptCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [quizId, untilCorrect, settings.shuffleQuestions, settings.shuffleAnswers, startSession, navigate]);

  useEffect(() => {
    loadQuiz();
    return () => clearSession();
  }, [quizId]);

  const handleRetakeQuiz = useCallback(() => {
    savingRef.current = false;
    setElapsed(0);
    setShowScore(false);
    loadQuiz();
  }, [loadQuiz]);

  useEffect(() => { setOptionFocusIndex(0); }, [currentIndex, queue[0]?.id]);

  useEffect(() => {
    if (!session.startTime || paused || finished) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (session.startTime ?? 0)) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [session.startTime, paused, finished]);

  const isCorrectAnswer = useCallback((q: ShuffledQuestion, userAnswer: string) => {
    // Skip-mark buttons apply regardless of question type, so they must be
    // checked before the essay-specific rule below — otherwise a skip-marked-
    // correct essay answer (userAnswer 'SKIP_CORRECT') fails the essay check
    // (which only accepts the literal 'CORRECT') and is scored as wrong.
    if (userAnswer === 'SKIP_CORRECT') return true;
    if (userAnswer === 'SKIP_INCORRECT') return false;
    if (q.questionType === 'ESSAY') return userAnswer === 'CORRECT';
    return userAnswer === q.remappedAnswer;
  }, []);

  const handleFinish = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;

    const results: QuestionResult[] = questions.map(q => {
      const userAnswer = answers[q.id] ?? '';
      const correct = isCorrectAnswer(q, userAnswer);
      return {
        questionId: q.id,
        questionText: q.questionText,
        questionNumber: q.questionNumber,
        correct,
        userAnswer,
        correctAnswer: q.remappedAnswer,
      };
    });

    const score = results.filter(r => r.correct).length;
    const entry = {
      id: uuidv4(),
      quizId: quiz!.id,
      quizTitle: quiz!.title,
      date: new Date().toISOString(),
      score,
      total: questions.length,
      percentage: Math.round((score / questions.length) * 100),
      timeSeconds: elapsed,
      questionResults: results,
    };
    try {
      await invoke('save_history', { entry });
      store.addHistory(entry);
    } catch (e) { console.error('Failed to save history:', e); }

    // finishSession AFTER history is saved so QuizEndScreen can find the entry
    finishSession();
  }, [finishSession, questions, answers, quiz, elapsed, isCorrectAnswer]);

  const handleFinishUntilCorrect = useCallback(() => {
    if (savingRef.current) return;
    savingRef.current = true;
    finishSession();
  }, [finishSession]);

  const handleUntilCorrectAnswer = useCallback((q: ShuffledQuestion, ans: string) => {
    setAnswer(q.id, ans);
    const correct = isCorrectAnswer(q, ans);
    setAttemptCount(c => c + 1);
    if (correct) setMasteredIds(prev => new Set(prev).add(q.id));
  }, [setAnswer, isCorrectAnswer]);

  const handleUntilCorrectNext = useCallback(() => {
    const q = queue[0];
    if (!q) return;
    const wasCorrect = masteredIds.has(q.id);

    setQueue(prev => {
      const rest = prev.slice(1);
      if (wasCorrect) return rest;
      return [...rest, q];
    });

    useStore.setState(s => {
      const newAnswers = { ...s.session.answers };
      delete newAnswers[q.id];
      return { session: { ...s.session, answers: newAnswers, showAnswer: false } };
    });

    const remainingAfter = wasCorrect ? queue.length - 1 : queue.length;
    if (remainingAfter <= 0) handleFinishUntilCorrect();
  }, [queue, masteredIds, handleFinishUntilCorrect]);

  const currentOptionCount = untilCorrect
    ? (queue[0]?.shuffledOptions.length ?? 0)
    : (questions[currentIndex]?.shuffledOptions.length ?? 0);

  const onSelectFocused = useCallback(() => {
    const q = untilCorrect ? queue[0] : questions[currentIndex];
    if (!q) return;
    const opt = q.shuffledOptions[optionFocusIndex];
    if (!opt) return;
    if (untilCorrect) handleUntilCorrectAnswer(q, opt.label);
    else setAnswer(q.id, opt.label);
  }, [untilCorrect, queue, questions, currentIndex, optionFocusIndex, handleUntilCorrectAnswer, setAnswer]);

  const onAdvance = useCallback(() => {
    if (untilCorrect) { handleUntilCorrectNext(); return; }
    const isLast = currentIndex === questions.length - 1;
    if (isLast) handleFinish();
    else next();
  }, [untilCorrect, handleUntilCorrectNext, currentIndex, questions.length, handleFinish, next]);

  // The question actually shown right now, for the gamepad hook. In Until
  // Correct mode this is queue[0], not questions[currentIndex] — currentIndex
  // never moves in that mode since it advances via the local queue instead.
  const currentQuestionForGamepad = untilCorrect ? (queue[0] ?? null) : (questions[currentIndex] ?? null);

  // Single entry point gamepad answers go through, so Until Correct mode's
  // bookkeeping (mastered set, attempt count) stays in sync with controller
  // input the same way it already does for mouse/keyboard input.
  const handleGamepadAnswer = useCallback((questionId: string, value: string) => {
    if (untilCorrect) {
      const q = queue[0];
      if (q && q.id === questionId) handleUntilCorrectAnswer(q, value);
    } else {
      setAnswer(questionId, value);
    }
  }, [untilCorrect, queue, handleUntilCorrectAnswer, setAnswer]);

  // Esc mirrors the B button: close an open overlay first, resume if paused,
  // otherwise prompt to quit. If the quit-confirm dialog is already up,
  // ConfirmModal handles Esc itself (cancels), so this is a no-op then.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (finished || showQuitConfirm) return;
      if (mediaOpen) { closeMedia(); return; }
      if (refsOpen) { closeRefs(); return; }
      if (paused) { setPaused(false); setPauseMenuIndex(0); return; }
      setShowQuitConfirm(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [finished, showQuitConfirm, mediaOpen, refsOpen, paused, closeMedia, closeRefs, setPaused]);

  useQuizGamepad({
    optionFocusIndex,
    setOptionFocusIndex,
    optionCount: currentOptionCount,
    currentQuestion: currentQuestionForGamepad,
    onAnswer: handleGamepadAnswer,
    onSelectFocused,
    onAdvance,
    onToggleScore: () => setShowScore(v => !v),
    onResume: () => { setPaused(false); setPauseMenuIndex(0); },
    onQuitRequest: () => setShowQuitConfirm(true),
    pauseMenuIndex,
    setPauseMenuIndex,
    suppressed: showQuitConfirm,
  });

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>Loading…</div>
  );
  if (!quiz) return null;
  if (finished) {
    if (untilCorrect) return <UntilCorrectEndScreen quizTitle={quiz.title} attempts={attemptCount} elapsed={elapsed} quiz={quiz} />;
    return <QuizEndScreen onRetakeQuiz={handleRetakeQuiz} />;
  }

  const showLegend = !mediaOpen && !refsOpen;

  const legendItems = [
    { button: 'A' as const, label: 'Select' },
    { button: 'B' as const, label: 'Back' },
    { button: 'X' as const, label: 'Skip, Mark Correct' },
    { button: 'Y' as const, label: 'Skip, Mark Incorrect' },
  ];

  if (untilCorrect) {
    const currentQ = queue[0];
    const masteredCount = masteredIds.size;

    return (
      <div style={{ position: 'relative', minHeight: '100%' }}>
        {showLegend && <GamepadLegend items={legendItems} />}
        <div className="pull-tab-bar" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
          <button className="pull-tab" onClick={toggleMedia} aria-label="Open media">
            <span>◀</span><span>MEDIA</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
            fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--inverse-fg-muted)' }}>{formatTime(elapsed)}</span>
            <span style={{ background: 'var(--inverse-fg)', color: 'var(--inverse-bg)', borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>
              UNTIL CORRECT
            </span>
            <button onClick={() => setShowScore(v => !v)}
              style={{ background: 'none', border: '1px solid var(--inverse-fg-muted)', borderRadius: 4, cursor: 'pointer',
                color: 'var(--inverse-fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px' }}>
              {showScore ? `${masteredCount} / ${totalUnique} mastered` : 'Score'}
            </button>
            <button onClick={() => setPaused(!paused)}
              style={{ background: 'none', border: '1px solid var(--inverse-fg)', borderRadius: 4, cursor: 'pointer',
                color: 'var(--inverse-fg)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px' }}>
              ■ Pause
            </button>
            <button onClick={() => setShowQuitConfirm(true)}
              style={{ background: 'none', border: '1px solid var(--inverse-fg-muted)', borderRadius: 4, cursor: 'pointer',
                color: 'var(--inverse-fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px' }}>
              ← Quit
            </button>
          </div>
          <button className="pull-tab" style={{ flexDirection: 'row-reverse' }} onClick={toggleRefs}>
            <span>REFS</span><span>▶</span>
          </button>
        </div>

        <div className="quiz-split-layout">
          {mediaOpen && <div className="quiz-side-pane open"><MediaOverlay /></div>}
          <div className="quiz-question-pane">
            <div style={{ padding: '24px 20px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--grey-500)', marginBottom: 10 }}>
                {masteredCount} / {totalUnique} mastered · {queue.length} remaining in queue
              </div>
              {currentQ && (
                <QuestionCard
                  question={currentQ}
                  answer={answers[currentQ.id]}
                  onAnswer={(ans) => handleUntilCorrectAnswer(currentQ, ans)}
                  onNext={handleUntilCorrectNext}
                  onFinish={handleUntilCorrectNext}
                  isLast={queue.length === 1}
                  instantFeedback={true}
                  optionFocusIndex={optionFocusIndex}
                />
              )}
            </div>
          </div>
          {refsOpen && <div className="quiz-side-pane open"><RefsOverlay /></div>}
        </div>

        {paused && (
          <PauseOverlay title={quiz.title} sub={`${masteredCount} / ${totalUnique} mastered`}
            onResume={() => { setPaused(false); setPauseMenuIndex(0); }}
            onQuit={() => setShowQuitConfirm(true)}
            focusIndex={pauseMenuIndex} />
        )}
        {showQuitConfirm && (
          <ConfirmModal
            title="Quit Quiz"
            message="Are you sure you want to quit? Your progress will not be saved."
            onConfirm={() => { clearSession(); navigate(backPath(quiz)); }}
            onCancel={() => setShowQuitConfirm(false)}
            confirmLabel="Yes, Quit"
            cancelLabel="No"
          />
        )}
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.entries(answers).filter(([qid, ans]) => {
    const q = questions.find(x => x.id === qid);
    if (!q) return false;
    return isCorrectAnswer(q, ans);
  }).length;

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {showLegend && <GamepadLegend items={legendItems} />}
      <div className="pull-tab-bar" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <button className="pull-tab" onClick={toggleMedia} aria-label="Open media">
          <span>◀</span><span>MEDIA</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
          fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <span style={{ color: 'var(--inverse-fg-muted)' }}>{formatTime(elapsed)}</span>
          <button onClick={() => setShowScore(v => !v)}
            style={{ background: 'none', border: '1px solid var(--inverse-fg-muted)', borderRadius: 4, cursor: 'pointer',
              color: 'var(--inverse-fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px' }}>
            {showScore ? `${correctCount} / ${answeredCount}` : 'Score'}
          </button>
          <button onClick={() => setPaused(!paused)}
            style={{ background: 'none', border: '1px solid var(--inverse-fg)', borderRadius: 4, cursor: 'pointer',
              color: 'var(--inverse-fg)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px' }}>
            ■ Pause
          </button>
          <button onClick={() => setShowQuitConfirm(true)}
            style={{ background: 'none', border: '1px solid var(--inverse-fg-muted)', borderRadius: 4, cursor: 'pointer',
              color: 'var(--inverse-fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px' }}>
            ← Quit
          </button>
        </div>
        <button className="pull-tab" style={{ flexDirection: 'row-reverse' }} onClick={toggleRefs}>
          <span>REFS</span><span>▶</span>
        </button>
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
                onFinish={handleFinish}
                isLast={isLast}
                instantFeedback={settings.instantFeedback}
                optionFocusIndex={optionFocusIndex}
              />
            )}
          </div>
        </div>
        {refsOpen && <div className="quiz-side-pane open"><RefsOverlay /></div>}
      </div>

      {paused && (
        <PauseOverlay title={quiz.title} sub={`${currentIndex + 1} / ${questions.length}`}
          onResume={() => { setPaused(false); setPauseMenuIndex(0); }}
          onQuit={() => setShowQuitConfirm(true)}
          focusIndex={pauseMenuIndex} />
      )}
      {showQuitConfirm && (
        <ConfirmModal
          title="Quit Quiz"
          message="Are you sure you want to quit? Your progress will not be saved."
          onConfirm={() => { clearSession(); navigate(backPath(quiz)); }}
          onCancel={() => setShowQuitConfirm(false)}
          confirmLabel="Yes, Quit"
          cancelLabel="No"
        />
      )}
    </div>
  );
}

function PauseOverlay({ title, sub, onResume, onQuit, focusIndex }: {
  title: string; sub: string; onResume: () => void; onQuit: () => void; focusIndex: number;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(var(--white-rgb), 0.97)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, zIndex: 300 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>Paused</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--grey-500)' }}>{title} · {sub}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--grey-500)' }}>
        ◀ ▶ to select · A to confirm · B to resume
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={onResume}
          style={focusIndex === 0 ? { outline: '3px solid var(--black)', outlineOffset: 2 } : undefined}>
          Resume
        </button>
        <button className="btn btn-secondary" onClick={onQuit}
          style={focusIndex === 1 ? { outline: '3px solid var(--black)', outlineOffset: 2 } : undefined}>
          Quit
        </button>
      </div>
    </div>
  );
}

function UntilCorrectEndScreen({ quizTitle, attempts, elapsed, quiz }: {
  quizTitle: string; attempts: number; elapsed: number; quiz: Quiz;
}) {
  const navigate = useNavigate();
  const { clearSession } = useStore();
  const backPath = quiz.folderId ? `/library/folder/${quiz.folderId}` : '/library';
  return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center',
      display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--grey-500)' }}>
        Until Correct — Complete
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>{quizTitle}</h1>
      <p style={{ fontSize: 14, color: 'var(--grey-600)' }}>
        You've answered every question correctly after {attempts} total {attempts === 1 ? 'attempt' : 'attempts'},
        in {formatTime(elapsed)}.
      </p>
      <p style={{ fontSize: 12, color: 'var(--grey-500)', fontFamily: 'var(--font-mono)' }}>
        This attempt was not saved to history.
      </p>
      <button className="btn btn-primary" style={{ alignSelf: 'center', marginTop: 8 }}
        onClick={() => { clearSession(); navigate(backPath); }}>
        {quiz.folderId ? 'Back to Folder' : 'Return to Library'}
      </button>
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
