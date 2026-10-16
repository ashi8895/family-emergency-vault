import React from 'react';
import ReactDOM from 'react-dom/client';
import './appearance'; // applies the saved colour theme and motion setting right away
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
