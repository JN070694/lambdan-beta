import { NavLink, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import Logo from './Logo';

function CenterTitle() {
  const { session, folders } = useStore();
  const location = useLocation();
  const params = useParams<{ folderId?: string }>();

  if (session.quiz && !session.finished) {
    return (
      <div className="topbar-center">
        <span style={{ color: 'var(--grey-500)', fontWeight: 400 }}>{session.currentIndex + 1} / {session.questions.length} · </span>
        {session.quiz.title}
      </div>
    );
  }

  if (params.folderId) {
    const folder = folders.find(f => f.id === params.folderId);
    return <div className="topbar-center">{folder?.name ?? 'Folder'}</div>;
  }

  const titles: Record<string, string> = {
    '/library': 'Quiz Library',
    '/history': 'History',
    '/settings': 'Settings',
  };
  const base = '/' + location.pathname.split('/')[1];
  return <div className="topbar-center">{titles[base] ?? ''}</div>;
}

export default function TopBar() {
  const { session } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const inQuiz = !!session.quiz && !session.finished;

  const pages: { path: string; label: string }[] = [
    { path: '/library', label: 'Library' },
    { path: '/history', label: 'History' },
    { path: '/settings', label: 'Settings' },
  ];

  const activeBase = '/' + location.pathname.split('/')[1];
  const activeIdx = pages.findIndex(p => p.path === activeBase);

  const goRelative = (dir: -1 | 1) => {
    const idx = activeIdx === -1 ? 0 : activeIdx;
    const next = Math.max(0, Math.min(pages.length - 1, idx + dir));
    if (next !== idx) navigate(pages[next].path);
  };

  return (
    <header className="topbar">
      <NavLink to="/library" className="topbar-logo" aria-label="Home">
        <Logo size={44} />
        <span>LAMBDAn</span>
      </NavLink>
      <CenterTitle />
      {inQuiz ? (
        <div style={{ justifySelf: 'end' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
          <button
            onClick={() => goRelative(-1)}
            title="LT — previous page"
            style={{
              background: 'var(--inverse-bg)', color: 'var(--inverse-fg)', border: 'none', borderRadius: 4,
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              padding: '3px 7px', cursor: 'pointer', flexShrink: 0,
            }}>
            LT
          </button>

          <nav className="topbar-nav">
            <NavLink to="/library" className={({ isActive }) => isActive ? 'active' : ''}>Library</NavLink>
            <NavLink to="/history" className={({ isActive }) => isActive ? 'active' : ''}>History</NavLink>
            <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>Settings</NavLink>
          </nav>

          <button
            onClick={() => goRelative(1)}
            title="RT — next page"
            style={{
              background: 'var(--inverse-bg)', color: 'var(--inverse-fg)', border: 'none', borderRadius: 4,
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              padding: '3px 7px', cursor: 'pointer', flexShrink: 0,
            }}>
            RT
          </button>
        </div>
      )}
    </header>
  );
}
