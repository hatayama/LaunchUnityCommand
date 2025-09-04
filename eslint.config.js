// @ts-check
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    },
  },
  eslintConfigPrettier,
];


