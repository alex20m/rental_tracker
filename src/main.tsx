import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

declare const __SINGLE__: boolean;

// Preview build only: show sample data so the screens aren't empty.
if (__SINGLE__) {
  const { useDemo } = await import('./demoGate');
  useDemo();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support. Skipped in the single-file preview build (no real origin to scope a worker to).
if ('serviceWorker' in navigator && !__SINGLE__ && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
