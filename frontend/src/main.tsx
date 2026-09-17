import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Aturan lintas-menu #1: scroll wheel pada input angka dinonaktifkan global
document.addEventListener(
  'wheel',
  (e) => {
    const t = e.target as HTMLElement;
    if (t && t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'number' && document.activeElement === t) {
      (t as HTMLInputElement).blur();
    }
  },
  { passive: true }
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
