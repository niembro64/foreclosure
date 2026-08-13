import React, { useEffect, useState } from 'react';
import Foreclosure from './screens/Foreclosure';
import NewJerseyForeclosures from './screens/NewJerseyForeclosures';
import './App.scss';

type AppView = 'connecticut' | 'new-jersey';

const viewFromHash = (): AppView =>
  window.location.hash.toLowerCase() === '#connecticut' ? 'connecticut' : 'new-jersey';

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
        <div className="mx-auto flex max-w-[1800px] flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="https://niemo.io"
            className="self-start rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600"
          >
            niemo.io
          </a>
          <div className="grid w-full grid-cols-2 rounded-lg border border-gray-700 bg-gray-900 p-1 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={() => selectView('connecticut')}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                view === 'connecticut' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Connecticut
            </button>
            <button
              type="button"
              onClick={() => selectView('new-jersey')}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                view === 'new-jersey' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
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
