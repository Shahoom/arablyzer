import type {
  CrawlError,
  CrawlIssue,
  CrawlState,
  Localized,
  TemplateKind,
} from '@arablyzer/api-contract'

type Severity = CrawlIssue['severity']

// What a deep crawl keeps (M4.5): the crawl, one row for each address it found, and the templates
// it grouped them into. Like the account's other data it holds nothing about a visitor, belongs to
// the account that started it and goes with it, and lives as long as the plan keeps history.

export interface PageIssue {
  readonly id: string
  readonly severity: Severity
  readonly count: number
}

export interface StoredTemplate {
  readonly key: string
  readonly kind: TemplateKind
  readonly pattern: string
  /** Pages the crawl found of it, and pages it checked. */
  readonly found: number
  readonly checked: number
  /** The pages scanned in the browsers for it. */
  readonly representatives: readonly string[]
}

export interface Crawl {
  readonly id: string
  readonly userId: string
  readonly siteId: string | null
  /** The address the crawl was asked to start at. */
  readonly startUrl: string
  /** The origin it crawls: the start page's, after its redirects. */
  readonly origin: string
  readonly state: CrawlState
  readonly error: CrawlError | null
  readonly pageCap: number
  /** The pause between two pages, in ms. */
  readonly delayMs: number
  readonly pagesFound: number
  /** Pages asked for (answered or not). */
  readonly pagesChecked: number
  readonly cancelRequested: boolean
  /** While a crawler holds the crawl, until when. */
  readonly leaseUntil: Date | null
  readonly createdAt: Date
  readonly startedAt: Date | null
  /** When the representatives began to be scanned. */
  readonly renderStartedAt: Date | null
  readonly finishedAt: Date | null
  readonly templates: readonly StoredTemplate[]
  /** The titles of the rules the issues name, as the engine gave them. */
  readonly titles: Readonly<Record<string, Localized>>
}

export type PageState = 'found' | 'checked' | 'blocked' | 'failed'

export interface CrawlPageRow {
  readonly url: string
  readonly depth: number
  readonly bucket: string
  readonly state: PageState
  readonly status: number | null
  readonly template: string | null
  readonly title: string | null
  readonly skeleton: string | null
  readonly issues: readonly PageIssue[]
  /** Issues the browsers found on a representative that the HTML checks do not. */
  readonly renderIssues: readonly PageIssue[]
  readonly scanId: string | null
  readonly error: string | null
}

export interface NewCrawl {
  readonly id: string
  readonly userId: string
  readonly siteId: string | null
  readonly startUrl: string
  readonly pageCap: number
  readonly delayMs: number
  readonly createdAt: Date
}

export type Started =
  { readonly kind: 'created'; readonly crawl: Crawl } | { readonly kind: 'active' }

/** A change to a crawl: what is absent stays as it is. */
export interface CrawlPatch {
  readonly origin?: string
  readonly state?: CrawlState
  readonly error?: CrawlError | null
  readonly leaseUntil?: Date | null
  readonly startedAt?: Date
  readonly renderStartedAt?: Date
  readonly finishedAt?: Date
  readonly templates?: readonly StoredTemplate[]
  readonly titles?: Readonly<Record<string, Localized>>
}

export interface Found {
  readonly url: string
  readonly depth: number
  readonly bucket: string
}

/** What came of asking for a page. */
export interface PageRecord {
  readonly state: 'checked' | 'blocked' | 'failed'
  readonly status: number | null
  readonly title: string | null
  readonly skeleton: string | null
  readonly issues: readonly PageIssue[]
  readonly error: string | null
  /** The pages it links to, to be added as found. */
  readonly links: readonly Found[]
}

export const ACTIVE_STATES: readonly CrawlState[] = ['queued', 'running', 'rendering']

/** The most addresses one crawl keeps, found or checked: a multiple of its cap, and never more than this. */
export const MAX_CRAWL_ROWS = 10_000
export const rowCapOf = (pageCap: number): number =>
  Math.min(MAX_CRAWL_ROWS, Math.max(200, pageCap * 20))

/**
 * Which found page to ask for next: the bucket (a rough address shape) with the fewest pages asked
 * for, so every kind of page is visited before one kind is visited twice; and in it the shallowest,
 * then the first found. The same rule in memory and in PostgreSQL.
 */
export function pickNext(
  candidates: readonly (Found & { readonly seq: number; readonly bucket: string })[],
  asked: ReadonlyMap<string, number>,
): Found | null {
  let best: (typeof candidates)[number] | null = null
  for (const candidate of candidates) {
    if (best === null) {
      best = candidate
      continue
    }
    const mine = asked.get(candidate.bucket) ?? 0
    const theirs = asked.get(best.bucket) ?? 0
    if (
      mine < theirs ||
      (mine === theirs &&
        (candidate.depth < best.depth ||
          (candidate.depth === best.depth && candidate.seq < best.seq)))
    ) {
      best = candidate
    }
  }
  return best === null ? null : { url: best.url, depth: best.depth, bucket: best.bucket }
}

export interface CrawlData {
  /** Starts a crawl, unless the account has one active (one at a time per account). */
  create(input: NewCrawl): Promise<Started>
  get(id: string): Promise<Crawl | null>
  /** A site's crawls, newest first. */
  forSite(userId: string, siteId: string, limit: number): Promise<Crawl[]>
  /** The newest crawl of each of the account's sites. */
  latestPerSite(userId: string): Promise<ReadonlyMap<string, Crawl>>
  /**
   * Asks for a crawl to stop: a queued one is cancelled at once, an active one at its next page.
   * False when the account has no such crawl or it has ended.
   */
  requestCancel(userId: string, id: string, at: Date): Promise<boolean>
  /** Deletes an ended crawl: 'active' when it still runs, 'missing' when the account has none. */
  remove(userId: string, id: string): Promise<'removed' | 'active' | 'missing'>
  /** The first active crawl no crawler holds (its lease has ended), now held until `leaseUntil`. */
  claim(now: Date, leaseUntil: Date): Promise<Crawl | null>
  update(id: string, patch: CrawlPatch): Promise<void>
  /** Adds addresses as found, new ones only, until the crawl keeps `rowCap`; how many were added. */
  add(id: string, found: readonly Found[], rowCap: number): Promise<number>
  next(id: string): Promise<Found | null>
  record(id: string, url: string, result: PageRecord, rowCap: number): Promise<void>
  pages(id: string): Promise<CrawlPageRow[]>
  /** Sets the template of pages, and the crawl's templates, together. */
  assign(
    id: string,
    templates: readonly StoredTemplate[],
    assignments: ReadonlyMap<string, string>,
  ): Promise<void>
  setScan(id: string, url: string, scanId: string): Promise<void>
  setRenderIssues(id: string, url: string, issues: readonly PageIssue[]): Promise<void>
  /** A page of the crawl's pages, in the order found; one template's when `template` is given. */
  list(
    id: string,
    options: { readonly template?: string; readonly offset: number; readonly limit: number },
  ): Promise<CrawlPageRow[]>
  /** Deletes the ended crawls finished before `before`; how many. */
  prune(before: Date): Promise<number>
  eraseUser(userId: string): Promise<void>
}

interface MemoryPage extends CrawlPageRow {
  readonly crawlId: string
  readonly seq: number
}

/** CrawlData in memory, for tests and `pnpm dev`. */
export class MemoryCrawlData implements CrawlData {
  readonly #crawls = new Map<string, Crawl>()
  readonly #pages = new Map<string, MemoryPage[]>()
  #seq = 0

  /** Sites removed take their crawls with them: wired by the account data in tests and dev. */
  dropSite(siteId: string): void {
    for (const [id, crawl] of this.#crawls) {
      if (crawl.siteId === siteId) this.#drop(id)
    }
  }

  #drop(id: string): void {
    this.#crawls.delete(id)
    this.#pages.delete(id)
  }

  create(input: NewCrawl): Promise<Started> {
    for (const crawl of this.#crawls.values()) {
      if (crawl.userId === input.userId && ACTIVE_STATES.includes(crawl.state)) {
        return Promise.resolve({ kind: 'active' })
      }
    }
    const crawl: Crawl = {
      id: input.id,
      userId: input.userId,
      siteId: input.siteId,
      startUrl: input.startUrl,
      origin: new URL(input.startUrl).origin,
      state: 'queued',
      error: null,
      pageCap: input.pageCap,
      delayMs: input.delayMs,
      pagesFound: 0,
      pagesChecked: 0,
      cancelRequested: false,
      leaseUntil: null,
      createdAt: input.createdAt,
      startedAt: null,
      renderStartedAt: null,
      finishedAt: null,
      templates: [],
      titles: {},
    }
    this.#crawls.set(crawl.id, crawl)
    this.#pages.set(crawl.id, [])
    return Promise.resolve({ kind: 'created', crawl })
  }

  get(id: string): Promise<Crawl | null> {
    return Promise.resolve(this.#crawls.get(id) ?? null)
  }

  forSite(userId: string, siteId: string, limit: number): Promise<Crawl[]> {
    return Promise.resolve(
      [...this.#crawls.values()]
        .filter((crawl) => crawl.userId === userId && crawl.siteId === siteId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    )
  }

  async latestPerSite(userId: string): Promise<ReadonlyMap<string, Crawl>> {
    const latest = new Map<string, Crawl>()
    const mine = [...this.#crawls.values()]
      .filter((crawl) => crawl.userId === userId && crawl.siteId !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    for (const crawl of mine)
      if (!latest.has(crawl.siteId ?? '')) latest.set(crawl.siteId ?? '', crawl)
    await Promise.resolve()
    return latest
  }

  requestCancel(userId: string, id: string, at: Date): Promise<boolean> {
    const crawl = this.#crawls.get(id)
    if (crawl?.userId !== userId || !ACTIVE_STATES.includes(crawl.state)) {
      return Promise.resolve(false)
    }
    this.#crawls.set(
      id,
      crawl.state === 'queued'
        ? { ...crawl, state: 'cancelled', cancelRequested: true, finishedAt: at }
        : { ...crawl, cancelRequested: true },
    )
    return Promise.resolve(true)
  }

  remove(userId: string, id: string): Promise<'removed' | 'active' | 'missing'> {
    const crawl = this.#crawls.get(id)
    if (crawl?.userId !== userId) return Promise.resolve('missing')
    if (ACTIVE_STATES.includes(crawl.state)) return Promise.resolve('active')
    this.#drop(id)
    return Promise.resolve('removed')
  }

  claim(now: Date, leaseUntil: Date): Promise<Crawl | null> {
    const due = [...this.#crawls.values()]
      .filter(
        (crawl) =>
          ACTIVE_STATES.includes(crawl.state) &&
          (crawl.leaseUntil === null || crawl.leaseUntil.getTime() <= now.getTime()),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
    if (due === undefined) return Promise.resolve(null)
    const held = { ...due, leaseUntil }
    this.#crawls.set(due.id, held)
    return Promise.resolve(held)
  }

  update(id: string, patch: CrawlPatch): Promise<void> {
    const crawl = this.#crawls.get(id)
    if (crawl === undefined) return Promise.resolve()
    const next: Crawl = {
      ...crawl,
      ...(patch.origin === undefined ? {} : { origin: patch.origin }),
      ...(patch.state === undefined ? {} : { state: patch.state }),
      ...(patch.error === undefined ? {} : { error: patch.error }),
      ...(patch.leaseUntil === undefined ? {} : { leaseUntil: patch.leaseUntil }),
      ...(patch.startedAt === undefined ? {} : { startedAt: patch.startedAt }),
      ...(patch.renderStartedAt === undefined ? {} : { renderStartedAt: patch.renderStartedAt }),
      ...(patch.finishedAt === undefined ? {} : { finishedAt: patch.finishedAt }),
      ...(patch.templates === undefined ? {} : { templates: patch.templates }),
      ...(patch.titles === undefined ? {} : { titles: { ...crawl.titles, ...patch.titles } }),
    }
    this.#crawls.set(id, next)
    return Promise.resolve()
  }

  #counts(id: string): void {
    const crawl = this.#crawls.get(id)
    const pages = this.#pages.get(id)
    if (crawl === undefined || pages === undefined) return
    this.#crawls.set(id, {
      ...crawl,
      pagesFound: pages.length,
      pagesChecked: pages.filter((p) => p.state === 'checked' || p.state === 'failed').length,
    })
  }

  add(id: string, found: readonly Found[], rowCap: number): Promise<number> {
    const pages = this.#pages.get(id)
    if (pages === undefined) return Promise.resolve(0)
    let added = 0
    for (const entry of found) {
      if (pages.length >= rowCap) break
      if (pages.some((page) => page.url === entry.url)) continue
      pages.push({
        crawlId: id,
        seq: ++this.#seq,
        url: entry.url,
        depth: entry.depth,
        bucket: entry.bucket,
        state: 'found',
        status: null,
        template: null,
        title: null,
        skeleton: null,
        issues: [],
        renderIssues: [],
        scanId: null,
        error: null,
      })
      added++
    }
    this.#counts(id)
    return Promise.resolve(added)
  }

  next(id: string): Promise<Found | null> {
    const pages = this.#pages.get(id) ?? []
    const asked = new Map<string, number>()
    for (const page of pages) {
      if (page.state === 'checked' || page.state === 'failed') {
        asked.set(page.bucket, (asked.get(page.bucket) ?? 0) + 1)
      }
    }
    return Promise.resolve(
      pickNext(
        pages.filter((page) => page.state === 'found'),
        asked,
      ),
    )
  }

  async record(id: string, url: string, result: PageRecord, rowCap: number): Promise<void> {
    const pages = this.#pages.get(id)
    const index = pages?.findIndex((page) => page.url === url) ?? -1
    const page = pages?.[index]
    if (pages === undefined || page === undefined) return
    pages[index] = {
      ...page,
      state: result.state,
      status: result.status,
      title: result.title,
      skeleton: result.skeleton,
      issues: result.issues,
      error: result.error,
    }
    await this.add(id, result.links, rowCap)
    this.#counts(id)
  }

  pages(id: string): Promise<CrawlPageRow[]> {
    return Promise.resolve(
      (this.#pages.get(id) ?? []).map((row) => ({
        url: row.url,
        depth: row.depth,
        bucket: row.bucket,
        state: row.state,
        status: row.status,
        template: row.template,
        title: row.title,
        skeleton: row.skeleton,
        issues: row.issues,
        renderIssues: row.renderIssues,
        scanId: row.scanId,
        error: row.error,
      })),
    )
  }

  assign(
    id: string,
    templates: readonly StoredTemplate[],
    assignments: ReadonlyMap<string, string>,
  ): Promise<void> {
    const pages = this.#pages.get(id)
    if (pages === undefined) return Promise.resolve()
    for (const [index, page] of pages.entries()) {
      const key = assignments.get(page.url)
      if (key !== undefined) pages[index] = { ...page, template: key }
    }
    const crawl = this.#crawls.get(id)
    if (crawl !== undefined) this.#crawls.set(id, { ...crawl, templates })
    return Promise.resolve()
  }

  #patchPage(id: string, url: string, patch: Partial<CrawlPageRow>): Promise<void> {
    const pages = this.#pages.get(id)
    const index = pages?.findIndex((page) => page.url === url) ?? -1
    const page = pages?.[index]
    if (pages !== undefined && page !== undefined) pages[index] = { ...page, ...patch }
    return Promise.resolve()
  }

  setScan(id: string, url: string, scanId: string): Promise<void> {
    return this.#patchPage(id, url, { scanId })
  }

  setRenderIssues(id: string, url: string, issues: readonly PageIssue[]): Promise<void> {
    return this.#patchPage(id, url, { renderIssues: issues })
  }

  async list(
    id: string,
    options: { template?: string; offset: number; limit: number },
  ): Promise<CrawlPageRow[]> {
    const rows = await this.pages(id)
    return rows
      .filter((row) => options.template === undefined || row.template === options.template)
      .slice(options.offset, options.offset + options.limit)
  }

  prune(before: Date): Promise<number> {
    let removed = 0
    for (const [id, crawl] of this.#crawls) {
      if (!ACTIVE_STATES.includes(crawl.state) && (crawl.finishedAt ?? crawl.createdAt) < before) {
        this.#drop(id)
        removed++
      }
    }
    return Promise.resolve(removed)
  }

  eraseUser(userId: string): Promise<void> {
    for (const [id, crawl] of this.#crawls) if (crawl.userId === userId) this.#drop(id)
    return Promise.resolve()
  }
}
