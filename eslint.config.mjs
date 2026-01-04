import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Allow unused vars that start with _ or are type imports
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      '@typescript-eslint/no-unused-expressions': 'warn',

      // React rules
      'react/jsx-no-leaked-render': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // New rules in react-hooks v7+ - downgrade to warn for existing code
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',

      // General rules - allow console.log for debugging
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  // Relaxed rules for test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
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
