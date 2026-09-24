import { crawlerAccess, robotsPath } from '../../lib/robots'
import { defineRule } from '../../rule'

/** Google Search's crawler; it never matches groups for other Google agents such as Googlebot-Image. */
const GOOGLEBOT = 'Googlebot'

export const rule = defineRule({
  id: 'robots-blocks-googlebot',
  version: '1.0.0',
  category: 'crawl',
  severity: 'critical',
  needs: ['robots'],
  messages: ['disallowed', 'server-error', 'unreachable'],
  appliesTo: () => true,
  detect: ({ page, robots }) => {
    if (robots === undefined) return []
    const access = crawlerAccess(robots, GOOGLEBOT, page.url)
    if (access === null || access.allowed) return []
    if (access.basis === 'unreachable') {
      const status = robots.outcome === 'unreachable' ? robots.status : null
      return [
        status === null
          ? { message: 'unreachable', url: robots.url }
          : { message: 'server-error', url: robots.url, values: { status } },
      ]
    }
    const blocking = access.match.rule
    if (blocking === null) return []
    return [
      {
        message: 'disallowed',
        url: robots.url,
        snippet: blocking.text,
        location: { line: blocking.line },
        values: {
          rule: blocking.text,
          line: blocking.line,
          path: robotsPath(page.url),
          group: access.match.group,
        },
        key: `${blocking.line}:${blocking.text}`,
      },
    ]
  },
})
