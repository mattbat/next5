import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBanner } from './components/ErrorBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { requestPersistentStorage } from './data/db';
import './styles.css';
import { applyTheme, followSystemTheme } from './theme';
import { blockZoom, trackAppHeight } from './viewport';

void requestPersistentStorage();
trackAppHeight();
blockZoom();
applyTheme();
followSystemTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
    <ErrorBanner />
  </StrictMode>,
);
