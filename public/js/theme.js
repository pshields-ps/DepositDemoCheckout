(function () {
  const STORAGE_KEY = 'deposit-demo-theme';
  const THEME_HREF = '/css/theme-cricket.css';

  function applyTheme(name) {
    const link = document.getElementById('theme-stylesheet');
    const select = document.getElementById('theme-select');
    const theme = name === 'classic' ? 'classic' : 'cricket';

    if (link) {
      if (theme === 'classic') {
        link.disabled = true;
      } else {
        link.disabled = false;
        link.href = THEME_HREF;
      }
    }

    if (select && select.value !== theme) {
      select.value = theme;
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      /* ignore */
    }
  }

  function init() {
    let saved = 'cricket';

    try {
      saved = localStorage.getItem(STORAGE_KEY) || 'cricket';
    } catch (err) {
      /* ignore */
    }

    applyTheme(saved);

    const select = document.getElementById('theme-select');
    if (select) {
      select.addEventListener('change', function () {
        applyTheme(select.value);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
