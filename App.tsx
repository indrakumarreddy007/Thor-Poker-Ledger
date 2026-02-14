
import React, { useState, useEffect } from 'react';
import { User } from './types';
import Login from './views/Login';
import Home from './views/Home';
import SessionAdmin from './views/SessionAdmin';
import SessionPlayer from './views/SessionPlayer';
import Settlement from './views/Settlement';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentRoute, setCurrentRoute] = useState<string>('home');
  const [routeParams, setRouteParams] = useState<any>(null);

  useEffect(() => {
    // Determine active user from local storage (simple auth persistence)
    const storedUser = localStorage.getItem('poker_ledger_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const [path, param] = hash.split('/');
      setCurrentRoute(path || 'home');
      setRouteParams(param);
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogin = (u: User) => {
    localStorage.setItem('poker_ledger_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('poker_ledger_user');
    setUser(null);
    window.location.hash = '';
  };

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const renderRoute = () => {
    switch (currentRoute) {
      case 'home':
        return <Home user={user} onLogout={handleLogout} navigate={navigate} />;
      case 'admin':
        return <SessionAdmin user={user} sessionCode={routeParams} navigate={navigate} />;
      case 'player':
        return <SessionPlayer user={user} sessionCode={routeParams} navigate={navigate} />;
      case 'settlement':
        return <Settlement user={user} sessionId={routeParams} navigate={navigate} />;
      case 'join':
        return <Home user={user} onLogout={handleLogout} navigate={navigate} initialCode={routeParams} />;
      default:
        return <Home user={user} onLogout={handleLogout} navigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 overflow-x-hidden">
      <nav className="border-b border-slate-800 px-4 py-3 flex justify-between items-center sticky top-0 bg-slate-950 z-50">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate('home')}
        >
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-slate-950 font-bold">
            ♠
          </div>
          <span className="font-bold text-xl tracking-tight">Ledger</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm hidden sm:inline">Hi, {user.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <ErrorBoundary>
          {renderRoute()}
        </ErrorBoundary>
      </main>
    </div>
  );
}
