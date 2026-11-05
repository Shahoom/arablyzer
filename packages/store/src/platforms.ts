import type { MemoryScanStore } from './memory'

// What the Salla and Zid apps keep (M9, issue #41): one row per installed store, with its tokens
// sealed by the API (the store sees only the opaque text), and the link from a store to the audits
// run on its storefront. A store's data lives exactly as long as its install: uninstalling erases
// the row, the tokens and the audits' scans with their reports.

export type Platform = 'salla' | 'zid'
export const PLATFORMS: readonly Platform[] = ['salla', 'zid']

/** `reauth`: the platform no longer accepts the tokens; the merchant must authorize again. */
export type InstallStatus = 'active' | 'reauth'

export interface PlatformInstall {
  readonly id: string
  readonly platform: Platform
  /** Salla's merchant id, or Zid's store uuid: the platform's own name for the store. */
  readonly storeKey: string
  readonly storeName: string | null
  /** The storefront the audit scans. Null until the platform has told us. */
  readonly storeUrl: string | null
  /** The tokens, sealed (apps/api/src/platforms/crypto.ts); null once the platform revoked them. */
  readonly sealedTokens: string | null
  readonly tokensExpireAt: Date | null
  readonly tokensAt: Date | null
  /** When the tokens are next refreshed; null when there is nothing to refresh. */
  readonly refreshDueAt: Date | null
  readonly status: InstallStatus
  /** SHA-256 of the lookup token a platform's dashboard opens the panel with (Zid). */
  readonly embedTokenHash: string | null
  readonly installedAt: Date
  readonly updatedAt: Date
  /** When the next audit may start; null when none is wanted. */
  readonly auditDueAt: Date | null
  readonly lastAuditAt: Date | null
}

export interface TokenPatch {
  readonly sealed: string
  readonly expiresAt: Date
  readonly at: Date
  readonly refreshDueAt: Date | null
}

/** What an event teaches about a store; a field left out is kept as it is. */
export interface InstallPatch {
  readonly storeName?: string | null
  readonly storeUrl?: string | null
  /**
   * New tokens. Applied only when they expire no earlier than the ones held: a signed webhook
   * that is replayed later carries older tokens, and must not overwrite a refresh.
   */
  readonly tokens?: TokenPatch
  readonly embedTokenHash?: string | null
}

export interface PlatformData {
  /** Creates the store's row, or teaches the existing one; `created` says which. */
  upsert(input: {
    readonly id: string
    readonly platform: Platform
    readonly storeKey: string
    readonly patch: InstallPatch
    readonly at: Date
  }): Promise<{ readonly install: PlatformInstall; readonly created: boolean }>
  get(platform: Platform, storeKey: string): Promise<PlatformInstall | null>
  byEmbedHash(hash: string): Promise<PlatformInstall | null>
  /** Wants an audit from `dueAt` on; an earlier time already asked for is kept. */
  scheduleAudit(installId: string, dueAt: Date): Promise<void>
  /** The stores whose audit is due, leased to the caller until `leaseUntil`. */
  claimAudits(now: Date, max: number, leaseUntil: Date): Promise<PlatformInstall[]>
  /** Puts a claimed audit off to `until`. */
  deferAudit(installId: string, until: Date): Promise<void>
  /** Records an audit that was queued: its scan, and that none is due any more. */
  recordAudit(input: {
    readonly installId: string
    readonly scanId: string
    readonly at: Date
  }): Promise<void>
  /** The store's newest audit, if its scan has not been deleted since. */
  latestAudit(installId: string): Promise<{ readonly scanId: string; readonly at: Date } | null>
  /** The stores whose tokens are due for a refresh, leased to the caller until `leaseUntil`. */
  claimRefreshes(now: Date, max: number, leaseUntil: Date): Promise<PlatformInstall[]>
  /** The platform refused the tokens: they are deleted, and the store waits for a new authorization. */
  dropTokens(installId: string): Promise<void>
  /** The store's row, tokens and audits' scans with their reports. False when there is no such store. */
  erase(platform: Platform, storeKey: string): Promise<boolean>
}

/** PlatformData in memory, for tests and `pnpm dev`. */
export class MemoryPlatformData implements PlatformData {
  readonly #installs = new Map<string, PlatformInstall>()
  readonly #audits: { installId: string; scanId: string; at: Date }[] = []
  readonly #leases = new Map<string, Date>()
  readonly #scans: MemoryScanStore

  constructor(scans: MemoryScanStore) {
    this.#scans = scans
  }

  #find(platform: Platform, storeKey: string): PlatformInstall | undefined {
    for (const install of this.#installs.values()) {
      if (install.platform === platform && install.storeKey === storeKey) return install
    }
    return undefined
  }

  upsert(input: Parameters<PlatformData['upsert']>[0]) {
    const { platform, storeKey, patch, at } = input
    const found = this.#find(platform, storeKey)
    let install: PlatformInstall = found ?? {
      id: input.id,
      platform,
      storeKey,
      storeName: null,
      storeUrl: null,
      sealedTokens: null,
      tokensExpireAt: null,
      tokensAt: null,
      refreshDueAt: null,
      status: 'active',
      embedTokenHash: null,
      installedAt: at,
      updatedAt: at,
      auditDueAt: null,
      lastAuditAt: null,
    }
    install = {
      ...install,
      updatedAt: at,
      ...(patch.storeName === undefined ? {} : { storeName: patch.storeName }),
      ...(patch.storeUrl === undefined ? {} : { storeUrl: patch.storeUrl }),
      ...(patch.embedTokenHash === undefined ? {} : { embedTokenHash: patch.embedTokenHash }),
    }
    const tokens = patch.tokens
    if (
      tokens !== undefined &&
      (install.tokensExpireAt === null || install.tokensExpireAt <= tokens.expiresAt)
    ) {
      install = {
        ...install,
        sealedTokens: tokens.sealed,
        tokensExpireAt: tokens.expiresAt,
        tokensAt: tokens.at,
        refreshDueAt: tokens.refreshDueAt,
        status: 'active',
      }
    }
    this.#installs.set(install.id, install)
    return Promise.resolve({ install, created: found === undefined })
  }

  get(platform: Platform, storeKey: string) {
    return Promise.resolve(this.#find(platform, storeKey) ?? null)
  }

  byEmbedHash(hash: string) {
    for (const install of this.#installs.values()) {
      if (install.embedTokenHash === hash) return Promise.resolve(install)
    }
    return Promise.resolve(null)
  }

  #change(id: string, change: Partial<PlatformInstall>): void {
    const install = this.#installs.get(id)
    if (install !== undefined) this.#installs.set(id, { ...install, ...change })
  }

  scheduleAudit(installId: string, dueAt: Date) {
    const install = this.#installs.get(installId)
    if (install !== undefined && (install.auditDueAt === null || install.auditDueAt > dueAt)) {
      this.#change(installId, { auditDueAt: dueAt })
    }
    return Promise.resolve()
  }

  claimAudits(now: Date, max: number, leaseUntil: Date) {
    const due = [...this.#installs.values()]
      .filter((install) => {
        const lease = this.#leases.get(`audit:${install.id}`)
        return (
          install.auditDueAt !== null &&
          install.auditDueAt <= now &&
          (lease === undefined || lease <= now)
        )
      })
      .sort((a, b) => (a.auditDueAt?.getTime() ?? 0) - (b.auditDueAt?.getTime() ?? 0))
      .slice(0, max)
    for (const install of due) this.#leases.set(`audit:${install.id}`, leaseUntil)
    return Promise.resolve(due)
  }

  deferAudit(installId: string, until: Date) {
    this.#leases.delete(`audit:${installId}`)
    this.#change(installId, { auditDueAt: until })
    return Promise.resolve()
  }

  recordAudit(input: { installId: string; scanId: string; at: Date }) {
    this.#audits.push({ installId: input.installId, scanId: input.scanId, at: input.at })
    this.#leases.delete(`audit:${input.installId}`)
    this.#change(input.installId, { auditDueAt: null, lastAuditAt: input.at })
    return Promise.resolve()
  }

  async latestAudit(installId: string) {
    const states = await this.#scans.states(
      this.#audits.filter((audit) => audit.installId === installId).map((audit) => audit.scanId),
    )
    const kept = this.#audits
      .filter((audit) => audit.installId === installId && states.has(audit.scanId))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
    const newest = kept[0]
    return newest === undefined ? null : { scanId: newest.scanId, at: newest.at }
  }

  claimRefreshes(now: Date, max: number, leaseUntil: Date) {
    const due = [...this.#installs.values()]
      .filter((install) => {
        const lease = this.#leases.get(`refresh:${install.id}`)
        return (
          install.sealedTokens !== null &&
          install.refreshDueAt !== null &&
          install.refreshDueAt <= now &&
          (lease === undefined || lease <= now)
        )
      })
      .sort((a, b) => (a.refreshDueAt?.getTime() ?? 0) - (b.refreshDueAt?.getTime() ?? 0))
      .slice(0, max)
    for (const install of due) this.#leases.set(`refresh:${install.id}`, leaseUntil)
    return Promise.resolve(due)
  }

  dropTokens(installId: string) {
    this.#leases.delete(`refresh:${installId}`)
    this.#change(installId, {
      sealedTokens: null,
      tokensExpireAt: null,
      tokensAt: null,
      refreshDueAt: null,
      status: 'reauth',
    })
    return Promise.resolve()
  }

  erase(platform: Platform, storeKey: string) {
    const install = this.#find(platform, storeKey)
    if (install === undefined) return Promise.resolve(false)
    const mine = this.#audits.filter((audit) => audit.installId === install.id)
    this.#scans.purge(mine.map((audit) => audit.scanId))
    for (let index = this.#audits.length - 1; index >= 0; index--) {
      if (this.#audits[index]?.installId === install.id) this.#audits.splice(index, 1)
    }
    this.#installs.delete(install.id)
    this.#leases.delete(`audit:${install.id}`)
    this.#leases.delete(`refresh:${install.id}`)
    return Promise.resolve(true)
  }
}
