import './polyfills.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { installGlobalErrorReporting } from './utils/reportError.js';

installGlobalErrorReporting();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary label="YardObs hit an unexpected error." reload>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
