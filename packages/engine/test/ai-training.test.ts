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
    new URL(
      `../../rules/src/rules/ai-training-filters/fixtures/${name}/index.html`,
      import.meta.url,
    ),
    'utf8',
  )

async function scanOf(html: string, ruleIds: string[]) {
  site = await tempSite({ 'index.html': html })
  return scan(site.url('/'), {
    ruleIds,
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
  })
}

describe('the AI training filters in a scan', () => {
  it('gives the report each check with its value and threshold', async () => {
    const wrong = await scanOf(fixture('wrong'), ['ai-training-filters'])
    expect(wrong.facts.aiTraining).toMatchObject({ outcome: 'tested', passes: false })
    const dup = wrong.facts.aiTraining?.checks.find((item) => item.id === 'dup_line_frac')
    expect(dup).toMatchObject({ threshold: 0.304, pass: false, applied: true })
    expect(wrong.findings.map((finding) => finding.ruleId)).toContain('ai-training-filters')
    const right = await scanOf(fixture('right'), ['ai-training-filters'])
    expect(right.facts.aiTraining).toMatchObject({ outcome: 'tested', passes: true })
    expect(right.findings).toEqual([])
  })

  it('says too little text under 50 words, and has no fact without the rule', async () => {
    const little = await scanOf(
      '<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body><p>نص قصير.</p></body></html>',
      ['ai-training-filters'],
    )
    expect(little.facts.aiTraining).toMatchObject({ outcome: 'too-little', passes: false })
    expect(little.rules.find((rule) => rule.id === 'ai-training-filters')?.status).toBe(
      'not-applicable',
    )
    const other = await scanOf(fixture('wrong'), ['ar-html-lang'])
    expect(other.facts.aiTraining).toBeUndefined()
  })
})
