import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorConfiguracion } from './app/ErrorConfiguracion';
import { entorno } from './lib/entorno';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {entorno.errorConfiguracion ? <ErrorConfiguracion mensaje={entorno.errorConfiguracion} /> : <App />}
  </StrictMode>,
);
