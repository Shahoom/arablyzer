import { PDF_ID_PATTERN } from '@arablyzer/api-contract'
import { planCatalogFrom, DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import { PdfDocument } from '@arablyzer/pdf'
import { ScannerUnavailable } from '@arablyzer/scanner-client'
import {
  MemoryAccountData,
  MemoryCrawlData,
  MemoryPdfData,
  MemoryScanStore,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createPdfRunner, UNAVAILABLE_MS } from '../src/pdf/runner'
import { readFileSync } from 'node:fs'
import type { Report } from '@arablyzer/report-schema'

const GOLDEN = new URL('../../../fixtures/golden/reports/04-rtl-layout.json', import.meta.url)
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Report

// M4.7: the PDF job — what it sends the scanner, what it keeps, and what it does when the scanner
// is busy, fails, or the report is gone.

const NOW = new Date('2026-10-10T10:00:00.000Z')
const SCAN = 'report'.padEnd(22, '_')
const USER = 'user'.padEnd(22, '_')
const PLANS = planCatalogFrom(
  {
    ARABLYZER_PLAN_ACCOUNT_SCANS: '3',
    ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
    ARABLYZER_PLAN_ACCOUNT_WHITE_LABEL: 'on',
  },
  { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 },
)

async function setup(renderer: (document: PdfDocument) => Promise<Uint8Array>) {
  const store = new MemoryScanStore()
  const pdfs = new MemoryPdfData()
  const crawls = new MemoryCrawlData()
  new MemoryAccountData(store)
  await store.create({ id: SCAN, url: 'https://shop.example/', createdAt: NOW })
  await store.start(SCAN, NOW)
  await store.finish(SCAN, golden, NOW)
  let clock = NOW.getTime()
  const slept: number[] = []
  const runner = createPdfRunner({
    pdfs,
    crawls,
    store,
    plans: PLANS,
    scanner: (document) => renderer(document),
    now: () => new Date(clock),
    sleep: (ms) => {
      slept.push(ms)
      clock += ms + UNAVAILABLE_MS / 4
      return Promise.resolve()
    },
    log: () => undefined,
  })
  const ask = async (language: 'ar' | 'en' = 'ar') => {
    const made = await pdfs.create(
      {
        id: 'job'.padEnd(22, '_'),
        userId: USER,
        kind: 'scan',
        subject: SCAN,
        base: null,
        language,
        createdAt: NOW,
      },
      3,
    )
    if (made.kind !== 'created') throw new Error('not created')
    return made.job.id
  }
  const advance = (ms: number) => {
    clock += ms
  }
  return { runner, pdfs, store, ask, slept, advance }
}

describe('the PDF job', () => {
  it('sends the scanner a document in the person’s language, and keeps the file it draws', async () => {
    let sent: PdfDocument | null = null
    const { runner, pdfs, ask } = await setup((document) => {
      sent = document
      return Promise.resolve(new Uint8Array([37, 80, 68, 70, 45]))
    })
    const id = await ask('ar')
    expect(PDF_ID_PATTERN.test(id)).toBe(true)
    await runner.tick()
    expect(sent).toMatchObject({ lang: 'ar', kind: 'scan', brand: null })
    expect(PdfDocument.safeParse(sent).success).toBe(true)
    const job = await pdfs.get(id)
    expect(job).toMatchObject({ state: 'done', bytes: 5 })
    expect(Array.from((await pdfs.file(id)) ?? [])).toEqual([37, 80, 68, 70, 45])
  })

  it('puts the account’s brand in the document only while its plan has white-label', async () => {
    let sent: PdfDocument | null = null
    const { runner, pdfs, ask } = await setup((document) => {
      sent = document
      return Promise.resolve(new Uint8Array([1]))
    })
    await pdfs.setBrand(USER, { name: 'شركة النور', color: '#ffff00' }, NOW)
    await ask('en')
    await runner.tick()
    const brand = (sent as PdfDocument | null)?.brand
    // The faint colour was replaced by Arablyzer's, and the credit line is the plan's.
    expect(brand).toMatchObject({
      name: 'شركة النور',
      color: '#3730a3',
      credit: 'by Arablyzer',
      logo: null,
    })
  })

  it('waits for a scanner that is busy, then fails the PDF and gives it back to the month', async () => {
    const { runner, pdfs, ask, slept } = await setup(() =>
      Promise.reject(new ScannerUnavailable('busy')),
    )
    const id = await ask()
    await runner.tick()
    expect(slept.length).toBeGreaterThan(1)
    expect(await pdfs.get(id)).toMatchObject({ state: 'failed', error: 'scanner-unavailable' })
    expect(await pdfs.used(USER, NOW)).toBe(0)
  })

  it('succeeds when the scanner is free again', async () => {
    let calls = 0
    const { runner, pdfs, ask } = await setup(() =>
      ++calls < 3
        ? Promise.reject(new ScannerUnavailable('busy'))
        : Promise.resolve(new Uint8Array([2])),
    )
    const id = await ask()
    await runner.tick()
    expect((await pdfs.get(id))?.state).toBe('done')
  })

  it('names why a PDF failed: too large, too slow, or its own fault; and a report that is gone', async () => {
    for (const [error, expected] of [
      [new Error('too-large'), 'too-large'],
      [
        Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        }),
        'timeout',
      ],
      [new Error('boom'), 'internal'],
    ] as const) {
      const { runner, pdfs, ask } = await setup(() => Promise.reject(error))
      const id = await ask()
      await runner.tick()
      expect((await pdfs.get(id))?.error, expected).toBe(expected)
    }
    const { runner, pdfs, ask, store } = await setup(() => Promise.resolve(new Uint8Array([1])))
    const id = await ask()
    await store.delete(SCAN, 'nope')
    // The scan is kept (a wrong token deletes nothing), so remove its report the way retention does.
    await store.deleteOlderThan(new Date(NOW.getTime() + 1000), 'unlinked')
    await runner.tick()
    expect((await pdfs.get(id))?.state).toBe('failed')
  })

  it('drops the files of old PDFs after the plan’s days', async () => {
    const { runner, pdfs, ask, advance } = await setup(() => Promise.resolve(new Uint8Array([1])))
    const id = await ask()
    await runner.tick()
    expect((await pdfs.get(id))?.state).toBe('done')
    advance(80 * 86_400_000)
    await runner.tick()
    expect((await pdfs.get(id))?.state).toBe('done')
    advance(20 * 86_400_000)
    await runner.tick()
    // Past the plan's 90 days the file, and the row with it (its 35 days are long over), are gone.
    expect(await pdfs.file(id)).toBeNull()
    expect(await pdfs.get(id)).toBeNull()
  })
})
