import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'data/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['lib/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default config;
