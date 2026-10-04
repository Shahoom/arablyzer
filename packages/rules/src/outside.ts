import type { OutsideFacts } from '@arablyzer/collectors'
import type { CollectorId } from './rule'

/**
 * The collectors that ask services other than the scanned site, and the key each one's answer
 * has in `Evidence.outside`. A tool's scan asks them when it names a rule that needs one; a
 * whole scan never does (`TOOL_ONLY`).
 */
export const OUTSIDE: Readonly<Partial<Record<CollectorId, keyof OutsideFacts>>> = {
  lookalikes: 'lookalikes',
  pdfs: 'pdfs',
  suggest: 'suggest',
  'ai-visibility': 'aiVisibility',
}

/**
 * The collectors only a tool's scan asks: a dozen requests to every site's search, or a paid API,
 * would be a load nobody asked for.
 */
export const TOOL_ONLY: ReadonlySet<CollectorId> = new Set<CollectorId>([
  'search',
  ...(Object.keys(OUTSIDE) as CollectorId[]),
])
