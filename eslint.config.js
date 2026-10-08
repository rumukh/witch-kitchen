import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'node_modules/**', 'vendor/**', 'test-results/**', 'assets/**', 'tools/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { window: 'readonly', document: 'readonly', console: 'readonly', process: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', URL: 'readonly', fetch: 'readonly', performance: 'readonly', structuredClone: 'readonly', require: 'readonly', __dirname: 'readonly', Response: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
