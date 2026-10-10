import type { PdfError } from '@arablyzer/api-contract'
import { PdfDocument } from '@arablyzer/pdf'
import { ScannerUnavailable, type PdfRenderer } from '@arablyzer/scanner-client'
import { monthOf, quietly, type PdfJob } from '@arablyzer/store'
import { documentOf, SubjectGone, type DocumentDeps } from './document'

export interface PdfRunnerDeps extends DocumentDeps {
  /** The scanner's PDF interface: it draws the document in its browser. */
  readonly scanner: PdfRenderer
  readonly sleep?: (ms: number) => Promise<void>
  readonly log?: (message: string) => void
}

/** How long a job holds a PDF before another may take it: longer than the scanner's own limit. */
export const LEASE_MS = 4 * 60_000
/** How long a scanner that is busy or not there is waited for before the PDF fails. */
export const UNAVAILABLE_MS = 3 * 60_000
/** How often the sweep of old files runs. */
export const SWEEP_MS = 60 * 60_000
const DAY_MS = 24 * 60 * 60 * 1000
/** Rows of finished PDFs are kept this long at least, so a month's list is not shorter than its allowance. */
const ROWS_DAYS = 35

export interface PdfRunner {
  /** Makes the PDFs that are waiting, one after the other; resolves when none is. */
  tick(): Promise<void>
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** What a failed PDF is called on the page. */
function errorOf(error: unknown): PdfError {
  if (error instanceof ScannerUnavailable) return 'scanner-unavailable'
  const text = message(error)
  if (text === 'too-large') return 'too-large'
  if (/abort|timeout|timed out/i.test(text) || (error as Error).name === 'TimeoutError')
    return 'timeout'
  return 'internal'
}

/**
 * The PDF job (M4.7), in the API's image and not in its process: it takes a queued PDF, builds the
 * document from the report as it is, has the scanner's browser draw it, and keeps the file. The
 * account's one-at-a-time and its month's allowance were settled when the PDF was asked for. A job
 * that dies is taken up again when its lease ends; a scanner that is busy is waited for, within
 * `UNAVAILABLE_MS`, and then the PDF fails (and is given back to the month's allowance).
 */
export function createPdfRunner(deps: PdfRunnerDeps): PdfRunner {
  const now = deps.now
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const told = quietly('PDF', deps.log)
  let lastSweep = 0

  async function draw(job: PdfJob): Promise<Uint8Array> {
    const document = PdfDocument.parse(await documentOf(deps, job))
    const started = now().getTime()
    for (let wait = 2_000; ; wait = Math.min(2 * wait, 15_000)) {
      try {
        return await deps.scanner(document)
      } catch (error) {
        if (!(error instanceof ScannerUnavailable)) throw error
        if (now().getTime() - started > UNAVAILABLE_MS) throw error
        await sleep(wait)
      }
    }
  }

  async function make(job: PdfJob): Promise<void> {
    try {
      const file = await draw(job)
      if (!(await deps.pdfs.finish(job.id, file, now()))) {
        told(new Error(`PDF ${job.id} was no longer running when its file was ready`))
      }
    } catch (error) {
      if (!(error instanceof SubjectGone))
        told(new Error(`PDF ${job.id} failed: ${message(error)}`))
      await deps.pdfs.fail(
        job.id,
        error instanceof SubjectGone ? 'internal' : errorOf(error),
        now(),
      )
    }
  }

  /** Files kept for the plan's history days at most; rows a little longer, for the month's list. */
  async function sweep(): Promise<void> {
    const at = now()
    if (at.getTime() - lastSweep < SWEEP_MS) return
    lastSweep = at.getTime()
    const days = deps.plans.account.historyDays
    await deps.pdfs.expire(new Date(at.getTime() - days * DAY_MS))
    const rows = new Date(at.getTime() - Math.max(days, ROWS_DAYS) * DAY_MS)
    await deps.pdfs.prune(rows, monthOf(new Date(at.getTime() - 92 * DAY_MS)))
  }

  return {
    async tick() {
      for (;;) {
        const job = await deps.pdfs.claim(now(), new Date(now().getTime() + LEASE_MS))
        if (job === null) break
        await make(job)
      }
      await sweep().catch((error: unknown) => {
        told(new Error(`The sweep failed: ${message(error)}`))
      })
    },
  }
}
