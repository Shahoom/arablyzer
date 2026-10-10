import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// IndexNow (BUILD-PLAN §6.5, M2.4c): Bing and Yandex hear of the site's pages when they change.
// The key is the deployment's (ARABLYZER_INDEXNOW_KEY): `--write-key` puts its file in the build,
// where the search engines check it; `--submit` sends the sitemaps' addresses, after a deploy.
// Deploying is the owner's decision, so nothing is sent before one (M2.5). `--on-build` is the
// build's own ping (M6): when the deployment asks for it (ARABLYZER_INDEXNOW_ON_BUILD=1), has a
// key and a real domain, the build tells IndexNow of the pages that change with the content, the
// blog's and the comparisons'; a failed ping is a warning, never a failed build.

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const ENDPOINT = 'https://api.indexnow.org/indexnow'
/** IndexNow's keys: 8 to 128 of a-z, A-Z, 0-9 and "-". */
const KEY = /^[A-Za-z0-9-]{8,128}$/
/** IndexNow takes up to 10,000 addresses in one request. */
const BATCH = 10_000

export function indexNowKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.ARABLYZER_INDEXNOW_KEY?.trim() ?? ''
  if (key === '') return null
  if (!KEY.test(key)) throw new Error('ARABLYZER_INDEXNOW_KEY is 8 to 128 of a-z, A-Z, 0-9 and -')
  return key
}

/** The sections whose pages change with the content: what a build tells IndexNow of. */
export const ON_BUILD_SECTIONS: readonly string[] = ['blog', 'compare']

/**
 * Whether this build pings IndexNow: only a deployment that asked for it, with a key, for a real
 * domain. The preview domain (arablyzer.example) is never sent.
 */
export function pingsOnBuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.ARABLYZER_INDEXNOW_ON_BUILD === '1' &&
    indexNowKey(env) !== null &&
    (env.ARABLYZER_SITE ?? '') !== '' &&
    !(env.ARABLYZER_SITE ?? '').includes('arablyzer.example')
  )
}

/**
 * Every <loc> of the sitemaps the build wrote, the index's children included; `sections` keeps
 * the sitemaps of those sections alone (/sitemaps/blog.xml).
 */
export async function sitemapUrls(
  dist: string = DIST,
  sections?: readonly string[],
): Promise<string[]> {
  const locs = (xml: string) =>
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '')
  const index = await readFile(path.join(dist, 'sitemap.xml'), 'utf8')
  const urls: string[] = []
  for (const sitemap of locs(index)) {
    const section = /\/sitemaps\/([a-z-]+)\.xml$/.exec(sitemap)?.[1] ?? ''
    if (sections !== undefined && !sections.includes(section)) continue
    const file = path.join(dist, new URL(sitemap).pathname)
    urls.push(...locs(await readFile(file, 'utf8')))
  }
  return urls
}

async function submit(urls: readonly string[], key: string): Promise<boolean> {
  const host = new URL(urls[0] ?? '').host
  let ok = true
  for (let start = 0; start < urls.length; start += BATCH) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: urls.slice(start, start + BATCH),
      }),
    })
    console.log(
      `IndexNow: ${String(response.status)} for ${String(Math.min(BATCH, urls.length - start))} addresses`,
    )
    if (!response.ok) ok = false
  }
  return ok
}

async function main() {
  const { values } = parseArgs({
    options: {
      'write-key': { type: 'boolean' },
      submit: { type: 'boolean' },
      'on-build': { type: 'boolean' },
    },
  })
  const key = indexNowKey()
  if (values['write-key'] === true) {
    if (key === null) return
    await writeFile(path.join(DIST, `${key}.txt`), key)
    console.log('IndexNow: the key file is in the build')
  }
  if (values.submit === true) {
    if (key === null) throw new Error('--submit needs ARABLYZER_INDEXNOW_KEY')
    if (!(await submit(await sitemapUrls(), key))) process.exitCode = 1
  }
  if (values['on-build'] === true && key !== null && pingsOnBuild()) {
    try {
      const urls = await sitemapUrls(DIST, ON_BUILD_SECTIONS)
      if (urls.length > 0) await submit(urls, key)
    } catch (error) {
      console.warn(`IndexNow: the build's ping failed: ${String(error)}`)
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
