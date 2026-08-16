import { useStore } from '@/store';
import type { ShuffledQuestion } from '@/types';

interface Props {
  question: ShuffledQuestion;
  answer: string | undefined;
  onAnswer: (ans: string) => void;
  onNext: () => void;
  onFinish: () => void;
  isLast: boolean;
  instantFeedback: boolean;
  optionFocusIndex?: number;
}

export default function QuestionCard({
  question, answer, onAnswer, onNext, onFinish, isLast, instantFeedback, optionFocusIndex,
}: Props) {
  const { session, toggleMedia } = useStore();
  const answered = answer !== undefined;
  const hasMedia = question.nidVariants.length > 0;

  const typeLabels: Record<string, string> = {
    MC: 'Multiple Choice',
    TF: 'True / False',
    ESSAY: 'Essay',
  };

  if (question.questionType === 'ESSAY') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {hasMedia && <MediaIndicator nid={question.nid} count={question.nidVariants.length} onOpen={toggleMedia} />}
        <MetaRow question={question} typeLabels={typeLabels} answered={answered} onAnswer={onAnswer} />
        <p style={{ fontSize: 15, lineHeight: 1.65, fontWeight: 500 }}>{question.questionText}</p>
        {!session.showAnswer ? (
          <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}
            onClick={() => useStore.getState().setShowAnswer(true)}>
            Show Answer
          </button>
        ) : (
          <>
            <div className="card-muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
              {question.correctAnswer}
            </div>
            {!answered && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => onAnswer('CORRECT')}
                  style={optionFocusIndex === 0 ? { outline: '2px solid #000', outlineOffset: 2 } : undefined}>
                  ✓ Correct
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => onAnswer('INCORRECT')}
                  style={optionFocusIndex === 1 ? { outline: '2px solid #000', outlineOffset: 2 } : undefined}>
                  ✗ Incorrect
                </button>
              </div>
            )}
          </>
        )}
        {answered && <NextRow answer={answer} isLast={isLast} onNext={onNext} onFinish={onFinish} essay />}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {hasMedia && <MediaIndicator nid={question.nid} count={question.nidVariants.length} onOpen={toggleMedia} />}
      <MetaRow question={question} typeLabels={typeLabels} answered={answered} onAnswer={onAnswer} />
      <p style={{ fontSize: 15, lineHeight: 1.65, fontWeight: 500 }}>{question.questionText}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {question.shuffledOptions.map((opt, i) => {
          let cls = 'option-btn';
          if (answered && instantFeedback) {
            if (opt.label === question.remappedAnswer) cls += ' selected-correct';
            else if (opt.label === answer) cls += ' selected-wrong';
          } else if (answered && opt.label === answer) {
            cls += ' selected-correct';
          }
          const focused = !answered && optionFocusIndex === i;
          return (
            <button
              key={opt.label}
              className={cls}
              disabled={answered}
              onClick={() => !answered && onAnswer(opt.label)}
              style={focused ? { outline: '2px solid #000', outlineOffset: 2 } : undefined}
            >
              <span className="opt-label">{opt.label}</span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>

      {answered && instantFeedback && (
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {answer === question.remappedAnswer || answer === 'SKIP_CORRECT'
            ? '✓ Correct'
            : `✗ Incorrect — correct answer: ${question.remappedAnswer}`}
        </div>
      )}
      {answered && <NextRow answer={answer} isLast={isLast} onNext={onNext} onFinish={onFinish} />}
    </div>
  );
}

function MediaIndicator({ nid, count, onOpen }: { nid: string; count: number; onOpen: () => void }) {
  return (
    <div className="media-indicator" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen()}>
      <div className="lambda-pill"><span>λ</span></div>
      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
        media available
      </div>
      <div style={{ fontSize: 11, color: '#888', fontFamily: 'var(--font-mono)' }}>
        {nid} · {count} {count === 1 ? 'image' : 'images'} — click to open
      </div>
    </div>
  );
}

function MetaRow({ question, typeLabels, answered, onAnswer }: {
  question: ShuffledQuestion;
  typeLabels: Record<string, string>;
  answered: boolean;
  onAnswer: (ans: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#888' }}>
        #{question.questionNumber}
      </span>
      {question.nid && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
          background: '#f0f0f0', padding: '2px 8px', borderRadius: 4, border: '1px solid #ccc' }}>
          {question.nid}
        </span>
      )}
      <span className="pill">{typeLabels[question.questionType]}</span>
      {question.group && <span className="pill pill-muted">{question.group}</span>}

      {!answered && (
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button
            onClick={() => onAnswer('SKIP_CORRECT')}
            title="Skip and mark correct"
            style={{
              background: '#fff', border: '1.5px solid #000', borderRadius: 5,
              padding: '3px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
              cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600,
            }}>
            ✓ Skip
          </button>
          <button
            onClick={() => onAnswer('SKIP_INCORRECT')}
            title="Skip and mark incorrect"
            style={{
              background: '#fff', border: '1.5px solid #ccc', borderRadius: 5,
              padding: '3px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
              cursor: 'pointer', whiteSpace: 'nowrap', color: '#666',
            }}>
            ✗ Skip
          </button>
        </div>
      )}
    </div>
  );
}

function NextRow({ answer, isLast, onNext, onFinish, essay }: {
  answer: string; isLast: boolean; onNext: () => void; onFinish: () => void; essay?: boolean;
}) {
  const correct = essay ? answer === 'CORRECT' : undefined;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {essay && (
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {correct ? '✓ Marked correct' : '✗ Marked incorrect'}
        </span>
      )}
      <div style={{ marginLeft: 'auto' }}>
        <button className="btn btn-primary" onClick={isLast ? onFinish : onNext}>
          {isLast ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
