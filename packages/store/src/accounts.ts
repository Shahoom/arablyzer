import type { ScanState } from '@arablyzer/api-contract'
import type { MemoryScanStore } from './memory'

// What an account keeps (M4.2): the sites a person saved and the link from their scans, which
// stays out of `scans` itself, so a scan still knows nothing of who asked (Phase 4 design §2.2).

export interface SavedSite {
  readonly id: string
  readonly url: string
  readonly createdAt: Date
}

/** A scan an account keeps, as the history lists it. */
export interface HistoryEntry {
  readonly scanId: string
  readonly url: string
  readonly state: ScanState
  /** The overall score of a finished whole-page scan; null otherwise. */
  readonly score: number | null
  readonly createdAt: Date
  readonly siteId: string | null
}

export type ScanSource = 'manual' | 'monitor' | 'crawl'

export type AddedSite =
  | { readonly kind: 'added' | 'existing'; readonly site: SavedSite }
  /** The account keeps as many sites as its plan allows. */
  | { readonly kind: 'limit' }

export interface AccountData {
  sites(userId: string): Promise<SavedSite[]>
  site(userId: string, siteId: string): Promise<SavedSite | null>
  /**
   * Saves the URL for the person, unless they hold `limit` sites already: counted and inserted
   * as one step, so two requests at once cannot pass the limit. A URL already saved is
   * `existing`, whatever the count.
   */
  addSite(
    userId: string,
    site: { readonly id: string; readonly url: string; readonly createdAt: Date },
    limit: number,
  ): Promise<AddedSite>
  /** False when the person has no such site. The scans of the site stay in the history. */
  removeSite(userId: string, siteId: string): Promise<boolean>
  /** Marks the scan as the account's; its site is the person's saved site with the same URL. */
  link(link: {
    readonly userId: string
    readonly scanId: string
    readonly url: string
    readonly source: ScanSource
    readonly createdAt: Date
  }): Promise<void>
  /** The account's scans, newest first. */
  history(userId: string, limit: number): Promise<HistoryEntry[]>
  /** The newest scan of each saved site, by site id. */
  latestPerSite(userId: string): Promise<ReadonlyMap<string, HistoryEntry>>
  /** Deletes the scans the account keeps, with their reports (before the account itself goes). */
  eraseUser(userId: string): Promise<void>
}

interface MemoryLink {
  readonly userId: string
  readonly scanId: string
  readonly siteId: string | null
  readonly createdAt: Date
}

/** AccountData in memory, over the memory scan store, for tests and `pnpm dev`. */
export class MemoryAccountData implements AccountData {
  readonly #scans: MemoryScanStore
  readonly #sites = new Map<string, SavedSite & { userId: string }>()
  readonly #links: MemoryLink[] = []
  /** Told when a site is removed, so what hangs on it (a monitor) goes too, as the database cascades. */
  readonly onSiteRemoved = new Set<(siteId: string) => void>()

  constructor(scans: MemoryScanStore) {
    this.#scans = scans
  }

  sites(userId: string): Promise<SavedSite[]> {
    return Promise.resolve(
      [...this.#sites.values()]
        .filter((site) => site.userId === userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(({ id, url, createdAt }) => ({ id, url, createdAt })),
    )
  }

  async site(userId: string, siteId: string): Promise<SavedSite | null> {
    return (await this.sites(userId)).find((site) => site.id === siteId) ?? null
  }

  async addSite(
    userId: string,
    site: { id: string; url: string; createdAt: Date },
    limit: number,
  ): Promise<AddedSite> {
    const mine = await this.sites(userId)
    const existing = mine.find((kept) => kept.url === site.url)
    if (existing !== undefined) return { kind: 'existing', site: existing }
    if (mine.length >= limit) return { kind: 'limit' }
    this.#sites.set(site.id, { ...site, userId })
    return { kind: 'added', site }
  }

  async removeSite(userId: string, siteId: string): Promise<boolean> {
    if ((await this.site(userId, siteId)) === null) return false
    this.#sites.delete(siteId)
    for (const listener of this.onSiteRemoved) listener(siteId)
    for (const [index, link] of this.#links.entries()) {
      if (link.siteId === siteId) this.#links[index] = { ...link, siteId: null }
    }
    return true
  }

  async link(link: {
    userId: string
    scanId: string
    url: string
    source: ScanSource
    createdAt: Date
  }): Promise<void> {
    const site = (await this.sites(link.userId)).find((kept) => kept.url === link.url)
    this.#links.push({
      userId: link.userId,
      scanId: link.scanId,
      siteId: site?.id ?? null,
      createdAt: link.createdAt,
    })
    this.#scans.linked.add(link.scanId)
  }

  async history(userId: string, limit: number): Promise<HistoryEntry[]> {
    const entries: HistoryEntry[] = []
    const mine = this.#links
      .filter((link) => link.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    for (const link of mine) {
      const scan = await this.#scans.get(link.scanId)
      if (scan === null) continue
      entries.push({
        scanId: scan.id,
        url: scan.url,
        state: scan.state,
        score: scan.tool === null && scan.report !== null ? scan.report.score.overall : null,
        createdAt: scan.createdAt,
        siteId: link.siteId,
      })
      if (entries.length >= limit) break
    }
    return entries
  }

  async latestPerSite(userId: string): Promise<ReadonlyMap<string, HistoryEntry>> {
    const latest = new Map<string, HistoryEntry>()
    for (const entry of await this.history(userId, Number.MAX_SAFE_INTEGER)) {
      if (entry.siteId !== null && !latest.has(entry.siteId)) latest.set(entry.siteId, entry)
    }
    return latest
  }

  eraseUser(userId: string): Promise<void> {
    const mine = this.#links.filter((link) => link.userId === userId)
    this.#scans.purge(mine.map((link) => link.scanId))
    for (const link of mine) this.#links.splice(this.#links.indexOf(link), 1)
    for (const [id, site] of this.#sites) if (site.userId === userId) this.#sites.delete(id)
    return Promise.resolve()
  }
}
