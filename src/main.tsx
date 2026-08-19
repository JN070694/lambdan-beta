import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ExpandedViewer from './components/quiz/ExpandedViewer';
import './index.css';

// A new window opened via openExpandedViewer() loads this same entry file
// with ?expand=... attached — detect that here and render just the minimal
// standalone viewer instead of the full routed app.
const isExpandedWindow = new URLSearchParams(window.location.search).has('expand');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isExpandedWindow ? <ExpandedViewer /> : <App />}
  </React.StrictMode>
);
