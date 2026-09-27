import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = `${root}dist/`
const rulesDir = fileURLToPath(new URL('../../rules/src/rules/', import.meta.url))

await rm(dist, { recursive: true, force: true })
await build({
  entryPoints: { arablyzer: `${root}src/main.ts` },
  outdir: dist,
  outExtension: { '.js': '.mjs' },
  // The browser code (and Playwright, which finds its own files at run time and so stays
  // external) goes to a chunk loaded only by --render; scans without it never load Playwright.
  // Lighthouse too, which reads its locales and trace engine from its own files, loads only by
  // --lab.
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  external: ['playwright-core', 'lighthouse', 'puppeteer-core'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Bundled CommonJS dependencies may call require(); an ES module has to provide one.
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __arablyzerRequire } from 'node:module';",
      'const require = __arablyzerRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'warning',
})

// @arablyzer/rules reads rules/<id>/copy.{ar,en}.md next to its code at run time.
for (const entry of await readdir(rulesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  await mkdir(`${dist}rules/${entry.name}`, { recursive: true })
  for (const lang of ['ar', 'en']) {
    const file = `${entry.name}/copy.${lang}.md`
    await copyFile(`${rulesDir}${file}`, `${dist}rules/${file}`)
  }
}
console.log(`Built ${dist}arablyzer.mjs`)
