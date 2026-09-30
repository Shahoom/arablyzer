export type AiCrawlerPurpose = 'search' | 'training' | 'user-fetch'

export interface AiCrawler {
  /** The robots.txt product token, as the provider documents it. */
  readonly token: string
  readonly provider: string
  readonly purpose: AiCrawlerPurpose
  /** The provider's own page for this crawler. */
  readonly docs: string
  /** When the token and purpose were last checked against the provider's documentation. */
  readonly verified: string
}

const OPENAI = 'https://developers.openai.com/api/docs/bots'
const ANTHROPIC =
  'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler'
const PERPLEXITY =
  'https://www.perplexity.ai/help-center/en/articles/10354969-how-does-perplexity-follow-robots-txt'
const GOOGLE =
  'https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers'

/**
 * AI crawler names change (docs/design/phase-0.md §5), so they live here as data. Checked on
 * 2026-09-24: Anthropic's page was read directly; OpenAI, Perplexity and Google were checked
 * through excerpts of the linked pages because the build environment could not open them.
 * Add a crawler only with a provider page that names it and its purpose.
 */
export const AI_CRAWLERS: readonly AiCrawler[] = [
  {
    token: 'OAI-SearchBot',
    provider: 'OpenAI',
    purpose: 'search',
    docs: OPENAI,
    verified: '2026-09-24',
  },
  {
    token: 'GPTBot',
    provider: 'OpenAI',
    purpose: 'training',
    docs: OPENAI,
    verified: '2026-09-24',
  },
  {
    token: 'ChatGPT-User',
    provider: 'OpenAI',
    purpose: 'user-fetch',
    docs: OPENAI,
    verified: '2026-09-24',
  },
  {
    token: 'Claude-SearchBot',
    provider: 'Anthropic',
    purpose: 'search',
    docs: ANTHROPIC,
    verified: '2026-09-24',
  },
  {
    token: 'ClaudeBot',
    provider: 'Anthropic',
    purpose: 'training',
    docs: ANTHROPIC,
    verified: '2026-09-24',
  },
  {
    token: 'Claude-User',
    provider: 'Anthropic',
    purpose: 'user-fetch',
    docs: ANTHROPIC,
    verified: '2026-09-24',
  },
  {
    token: 'PerplexityBot',
    provider: 'Perplexity',
    purpose: 'search',
    docs: PERPLEXITY,
    verified: '2026-09-24',
  },
  {
    token: 'Perplexity-User',
    provider: 'Perplexity',
    purpose: 'user-fetch',
    docs: PERPLEXITY,
    verified: '2026-09-24',
  },
  {
    token: 'Google-Extended',
    provider: 'Google',
    purpose: 'training',
    docs: GOOGLE,
    verified: '2026-09-24',
  },
]
