import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  // Relative, not '/sudoku/'. GitHub Pages serves a project site from a subpath,
  // so root-absolute asset URLs 404 there. Relative paths work at any subpath,
  // which keeps the build independent of the repo name and of where it is served.
  base: './',
  // Two entries, not a router: GitHub Pages has no rewrite rules, so a
  // history route would need the 404.html trick to survive a reload.
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input: { main: 'src/index.html', print: 'src/print.html' } },
  },
});
