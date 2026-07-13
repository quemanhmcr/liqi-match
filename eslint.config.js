// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      },
    },
    ignores: [
      'node_modules/',
      '.expo/',
      'dist/',
      'coverage/',
      'ios/',
      'android/',
      'web-build/',
      'cloudflare/media-worker/',
      'supabase/functions/',
    ],
  },
]);
