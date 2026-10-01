(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const errorAlert = document.getElementById('error-alert');

  if (DepositAuth.getSession()) {
    window.location.href = '/deposit.html';
    return;
  }

  DepositAuth.initNav();

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email) {
      errorAlert.textContent = 'Please enter your email address.';
      errorAlert.classList.remove('hidden');
      return;
    }

    if (!password) {
      errorAlert.textContent = 'Please enter a password.';
      errorAlert.classList.remove('hidden');
      return;
    }

    const session = DepositAuth.createSession(email);
    DepositAuth.setSession(session);

    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('return') || '/deposit.html';
    window.location.href = returnTo;
  });
})();
