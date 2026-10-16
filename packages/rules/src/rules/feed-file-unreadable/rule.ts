import type { FeedUnreadable } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = [
  'html',
  'empty',
  'not-utf8',
  'not-xml',
  'not-a-feed',
  'no-items',
  'no-columns',
] as const satisfies readonly Exclude<FeedUnreadable, 'compressed'>[]
type Message = (typeof MESSAGES)[number]

/**
 * M6.1: the file at the address is no product feed Google Merchant Center can read: a web page,
 * nothing, bytes that are not UTF-8, XML that breaks or is another document, a feed without
 * products, or text whose first row is no list of columns. A feed that reads is judged by the
 * rules beside this one. A compressed file (.gz) is one Merchant Center reads and this check does
 * not: that is the check's limit, not the site's fault, so the rule could not check (an error).
 */
export const rule = defineRule({
  id: 'feed-file-unreadable',
  version: '1.0.0',
  category: 'commerce',
  severity: 'serious',
  needs: ['feed'],
  messages: MESSAGES,
  appliesTo: (_page, evidence) => evidence?.feed !== undefined,
  couldNotCheck: (evidence) =>
    evidence.feed?.kind === 'unreadable' && evidence.feed.reason === 'compressed'
      ? 'feed-compressed'
      : null,
  detect: ({ feed }): DetectorFinding<Message>[] => {
    if (feed?.kind !== 'unreadable' || feed.reason === 'compressed') return []
    return [
      {
        message: feed.reason,
        values: {
          line: feed.line ?? 0,
          column: feed.column ?? 0,
          root: feed.root ?? '',
        },
        ...(feed.line === undefined
          ? {}
          : { location: { line: feed.line, column: feed.column ?? 1 } }),
        key: feed.reason,
      },
    ]
  },
})
