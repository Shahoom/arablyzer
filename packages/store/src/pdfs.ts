import type { Language, LogoType, PdfError, PdfKind, PdfState } from '@arablyzer/api-contract'

// What PDF export and white-label keep (M4.7). Like the account's other data it holds nothing about a
// visitor, belongs to the account that made it and goes with it. A PDF lives as long as the report it
// is of (the database deletes it with the report) and no longer than the plan's history days.

/** The company's mark on an account's PDFs and shared reports. */
export interface BrandRecord {
  readonly userId: string
  readonly name: string
  /** `#rrggbb`, or null for Arablyzer's own. */
  readonly color: string | null
  /** The logo's type, or null for none; its bytes are `logo()`, read when they are wanted. */
  readonly logoType: LogoType | null
  readonly updatedAt: Date
}

export interface PdfJob {
  readonly id: string
  readonly userId: string
  readonly kind: PdfKind
  /** The report: the scan or crawl (the later one, for a comparison). */
  readonly subject: string
  /** For a comparison, the earlier report. */
  readonly base: string | null
  readonly language: Language
  readonly state: PdfState
  readonly error: PdfError | null
  readonly bytes: number | null
  readonly createdAt: Date
  readonly startedAt: Date | null
  readonly finishedAt: Date | null
  /** While a PDF job holds the job, until when. */
  readonly leaseUntil: Date | null
}

export interface NewPdf {
  readonly id: string
  readonly userId: string
  readonly kind: PdfKind
  readonly subject: string
  readonly base: string | null
  readonly language: Language
  readonly createdAt: Date
}

export type PdfCreated =
  | { readonly kind: 'created'; readonly job: PdfJob }
  /** The account has a PDF queued or being drawn already (one at a time). */
  | { readonly kind: 'active' }
  /** The account has used its month's PDFs. */
  | { readonly kind: 'limit' }

export const ACTIVE_PDF_STATES: readonly PdfState[] = ['queued', 'running']

/** `2026-10`: the month a PDF is counted in, in UTC. */
export const monthOf = (at: Date): string => at.toISOString().slice(0, 7)

/** Whether the report a job is of is a crawl (its kind says so). */
export const isCrawlPdf = (kind: PdfKind): boolean => kind === 'crawl' || kind === 'compare-crawls'

export interface PdfData {
  brand(userId: string): Promise<BrandRecord | null>
  /** The logo's bytes. */
  logo(userId: string): Promise<{ readonly type: LogoType; readonly bytes: Uint8Array } | null>
  /** Sets the name and colour; the logo, if there is one, stays. */
  setBrand(
    userId: string,
    brand: { readonly name: string; readonly color: string | null },
    at: Date,
  ): Promise<void>
  /** Sets or removes (null) the logo; the name and colour stay. */
  setLogo(
    userId: string,
    logo: { readonly type: LogoType; readonly bytes: Uint8Array } | null,
    at: Date,
  ): Promise<void>
  /**
   * Asks for a PDF: counted against the month's allowance and inserted as one step, so two requests at
   * once cannot pass the limit. One PDF at a time per account, held by the database.
   */
  create(input: NewPdf, perMonth: number): Promise<PdfCreated>
  get(id: string): Promise<PdfJob | null>
  /** The account's PDFs, newest first. */
  list(userId: string, limit: number): Promise<PdfJob[]>
  /** How many PDFs the account has asked for in the month of `at`. */
  used(userId: string, at: Date): Promise<number>
  /** The file of a finished PDF. */
  file(id: string): Promise<Uint8Array | null>
  /** The first queued PDF (or one whose job died: its lease ended) now held until `leaseUntil`. */
  claim(now: Date, leaseUntil: Date): Promise<PdfJob | null>
  /** Running → done, with the file. */
  finish(id: string, file: Uint8Array, at: Date): Promise<boolean>
  /** Queued or running → failed; the PDF is given back to the month's allowance. */
  fail(id: string, error: PdfError, at: Date): Promise<boolean>
  /** Gives a PDF back to the queue (the scanner was busy): lease cleared, state queued. */
  requeue(id: string): Promise<void>
  /** False when the account has no such PDF, or it is still being made. */
  remove(userId: string, id: string): Promise<boolean>
  /** Drops the files of PDFs made before `before` (they stay as rows that say so); how many. */
  expire(before: Date): Promise<number>
  /** Deletes the rows of PDFs made before `before`, and the allowance ledger's months before `month`. */
  prune(before: Date, month: string): Promise<number>
  eraseUser(userId: string): Promise<void>
}

interface Stored extends PdfJob {
  readonly file: Uint8Array | null
}

/** PdfData in memory, for tests and `pnpm dev`. */
export class MemoryPdfData implements PdfData {
  readonly #brands = new Map<string, BrandRecord>()
  readonly #logos = new Map<string, { readonly type: LogoType; readonly bytes: Uint8Array }>()
  readonly #jobs = new Map<string, Stored>()
  readonly #usage = new Map<string, number>()

  brand(userId: string): Promise<BrandRecord | null> {
    return Promise.resolve(this.#brands.get(userId) ?? null)
  }

  logo(userId: string) {
    return Promise.resolve(this.#logos.get(userId) ?? null)
  }

  setBrand(
    userId: string,
    brand: { readonly name: string; readonly color: string | null },
    at: Date,
  ): Promise<void> {
    const before = this.#brands.get(userId)
    this.#brands.set(userId, {
      userId,
      name: brand.name,
      color: brand.color,
      logoType: before?.logoType ?? null,
      updatedAt: at,
    })
    return Promise.resolve()
  }

  setLogo(
    userId: string,
    logo: { readonly type: LogoType; readonly bytes: Uint8Array } | null,
    at: Date,
  ): Promise<void> {
    const before = this.#brands.get(userId)
    if (logo === null) this.#logos.delete(userId)
    else this.#logos.set(userId, logo)
    this.#brands.set(userId, {
      userId,
      name: before?.name ?? '',
      color: before?.color ?? null,
      logoType: logo?.type ?? null,
      updatedAt: at,
    })
    return Promise.resolve()
  }

  create(input: NewPdf, perMonth: number): Promise<PdfCreated> {
    for (const job of this.#jobs.values()) {
      if (job.userId === input.userId && ACTIVE_PDF_STATES.includes(job.state)) {
        return Promise.resolve({ kind: 'active' })
      }
    }
    const key = `${input.userId}/${monthOf(input.createdAt)}`
    const used = this.#usage.get(key) ?? 0
    if (used >= perMonth) return Promise.resolve({ kind: 'limit' })
    this.#usage.set(key, used + 1)
    const job: Stored = {
      ...input,
      state: 'queued',
      error: null,
      bytes: null,
      startedAt: null,
      finishedAt: null,
      leaseUntil: null,
      file: null,
    }
    this.#jobs.set(job.id, job)
    return Promise.resolve({ kind: 'created', job: view(job) })
  }

  get(id: string): Promise<PdfJob | null> {
    const job = this.#jobs.get(id)
    return Promise.resolve(job === undefined ? null : view(job))
  }

  list(userId: string, limit: number): Promise<PdfJob[]> {
    return Promise.resolve(
      [...this.#jobs.values()]
        .filter((job) => job.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map(view),
    )
  }

  used(userId: string, at: Date): Promise<number> {
    return Promise.resolve(this.#usage.get(`${userId}/${monthOf(at)}`) ?? 0)
  }

  file(id: string): Promise<Uint8Array | null> {
    const job = this.#jobs.get(id)
    return Promise.resolve(job?.state === 'done' ? job.file : null)
  }

  claim(now: Date, leaseUntil: Date): Promise<PdfJob | null> {
    const next = [...this.#jobs.values()]
      .filter(
        (job) =>
          ACTIVE_PDF_STATES.includes(job.state) &&
          (job.leaseUntil === null || job.leaseUntil.getTime() <= now.getTime()),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
    if (next === undefined) return Promise.resolve(null)
    const taken: Stored = {
      ...next,
      state: 'running',
      startedAt: next.startedAt ?? now,
      leaseUntil,
    }
    this.#jobs.set(next.id, taken)
    return Promise.resolve(view(taken))
  }

  finish(id: string, file: Uint8Array, at: Date): Promise<boolean> {
    const job = this.#jobs.get(id)
    if (job?.state !== 'running') return Promise.resolve(false)
    this.#jobs.set(id, {
      ...job,
      state: 'done',
      file,
      bytes: file.length,
      finishedAt: at,
      leaseUntil: null,
    })
    return Promise.resolve(true)
  }

  fail(id: string, error: PdfError, at: Date): Promise<boolean> {
    const job = this.#jobs.get(id)
    if (job === undefined || !ACTIVE_PDF_STATES.includes(job.state)) return Promise.resolve(false)
    this.#jobs.set(id, { ...job, state: 'failed', error, finishedAt: at, leaseUntil: null })
    const key = `${job.userId}/${monthOf(job.createdAt)}`
    this.#usage.set(key, Math.max(0, (this.#usage.get(key) ?? 0) - 1))
    return Promise.resolve(true)
  }

  requeue(id: string): Promise<void> {
    const job = this.#jobs.get(id)
    if (job?.state === 'running') this.#jobs.set(id, { ...job, state: 'queued', leaseUntil: null })
    return Promise.resolve()
  }

  remove(userId: string, id: string): Promise<boolean> {
    const job = this.#jobs.get(id)
    if (job?.userId !== userId || ACTIVE_PDF_STATES.includes(job.state))
      return Promise.resolve(false)
    this.#jobs.delete(id)
    return Promise.resolve(true)
  }

  expire(before: Date): Promise<number> {
    let count = 0
    for (const [id, job] of this.#jobs) {
      if (job.state === 'done' && job.createdAt.getTime() < before.getTime()) {
        this.#jobs.set(id, { ...job, state: 'expired', file: null })
        count++
      }
    }
    return Promise.resolve(count)
  }

  prune(before: Date, month: string): Promise<number> {
    let count = 0
    for (const [id, job] of this.#jobs) {
      if (!ACTIVE_PDF_STATES.includes(job.state) && job.createdAt.getTime() < before.getTime()) {
        this.#jobs.delete(id)
        count++
      }
    }
    for (const key of this.#usage.keys()) {
      if ((key.split('/')[1] ?? '') < month) this.#usage.delete(key)
    }
    return Promise.resolve(count)
  }

  eraseUser(userId: string): Promise<void> {
    this.#brands.delete(userId)
    this.#logos.delete(userId)
    for (const [id, job] of this.#jobs) if (job.userId === userId) this.#jobs.delete(id)
    for (const key of this.#usage.keys()) if (key.startsWith(`${userId}/`)) this.#usage.delete(key)
    return Promise.resolve()
  }
}

const view = (stored: Stored): PdfJob => {
  // The job as a caller sees it: the file's bytes are read through `file()`, never carried here.
  const job: Record<string, unknown> = { ...stored }
  delete job.file
  return job as unknown as PdfJob
}
