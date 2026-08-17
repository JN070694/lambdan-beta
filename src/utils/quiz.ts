import type { Question, ShuffledQuestion, ShuffledOption } from '@/types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function prepareQuestion(q: Question, shuffleAnswers: boolean = true): ShuffledQuestion {
  const labels = ['A', 'B', 'C', 'D', 'E'];
  const rawOptions: ShuffledOption[] = [];

  const pairs: [string, string][] = [
    ['A', q.optionA], ['B', q.optionB], ['C', q.optionC],
    ['D', q.optionD], ['E', q.optionE],
  ];

  for (const [label, text] of pairs) {
    if (text.trim()) rawOptions.push({ label, text, originalLabel: label });
  }

  const shouldShuffle = q.questionType === 'MC' && shuffleAnswers;
  const options = shouldShuffle ? shuffle(rawOptions) : rawOptions;

  const shuffledOptions: ShuffledOption[] = options.map((opt, i) => ({
    ...opt,
    label: labels[i],
  }));

  const remappedAnswer = shuffledOptions.find(o => o.originalLabel === q.correctAnswer)?.label ?? q.correctAnswer;

  return { ...q, shuffledOptions, remappedAnswer };
}

export function prepareQuestions(questions: Question[], shuffleAnswers: boolean = true): ShuffledQuestion[] {
  return questions.map(q => prepareQuestion(q, shuffleAnswers));
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
