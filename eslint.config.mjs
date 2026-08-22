import nx from '@nx/eslint-plugin';

// Root ESLint flat config — enforces the layered, cycle-free dependency DAG
// described in docs/10-shared-packages-and-boundaries.md. Every project's
// package.json "nx.tags" is checked against these constraints on every
// `nx lint` / `nx affected -t lint` run (wired into CI, see
// docs/deployment/02-cicd.md), so a circular or cross-boundary import can
// never reach `main` or a deploy.
export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/vite.config.*.timestamp*', '**/node_modules'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:backend',
              onlyDependOnLibsWithTags: ['scope:backend', 'scope:shared'],
              notDependOnLibsWithTags: ['scope:frontend'],
            },
            {
              sourceTag: 'scope:frontend',
              onlyDependOnLibsWithTags: ['scope:frontend', 'scope:shared'],
              notDependOnLibsWithTags: ['scope:backend'],
            },
            {
              sourceTag: 'type:feature',
              notDependOnLibsWithTags: ['type:feature'],
            },
            {
              sourceTag: 'type:infra',
              onlyDependOnLibsWithTags: ['scope:shared', 'type:infra'],
            },
            {
              sourceTag: 'scope:app',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:backend',
                'scope:frontend',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message:
                'Use an @eos/* package import instead of reaching across project boundaries with a relative path (docs/10).',
            },
          ],
        },
      ],
    },
  },
];
