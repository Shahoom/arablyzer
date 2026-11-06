import { AI_CRAWLERS } from '@arablyzer/rules/ai-crawlers'

// The robots.txt generator (M10.1): a file written from a few choices, in the shape the robots rules
// read. A path to block is a path; the crawlers of AI training and of AI search are the lists the
// ai-crawler checks use, each by the product token its provider documents.

export type CrawlerChoice = 'allow' | 'block'

export interface RobotsFileOptions {
  /** Paths the file keeps every crawler out of: one per line, starting with a slash. */
  readonly blockPaths: readonly string[]
  /** Crawlers that collect text to train models (GPTBot, ClaudeBot, Google-Extended…). */
  readonly training: CrawlerChoice
  /** Crawlers that fetch pages to answer a question in an AI assistant (OAI-SearchBot…). */
  readonly search: CrawlerChoice
  readonly sitemaps: readonly string[]
}

export type RobotsFileProblem = 'path-blank' | 'path-bad' | 'sitemap-bad'

export interface RobotsFileResult {
  readonly text: string
  /** What was left out of the file, and where in the input it was. */
  readonly problems: readonly { readonly problem: RobotsFileProblem; readonly input: string }[]
}

/** A path as robots.txt takes it: from the root, no spaces or control characters. */
const BAD_PATH = /[\s\p{Cc}#]/u

function tokensOf(purpose: 'training' | 'search'): string[] {
  return AI_CRAWLERS.filter((crawler) => crawler.purpose === purpose).map(
    (crawler) => crawler.token,
  )
}

export function robotsFile(options: RobotsFileOptions): RobotsFileResult {
  const problems: { problem: RobotsFileProblem; input: string }[] = []
  const paths: string[] = []
  for (const raw of options.blockPaths) {
    const line = raw.trim()
    if (line === '') continue
    if (BAD_PATH.test(line)) {
      problems.push({ problem: 'path-bad', input: line })
      continue
    }
    const path = line.startsWith('/') || line.startsWith('*') ? line : `/${line}`
    if (!paths.includes(path)) paths.push(path)
  }
  const sitemaps: string[] = []
  for (const raw of options.sitemaps) {
    const line = raw.trim()
    if (line === '') continue
    try {
      const url = new URL(line)
      if (!/^https?:$/.test(url.protocol)) throw new TypeError('scheme')
      if (!sitemaps.includes(url.href)) sitemaps.push(url.href)
    } catch {
      problems.push({ problem: 'sitemap-bad', input: line })
    }
  }
  const groups: string[] = [
    [
      'User-agent: *',
      ...(paths.length === 0 ? ['Disallow:'] : paths.map((p) => `Disallow: ${p}`)),
    ].join('\n'),
  ]
  for (const [choice, purpose] of [
    [options.training, 'training'],
    [options.search, 'search'],
  ] as const) {
    if (choice === 'block') {
      groups.push(
        [...tokensOf(purpose).map((token) => `User-agent: ${token}`), 'Disallow: /'].join('\n'),
      )
    }
  }
  const text = [
    groups.join('\n\n'),
    ...(sitemaps.length === 0 ? [] : [sitemaps.map((s) => `Sitemap: ${s}`).join('\n')]),
  ].join('\n\n')
  return { text: `${text}\n`, problems }
}
