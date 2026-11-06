import type { SotawStore } from './store'

/**
 * A certificate that does not reach a root the crawler trusts, the way a server with a missing
 * intermediate fails: a browser fetches what is missing (the certificate's AIA address) and shows
 * the site, while the crawl's fetch, which never turns certificate checks off, fails. A private
 * authority fails the same way, so this says the chain could not be completed, not why.
 */
const INCOMPLETE_CHAIN =
  /\b(?:UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT(?:_LOCALLY)?)\b/

export interface TlsFailure {
  readonly code: string
  readonly message: string
}

export const isIncompleteChain = (failure: TlsFailure | null): boolean =>
  failure?.code === 'tls-failed' && INCOMPLETE_CHAIN.test(failure.message)

export interface TlsCheckDeps {
  readonly store: Pick<SotawStore, 'results' | 'skip'>
  /** Asks for an address under the egress rules: why it failed, or null when it answered. */
  readonly read: (url: string) => Promise<TlsFailure | null>
  /** The host's load per core. */
  readonly load: () => number
  readonly sleep: (ms: number) => Promise<void>
  readonly now: () => number
  readonly log: (line: string) => void
  readonly maxLoad: number
  readonly pollMs: number
  /** The pause between two reads. */
  readonly paceMs: number
}

/**
 * Of the sites no address of which could be read, moves those that failed on an incomplete chain to
 * a reason of their own (`tls-chain`), so that the funnel can say so: the crawl reads through the
 * scanner, whose answer is only that robots.txt could not be read. It reads each site's robots.txt
 * and nothing else, under the crawl's own limits, and `requeue --reason tls-chain` undoes it.
 */
export async function markIncompleteChains(
  runId: string,
  deps: TlsCheckDeps,
): Promise<{ checked: number; marked: number }> {
  const rows = (await deps.store.results(runId)).filter(
    (row) => row.state === 'skipped' && row.reason === 'robots-unreachable',
  )
  let marked = 0
  for (const [index, row] of rows.entries()) {
    for (const origin of [`https://${row.domain}`, `https://www.${row.domain}`]) {
      while (deps.load() > deps.maxLoad) await deps.sleep(deps.pollMs)
      const failure = await deps.read(`${origin}/robots.txt`)
      await deps.sleep(deps.paceMs)
      if (isIncompleteChain(failure)) {
        await deps.store.skip(runId, row.domain, 'tls-chain', new Date(deps.now()))
        marked++
        break
      }
    }
    if ((index + 1) % 50 === 0)
      deps.log(`${String(index + 1)} of ${String(rows.length)}, ${String(marked)} marked`)
  }
  return { checked: rows.length, marked }
}
