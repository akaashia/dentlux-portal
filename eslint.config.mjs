import js from '@eslint/js';
import react from 'eslint-plugin-react';
import globals from 'globals';
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.work/**',
      '.data/**',
      'playwright-report/**',
      'test-results/**',
      'docs/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  },
  {
    ...react.configs.flat.recommended,
    files: ['frontend/**/*.jsx'],
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
];
