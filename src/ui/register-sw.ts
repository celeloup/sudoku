/**
 * Registers the service worker that makes the app installable and offline-capable.
 *
 * The URL is relative for the same reason `base` is './' in vite.config.ts: GitHub
 * Pages serves this from a repo subpath, and a root-absolute URL would both 404 and
 * ask for a scope the site does not own. It resolves against the document, and both
 * HTML entries sit beside sw.js at the site root, so the scope is the whole app.
 */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js');
  });
}
