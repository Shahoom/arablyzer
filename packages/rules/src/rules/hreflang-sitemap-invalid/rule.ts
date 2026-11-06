import type { SitemapCheck, SitemapUrl } from '@arablyzer/collectors'
import { checkHreflang } from '../../lib/hreflang'
import { isPublicUrl } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'no-self' | 'no-return' | 'bad-code' | 'relative'

interface Read {
  readonly url: string
  readonly urls: readonly SitemapUrl[]
}

function withAlternates(checks: readonly SitemapCheck[] | undefined): Read[] {
  return (checks ?? []).flatMap((entry) =>
    entry.outcome === 'fetched' &&
    entry.urls?.urls.some((url) => url.alternates.length > 0) === true
      ? [{ url: entry.url, urls: entry.urls.urls }]
      : [],
  )
}

/** An address as a page: lowercase scheme and host, no fragment; the text itself when it is not an address. */
function same(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.href
  } catch {
    return value
  }
}

const isAbsolute = (value: string) => /^https?:\/\//i.test(value)

/**
 * M10.1: the language versions a sitemap lists with `xhtml:link` (Google's way to give hreflang
 * in a sitemap): an entry whose alternates leave out itself, an alternate that is a page of the same
 * file which does not list the entry back, a language or region code Google does not accept, and an
 * alternate address that is not a full URL. One finding for each kind and sitemap, with how many
 * and the first. An alternate that is not an entry of the file cannot be judged here (it may be in
 * another sitemap) and is left alone.
 */
export const rule = defineRule({
  id: 'hreflang-sitemap-invalid',
  version: '1.0.0',
  category: 'intl',
  severity: 'moderate',
  needs: ['robots', 'sitemap'],
  messages: ['no-self', 'no-return', 'bad-code', 'relative'],
  appliesTo: (page, evidence) =>
    isPublicUrl(page.url) && withAlternates(evidence?.sitemap?.checked).length > 0,
  detect: ({ sitemap }): DetectorFinding<Message>[] =>
    withAlternates(sitemap?.checked).flatMap(({ url, urls }) => {
      const entries = new Map(urls.map((entry) => [same(entry.loc), entry]))
      const found = new Map<Message, { count: number; first: Record<string, string | number> }>()
      const note = (message: Message, values: Record<string, string>) => {
        const known = found.get(message)
        if (known === undefined) found.set(message, { count: 1, first: values })
        else known.count++
      }
      for (const entry of urls) {
        if (entry.alternates.length === 0) continue
        const own = same(entry.loc)
        if (!entry.alternates.some((alternate) => same(alternate.href) === own)) {
          note('no-self', { url: entry.loc })
        }
        for (const alternate of entry.alternates) {
          if (alternate.hreflang !== '' && checkHreflang(alternate.hreflang) !== null) {
            note('bad-code', { url: entry.loc, code: alternate.hreflang })
          }
          if (!isAbsolute(alternate.href)) {
            note('relative', { url: entry.loc, alternate: alternate.href })
            continue
          }
          const target = entries.get(same(alternate.href))
          if (
            target !== undefined &&
            same(alternate.href) !== own &&
            !target.alternates.some((back) => same(back.href) === own)
          ) {
            note('no-return', { url: entry.loc, alternate: alternate.href })
          }
        }
      }
      return (['no-self', 'no-return', 'bad-code', 'relative'] as const).flatMap((message) => {
        const hit = found.get(message)
        return hit === undefined
          ? []
          : [
              {
                message,
                values: { sitemap: url, count: hit.count, ...hit.first },
                url,
                key: `${url}:${message}`,
              },
            ]
      })
    }),
})
