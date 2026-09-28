import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPolicy } from '@arablyzer/egress'
import { loadSiteConfig, serveCrux, serveSite, trustFixtureCa } from '@arablyzer/fixtures'
import { describe, expect, it } from 'vitest'
import { scan } from '../../src/index'
import { resolverFor, schemaErrors } from '../helpers'
import { GOLDEN_NAMES, normalize, REPORTS, SITES } from './golden'

// Fixture sites served over HTTPS carry certificates from the test authority.
trustFixtureCa()

/**
 * The fonts a browser falls back to differ between machines, so the reports come from the scanner
 * image alone (Phase 1 design §5), which sets ARABLYZER_IMAGE. There, with its network isolated
 * (docker run --network none), all three engines render.
 */
const IN_IMAGE = process.env.ARABLYZER_IMAGE === '1'
/** Writes the reports instead of comparing them: a change needs approval in its PR (§16.3). */
const UPDATE = process.env.ARABLYZER_GOLDEN_UPDATE === '1'
/** Where to write the reports that differ, for CI to keep. */
const OUT = process.env.ARABLYZER_GOLDEN_OUT

/** Fixed ports, so each page's URL, and its findings' fingerprints, stay the same. */
const CRUX_PORT = 41_000
const FIRST_PORT = 41_001

describe.skipIf(!IN_IMAGE)('golden reports, in the scanner image', () => {
  it.each(GOLDEN_NAMES.map((name, index) => [name, index] as const))(
    '%s',
    async (name, index) => {
      const dir = `${SITES}${name}`
      const config = await loadSiteConfig(dir)
      const data = config.crux
      const site = await serveSite(dir, { port: FIRST_PORT + index })
      const crux = data === undefined ? undefined : await serveCrux(data, { port: CRUX_PORT })
      try {
        const report = await scan(site.url('/'), {
          policy: createPolicy({
            allowTargets: [
              { address: '127.0.0.1', port: site.port },
              ...(crux === undefined ? [] : [{ address: '127.0.0.1', port: crux.port }]),
            ],
          }),
          resolver: resolverFor(site),
          // A page over HTTPS carries a certificate of the test authority, which only this process
          // trusts: the browsers refuse it, and Arablyzer never loosens that, so it is not rendered.
          ...(config.tls === undefined
            ? { render: { engines: ['chromium', 'firefox', 'webkit'] as const } }
            : {}),
          ...(crux === undefined
            ? {}
            : { crux: { apiKey: 'golden-key', endpoint: crux.endpoint } }),
        })
        expect(schemaErrors(report)).toBe('')
        const actual = `${JSON.stringify(normalize(report), null, 2)}\n`
        const file = `${REPORTS}${name}.json`
        if (UPDATE) {
          writeFileSync(file, actual)
          return
        }
        // A page without a report yet counts as changed: CI keeps what it gave, to be committed.
        const expected = existsSync(file) ? readFileSync(file, 'utf8') : null
        if (actual !== expected && OUT !== undefined) {
          mkdirSync(OUT, { recursive: true })
          writeFileSync(`${OUT}/${name}.json`, actual)
        }
        expect(expected, `${name}: no golden report yet`).not.toBeNull()
        expect(JSON.parse(actual), `${name}: its report changed`).toEqual(
          JSON.parse(expected ?? 'null'),
        )
      } finally {
        await site.close()
        await crux?.close()
      }
    },
    180_000,
  )
})
