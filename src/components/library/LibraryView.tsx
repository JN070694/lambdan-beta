import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { exit } from '@tauri-apps/plugin-process';
import { useStore } from '@/store';
import type { Folder, Quiz, ImportResult } from '@/types';
import Modal from '@/components/shared/Modal';
import ConfirmModal from '@/components/shared/ConfirmModal';
import GamepadLegend from '@/components/shared/GamepadLegend';
import QuizHistoryPeek from './QuizHistoryPeek';
import { useMenuGamepad } from '@/utils/useMenuGamepad';

type ListItem =
  | { type: 'folder'; data: Folder }
  | { type: 'quiz'; data: Quiz };

export default function LibraryView() {
  const { folderId } = useParams<{ folderId?: string }>();
  const { quizzes, setQuizzes, folders, setFolders, upsertFolder, removeFolder } = useStore();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const importRowRef = useRef<HTMLDivElement | null>(null);
  const [importRowTop, setImportRowTop] = useState(92); // sensible default before first measurement
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [historyPeekQuiz, setHistoryPeekQuiz] = useState<Quiz | null>(null);
  const [confirmDeleteQuiz, setConfirmDeleteQuiz] = useState<Quiz | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<Folder | null>(null);
  const [pendingImportPath, setPendingImportPath] = useState<string | null>(null);
  const [showQuitAppConfirm, setShowQuitAppConfirm] = useState(false);
  const [overrideNames, setOverrideNames] = useState<string[]>([]);
  const navigate = useNavigate();

  const currentFolder = folderId ? folders.find(f => f.id === folderId) : null;

  const refreshAll = useCallback(async () => {
    const [allQuizzes, allFolders] = await Promise.all([
      invoke<Quiz[]>('get_all_quizzes'),
      invoke<Folder[]>('get_folders'),
    ]);
    setQuizzes(allQuizzes);
    setFolders(allFolders);
  }, [setQuizzes, setFolders]);

  useEffect(() => { refreshAll(); }, []);
  useEffect(() => { setFocusedIndex(0); }, [folderId]);

  // Keep the floating gamepad legend's top edge aligned with the Import
  // row's actual top edge — which shifts down when a "Back to Library"
  // button is showing above it (inside a folder) — rather than a guessed
  // constant that would drift out of alignment in that case.
  useEffect(() => {
    const measure = () => {
      if (importRowRef.current) {
        setImportRowTop(importRowRef.current.getBoundingClientRect().top);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [folderId, currentFolder]);

  const visibleQuizzes = folderId
    ? quizzes.filter(q => q.folderId === folderId)
    : quizzes.filter(q => !q.folderId);

  const items: ListItem[] = useMemo(() => {
    const list: ListItem[] = [];
    if (!folderId) folders.forEach(f => list.push({ type: 'folder', data: f }));
    visibleQuizzes.forEach(q => list.push({ type: 'quiz', data: q }));
    return list;
  }, [folderId, folders, visibleQuizzes]);

  const prettify = (stem: string) =>
    stem.replace(/[-_]/g, ' ').split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const handleImport = async () => {
    const path = await open({
      filters: [{ name: 'Quiz Pack', extensions: ['gz', 'csv'] }],
      multiple: false,
    });
    if (typeof path !== 'string') return;

    const fileName = path.split('/').pop() ?? '';
    const isTar = fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz');
    const isCsv = fileName.endsWith('.csv');
    const tarStem = fileName.replace(/\.tar\.gz$/, '').replace(/\.tgz$/, '');

    let wouldOverride: string[] = [];

    if (isCsv) {
      const title = fileName.replace(/\.csv$/i, '');
      const existingInContext = folderId
        ? quizzes.filter(q => q.folderId === folderId)
        : quizzes.filter(q => !q.folderId);
      if (existingInContext.some(q => q.title.toLowerCase() === title.toLowerCase())) {
        wouldOverride = [title];
      }
    } else if (isTar) {
      const folderName = prettify(tarStem);
      const matchingFolder = folders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
      if (matchingFolder) {
        const quizzesInFolder = quizzes.filter(q => q.folderId === matchingFolder.id);
        if (quizzesInFolder.length > 0) {
          wouldOverride = quizzesInFolder.map(q => q.title);
        }
      }
    }

    if (wouldOverride.length > 0) {
      setOverrideNames(wouldOverride);
      setPendingImportPath(path);
    } else {
      await doImport(path);
    }
  };

  const doImport = async (path: string) => {
    setPendingImportPath(null);
    setOverrideNames([]);
    setImporting(true);
    setError(null);
    try {
      const result = await invoke<ImportResult>('import_pack', {
        path,
        folderId: folderId ?? null,
      });
      await refreshAll();
      if (result.folderWasCreated && result.folderId) {
        navigate(`/library/folder/${result.folderId}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    await invoke('delete_quiz', { quizId: id });
    await refreshAll();
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const folder = await invoke<Folder>('create_folder', { name: newFolderName.trim() });
    upsertFolder(folder);
    setShowNewFolder(false);
    setNewFolderName('');
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameValue.trim()) return;
    await invoke('rename_folder', { folderId: renamingFolder.id, name: renameValue.trim() });
    upsertFolder({ ...renamingFolder, name: renameValue.trim() });
    setRenamingFolder(null);
  };

  const doDeleteFolder = async (folder: Folder) => {
    await invoke('delete_folder', { folderId: folder.id });
    removeFolder(folder.id);
    await refreshAll();
    setConfirmDeleteFolder(null);
  };

  const handleDropOnFolder = async (targetFolderId: string) => {
    if (!draggedId) return;
    await invoke('move_quiz_to_folder', { quizId: draggedId, folderId: targetFolderId });
    setDraggedId(null);
    await refreshAll();
  };

  const onConfirm = useCallback(() => {
    if (historyPeekQuiz) { setHistoryPeekQuiz(null); return; }
    if (confirmDeleteQuiz) { handleDeleteQuiz(confirmDeleteQuiz.id); setConfirmDeleteQuiz(null); return; }
    const item = items[focusedIndex];
    if (!item) return;
    if (item.type === 'folder') navigate(`/library/folder/${item.data.id}`);
    else navigate(`/quiz/${item.data.id}`);
  }, [items, focusedIndex, navigate, historyPeekQuiz, confirmDeleteQuiz]);

  const onBack = useCallback(() => {
    if (historyPeekQuiz) { setHistoryPeekQuiz(null); return; }
    if (confirmDeleteQuiz) { setConfirmDeleteQuiz(null); return; }
    if (confirmDeleteFolder) { setConfirmDeleteFolder(null); return; }
    if (showQuitAppConfirm) { setShowQuitAppConfirm(false); return; }
    if (folderId) { navigate('/library'); return; }
    setShowQuitAppConfirm(true); // at library root — B prompts to quit the app
  }, [historyPeekQuiz, confirmDeleteQuiz, confirmDeleteFolder, showQuitAppConfirm, folderId, navigate]);

  const onSecondary = useCallback(() => {
    const item = items[focusedIndex];
    if (item && item.type === 'quiz') setHistoryPeekQuiz(item.data);
  }, [items, focusedIndex]);

  const onTertiary = useCallback(() => {
    const item = items[focusedIndex];
    if (!item) return;
    if (item.type === 'quiz') setConfirmDeleteQuiz(item.data);
    else setConfirmDeleteFolder(item.data);
  }, [items, focusedIndex]);

  useMenuGamepad({
    currentPage: 'library',
    onNavigatePage: (page) => navigate(`/${page}`),
    itemCount: items.length,
    focusedIndex,
    onFocusChange: setFocusedIndex,
    onConfirm,
    onBack,
    onSecondary,
    onTertiary,
    enabled: !showNewFolder && !renamingFolder && !confirmDeleteQuiz && !confirmDeleteFolder && !historyPeekQuiz && !pendingImportPath && !showQuitAppConfirm,
  });

  let runningIndex = -1;
  const focusedItem = items[focusedIndex];
  const legendItems = focusedItem?.type === 'folder'
    ? [
        { button: 'A' as const, label: 'Open Folder' },
        { button: 'B' as const, label: 'Back' },
        { button: 'X' as const, label: '—' },
        { button: 'Y' as const, label: 'Delete Folder' },
      ]
    : focusedItem?.type === 'quiz'
      ? [
          { button: 'A' as const, label: 'Take Quiz' },
          { button: 'B' as const, label: 'Back' },
          { button: 'X' as const, label: 'Last 5 Scores' },
          { button: 'Y' as const, label: 'Delete Quiz' },
        ]
      : [
          { button: 'A' as const, label: '—' },
          { button: 'B' as const, label: 'Back' },
          { button: 'X' as const, label: '—' },
          { button: 'Y' as const, label: '—' },
        ];

  return (
    <div>
      <GamepadLegend items={legendItems} top={importRowTop} />

      {folderId && currentFolder && (
        <button
          className="btn btn-secondary"
          style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => navigate('/library')}>
          ← Back to Library
        </button>
      )}

      <div ref={importRowRef} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 22 }}>
        {!folderId && (
          <button className="btn btn-secondary" onClick={() => setShowNewFolder(true)}>
            + New Folder
          </button>
        )}
        <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
          {importing ? 'Importing…' : '+ Import'}
        </button>
      </div>

      {error && (
        <div style={{ border: '1.5px solid var(--black)', borderRadius: 8, padding: '10px 14px',
          marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--grey-100)',
          whiteSpace: 'pre-wrap' }}>
          <strong>Import failed:</strong> {error}
        </div>
      )}

      {!folderId && folders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label">Folders</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {folders.map(folder => {
              runningIndex++;
              return (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  focused={runningIndex === focusedIndex}
                  onOpen={() => navigate(`/library/folder/${folder.id}`)}
                  onRename={() => { setRenamingFolder(folder); setRenameValue(folder.name); }}
                  onDelete={() => setConfirmDeleteFolder(folder)}
                  onDrop={() => handleDropOnFolder(folder.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {visibleQuizzes.length === 0 ? (
        <div className="empty-state">
          <h2>{folderId ? 'Folder is empty' : 'No quizzes yet'}</h2>
          <p>{folderId ? 'Import a pack into this folder.' : 'Import a .tar.gz pack or standalone .csv to get started.'}</p>
          <button className="btn btn-primary" onClick={handleImport}>+ Import</button>
        </div>
      ) : (
        <>
          {!folderId && <div className="section-label">Unfoldered Quizzes</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visibleQuizzes.map(quiz => {
              runningIndex++;
              return (
                <QuizCard
                  key={quiz.id}
                  quiz={quiz}
                  focused={runningIndex === focusedIndex}
                  onTake={() => navigate(`/quiz/${quiz.id}`)}
                  onHistory={() => setHistoryPeekQuiz(quiz)}
                  onDelete={() => setConfirmDeleteQuiz(quiz)}
                  onDragStart={() => setDraggedId(quiz.id)}
                  onDragEnd={() => setDraggedId(null)}
                />
              );
            })}
          </div>
        </>
      )}

      {pendingImportPath && (
        <ConfirmModal
          title="Import Notification"
          message={
            <span>
              The following {overrideNames.length === 1 ? 'quiz' : 'quizzes'} already {overrideNames.length === 1 ? 'exists' : 'exist'} and will be <strong>replaced</strong> with the newer version:
              <ul style={{ marginTop: 10, marginLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {overrideNames.map(n => <li key={n} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{n}</li>)}
              </ul>
              <br />
              Do you want to continue?
            </span>
          }
          onConfirm={() => doImport(pendingImportPath)}
          onCancel={() => { setPendingImportPath(null); setOverrideNames([]); }}
          confirmLabel="Yes, Import"
          cancelLabel="No"
        />
      )}

      {historyPeekQuiz && (
        <QuizHistoryPeek quiz={historyPeekQuiz} onClose={() => setHistoryPeekQuiz(null)} />
      )}

      {confirmDeleteQuiz && (
        <ConfirmModal
          title="Delete Quiz"
          message={<>Are you sure you want to delete <strong>{confirmDeleteQuiz.title}</strong>? This removes the quiz and all its history and cannot be undone.</>}
          onConfirm={async () => { await handleDeleteQuiz(confirmDeleteQuiz.id); setConfirmDeleteQuiz(null); }}
          onCancel={() => setConfirmDeleteQuiz(null)}
          confirmLabel="Yes, Delete"
          cancelLabel="No"
        />
      )}

      {confirmDeleteFolder && (
        <ConfirmModal
          title="Delete Folder"
          message={<>Are you sure you want to delete folder <strong>{confirmDeleteFolder.name}</strong>? Quizzes inside will move to the root library.</>}
          onConfirm={() => doDeleteFolder(confirmDeleteFolder)}
          onCancel={() => setConfirmDeleteFolder(null)}
          confirmLabel="Yes, Delete"
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

      {showNewFolder && (
        <Modal title="New Folder" onClose={() => setShowNewFolder(false)}>
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            placeholder="Folder name…"
            style={{ width: '100%', border: '1.5px solid var(--black)', borderRadius: 6,
              padding: '8px 12px', fontSize: 14, marginBottom: 16, outline: 'none' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowNewFolder(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</button>
          </div>
        </Modal>
      )}

      {renamingFolder && (
        <Modal title="Rename Folder" onClose={() => setRenamingFolder(null)}>
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRenameFolder()}
            style={{ width: '100%', border: '1.5px solid var(--black)', borderRadius: 6,
              padding: '8px 12px', fontSize: 14, marginBottom: 16, outline: 'none' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setRenamingFolder(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRenameFolder} disabled={!renameValue.trim()}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FolderCard({ folder, focused, onOpen, onRename, onDelete, onDrop }: {
  folder: Folder; focused: boolean; onOpen: () => void; onRename: () => void;
  onDelete: () => void; onDrop: () => void;
}) {
  const [dropTarget, setDropTarget] = useState(false);
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
      outline: focused ? '2px solid var(--black)' : (dropTarget ? '2px solid var(--black)' : 'none'), outlineOffset: 2 }}
      onClick={onOpen}
      onDragOver={e => { e.preventDefault(); setDropTarget(true); }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={e => { e.preventDefault(); setDropTarget(false); onDrop(); }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2 5.5A1.5 1.5 0 013.5 4h4.086a1.5 1.5 0 011.06.44l.915.914A1.5 1.5 0 0010.621 6H16.5A1.5 1.5 0 0118 7.5v7A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-9z" fill="var(--black)"/>
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{folder.name}</div>
        <div style={{ fontSize: 11, color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {folder.quizCount} {folder.quizCount === 1 ? 'quiz' : 'quizzes'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        <button className="btn btn-secondary btn-sm" onClick={onRename}>Rename</button>
        <button className="btn btn-secondary btn-sm" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function QuizCard({ quiz, focused, onTake, onHistory, onDelete, onDragStart, onDragEnd }: {
  quiz: Quiz; focused: boolean; onTake: () => void; onHistory: () => void;
  onDelete: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const date = new Date(quiz.importedAt).toLocaleDateString(undefined,
    { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="card draggable" draggable
      onDragStart={() => { setDragging(true); onDragStart(); }}
      onDragEnd={() => { setDragging(false); onDragEnd(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: dragging ? 0.4 : 1,
        outline: focused ? '2px solid var(--black)' : 'none', outlineOffset: 2 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {quiz.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--grey-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {quiz.questionCount} questions · {date}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
        <button className="btn btn-primary btn-sm" onClick={onTake}>Take Quiz</button>
        <button className="btn btn-secondary btn-sm" onClick={onHistory}>Last 5 Scores</button>
        <button className="btn btn-secondary btn-sm" onClick={onDelete}>✕</button>
      </div>
    </div>
  );
}
