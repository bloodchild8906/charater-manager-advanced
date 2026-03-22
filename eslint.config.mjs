// @ts-check

import eslint from '@eslint/js';
import eslintPluginVitest from '@vitest/eslint-plugin';
import json from '@eslint/json';
import globals from 'globals';

export default [
  {
    name: 'base',
    ignores: ['**/node_modules/**', '**/dist/**', '**/built/**', 'package-lock.json'],
  },
  {
    name: 'eslint/recommended-with-overrides',
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
    },
  },
  {
    name: 'browser-modules',
    files: ['app/app.js', 'app/frontend/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    name: 'service-worker',
    files: ['app/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
  },
  {
    name: 'vitest/recommended',
    files: ['**/*.test.{js,ts}'],
    ignores: ['**/*.json'],
    ...eslintPluginVitest.configs['flat/recommended'],
    languageOptions: {
      globals: {
        ...eslintPluginVitest.environments.env.globals,
      },
    },
  },
  {
    name: 'json/recommended',
    plugins: { json },
    language: 'json/json',
    files: ['**/*.json'],
    rules: {
      ...json.configs.recommended.rules,
    },
  },
];
