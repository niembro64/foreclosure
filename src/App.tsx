import React from 'react';
import Foreclosure from './screens/Foreclosure';
import './App.scss';

const App: React.FC = () => {
  return (
    <div className="App flex min-h-screen flex-col">
      <Foreclosure />
    </div>
  );
};

export default App;
