export default function ThemeScript() {
  const code = `
(function () {
  try {
    var stored = localStorage.getItem('bowling-theme');
    var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'light' || stored === 'dark' ? stored : (systemDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = 'light';
  }
})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
