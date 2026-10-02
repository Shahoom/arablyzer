import type * as Collectors from '@arablyzer/collectors'
import { expect, it, vi } from 'vitest'
import { scan } from '../src/index'
import { flagRule, policyFor, schemaErrors, tempSite } from './helpers'

// Stands in for a collector bug, or an input it cannot handle, and for a thread that cannot start.
vi.mock('@arablyzer/collectors', async (importOriginal) => ({
  ...(await importOriginal<typeof Collectors>()),
  collectPage: () => {
    throw new RangeError('Invalid string length')
  },
  collectPageIsolated: () => Promise.reject(new Error('The thread reading the page did not start')),
}))

it.each([
  ['in this process', undefined],
  ['in a thread of its own', {}],
])(
  'fails the scan with a notice, not an exception, when the page cannot be read %s',
  async (_where, isolateParse) => {
    const local = await tempSite({ 'index.html': '<p>مرحبا</p>' })
    try {
      const report = await scan(local.url('/'), {
        rules: [flagRule()],
        policy: policyFor(local),
        ...(isolateParse === undefined ? {} : { isolateParse }),
      })
      expect(schemaErrors(report)).toBe('')
      expect(report.scan.status).toBe('failed')
      expect(report.scan.notices.map((item) => item.code)).toEqual(['page-unreadable'])
      expect(report.target.http.status).toBe(200)
      expect(report.page).toBeNull()
      expect(report.rules[0]).toMatchObject({ status: 'error', error: 'page-unreadable' })
    } finally {
      await local.close()
    }
  },
)
