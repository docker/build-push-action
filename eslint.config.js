/* eslint-disable @typescript-eslint/no-require-imports */
const {defineConfig, globalIgnores} = require('eslint/config');
const {fixupConfigRules, fixupPluginRules} = require('@eslint/compat');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const vitestPlugin = require('@vitest/eslint-plugin');
const prettier = require('eslint-plugin-prettier');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const js = require('@eslint/js');
const {FlatCompat} = require('@eslint/eslintrc');

// __dirname and __filename exist natively in CommonJS
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

module.exports = defineConfig([
  globalIgnores(['dist/**/*', 'coverage/**/*', 'node_modules/**/*']),
  {
    // prettier-ignore
    extends: fixupConfigRules(
      compat.extends(
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@vitest/legacy-recommended',
        'plugin:prettier/recommended'
      )
    ),

    plugins: {
      '@typescript-eslint': fixupPluginRules(typescriptEslint),
      '@vitest': fixupPluginRules(vitestPlugin),
      prettier: fixupPluginRules(prettier)
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...vitestPlugin.environments.env.globals
      },
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },

    rules: {
      '@typescript-eslint/no-require-imports': [
        'error',
        {
          allowAsImport: true
        }
      ]
    }
  }
]);
