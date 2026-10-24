import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css'; 
import './styles/breed-info.css';
import { App } from './App';
import { registerServiceWorker } from './lib/swRegister';

const root = document.getElementById('root');
if (!root) throw new Error('#root fehlt in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline-Start und Push nur im Produktions-Build (im Entwicklungsserver würde der Cache stören)
if (import.meta.env.PROD) registerServiceWorker();
