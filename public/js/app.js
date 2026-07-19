/* global window, document, Auth, api, Chart */
(function () {
  'use strict';

  // ==========================================================================
  // Helpers
  // ==========================================================================
  const money = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
  const dateTime = (d) => (d ? new Date(d).toLocaleString('en-IN') : '-');
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (name) => (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const debounce = (fn, ms) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };

  function toast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.remove();
  }

  function openModal({ title, bodyHtml, footerHtml, wide = false }) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalOverlay';
    overlay.innerHTML = `
      <div class="modal ${wide ? 'modal-wide' : ''}">
        <div class="modal-header">
          <h3>${esc(title)}</h3>
          <button class="modal-close" data-close-modal>&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.hasAttribute('data-close-modal')) closeModal();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function statusBadge(status) {
    return `<span class="badge badge-${esc(status)}">${esc(status)}</span>`;
  }
  function riskBadge(risk) {
    return `<span class="badge badge-${esc(risk)}">${esc(risk)} Risk</span>`;
  }

  // ==========================================================================
  // Router
  // ==========================================================================
  const routes = {
    dashboard: { label: 'Dashboard', icon: '📊', render: () => window.pages.renderDashboard() },
    customers: { label: 'Customers', icon: '👥', render: () => window.pages.renderCustomers() },
    invoices: { label: 'Invoices', icon: '🧾', render: () => window.pages.renderInvoices() },
    payments: { label: 'Payments', icon: '💳', render: () => window.pages.renderPayments() },
    analytics: { label: 'Analytics', icon: '📈', render: () => window.pages.renderAnalytics() },
    activity: { label: 'Activity Logs', icon: '🕒', render: () => window.pages.renderActivity() },
  };

  function currentRoute() {
    const hash = window.location.hash.replace('#/', '') || 'dashboard';
    return routes[hash] ? hash : 'dashboard';
  }

  function navigate(route) {
    window.location.hash = `#/${route}`;
  }

  window.addEventListener('hashchange', () => {
    if (!Auth.isLoggedIn()) return renderLogin();
    renderApp();
  });

  window.addEventListener('auth:expired', () => {
    toast('Your session expired. Please log in again.', 'error');
    renderLogin();
  });

  // ==========================================================================
  // Boot
  // ==========================================================================
  function boot() {
    if (Auth.isLoggedIn()) {
      renderApp();
    } else {
      renderLogin();
    }
  }

  // ==========================================================================
  // Login / Register screen
  // ==========================================================================
  function renderLogin(mode = 'login') {
    const root = document.getElementById('root');
    root.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-brand">
            <div class="brand-mark">IP</div>
            <div class="brand-name" style="color:var(--color-text);font-family:var(--font-display);font-weight:700;font-size:17px;">InvoicePro</div>
          </div>
          <div class="login-title">${mode === 'login' ? 'Welcome back' : 'Create admin account'}</div>
          <div class="login-sub">${mode === 'login' ? 'Sign in to manage your billing.' : 'Set up the first admin account for this workspace.'}</div>
          <div id="authMessage"></div>
          <form id="authForm">
            ${mode === 'register' ? `
              <div class="field"><label>Full Name</label><input type="text" name="name" required /></div>
            ` : ''}
            <div class="field"><label>Email</label><input type="email" name="email" required /></div>
            <div class="field"><label>Password</label><input type="password" name="password" required minlength="6" /></div>
            <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:6px;" id="authSubmitBtn">
              ${mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <div class="login-toggle">
            ${mode === 'login'
              ? `First time here? <a id="toggleMode">Register the admin account</a>`
              : `Already have an account? <a id="toggleMode">Sign in</a>`}
          </div>
        </div>
      </div>
    `;

    document.getElementById('toggleMode').addEventListener('click', () => renderLogin(mode === 'login' ? 'register' : 'login'));

    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = document.getElementById('authSubmitBtn');
      const msgEl = document.getElementById('authMessage');
      msgEl.innerHTML = '';
      btn.disabled = true;
      btn.textContent = mode === 'login' ? 'Signing in...' : 'Creating...';

      const payload = {
        email: form.email.value.trim(),
        password: form.password.value,
      };
      if (mode === 'register') payload.name = form.name.value.trim();

      try {
        const json = await api(`/api/auth/${mode}`, { method: 'POST', body: payload });
        Auth.setToken(json.data.token);
        Auth.setUser(json.data.user);
        toast(mode === 'login' ? 'Welcome back!' : 'Admin account created', 'success');
        navigate('dashboard');
        renderApp();
      } catch (err) {
        msgEl.innerHTML = `<div class="form-message error">${esc(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
      }
    });
  }

  // ==========================================================================
  // App shell (sidebar + topbar + routed page content)
  // ==========================================================================
  function renderApp() {
    const route = currentRoute();
    const user = Auth.getUser() || { name: 'Admin' };
    const root = document.getElementById('root');

    root.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar" id="sidebar">
          <div class="brand">
            <div class="brand-mark">IP</div>
            <div>
              <div class="brand-name">InvoicePro</div>
              <div class="brand-sub">Billing Suite</div>
            </div>
          </div>
          <ul class="nav-list">
            ${Object.entries(routes).map(([key, r]) => `
              <li class="nav-item ${key === route ? 'active' : ''}" data-route="${key}">
                <span class="nav-icon">${r.icon}</span> ${r.label}
              </li>
            `).join('')}
          </ul>
          <div class="sidebar-footer">Signed in as<br/><strong style="color:#fff;">${esc(user.name)}</strong></div>
        </aside>

        <div class="main-area">
          <div class="topbar">
            <div>
              <h1>${routes[route].label}</h1>
              <div class="topbar-sub" id="topbarSub"></div>
            </div>
            <div class="topbar-right">
              <div class="user-chip">
                <div class="user-avatar">${esc(initials(user.name))}</div>
                <span>${esc(user.name)}</span>
              </div>
              <button class="btn btn-outline btn-sm" id="logoutBtn">Log out</button>
            </div>
          </div>
          <div class="page-content" id="pageContent">
            <div class="loading-row">Loading...</div>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('.nav-item').forEach((el) => {
      el.addEventListener('click', () => navigate(el.getAttribute('data-route')));
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
      Auth.logoutLocal();
      renderLogin();
    });

    routes[route].render();
  }

  window.appHelpers = { money, shortDate, dateTime, esc, initials, debounce, toast, openModal, closeModal, statusBadge, riskBadge, navigate, api, Auth };
  window.renderLogin = renderLogin;
  window.renderApp = renderApp;

  document.addEventListener('DOMContentLoaded', boot);
})();
