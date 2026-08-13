import React, { useEffect, useState } from 'react';
import Foreclosure from './screens/Foreclosure';
import NewJerseyForeclosures from './screens/NewJerseyForeclosures';
import './App.scss';

type AppView = 'connecticut' | 'new-jersey';

const viewFromHash = (): AppView =>
  window.location.hash.toLowerCase() === '#new-jersey' ? 'new-jersey' : 'connecticut';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(viewFromHash);

  useEffect(() => {
    const handleHashChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const selectView = (nextView: AppView) => {
    window.location.hash = nextView;
    setView(nextView);
  };

  return (
    <div className="App min-h-screen bg-gray-900">
      <nav className="sticky top-0 z-50 border-b border-gray-700 bg-gray-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <a href="https://games.niemo.io" className="font-semibold text-blue-300 hover:text-blue-200">
            games.niemo.io
          </a>
          <div className="flex rounded-lg border border-gray-700 bg-gray-900 p-1">
            <button
              type="button"
              onClick={() => selectView('connecticut')}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                view === 'connecticut' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Connecticut
            </button>
            <button
              type="button"
              onClick={() => selectView('new-jersey')}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                view === 'new-jersey' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              New Jersey
            </button>
          </div>
        </div>
      </nav>
      {view === 'connecticut' ? <Foreclosure /> : <NewJerseyForeclosures />}
    </div>
  );
};

export default App;
