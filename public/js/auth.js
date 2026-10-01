(function (global) {
  'use strict';

  const SESSION_KEY = 'depositDemoSession';

  function emailToCustomerId(email) {
    return email
      .trim()
      .toLowerCase()
      .replace(/@/g, '-at-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function nameFromEmail(email) {
    const local = email.split('@')[0] || 'Customer';
    const parts = local.replace(/[._-]+/g, ' ').trim().split(/\s+/);
    const firstName = parts[0] ? capitalize(parts[0]) : 'Customer';
    const lastName = parts.length > 1 ? capitalize(parts[parts.length - 1]) : 'User';
    return { firstName, lastName };
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function createSession(email) {
    const names = nameFromEmail(email);
    return {
      email: email.trim().toLowerCase(),
      merchantCustomerId: emailToCustomerId(email),
      firstName: names.firstName,
      lastName: names.lastName,
    };
  }

  function requireAuth(redirectTo) {
    const session = getSession();
    if (!session) {
      const returnPath = redirectTo || window.location.pathname;
      window.location.href = '/login.html?return=' + encodeURIComponent(returnPath);
      return null;
    }
    return session;
  }

  function initNav() {
    const session = getSession();
    const loginLink = document.getElementById('nav-login');
    const depositLink = document.getElementById('nav-deposit');
    const logoutLink = document.getElementById('nav-logout');
    const userLabel = document.getElementById('nav-user');

    if (session) {
      if (loginLink) loginLink.classList.add('hidden');
      if (logoutLink) logoutLink.classList.remove('hidden');
      if (userLabel) {
        userLabel.textContent = session.email;
        userLabel.classList.remove('hidden');
      }
      if (depositLink) depositLink.classList.remove('hidden');
    } else {
      if (loginLink) loginLink.classList.remove('hidden');
      if (logoutLink) logoutLink.classList.add('hidden');
      if (userLabel) userLabel.classList.add('hidden');
    }

    if (logoutLink) {
      logoutLink.addEventListener('click', function (e) {
        e.preventDefault();
        clearSession();
        window.location.href = '/login.html';
      });
    }
  }

  global.DepositAuth = {
    getSession,
    setSession,
    clearSession,
    createSession,
    requireAuth,
    initNav,
    emailToCustomerId,
  };
})(window);
