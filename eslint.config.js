// @ts-check
import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Design §1 and CLAUDE.md: scan traffic may only leave through @arablyzer/egress.
// Lint is a guardrail, not a sandbox; the egress tests are the real check.
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
  'ws',
  // Browsers must be launched behind the egress proxy (Phase 1), never directly.
  'playwright',
  'playwright-core',
  'puppeteer',
  'puppeteer-core',
]
const NETWORK_SUBPATHS = NETWORK_MODULES.filter((name) => !name.includes('/')).map(
  (name) => `${name}/*`,
)
// Other ways out: loading built-ins by computed name, or spawning a process such as curl.
const ESCAPE_MODULES = ['module', 'child_process']
const NETWORK_MESSAGE =
  'Network access goes through @arablyzer/egress only (docs/design/phase-0.md §1).'

/** Tests and scripts may spawn processes (e.g. the CLI under test); source code may not. */
function networkRules({ allowProcesses }) {
  const modules = allowProcesses ? NETWORK_MODULES : [...NETWORK_MODULES, ...ESCAPE_MODULES]
  return {
    'no-restricted-imports': [
      'error',
      {
        paths: modules
          .flatMap((name) => [name, `node:${name}`])
          .map((name) => ({ name, message: NETWORK_MESSAGE })),
        patterns: [{ group: [...NETWORK_SUBPATHS, '@playwright/*'], message: NETWORK_MESSAGE }],
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
      { object: 'global', property: 'fetch', message: NETWORK_MESSAGE },
      { object: 'process', property: 'getBuiltinModule', message: NETWORK_MESSAGE },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector:
          'ImportExpression > Literal[value=/^(node:)?(https?|http2|net|tls|dns|dgram|module|child_process|undici|ws|playwright|puppeteer)(\\/|-core|$)/]',
        message: NETWORK_MESSAGE,
      },
      {
        selector: 'ImportExpression[source.type!="Literal"]',
        message: 'Use a literal module name in import(), so the network ban can check it.',
      },
    ],
  }
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
  { rules: networkRules({ allowProcesses: false }) },
  { files: ['**/test/**', '**/scripts/**'], rules: networkRules({ allowProcesses: true }) },
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
