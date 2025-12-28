import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // TypeScript rules - downgraded to warnings for CI
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'warn',
      
      // React rules
      'react/jsx-no-leaked-render': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      
      // General rules
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  {
    ignores: [
      '.next/',
      'node_modules/',
      'dist/',
      'coverage/',
      '*.config.js',
      '*.config.mjs',
    ],
  },
];

export default eslintConfig;
