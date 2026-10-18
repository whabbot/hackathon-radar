import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

const supabaseImport = {
  group: ['@supabase/supabase-js'],
  message: 'Only src/db.ts may import @supabase/supabase-js.',
}

const dbImport = {
  group: ['./db', './db.ts', './db.js'],
  message: 'Only src/session.ts and src/review.ts may import db.ts.',
}

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [supabaseImport, dbImport] }],
    },
  },
  {
    files: ['src/db.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['src/session.ts', 'src/review.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [supabaseImport] }],
    },
  },
  {
    files: ['src/main.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            supabaseImport,
            dbImport,
            {
              group: ['**/db', '**/db.ts'],
              message: 'main.tsx may import session.ts, review.ts, and domain.ts.',
            },
          ],
        },
      ],
    },
  },
)
