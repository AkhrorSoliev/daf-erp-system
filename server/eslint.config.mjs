// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'scripts/**',
      '.agents/**',
      'src/generated/**',
      'generated/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      // Prisma queries and JSON fields routinely surface `any` typed values;
      // these rules generate noise rather than catching real bugs in this
      // codebase. Keep them as warnings so editors still surface them.
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      // Allow `_`-prefixed names for intentionally unused parameters/vars.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    // Test scaffolding is held to a different standard than shipped code.
    //
    // `require-await`: an in-memory fake of Prisma or Redis declares its
    // methods `async` to match the real signature it stands in for. Adding an
    // `await` to satisfy the rule would make the fake LESS faithful.
    //
    // `no-require-imports`: specs use `require()` to reach a module lazily,
    // after `jest.mock` has been applied — that is the point of the call.
    //
    // These are the only two relaxations. Everything else — unused variables,
    // `[object Object]` stringification, formatting — applies to specs exactly
    // as it applies to `src`, because a spec that lies is worse than no spec.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
