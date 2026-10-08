import { readFileSync } from 'node:fs'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { tempSite, type TempSite } from './helpers'

let site: TempSite | undefined
afterEach(async () => {
  await site?.close()
  site = undefined
})

const fixture = (name: string) =>
  readFileSync(
    new URL(`../../rules/src/rules/dialect-register/fixtures/${name}/index.html`, import.meta.url),
    'utf8',
  )

async function scanOf(html: string, ruleIds: string[]) {
  site = await tempSite({ 'index.html': html })
  return scan(site.url('/'), {
    ruleIds,
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
  })
}

describe('the dialect in a scan', () => {
  it('gives the report the variety, the mix and whether it fits the page', async () => {
    const report = await scanOf(fixture('wrong'), ['dialect-register'])
    expect(report.facts.dialect).toMatchObject({
      outcome: 'classified',
      label: 'gulf',
      country: 'EG',
      fits: false,
    })
    expect(report.facts.dialect?.mix.gulf).toBeGreaterThan(50)
    const right = await scanOf(fixture('right'), ['dialect-register'])
    expect(right.facts.dialect).toMatchObject({ label: 'egyptian', fits: true })
  })

  it('says too little text, and has no fact without the rule', async () => {
    const little = await scanOf(
      '<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body><p>ازاي كده</p></body></html>',
      ['dialect-register'],
    )
    expect(little.facts.dialect).toMatchObject({ outcome: 'too-little', label: null })
    const other = await scanOf(fixture('wrong'), ['ar-html-lang'])
    expect(other.facts.dialect).toBeUndefined()
  })
})
