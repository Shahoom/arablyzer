import { sitemapUrl, type SitemapCheck, type SitemapFacts } from '@arablyzer/collectors'
import { isPublicUrl } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message =
  | 'not-url'
  | 'unavailable'
  | 'html'
  | 'not-xml'
  | 'root'
  | 'namespace'
  | 'text'
  | 'empty'
  | 'compression'

/**
 * Whether there is a sitemap to judge: one robots.txt names, or one at /sitemap.xml that answered
 * with something other than an HTML page. Without one, the site has none, which is
 * sitemap-missing's to say.
 */
function hasSitemap(sitemap: SitemapFacts | undefined): boolean {
  if (sitemap === undefined) return false
  if (sitemap.named.length > 0) return true
  return sitemap.checked.some(
    (check) => check.outcome === 'fetched' && check.content.kind !== 'html',
  )
}

/**
 * A sitemap search engines cannot read, of those the site gives them: a Sitemap line of robots.txt
 * that is not a full URL; a sitemap it names that answers an error status or an HTML page; and a
 * sitemap, named or at /sitemap.xml, that is not well-formed XML, whose root is not a urlset or
 * sitemapindex of the protocol (or an RSS 2.0 or Atom 1.0 feed), that is text with a line that is
 * not a full URL, that lists nothing, or that is a gzip file which will not decompress. Only the
 * sitemaps the engine fetched: the first few robots.txt names, not the ones an index lists. One
 * the scan could not check is not judged; the rule could not check when that leaves it nothing.
 */
export const rule = defineRule({
  id: 'sitemap-invalid',
  version: '1.0.0',
  category: 'crawl',
  severity: 'moderate',
  needs: ['robots', 'sitemap'],
  messages: [
    'not-url',
    'unavailable',
    'html',
    'not-xml',
    'root',
    'namespace',
    'text',
    'empty',
    'compression',
  ],
  appliesTo: (page, evidence) => isPublicUrl(page.url) && hasSitemap(evidence?.sitemap),
  couldNotCheck: ({ sitemap }) => {
    if (sitemap === undefined) return null
    // A Sitemap line that is not a URL is judged whatever else could not be read: it needs no fetch.
    if (sitemap.named.some((line) => sitemapUrl(line.value) === null)) return null
    // What robots.txt names, every one of it unchecked: nothing was read to judge. The probe of
    // /sitemap.xml, when it names none, is sitemap-missing's to say.
    const named = sitemap.checked.filter((check) => check.named)
    return named.length > 0 && named.every((check) => check.outcome === 'failed')
      ? 'sitemap-unchecked'
      : null
  },
  detect: ({ robots, sitemap }): DetectorFinding<Message>[] => {
    if (sitemap === undefined) return []
    const lines = sitemap.named
      .filter((line) => sitemapUrl(line.value) === null)
      .map((line): DetectorFinding<Message> => ({
        message: 'not-url',
        ...(robots === undefined ? {} : { url: robots.url }),
        snippet: line.value,
        location: { line: line.line },
        values: { value: line.value, line: line.line },
        key: String(line.line),
      }))
    return [...lines, ...sitemap.checked.flatMap(judge)]
  },
})

function judge(check: SitemapCheck): DetectorFinding<Message>[] {
  const { url } = check
  const finding = (
    message: Message,
    values: Readonly<Record<string, string | number>> = {},
    location?: DetectorFinding['location'],
  ): DetectorFinding<Message>[] => [
    {
      message,
      url,
      ...(location === undefined ? {} : { location }),
      values: { url, ...values },
      key: url,
    },
  ]
  // What could not be checked says nothing of the sitemap.
  if (check.outcome === 'failed') return []
  // /sitemap.xml without a sitemap is sitemap-missing's: only a named one is judged here.
  if (check.outcome === 'unavailable') {
    return check.named ? finding('unavailable', { status: check.status }) : []
  }
  const { content } = check
  switch (content.kind) {
    case 'html':
      return check.named ? finding('html') : []
    case 'not-xml':
      return finding(
        'not-xml',
        { line: content.line, column: content.column },
        { line: content.line, column: content.column },
      )
    case 'root':
      return finding('root', { root: content.root, namespace: content.namespace })
    case 'namespace':
      return finding('namespace', { root: content.root, namespace: content.namespace })
    case 'text':
      return finding('text', { line: content.line }, { line: content.line })
    case 'compression':
      return finding('compression')
    case 'sitemap':
      return content.entries === 0 ? finding('empty') : []
  }
}
