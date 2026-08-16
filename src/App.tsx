import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '@/store';
import type { Folder, Quiz, HistoryEntry, AppSettings, GamepadMapping } from '@/types';
import TopBar from '@/components/shared/TopBar';
import LibraryView from '@/components/library/LibraryView';
import QuizView from '@/components/quiz/QuizView';
import RetakeView from '@/components/quiz/RetakeView';
import HistoryView from '@/components/history/HistoryView';
import SettingsView from '@/components/settings/SettingsView';
import { useRightStickScroll } from '@/utils/useRightStickScroll';

export default function App() {
  const { setFolders, setQuizzes, setHistory, setSettings, setGamepadMapping, session } = useStore();

  useRightStickScroll();

  useEffect(() => {
    Promise.all([
      invoke<Quiz[]>('get_all_quizzes').then(setQuizzes),
      invoke<Folder[]>('get_folders').then(setFolders),
      invoke<HistoryEntry[]>('get_history', { quizId: null }).then(setHistory),
      invoke<AppSettings>('get_settings').then(setSettings),
      invoke<GamepadMapping>('get_gamepad_mapping').then(setGamepadMapping),
    ]).catch(console.error);
  }, []);

  const isWide = session.mediaOpen || session.refsOpen;

  return (
    <BrowserRouter>
      <div className="app">
        <TopBar />
        <main className={`main-content${isWide ? ' wide' : ''}`}>
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route path="/library" element={<LibraryView />} />
            <Route path="/library/folder/:folderId" element={<LibraryView />} />
            <Route path="/quiz/:quizId" element={<QuizView />} />
            <Route path="/quiz/:quizId/retake" element={<RetakeView />} />
            <Route path="/history" element={<HistoryView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
