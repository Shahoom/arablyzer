import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { INTEGRATIONS_UI } from '@arablyzer/i18n/integrations'
import { build } from 'esbuild'
import { markPng } from './icons'
import { zip, type ZipEntry } from './zip'

// `pnpm ext:build`: the extension as Chrome loads it (dist/, for "Load unpacked") and as the
// Chrome Web Store takes it (a zip of dist/). Two scripts are bundled from src/; everything else
// is copied or made here. Nothing is minified, and nothing is fetched at run time (MV3).

const root = fileURLToPath(new URL('../', import.meta.url))
const SIZES = [16, 32, 48, 128] as const

export async function buildExtension(out: string): Promise<{ version: string; files: string[] }> {
  const pkg = JSON.parse(await readFile(`${root}package.json`, 'utf8')) as { version: string }
  await rm(out, { recursive: true, force: true })
  await mkdir(`${out}/icons`, { recursive: true })

  await build({
    entryPoints: { popup: `${root}src/popup.ts`, options: `${root}src/options.ts` },
    outdir: out,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome114',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
  })

  const manifest = JSON.parse(await readFile(`${root}static/manifest.json`, 'utf8')) as Record<
    string,
    unknown
  >
  await writeFile(
    `${out}/manifest.json`,
    `${JSON.stringify({ ...manifest, version: pkg.version }, null, 2)}\n`,
  )
  for (const file of ['popup.html', 'options.html', 'ui.css']) {
    await writeFile(`${out}/${file}`, await readFile(`${root}static/${file}`))
  }
  for (const size of SIZES) await writeFile(`${out}/icons/icon-${String(size)}.png`, markPng(size))
  // The store listing's name and description, in both languages, from the one source of strings.
  for (const lang of ['ar', 'en'] as const) {
    const { name, description } = INTEGRATIONS_UI[lang].extension
    await mkdir(`${out}/_locales/${lang}`, { recursive: true })
    await writeFile(
      `${out}/_locales/${lang}/messages.json`,
      `${JSON.stringify({ extName: { message: name }, extDescription: { message: description } }, null, 2)}\n`,
    )
  }
  return { version: pkg.version, files: await listFiles(out) }
}

async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const names: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory())
      names.push(...(await listFiles(`${dir}/${entry.name}`, `${prefix}${entry.name}/`)))
    else names.push(`${prefix}${entry.name}`)
  }
  return names.sort()
}

export async function zipExtension(out: string, files: readonly string[]): Promise<Buffer> {
  const entries: ZipEntry[] = []
  for (const name of files) entries.push({ name, data: await readFile(`${out}/${name}`) })
  return zip(entries)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = `${root}dist`
  const { version, files } = await buildExtension(out)
  const archive = `${root}arablyzer-chrome-extension-${version}.zip`
  await writeFile(archive, await zipExtension(out, files))
  console.log(`Built ${out} (${String(files.length)} files) and ${archive}`)
}
