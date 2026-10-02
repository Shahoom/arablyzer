/**
 * What a page may ask of the network in one render, decided by the browser's route for each request
 * it makes (see renderWith). The proxy sees an HTTPS request only as a tunnel, with neither its
 * method nor its address, so the decision is taken here, in the browser, where every request stops
 * and waits for it.
 */

/**
 * Methods of requests that ask for something and hand nothing over. Any other method sends data
 * out of Arablyzer's address to a host the page names (POST, PUT, PATCH, DELETE, and the rest), and
 * a render needs no page to do that (M1 review, issue #29: `fetch`, XHR, `sendBeacon`, `<a ping>`,
 * a form's submission, a WebSocket and CSP reports each reached a second server, in Chromium or in
 * Firefox).
 */
export const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD'])

/**
 * The most distinct hosts a page may contact in one render: a number of our own, not a standard's.
 * It bounds how many different sites a page can make a scan reach, whatever it asks for. A page
 * that needs more is cut, and the report says so (see PageRequests.overHosts).
 */
export const DEFAULT_MAX_HOSTS = 50

/**
 * The page's requests as the browser's route counted them: every one, including those inside
 * HTTPS connections, which the proxy sees only as tunnels (the owner's sites, 2026-09-27: dozens
 * of files over two connections), and those refused before they left, which never reach it.
 */
export interface PageRequests {
  readonly made: number
  /** Refused past maxRequests. */
  readonly overLimit: number
  /** Refused past maxHosts: to a host that would have been one more than the render allows. */
  readonly overHosts: number
  /**
   * Refused because they send data: every request whose method is not GET or HEAD, whatever its
   * destination, and every WebSocket. A page's own requests to its own site included.
   */
  readonly sending: number
}

/** The page's requests against the render's limits, as the route has counted them so far. */
export interface RequestBudget {
  readonly max: number
  readonly maxHosts: number
  /** Every request the route was asked about, and every WebSocket. */
  made: number
  /** Let through, at most `max`. */
  sent: number
  overLimit: number
  overHosts: number
  sending: number
  /** The request limit refused something, so the page did not load in full. */
  reached: boolean
  /** The hosts of the requests let through, at most `maxHosts` of them. */
  readonly hosts: Set<string>
}

export function newBudget(max: number, maxHosts: number): RequestBudget {
  return {
    max,
    maxHosts,
    made: 0,
    sent: 0,
    overLimit: 0,
    overHosts: 0,
    sending: 0,
    reached: false,
    hosts: new Set(),
  }
}

/** What the route does with a request: lets it out, or refuses it, and why. */
export type Verdict = 'allow' | 'sending' | 'limit' | 'hosts'

/**
 * Counts a request and says what becomes of it. Called for each request before anything else is
 * awaited, so a burst cannot get past a limit before the limit is noticed (M1.1 review).
 *
 * In this order: a request that sends data is refused whatever else is true and uses none of the
 * render's budget; then the request limit, so that once it is reached everything is over it; then
 * the host limit, which refuses a request to a host the page had not contacted when the render
 * already has `maxHosts`. Only a request let out has its host remembered.
 */
export function admit(budget: RequestBudget, method: string, url: string): Verdict {
  budget.made++
  if (!READ_METHODS.has(method)) {
    budget.sending++
    return 'sending'
  }
  if (budget.sent >= budget.max) {
    budget.reached = true
    budget.overLimit++
    return 'limit'
  }
  const host = hostOf(url)
  if (host !== null && !budget.hosts.has(host) && budget.hosts.size >= budget.maxHosts) {
    budget.overHosts++
    return 'hosts'
  }
  budget.sent++
  if (host !== null) budget.hosts.add(host)
  return 'allow'
}

/** A WebSocket the page opened, which was closed unopened: a request that sends data. */
export function refuseSocket(budget: RequestBudget): void {
  budget.made++
  budget.sending++
}

/** What the render reports of a budget. */
export function pageRequests(budget: RequestBudget): PageRequests {
  return {
    made: budget.made,
    overLimit: budget.overLimit,
    overHosts: budget.overHosts,
    sending: budget.sending,
  }
}

/**
 * The host a request goes to, as the browser resolves it (WHATWG URL: lower case, IDNs in
 * punycode, IPv4 in dotted form), or null for a URL that reaches no host: a data: or blob: URL is
 * the page's own. A URL that does not parse counts as a host of its own, so it is neither free nor
 * a way round the limit.
 */
function hostOf(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  return HOSTED_SCHEMES.has(parsed.protocol) ? parsed.hostname : null
}

const HOSTED_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:'])
