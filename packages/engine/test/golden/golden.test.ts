import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPolicy } from '@arablyzer/egress'
import {
  type CruxStandIn,
  loadSiteConfig,
  serveCrux,
  serveSite,
  trustFixtureCa,
} from '@arablyzer/fixtures'
import { describe, expect, it } from 'vitest'
import { scan } from '../../src/index'
import { resolverFor, schemaErrors } from '../helpers'
import {
  CRUX_PORT,
  FONTS,
  GOLDEN_NAMES,
  IMAGE_FONTS,
  normalize,
  portOf,
  REPORTS,
  SITES,
} from './golden'

// Fixture sites served over HTTPS carry certificates from the test authority.
trustFixtureCa()

/**
 * The fonts a browser falls back to differ between machines, so the reports come from the scanner
 * image alone (Phase 1 design §5), which sets ARABLYZER_IMAGE. There, with its network isolated
 * (docker run --network none), all three engines render the pages served over HTTP.
 */
const IN_IMAGE = process.env.ARABLYZER_IMAGE === '1'
/**
 * Where to write what differs from the committed files, or has none yet, for CI to keep: they are
 * committed from there, and a change needs approval in its PR (BUILD-PLAN §16.3).
 */
const OUT = process.env.ARABLYZER_GOLDEN_OUT

// Outside the image the reports are skipped, and a skipped comparison must not pass for one.
if (OUT !== undefined && !IN_IMAGE) {
  throw new Error(
    'ARABLYZER_GOLDEN_OUT is set outside the scanner image, where nothing is compared',
  )
}

/** The committed file, or null; what differs from it is kept in OUT. */
function committed(file: string, name: string, actual: string): string | null {
  const expected = existsSync(file) ? readFileSync(file, 'utf8') : null
  if (actual !== expected && OUT !== undefined) {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/${name}`, actual)
  }
  return expected
}

describe.skipIf(!IN_IMAGE)('golden reports, in the scanner image', () => {
  // Debian's font packages are not pinned: a change of fonts shows here, not only as reports
  // that differ.
  it('the image has the fonts the reports were made with', () => {
    const actual = readFileSync(IMAGE_FONTS, 'utf8')
    const expected = committed(FONTS, 'fonts.txt', actual)
    expect(expected, 'no fonts.txt yet').not.toBeNull()
    expect(actual).toBe(expected)
  })

  it.each(GOLDEN_NAMES)(
    '%s',
    async (name) => {
      const dir = `${SITES}${name}`
      const config = await loadSiteConfig(dir)
      const site = await serveSite(dir, { port: portOf(name) })
      let crux: CruxStandIn | undefined
      try {
        if (config.crux !== undefined) crux = await serveCrux(config.crux, { port: CRUX_PORT })
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
        const actual = `${JSON.stringify(normalize(report), null, 2)}\n`
        // Kept before anything is checked, so CI has it whatever fails.
        const expected = committed(`${REPORTS}${name}.json`, `${name}.json`, actual)
        expect(schemaErrors(report)).toBe('')
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
