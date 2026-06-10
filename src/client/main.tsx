import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/AppContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import App from './App.js';
import AuthGate from './components/AuthGate.js';
import { getRouterBasename } from './auth.js';
import './index.css';

function bootstrap() {
  const app = (
    <BrowserRouter basename={getRouterBasename()}>
      <ThemeProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </ThemeProvider>
    </BrowserRouter>
  );

  const rootNode = <AuthGate>{app}</AuthGate>;

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>{rootNode}</React.StrictMode>,
  );
}

bootstrap();
