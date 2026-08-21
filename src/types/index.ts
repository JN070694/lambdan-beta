export type QuestionType = 'MC' | 'TF' | 'ESSAY';

export interface Folder {
  id: string;
  name: string;
  createdAt: string;
  quizCount: number;
}

export interface Quiz {
  id: string;
  title: string;
  csvFileName: string;
  questionCount: number;
  importedAt: string;
  referenceImages: ReferenceImage[];
  folderId: string | null;
}

export interface ReferenceImage {
  key: string;
  number: number;
  name: string;
  displayLabel: string;
  filePath: string;
}

export interface Question {
  id: string;
  quizId: string;
  questionNumber: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  correctAnswer: string;
  nid: string;
  imagePath: string | null;
  nidVariants: string[];
  group: string;
  questionType: QuestionType;
  explanation: string;
}

export interface ShuffledOption {
  label: string;
  text: string;
  originalLabel: string;
}

export interface ShuffledQuestion extends Question {
  shuffledOptions: ShuffledOption[];
  remappedAnswer: string;
}

export interface QuestionResult {
  questionId: string;
  questionText: string;
  questionNumber?: string;
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
}

export interface HistoryEntry {
  id: string;
  quizId: string;
  quizTitle: string;
  date: string;
  score: number;
  total: number;
  percentage: number;
  timeSeconds: number;
  questionResults: QuestionResult[];
}

export interface AppSettings {
  instantFeedback: boolean;
  shuffleQuestions: boolean;
  untilCorrectMode: boolean;
  buttonIconStyle: 'xbox' | 'playstation';
  shuffleAnswers: boolean;
  displayScale: 'auto' | 'compact' | 'comfortable' | 'large';
  theme: 'default' | 'ultra-luxe';
}

export interface GamepadMapping {
  select: number;
  back: number;
  skipCorrect: number;
  skipIncorrect: number;
  media: number;
  references: number;
  pause: number;
  score: number;
  lt: number;
  rt: number;
  ls: number;
  rs: number;
}

export interface ImportResult {
  quizzesImported: number;
  folderId: string | null;
  folderName: string | null;
  folderWasCreated: boolean;
}
