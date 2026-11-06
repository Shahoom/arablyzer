import type { SitemapCheck, SitemapUrls } from '@arablyzer/collectors'
import { isPublicUrl } from '../../lib/hosts'
import { isW3cDate } from '../../lib/w3c-date'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'invalid' | 'identical'

/** A sitemap whose dates say nothing: this many entries or more, every one with the same date. */
const IDENTICAL_FROM = 10

interface Read {
  readonly url: string
  readonly urls: SitemapUrls
}

/** The sitemaps the scan fetched that are a `urlset` with the entries read. */
function urlsets(check: readonly SitemapCheck[] | undefined): Read[] {
  return (check ?? []).flatMap((entry) =>
    entry.outcome === 'fetched' && entry.urls !== undefined
      ? [{ url: entry.url, urls: entry.urls }]
      : [],
  )
}

/**
 * M10.1: the `lastmod` dates of a sitemap. One that is not a W3C datetime (`05/03/2026`, `٢٠٢٦-٠٣-٠٥`,
 * `2026-02-30`), which Google ignores; and a sitemap of ten entries or more all dated the same, which
 * is the day it was built and not the day any page changed, so Google learns not to trust the date.
 * Only the sitemaps the scan fetched, and the entries it kept (the first 5,000).
 */
export const rule = defineRule({
  id: 'sitemap-lastmod-invalid',
  version: '1.0.0',
  category: 'crawl',
  severity: 'minor',
  needs: ['robots', 'sitemap'],
  messages: ['invalid', 'identical'],
  appliesTo: (page, evidence) =>
    isPublicUrl(page.url) &&
    urlsets(evidence?.sitemap?.checked).some(({ urls }) =>
      urls.urls.some((entry) => entry.lastmod !== null),
    ),
  detect: ({ sitemap }): DetectorFinding<Message>[] =>
    urlsets(sitemap?.checked).flatMap(({ url, urls }) => {
      const dated = urls.urls.flatMap((entry) => (entry.lastmod === null ? [] : [entry.lastmod]))
      const findings: DetectorFinding<Message>[] = []
      const invalid = dated.filter((value) => !isW3cDate(value))
      if (invalid.length > 0) {
        findings.push({
          message: 'invalid',
          values: { sitemap: url, value: invalid[0] ?? '', count: invalid.length },
          url,
          key: `${url}:invalid`,
        })
      }
      if (dated.length >= IDENTICAL_FROM && new Set(dated).size === 1) {
        findings.push({
          message: 'identical',
          values: { sitemap: url, value: dated[0] ?? '', count: dated.length },
          url,
          key: `${url}:identical`,
        })
      }
      return findings
    }),
})
