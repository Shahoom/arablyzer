import { fileURLToPath } from 'node:url'
import type { ScanEvent } from '@arablyzer/api-contract'
import { createPolicy } from '@arablyzer/egress'
import { serveSite } from '@arablyzer/fixtures'
import { describe, expect, it } from 'vitest'
import { eventOf } from '../src/events'
import { localScanner } from '../src/local'

describe('localScanner', () => {
  it('runs the engine on a golden page, its steps as the page reads them', async () => {
    const site = await serveSite(
      fileURLToPath(new URL('../../../fixtures/golden/sites/20-clean-contact/', import.meta.url)),
    )
    try {
      const seen: ScanEvent[] = []
      const report = await localScanner({
        policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      })(site.url('/'), (event) => seen.push(event))
      expect(report.scan.status).toBe('complete')
      expect(report.target.url).toBe(site.url('/'))
      expect(seen[0]).toEqual({ type: 'started', engines: [] })
      expect(seen[1]).toEqual({
        type: 'page',
        status: 200,
        contentType: 'text/html; charset=utf-8',
        error: null,
      })
      expect(seen.at(-1)?.type).toBe('rules')
    } finally {
      await site.close()
    }
  })

  it('names the engines the scan will render in when it starts', () => {
    expect(eventOf({ step: 'start', engines: ['chromium', 'webkit'] })).toEqual({
      type: 'started',
      engines: ['chromium', 'webkit'],
    })
  })
})
