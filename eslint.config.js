// ESLint (ADR-010). SEC-16: sin HTML crudo, eval ni `javascript:`; `target=_blank` con noreferrer.
// SEC-17: sin console.* salvo warn/error (y estos sin objetos de sesión, ficha ni respuestas de RPC).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

const HTML_CRUDO = 'SEC-16: no se escribe HTML crudo; React escapa el texto.';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'dist-*/',
      'coverage/',
      'node_modules/',
      'public/',
      'spikes/',
      'spike-s02/',
      '.pages-spike/',
      '.aidlc/',
      '.claude/',
      'playwright-report/',
      'test-results/',
      'supabase/functions/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    ...react.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
  },
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['tests/**/*.{ts,tsx,js,mjs}', 'scripts/**/*.{js,mjs,ts}', '*.config.{js,ts,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      // SEC-16
      'react/no-danger': 'error',
      'react/jsx-no-script-url': 'error',
      'react/jsx-no-target-blank': ['error', { enforceDynamicLinks: 'always' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-syntax': [
        'error',
        // Leer innerHTML en una prueba es inocuo; asignarlo no.
        {
          selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
          message: HTML_CRUDO,
        },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: HTML_CRUDO },
        { selector: "CallExpression[callee.property.name=/^(write|writeln)$/][callee.object.name='document']", message: HTML_CRUDO },
        { selector: "CallExpression[callee.property.name='createContextualFragment']", message: HTML_CRUDO },
      ],
    },
  },
  {
    // SEC-17: el código que corre en el navegador.
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] },
  },
  {
    // Scripts de CLI y ayudas de prueba: escriben por consola y limpian secuencias ANSI.
    files: ['tests/**/*.{ts,tsx,js,mjs}', 'scripts/**/*.{js,mjs,ts}'],
    rules: { 'no-control-regex': 'off' },
  },
);
