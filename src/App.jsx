import React from 'react';
import InvoiceCreation from './pages/InvoiceCreation.jsx';
import logo from './facturefacile_logo.png';
import './styles/app.css';

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#accueil" aria-label="Smoothfacture — accueil">
            <span className="brand-mark"><img src={logo} alt="Facture Facile" /></span>
          </a>

          <div className="artisan-profile" aria-label="Compte de Gérard Courbot">
            <span className="profile-avatar">GC</span>
            <span className="profile-copy"><strong>Gérard Courbot</strong><small>Artisan</small></span>
          </div>
        </div>
      </header>

      <main id="accueil"><InvoiceCreation /></main>

      <footer className="site-footer">
        <span>smoothfacture</span>
        <span>Vos documents professionnels, simplement.</span>
      </footer>
    </div>
  );
}

export default App;
