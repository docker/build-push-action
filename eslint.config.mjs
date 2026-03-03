import {defineConfig} from 'eslint/config';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import eslintPluginPrettier from 'eslint-plugin-prettier';

export default defineConfig([
  {
    ignores: ['.yarn/**/*', 'coverage/**/*', 'dist/**/*']
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['__tests__/**'],
    ...vitest.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.node,
        ...vitest.environments.env.globals
      }
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-conditional-expect': 'error',
      'vitest/no-disabled-tests': 0
    }
  },
  {
    plugins: {
      prettier: eslintPluginPrettier
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-require-imports': [
        'error',
        {
          allowAsImport: true
        }
      ]
    }
  }
]);
