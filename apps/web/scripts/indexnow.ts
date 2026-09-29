import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// IndexNow (BUILD-PLAN §6.5, M2.4c): Bing and Yandex hear of the site's pages when they change.
// The key is the deployment's (ARABLYZER_INDEXNOW_KEY): `--write-key` puts its file in the build,
// where the search engines check it; `--submit` sends the sitemaps' addresses, after a deploy.
// Deploying is the owner's decision, so nothing is sent before one (M2.5).

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

/** Every <loc> of the sitemaps the build wrote, the index's children included. */
export async function sitemapUrls(dist: string = DIST): Promise<string[]> {
  const locs = (xml: string) =>
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '')
  const index = await readFile(path.join(dist, 'sitemap.xml'), 'utf8')
  const urls: string[] = []
  for (const sitemap of locs(index)) {
    const file = path.join(dist, new URL(sitemap).pathname)
    urls.push(...locs(await readFile(file, 'utf8')))
  }
  return urls
}

async function main() {
  const { values } = parseArgs({
    options: { 'write-key': { type: 'boolean' }, submit: { type: 'boolean' } },
  })
  const key = indexNowKey()
  if (values['write-key'] === true) {
    if (key === null) return
    await writeFile(path.join(DIST, `${key}.txt`), key)
    console.log('IndexNow: the key file is in the build')
  }
  if (values.submit === true) {
    if (key === null) throw new Error('--submit needs ARABLYZER_INDEXNOW_KEY')
    const urls = await sitemapUrls()
    const host = new URL(urls[0] ?? '').host
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
      if (!response.ok) process.exitCode = 1
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
