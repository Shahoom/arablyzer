import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { runAction } from './run'

// The entry GitHub runs (action.yml → dist/index.mjs). The one request path: to the Arablyzer
// API named in `api_url`, with the person's key (not scan traffic, which leaves the scanner
// through the egress proxy), so the global `fetch` is handed over here and nowhere else.
process.exitCode = await runAction({
  env: process.env,
  fetcher: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  writeFile: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
})
