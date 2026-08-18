import { create } from 'zustand';
import type {
  Quiz, Folder, ShuffledQuestion, HistoryEntry,
  AppSettings, GamepadMapping, QuestionResult
} from '@/types';

interface QuizSession {
  quiz: Quiz | null;
  questions: ShuffledQuestion[];
  currentIndex: number;
  answers: Record<string, string>;
  results: QuestionResult[];
  startTime: number | null;
  paused: boolean;
  finished: boolean;
  showAnswer: boolean;
  mediaOpen: boolean;
  refsOpen: boolean;
  mediaVariantIndex: number;
  refIndex: number;
}

const defaultSession: QuizSession = {
  quiz: null, questions: [], currentIndex: 0,
  answers: {}, results: [], startTime: null,
  paused: false, finished: false, showAnswer: false,
  mediaOpen: false, refsOpen: false,
  mediaVariantIndex: 0, refIndex: 0,
};

interface AppState {
  folders: Folder[];
  quizzes: Quiz[];
  history: HistoryEntry[];
  settings: AppSettings;
  gamepadMapping: GamepadMapping;

  setFolders: (f: Folder[]) => void;
  setQuizzes: (q: Quiz[]) => void;
  upsertFolder: (f: Folder) => void;
  removeFolder: (id: string) => void;
  setHistory: (h: HistoryEntry[]) => void;
  addHistory: (e: HistoryEntry) => void;
  setSettings: (s: AppSettings) => void;
  setGamepadMapping: (m: GamepadMapping) => void;

  session: QuizSession;
  startSession: (quiz: Quiz, questions: ShuffledQuestion[]) => void;
  setAnswer: (questionId: string, answer: string) => void;
  next: () => void;
  prev: () => void;
  setShowAnswer: (v: boolean) => void;
  toggleMedia: () => void;
  toggleRefs: () => void;
  closeMedia: () => void;
  closeRefs: () => void;
  setMediaVariant: (i: number) => void;
  setRefIndex: (i: number) => void;
  setPaused: (v: boolean) => void;
  finishSession: () => void;
  clearSession: () => void;
}

const defaultGamepad: GamepadMapping = {
  select: 0, back: 1, skipCorrect: 3, skipIncorrect: 2,
  media: 4, references: 5, pause: 9, score: 8,
  lt: 6, rt: 7, ls: 10, rs: 11,
};

export const useStore = create<AppState>((set) => ({
  folders: [],
  quizzes: [],
  history: [],
  settings: { instantFeedback: true, shuffleQuestions: false, untilCorrectMode: false, buttonIconStyle: 'xbox', shuffleAnswers: true, displayScale: 'auto' },
  gamepadMapping: defaultGamepad,

  setFolders: (folders) => set({ folders }),
  setQuizzes: (quizzes) => set({ quizzes }),
  upsertFolder: (f) => set((s) => {
    const idx = s.folders.findIndex(x => x.id === f.id);
    const updated = [...s.folders];
    if (idx >= 0) updated[idx] = f; else updated.push(f);
    return { folders: updated };
  }),
  removeFolder: (id) => set((s) => ({ folders: s.folders.filter(f => f.id !== id) })),
  setHistory: (history) => set({ history }),
  addHistory: (e) => set((s) => ({ history: [e, ...s.history] })),
  setSettings: (settings) => set({ settings }),
  setGamepadMapping: (gamepadMapping) => set({ gamepadMapping }),

  session: defaultSession,
  startSession: (quiz, questions) => set({
    session: { ...defaultSession, quiz, questions, startTime: Date.now() }
  }),
  setAnswer: (questionId, answer) => set((s) => ({
    session: { ...s.session, answers: { ...s.session.answers, [questionId]: answer } }
  })),
  next: () => set((s) => ({
    session: {
      ...s.session, showAnswer: false, mediaOpen: false,
      mediaVariantIndex: 0,
      currentIndex: Math.min(s.session.currentIndex + 1, s.session.questions.length - 1),
    }
  })),
  prev: () => set((s) => ({
    session: {
      ...s.session, showAnswer: false,
      currentIndex: Math.max(s.session.currentIndex - 1, 0),
    }
  })),
  setShowAnswer: (v) => set((s) => ({ session: { ...s.session, showAnswer: v } })),
  toggleMedia: () => set((s) => ({ session: { ...s.session, mediaOpen: !s.session.mediaOpen, refsOpen: false } })),
  toggleRefs: () => set((s) => ({ session: { ...s.session, refsOpen: !s.session.refsOpen, mediaOpen: false } })),
  closeMedia: () => set((s) => ({ session: { ...s.session, mediaOpen: false } })),
  closeRefs: () => set((s) => ({ session: { ...s.session, refsOpen: false } })),
  setMediaVariant: (i) => set((s) => ({ session: { ...s.session, mediaVariantIndex: i } })),
  setRefIndex: (i) => set((s) => ({ session: { ...s.session, refIndex: i } })),
  setPaused: (v) => set((s) => ({ session: { ...s.session, paused: v } })),
  finishSession: () => set((s) => ({ session: { ...s.session, finished: true } })),
  clearSession: () => set({ session: defaultSession }),
}));
