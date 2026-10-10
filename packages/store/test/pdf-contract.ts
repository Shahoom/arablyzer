import { describe, expect, it } from 'vitest'
import type { NewPdf, PdfData } from '../src/index'

export const NOW = new Date('2026-10-09T12:00:00.000Z')
const MINUTE = 60_000
export const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE)

export interface PdfHarness {
  readonly pdfs: PdfData
  /** Makes the person exist (PostgreSQL keeps a foreign key to them). */
  readonly user: (id: string) => Promise<void>
  /** Makes a scan exist (PostgreSQL keeps a foreign key to it). */
  readonly scan: (scanId: string) => Promise<void>
  /** Empties the PDF tables, so a claim finds only this test's jobs (PostgreSQL shares them between tests). */
  readonly reset: () => Promise<void>
}

let counter = 0
/** An id of 22 characters, as a scan's or a PDF's. */
export const id = (prefix: string) => `${prefix}${String(++counter)}`.padEnd(22, '_')

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

/** What PDF export keeps, run over the memory store and PostgreSQL alike (M4.7). */
export function pdfContract(make: () => PdfHarness | Promise<PdfHarness>): void {
  async function setup() {
    const h = await make()
    await h.reset()
    const userId = id('u')
    await h.user(userId)
    const input = async (overrides: Partial<NewPdf> = {}): Promise<NewPdf> => {
      const subject = overrides.subject ?? id('s')
      await h.scan(subject)
      return {
        id: id('p'),
        userId,
        kind: 'scan',
        subject,
        base: null,
        language: 'ar',
        createdAt: NOW,
        ...overrides,
      }
    }
    return { ...h, userId, input }
  }

  describe('PDF jobs', () => {
    it('queues one PDF at a time for an account, and counts it against the month', async () => {
      const { pdfs, input, userId } = await setup()
      const first = await pdfs.create(await input(), 3)
      expect(first.kind).toBe('created')
      expect((await pdfs.create(await input(), 3)).kind).toBe('active')
      expect(await pdfs.used(userId, NOW)).toBe(1)
      if (first.kind !== 'created') return
      await pdfs.claim(NOW, at(4))
      await pdfs.finish(first.job.id, new Uint8Array([37, 80, 68, 70]), at(1))
      expect((await pdfs.create(await input(), 3)).kind).toBe('created')
    })

    it('stops at the month’s allowance, starts again with the next month, and gives a failed PDF back', async () => {
      const { pdfs, input, userId } = await setup()
      for (let n = 0; n < 2; n++) {
        const made = await pdfs.create(await input({ createdAt: at(n) }), 2)
        if (made.kind !== 'created') throw new Error('not created')
        await pdfs.claim(at(n), at(n + 4))
        await pdfs.finish(made.job.id, new Uint8Array([1]), at(n))
      }
      expect((await pdfs.create(await input({ createdAt: at(5) }), 2)).kind).toBe('limit')
      expect(await pdfs.used(userId, NOW)).toBe(2)
      const nextMonth = new Date('2026-11-02T00:00:00.000Z')
      const later = await pdfs.create(await input({ createdAt: nextMonth }), 2)
      expect(later.kind).toBe('created')
      expect(await pdfs.used(userId, nextMonth)).toBe(1)
      if (later.kind !== 'created') return
      await pdfs.fail(later.job.id, 'internal', nextMonth)
      expect(await pdfs.used(userId, nextMonth)).toBe(0)
    })

    it('hands a queued PDF to one job at a time and takes it back when the lease ends', async () => {
      const { pdfs, input } = await setup()
      const made = await pdfs.create(await input(), 3)
      if (made.kind !== 'created') throw new Error('not created')
      const taken = await pdfs.claim(NOW, at(4))
      expect(taken?.id).toBe(made.job.id)
      expect(taken?.state).toBe('running')
      expect(await pdfs.claim(at(1), at(5))).toBeNull()
      expect((await pdfs.claim(at(5), at(9)))?.id).toBe(made.job.id)
      await pdfs.requeue(made.job.id)
      expect((await pdfs.get(made.job.id))?.state).toBe('queued')
    })

    it('keeps the file of a finished PDF, serves it to nobody else, and drops it with expiry', async () => {
      const { pdfs, input, userId } = await setup()
      const made = await pdfs.create(await input({ kind: 'compare-scans', base: id('b') }), 3)
      if (made.kind !== 'created') throw new Error('not created')
      expect(await pdfs.file(made.job.id)).toBeNull()
      await pdfs.claim(NOW, at(4))
      expect(await pdfs.finish(made.job.id, new Uint8Array([1, 2, 3]), at(1))).toBe(true)
      expect(await pdfs.finish(made.job.id, new Uint8Array([9]), at(2))).toBe(false)
      expect(Array.from((await pdfs.file(made.job.id)) ?? [])).toEqual([1, 2, 3])
      expect((await pdfs.get(made.job.id))?.bytes).toBe(3)
      expect((await pdfs.list(userId, 10)).map((job) => job.id)).toEqual([made.job.id])
      await pdfs.expire(at(-5))
      expect((await pdfs.get(made.job.id))?.state).toBe('done')
      expect(await pdfs.expire(at(60))).toBeGreaterThanOrEqual(1)
      expect(await pdfs.file(made.job.id)).toBeNull()
      expect((await pdfs.get(made.job.id))?.state).toBe('expired')
      expect(await pdfs.prune(at(120), '2026-09')).toBeGreaterThanOrEqual(1)
      expect(await pdfs.get(made.job.id)).toBeNull()
    })

    it('does not delete a PDF that is being made', async () => {
      const { pdfs, input, userId } = await setup()
      const made = await pdfs.create(await input(), 3)
      if (made.kind !== 'created') throw new Error('not created')
      expect(await pdfs.remove(userId, made.job.id)).toBe(false)
      await pdfs.fail(made.job.id, 'timeout', at(1))
      expect(await pdfs.remove(userId, made.job.id)).toBe(true)
    })
  })

  describe('the brand', () => {
    it('keeps a name, a colour and a logo apart, and erases all of them with the account', async () => {
      const { pdfs, userId, input } = await setup()
      expect(await pdfs.brand(userId)).toBeNull()
      await pdfs.setLogo(userId, { type: 'image/png', bytes: PNG }, NOW)
      await pdfs.setBrand(userId, { name: 'شركة النور', color: '#112233' }, at(1))
      const brand = await pdfs.brand(userId)
      expect(brand).toMatchObject({ name: 'شركة النور', color: '#112233', logoType: 'image/png' })
      expect(Array.from((await pdfs.logo(userId))?.bytes ?? [])).toEqual(Array.from(PNG))
      await pdfs.setLogo(userId, null, at(2))
      expect((await pdfs.brand(userId))?.logoType).toBeNull()
      expect(await pdfs.logo(userId)).toBeNull()
      expect((await pdfs.brand(userId))?.name).toBe('شركة النور')

      await pdfs.setLogo(userId, { type: 'image/png', bytes: PNG }, at(3))
      await pdfs.create(await input(), 3)
      await pdfs.eraseUser(userId)
      expect(await pdfs.brand(userId)).toBeNull()
      expect(await pdfs.logo(userId)).toBeNull()
      expect(await pdfs.list(userId, 10)).toEqual([])
      expect(await pdfs.used(userId, NOW)).toBe(0)
    })
  })
}
