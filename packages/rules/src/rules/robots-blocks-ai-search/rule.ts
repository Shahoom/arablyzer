import { AI_CRAWLERS } from '../../lib/ai-crawlers'
import { crawlerAccess, robotsPath } from '../../lib/robots'
import { defineRule, type DetectorFinding } from '../../rule'

/** Only search crawlers: blocking training or user-fetch crawlers is a choice, shown as facts. */
const SEARCH_CRAWLERS = AI_CRAWLERS.filter((crawler) => crawler.purpose === 'search')

type Message = 'disallowed' | 'server-error' | 'unreachable'

export const rule = defineRule({
  id: 'robots-blocks-ai-search',
  version: '1.0.0',
  category: 'ai',
  severity: 'moderate',
  needs: ['robots'],
  messages: ['disallowed', 'server-error', 'unreachable'],
  appliesTo: () => true,
  detect: ({ page, robots }) => {
    if (robots === undefined) return []
    if (robots.outcome === 'unreachable') {
      // One finding for the file, not one per crawler: the cause is the same.
      const finding: DetectorFinding<Message> =
        robots.status === null
          ? { message: 'unreachable', url: robots.url }
          : { message: 'server-error', url: robots.url, values: { status: robots.status } }
      return [finding]
    }
    return SEARCH_CRAWLERS.flatMap((crawler): DetectorFinding<Message>[] => {
      const access = crawlerAccess(robots, crawler.token, page.url)
      if (access?.basis !== 'rules' || access.allowed || access.match.rule === null) return []
      const blocking = access.match.rule
      return [
        {
          message: 'disallowed',
          url: robots.url,
          snippet: blocking.text,
          location: { line: blocking.line },
          values: {
            token: crawler.token,
            provider: crawler.provider,
            rule: blocking.text,
            line: blocking.line,
            path: robotsPath(page.url),
          },
          key: crawler.token,
        },
      ]
    })
  },
})
