import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initCapacitor } from './capacitor';
import './index.css';

// Initialize Capacitor plugins (status bar, splash screen) before first render.
// On web this is a no-op — the guard is inside initCapacitor().
initCapacitor().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
