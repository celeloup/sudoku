import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  // Relative, not '/sudoku/'. GitHub Pages serves a project site from a subpath,
  // so root-absolute asset URLs 404 there. Relative paths work at any subpath,
  // which keeps the build independent of the repo name and of where it is served.
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
});
