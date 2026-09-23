// @ts-check
import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Design §1 and CLAUDE.md: scan traffic may only leave through @arablyzer/egress.
const NETWORK_MODULES = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dns',
  'dns/promises',
  'dgram',
  'undici',
  'node-fetch',
  'axios',
  'got',
  'ky',
]
const NETWORK_MESSAGE =
  'Network access goes through @arablyzer/egress only (docs/design/phase-0.md §1).'

const networkRules = {
  'no-restricted-imports': [
    'error',
    {
      paths: NETWORK_MODULES.flatMap((name) => [name, `node:${name}`]).map((name) => ({
        name,
        message: NETWORK_MESSAGE,
      })),
    },
  ],
  'no-restricted-globals': [
    'error',
    ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
      name,
      message: NETWORK_MESSAGE,
    })),
  ],
  'no-restricted-properties': [
    'error',
    { object: 'globalThis', property: 'fetch', message: NETWORK_MESSAGE },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector:
        'ImportExpression > Literal[value=/^(node:)?(https?|http2|net|tls|dns|dgram|undici)/]',
      message: NETWORK_MESSAGE,
    },
  ],
}

export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', '**/.turbo/']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },
  { rules: networkRules },
  {
    // The egress package is the network boundary; the fixture server is local test infrastructure.
    files: ['packages/egress/**', 'fixtures/**'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
)
