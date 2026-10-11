import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// The Action runs this one file: GitHub does not install anything for it. Not minified, so a
// change to it reads as a change to the code; CI rebuilds it and fails if it differs from the commit.
const root = fileURLToPath(new URL('../', import.meta.url))
await rm(`${root}dist`, { recursive: true, force: true })
await build({
  entryPoints: [`${root}src/main.ts`],
  outfile: `${root}dist/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
})
console.log(`Built ${root}dist/index.mjs`)
