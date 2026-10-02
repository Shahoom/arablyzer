// @ts-check
import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import astro from 'eslint-plugin-astro'
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
  // Lighthouse and its launcher open a browser and its debugging connection.
  'lighthouse',
  'chrome-launcher',
]
const NETWORK_SUBPATHS = NETWORK_MODULES.filter((name) => !name.includes('/')).map(
  (name) => `${name}/*`,
)
// Other ways out: loading built-ins by computed name, or spawning a process such as curl.
const ESCAPE_MODULES = ['module', 'child_process']
const NETWORK_MESSAGE =
  'Network access goes through @arablyzer/egress only (docs/design/phase-0.md §1).'

/**
 * Tests and scripts may spawn processes (e.g. the CLI under test); source code may not. `allow`
 * lifts the ban on named modules for one package, and only on those.
 */
function networkRules({ allowProcesses, allow = [] }) {
  const modules = (
    allowProcesses ? NETWORK_MODULES : [...NETWORK_MODULES, ...ESCAPE_MODULES]
  ).filter((name) => !allow.includes(name))
  const subpaths = NETWORK_SUBPATHS.filter((pattern) => !allow.includes(pattern.slice(0, -2)))
  return {
    'no-restricted-imports': [
      'error',
      {
        paths: modules
          .flatMap((name) => [name, `node:${name}`])
          .map((name) => ({ name, message: NETWORK_MESSAGE })),
        patterns: [{ group: [...subpaths, '@playwright/*'], message: NETWORK_MESSAGE }],
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
  // The golden pages are fixtures the scanner reads, not code of Arablyzer's.
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/.turbo/',
    '**/.astro/',
    'fixtures/golden/',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  // .astro files: their front matter runs in Node at build time, their scripts in the browser.
  // The network ban below covers them; typed rules need a program they are not part of.
  astro.configs.recommended,
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
  { files: ['**/*.astro', '**/*.astro/*.ts'], extends: [tseslint.configs.disableTypeChecked] },
  { rules: networkRules({ allowProcesses: false }) },
  { files: ['**/test/**', '**/scripts/**'], rules: networkRules({ allowProcesses: true }) },
  {
    // Phase 1: browsers are launched here and nowhere else, always behind the egress proxy
    // (docs/design/plans/m1.1-browser.md §3); the browser SSRF suite checks that they stay there.
    files: ['packages/browser/src/**'],
    rules: networkRules({ allowProcesses: false, allow: ['playwright-core'] }),
  },
  {
    // That suite serves hostile pages and traps local services, so its tests open sockets.
    files: ['packages/browser/test/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // M1.3b: Lighthouse's Chromium is launched here, by puppeteer-core, behind the egress proxy
    // with the render's flags; Playwright only says where its Chromium is.
    files: ['packages/lab/src/**'],
    rules: networkRules({
      allowProcesses: false,
      allow: ['playwright-core', 'puppeteer-core', 'lighthouse'],
    }),
  },
  {
    // Its tests serve pages and a service the policy refuses, so they open sockets.
    files: ['packages/lab/test/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // The site's pages run in the visitor's browser (M2.1).
    files: ['apps/web/src/islands/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The scan form's one request, to Arablyzer's own API on the same origin: not scan traffic,
    // which leaves the server through the egress proxy alone (M2.1 plan §2). fetch alone.
    files: ['apps/web/src/islands/api.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
          name,
          message: NETWORK_MESSAGE,
        })),
      ],
    },
  },
  {
    // The report page follows its scan's events from Arablyzer's own API (M2.1 plan §5): the
    // browser's EventSource, and nothing else.
    files: ['apps/web/src/islands/events.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket'].map((name) => ({
          name,
          message: NETWORK_MESSAGE,
        })),
      ],
    },
  },
  {
    // The worker's one request, to the scanner, on the network the two share alone (M2.1 plan
    // §5b): not scan traffic, which leaves the scanner through the egress proxy. fetch alone.
    files: ['packages/scanner-client/src/client.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
          name,
          message: NETWORK_MESSAGE,
        })),
      ],
    },
  },
  {
    // IndexNow's one endpoint, asked from the machine that deployed the site, after a deploy
    // (M2.4c): not scan traffic, which leaves the scanner through the egress proxy. fetch alone.
    files: ['apps/web/scripts/indexnow.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
          name,
          message: NETWORK_MESSAGE,
        })),
      ],
    },
  },
  {
    // The stack's end-to-end test asks the stack itself, on the host's port, as a visitor does
    // (M2.1 plan §5b), and runs commands in its containers; so do the checks it shares with the
    // post-deploy script, and the script.
    files: ['infra/test/**', 'infra/checks/**', 'infra/verify-deploy.ts'],
    rules: {
      ...networkRules({ allowProcesses: true }),
      'no-restricted-globals': [
        'error',
        ...['XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
          name,
          message: NETWORK_MESSAGE,
        })),
      ],
    },
  },
  {
    // The site's Lighthouse run in CI, on its own pages on loopback (M2.1 plan §3).
    files: ['apps/web/scripts/lighthouse.ts'],
    rules: networkRules({ allowProcesses: true, allow: ['lighthouse', 'chrome-launcher'] }),
  },
  {
    // The knowledge hub and the content pages driven in the browsers (M2.6 R5): the site's own
    // pages on loopback, and every request off the site refused.
    files: ['apps/web/test/browser/knowledge.browser.test.ts'],
    rules: networkRules({ allowProcesses: true, allow: ['playwright-core'] }),
  },
  {
    // The site's Open Graph images, drawn by Chromium at build (M2.4c): the card's own HTML,
    // inline fonts, and every request refused.
    files: ['apps/web/scripts/og-images.ts'],
    rules: networkRules({ allowProcesses: true, allow: ['playwright-core'] }),
  },
  {
    // A tool page driven in the browsers as a visitor uses it (M2.2a review): the site's own
    // pages on loopback, the API's answers the test's, and every request off the site refused.
    files: ['apps/web/test/browser/tool.browser.test.ts'],
    rules: networkRules({ allowProcesses: true, allow: ['playwright-core'] }),
  },
  {
    // The tools' directory and the tool pages' own parts driven in the browsers (M2.6 R3), and the
    // heads of the pages and the contrast of their text as one system (R6): the site's own pages
    // on loopback, and every request off the site refused.
    files: [
      'apps/web/test/browser/directory.browser.test.ts',
      'apps/web/test/browser/tool-page.browser.test.ts',
      'apps/web/test/browser/heads.browser.test.ts',
      'apps/web/test/browser/contrast.browser.test.ts',
    ],
    rules: networkRules({ allowProcesses: true, allow: ['playwright-core'] }),
  },
  {
    // The generators and the paste tool driven in the browsers (M2.3b): the site's own pages on
    // loopback, and every request off the site refused.
    files: ['apps/web/test/browser/generators.browser.test.ts'],
    rules: networkRules({ allowProcesses: true, allow: ['playwright-core'] }),
  },
  {
    // The report page drawn in the browsers (M2.6 R4): the site's own pages on loopback, the API's
    // answers the test's, and every request off the site refused.
    files: ['apps/web/test/browser/report-layout.browser.test.ts'],
    rules: networkRules({ allowProcesses: true, allow: ['playwright-core'] }),
  },
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
