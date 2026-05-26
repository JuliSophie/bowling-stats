export default function ThemeScript() {
  const code = `
(function () {
  var storageKey = 'bowling-theme';

  function isTheme(value) {
    return value === 'light' || value === 'dark';
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  try {
    var savedTheme = localStorage.getItem(storageKey);
    applyTheme(isTheme(savedTheme) ? savedTheme : systemTheme());
  } catch (_) {
    applyTheme(systemTheme());
  }
})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
