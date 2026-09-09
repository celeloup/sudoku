import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: String(import.meta.dirname),
      },
    },
    rules: {
      // noUncheckedIndexedAccess makes every typed-array read `number | undefined`.
      // `!` on an indexed read is the idiom here; see Global Constraints.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // The engine must stay pure: no DOM, no ambient randomness, no UI imports.
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/rng.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'The engine must not touch the DOM.' },
        { name: 'window', message: 'The engine must not touch the DOM.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG. Only rng.ts may call Math.random.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui/**', '../ui/*'], message: 'The engine must not import from the UI.' },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // The UI must go through the engine's public barrel, not its submodules
    // -- see src/engine/index.ts. This keeps the barrel the one place a
    // future refactor of the engine's internals has to stay compatible with.
    files: ['src/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/engine/*'],
              message: "Import from '../engine' (the public barrel), not an engine submodule.",
            },
          ],
        },
      ],
    },
  },
);
