import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'src-tauri/**', 'node_modules/**', 'scripts/**'] },
  {
    ...js.configs.recommended,
    rules: {
      ...js.configs.recommended.rules,
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off'
    }
  },
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/test/**'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      security
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        React: 'readonly'
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    settings: {
      react: { version: '18' }
    },
    rules: {
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'no-unused-vars': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-useless-assignment': 'off'
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/test/**'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      security,
      '@typescript-eslint': tseslint.plugin
    },
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
        ...globals.node,
        React: 'readonly'
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    settings: {
      react: { version: '18' }
    },
    rules: {
      ...tseslint.configs.recommended.reduce((acc, cfg) => ({ ...acc, ...(cfg.rules || {}) }), {}),
      'no-undef': 'off', // TypeScript itself catches undefined identifiers
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-useless-assignment': 'off'
    }
  },
  {
    // Pre-existing `// @ts-nocheck` files, carried over from before ESLint
    // covered .ts/.tsx at all (Sprint 6, 2026-07-02). These were written
    // without type-checking; removing @ts-nocheck would likely surface a
    // large batch of real type errors in each, which is a separate, scoped
    // effort (tracked in ALPHONSOTOTHEMOON.md's Sprint 5/6 notes) — not
    // something to silently paper over by disabling the rule everywhere.
    // Do not add new files to this list; fix @ts-nocheck at the source
    // instead for anything new.
    files: [
      'src/App.tsx',
      'src/components/ApprovalModal.tsx',
      'src/components/ChatView.tsx',
      'src/components/ConnectorHealthPanel.tsx',
      'src/components/OllamaOfflineBanner.tsx',
      'src/components/OnboardingWizard.tsx',
      'src/components/SettingsView.tsx',
      'src/components/Sidebar.tsx',
      'src/components/WorkflowBuilderView.tsx'
    ],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  },
  {
    files: ['src/test/**/*.{js,jsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off'
    }
  }
];
