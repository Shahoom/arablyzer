import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadRuleExample } from '../src/example'
import { RULES } from '../src/index'
import { fixtureNames, fixturesDir } from './helpers'

/**
 * Rules whose fixtures hold no code a page could show: what they judge is not in the page's
 * files. Their pages go without the example; the fix section shows the code to write.
 */
const NO_EXAMPLE: Readonly<Record<string, string>> = {
  'bot-challenge': 'the headers of a challenge in place of the page, which no excerpt shows',
  'cwv-cls-poor': "real visitors' data from the Chrome UX Report, not the page",
  'cwv-inp-poor': "real visitors' data from the Chrome UX Report, not the page",
  'cwv-lcp-poor': "real visitors' data from the Chrome UX Report, not the page",
  'dmarc-missing': 'DNS records, which no excerpt of the page shows',
  'frame-protection-missing': 'response headers, whose absence no excerpt shows',
  'hsts-missing': 'a response header, whose absence no excerpt shows',
  'https-missing': 'the address the page answers at',
  'lookalike-domains': 'DNS and Certificate Transparency records of other domains, not the page',
  'knowledge-graph-entity': "Google's Knowledge Graph, not the page",
  'payment-methods': 'nothing: it lists the payment methods the page shows, as information',
  'platform-detected': 'nothing: it lists the platform and plugins a page shows, as information',
  'misspellings-uncovered': 'what people type in Google’s suggestions, not the page',
  'pdf-arabic-text': 'the PDF files the page links, not the page',
  'pdf-metadata': 'the PDF files the page links, not the page',
  'redirect-chain': 'the redirects before the page, which no excerpt shows',
  'redirect-temporary': 'the redirects before the page, which no excerpt shows',
  'safe-browsing-flagged': "Google's lists, which no excerpt of the page shows",
  'search-spelling-variants': "the answers of the site's own search, not the page",
  'sitemap-missing': 'the absence of a sitemap, which no excerpt shows',
  'spf-missing': 'DNS records, which no excerpt of the page shows',
  'text-compression-missing': 'how the server sends the page’s files',
  'tls-expiring': 'the server’s certificate',
  'x-content-type-options-missing': 'a response header, whose absence no excerpt shows',
}

const fold = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Each fixture of one kind (wrong*, right*) as its text files, whitespace folded. */
function fixtures(ruleId: string, kind: 'wrong' | 'right'): string[][] {
  return fixtureNames(ruleId)
    .filter((fixture) => fixture.startsWith(kind))
    .map((name) => {
      const texts: string[] = []
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = `${dir}${entry.name}`
          if (entry.isDirectory()) walk(`${path}/`)
          else if (/\.(?:html|css|txt)$/.test(entry.name))
            texts.push(fold(readFileSync(path, 'utf8')))
        }
      }
      walk(`${fixturesDir(ruleId)}${name}/`)
      return texts
    })
}

const holds = (fixture: readonly string[], code: string) =>
  fixture.some((text) => text.includes(fold(code)))

/**
 * A fixture whose files are the same as one of the other kind differs from it only where no
 * excerpt reaches (its response headers, say, in fixture.json): it tells nothing apart.
 */
function apart(own: readonly string[][], other: readonly string[][]): string[][] {
  const key = (fixture: readonly string[]) => [...fixture].sort().join('\n')
  const same = new Set(other.map(key))
  return own.filter((fixture) => !same.has(key(fixture)))
}

describe.each(RULES.map((rule) => [rule.id] as const))('%s', (id) => {
  const example = loadRuleExample(id)
  const why = NO_EXAMPLE[id]

  if (why !== undefined) {
    it(`shows no example: it judges ${why}`, () => {
      expect(example).toBeNull()
    })
    return
  }

  it('shows an excerpt of a wrong fixture and of a right one, whitespace aside', () => {
    expect(example, 'rules/<id>/example.md').not.toBeNull()
    if (example === null) return
    expect(fixtures(id, 'wrong').some((fixture) => holds(fixture, example.wrong))).toBe(true)
    expect(fixtures(id, 'right').some((fixture) => holds(fixture, example.right))).toBe(true)
  })

  it('shows what tells the two apart: neither excerpt is in a fixture of the other kind', () => {
    if (example === null) return
    const wrong = fixtures(id, 'wrong')
    const right = fixtures(id, 'right')
    expect(apart(right, wrong).some((fixture) => holds(fixture, example.wrong))).toBe(false)
    expect(apart(wrong, right).some((fixture) => holds(fixture, example.right))).toBe(false)
  })
})
