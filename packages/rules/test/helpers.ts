import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ARABIC_BLOCKS,
  collectCrux,
  collectPage,
  collectRobots,
  organizationalDomain,
  type CruxFacts,
  type DnsFacts,
  type A11yNodeFact,
  type A11yRuleFact,
  type A11yRuleId,
  type ArabicTextBlock,
  type CertificateFacts,
  type Engine,
  type Header,
  type PageFacts,
  type RenderedFacts,
  type RobotsFacts,
} from '@arablyzer/collectors'
import {
  answerCrux,
  certificateWindow,
  fixtureTxt,
  loadFixtureConfig,
  type CruxData,
  loadSiteConfig,
  resolveFixtureResponse,
  type SiteConfig,
} from '@arablyzer/fixtures'
import type { Redirect } from '@arablyzer/report-schema'
import { isLocalHost } from '../src/lib/hosts'
import type { DetectorFinding, Evidence, Rule } from '../src/rule'

/** Rule tests read fixtures without HTTP; the engine test serves the same sites for real. */
export const FIXTURE_ORIGIN = 'http://fixture.test'

export function fixturesDir(ruleId: string): string {
  return fileURLToPath(new URL(`../src/rules/${ruleId}/fixtures/`, import.meta.url))
}

export function fixtureNames(ruleId: string): string[] {
  return readdirSync(fixturesDir(ruleId), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** The statuses a fetch follows (egress's safeFetch), and how many redirects it follows. */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 10

/**
 * Evidence for fixtures/<name>/ exactly as the fixture server would answer / and /robots.txt:
 * under its site.json host and over HTTPS when it asks, with the certificate it would have. A
 * redirect is followed, as the engine follows it, to a path of the site or to one of its names,
 * and each one is in the evidence's `redirects`. On a public name, the TXT records of the page's
 * organizational domain are those site.json gives (fixtureTxt), for the names `txtNames` lists:
 * those the rule reads.
 */
export async function fixtureEvidence(
  ruleId: string,
  name: string,
  txtNames: (domain: string) => readonly string[] = () => [],
): Promise<Evidence> {
  const root = `${fixturesDir(ruleId)}${name}`
  const config = await loadFixtureConfig(root)
  const site = await loadSiteConfig(root)
  const scheme = site.tls === undefined ? 'http:' : 'https:'
  const names = site.host === undefined ? [] : [site.host, ...(site.aliases ?? [])]
  let url = `${scheme}//${site.host ?? 'fixture.test'}/`
  const answer = (at: URL) =>
    resolveFixtureResponse(root, config, at.pathname, {
      ...(names.includes(at.hostname) ? { host: at.hostname } : {}),
    })
  let page = await answer(new URL(url))
  const redirects: Redirect[] = []
  for (;;) {
    const [location] = [page.headers.location ?? []].flat()
    if (!REDIRECT_STATUSES.has(page.status) || location === undefined) break
    if (redirects.length === MAX_REDIRECTS) throw new Error(`${ruleId}/${name}: too many redirects`)
    redirects.push({ url, status: page.status })
    const next = new URL(location, url)
    const own = next.protocol === scheme && next.port === ''
    if (!own || (next.hostname !== new URL(url).hostname && !names.includes(next.hostname))) {
      throw new Error(`${ruleId}/${name}: a redirect leaves the fixture site, to ${next.href}`)
    }
    url = next.href
    page = await answer(next)
  }
  const robots = await answer(new URL('/robots.txt', url))
  const window =
    site.tls === undefined ? null : certificateWindow(site.tls.lifetimeDays, site.tls.daysLeft)
  return {
    redirects,
    page: collectPage({
      url,
      status: page.status,
      headers: headerList(page.headers),
      body: page.body,
      certificate:
        window === null
          ? null
          : {
              validFrom: window[0].toISOString(),
              validTo: window[1].toISOString(),
              checkedAt: new Date().toISOString(),
            },
    }),
    robots: collectRobots({
      url: new URL('/robots.txt', url).href,
      response: { status: robots.status, body: robots.body, truncated: false },
      errorCode: null,
    }),
    // CrUX's answers as the engine asks for them: the URL, then the origin when it has none.
    ...(site.crux === undefined ? {} : { crux: cruxOf(site.crux, url) }),
    ...dnsOf(site, url, txtNames),
  }
}

/** The TXT records the engine would look up for the page's domain, as the site answers them. */
function dnsOf(
  site: SiteConfig,
  pageUrl: string,
  txtNames: (domain: string) => readonly string[],
): { dns?: DnsFacts } {
  const host = new URL(pageUrl).hostname
  const domain = isLocalHost(host) ? null : organizationalDomain(host)
  if (domain === null) return {}
  return {
    dns: {
      domain,
      txt: txtNames(domain).map((txtName) => ({ name: txtName, ...fixtureTxt(site, txtName) })),
    },
  }
}

/** What the engine would read from the CrUX stand-in for a fixture site's page. */
function cruxOf(data: CruxData, pageUrl: string): CruxFacts {
  const ask = (query: Record<string, string>) =>
    answerCrux(data, { ...query, formFactor: 'PHONE' }, 'fixture-key')
  const url = ask({ url: pageUrl })
  return url.status === 404
    ? collectCrux({ url, origin: ask({ origin: new URL(pageUrl).origin }) })
    : collectCrux({ url })
}

function headerList(headers: Record<string, string | string[]>): Header[] {
  return Object.entries(headers).flatMap(([name, value]) =>
    (Array.isArray(value) ? value : [value]).map((item): Header => [name, item]),
  )
}

export interface HtmlPageOptions {
  readonly headers?: readonly Header[]
  readonly status?: number
  readonly url?: string
  readonly certificate?: CertificateFacts | null
}

/** PageFacts for an inline HTML string. */
export function htmlPage(html: string, options: HtmlPageOptions = {}): PageFacts {
  return collectPage({
    url: options.url ?? `${FIXTURE_ORIGIN}/`,
    status: options.status ?? 200,
    headers: options.headers ?? [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(html),
    certificate: options.certificate ?? null,
  })
}

export function evidenceOf(page: PageFacts, robots?: RobotsFacts): Evidence {
  return robots === undefined ? { page } : { page, robots }
}

/** A detector's findings as an array; detectors may yield them lazily. */
export function detectAll<M extends string>(
  rule: Rule<M>,
  evidence: Evidence,
): DetectorFinding<M>[] {
  return [...rule.detect(evidence)]
}

/** An Arabic page as its HTML, for rules that read the rendered page. */
export const ARABIC_PAGE = htmlPage(
  '<html lang="ar" dir="rtl"><body><p id="a">نشحن الطلبات خلال يومي عمل.</p></body></html>',
)

/** A text's distinct Arabic-script characters in code point order, as the page script gives them. */
export function arabicCharactersOf(text: string): string {
  const found = new Set<number>()
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0
    if (ARABIC_BLOCKS.some(([first, last]) => codePoint >= first && codePoint <= last)) {
      found.add(codePoint)
    }
  }
  return String.fromCodePoint(...[...found].sort((a, b) => a - b))
}

/** A block of Arabic text as an engine measured it: plain text, no spacing, a system font. */
export function arabicBlock(overrides: Partial<ArabicTextBlock> = {}): ArabicTextBlock {
  const text = overrides.text ?? 'نشحن الطلبات خلال يومي عمل.'
  return {
    selector: '#a',
    box: { x: 20, y: 40, width: 350, height: 24 },
    text,
    letterSpacing: 0,
    letterSpacingApplied: null,
    fontFamily: 'serif',
    primaryFamily: 'serif',
    arabicCharacters: arabicCharactersOf(text),
    ...overrides,
  }
}

/** One engine's facts for a right-to-left Arabic page that fits a phone screen. */
export function renderedFacts(
  engine: Engine = 'chromium',
  overrides: Partial<RenderedFacts> = {},
): RenderedFacts {
  return {
    engine,
    version: '1.0',
    url: `${FIXTURE_ORIGIN}/`,
    status: 200,
    viewport: { width: 390, height: 844 },
    dir: 'rtl',
    lang: 'ar',
    viewportMeta: 'width=device-width, initial-scale=1',
    scrollWidth: 390,
    overflow: [],
    arabicText: [arabicBlock()],
    arabicTextOmitted: 0,
    fontFaces: [],
    fontFacesOmitted: 0,
    fontRequests: [],
    arabicFontCoverage: [],
    stylesheets: { read: 0, unread: 0, physical: [] },
    ...(engine === 'chromium' ? { usedFonts: [] } : {}),
    bidi: [],
    fields: [],
    directionIcons: [],
    compression: { checked: 0, uncompressed: [] },
    images: [],
    a11y: null,
    truncated: false,
    limited: false,
    filesRead: true,
    ...overrides,
  }
}

/** An element axe reported. */
export function axeNode(selector: string, overrides: Partial<A11yNodeFact> = {}): A11yNodeFact {
  return {
    selector,
    snippet: `<p id="${selector.slice(1)}">`,
    reason: null,
    contrast: null,
    ...overrides,
  }
}

/** axe's result for one of its rules: applicable, and nothing found unless given. */
export function axeRule(id: A11yRuleId, overrides: Partial<A11yRuleFact> = {}): A11yRuleFact {
  const violations = overrides.violations ?? []
  const incomplete = overrides.incomplete ?? []
  return {
    id,
    applicable: true,
    violations,
    violationCount: violations.length,
    incomplete,
    incompleteCount: incomplete.length,
    ...overrides,
  }
}

/** One engine's facts with axe's results for the given rules. */
export function withAxe(engine: Engine, ...rules: A11yRuleFact[]): RenderedFacts {
  return renderedFacts(engine, { a11y: { axeVersion: '4.13.0', rules } })
}

/** Evidence for a rule that needs `render`: the page's HTML and each engine's facts. */
export function renderedEvidence(
  rendered: readonly RenderedFacts[],
  page: PageFacts = ARABIC_PAGE,
): Evidence {
  return { page, rendered }
}

/** Whether a rule applies, as the engine asks it: with the evidence. */
export function applies(rule: Rule, evidence: Evidence): boolean {
  return rule.appliesTo(evidence.page, evidence)
}
