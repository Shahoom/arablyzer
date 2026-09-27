import { decodeWindows1252 } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const inBody = (text: string) =>
  detectAll(rule, evidenceOf(htmlPage(`<html lang="ar"><body><p>${text}</p></body></html>`)))

describe('ar-mojibake', () => {
  it('fires on UTF-8 Arabic that was read as Windows-1252 before it reached the page', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'from-utf-8',
        values: {
          found: 'Ù…Ù†ØªØ¬ Ø±Ø§Ø¦Ø¹ ÙˆØµÙ„Ù†ÙŠ Ø¨Ø³Ø±Ø¹Ø©',
          recovered: 'منتج رائع وصلني بسرعة',
        },
        selector: 'body > main > blockquote',
        location: { line: 16 },
        key: 'body > main > blockquote#0',
      },
    ])
  })

  it('fires on every text of a UTF-8 page that the server declares as Windows-1252, eight words at most', async () => {
    const findings = detectAll(rule, await fixtureEvidence(rule.id, 'wrong-charset'))
    expect(findings.map((finding) => [finding.message, finding.values?.recovered])).toEqual([
      ['from-utf-8', 'عطر العود الفاخر'],
      ['from-utf-8', 'عطر العود الفاخر في قارورة من خمسين مل،'],
    ])
  })

  it('fires on a Windows-1256 page that the server declares as Windows-1252', async () => {
    const findings = detectAll(rule, await fixtureEvidence(rule.id, 'wrong-windows-1256'))
    expect(findings.map((finding) => [finding.message, finding.values?.recovered])).toEqual([
      ['from-windows-1256', 'بخور ظفار'],
      ['from-windows-1256', 'بخور من مزارع ظفار في علب من نصف'],
    ])
  })

  it('passes Arabic with French, German and Spanish words in it', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it.each(['Crème brûlée', 'Ça va très bien', 'Ñandú', 'ÆØÅ', 'Ø', 'Øresund', 'Ù'])(
    'leaves %j alone',
    (text) => {
      expect(inBody(text)).toEqual([])
    },
  )

  it('reports the first run of garbled words in a text, up to eight', () => {
    const garbled = decodeWindows1252(
      new TextEncoder().encode('واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة'),
    )
    const [finding] = inBody(`قبل: ${garbled}`)
    expect(finding?.values?.recovered).toBe('واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية')
  })

  // Independent review, 2026-09-27: hostile pages and real text.
  it('stays linear on a word made of punctuation, which a page could use to stall a scan', () => {
    const start = performance.now()
    expect(inBody(`a${'!'.repeat(200_000)}a`)).toEqual([])
    expect(performance.now() - start).toBeLessThan(5000)
  }, 30_000)

  it('leaves out a line of Danish or Norwegian letters, which is not Arabic in Windows-1256', () => {
    expect(inBody('Øen på Åen, ÆØÅ æøå.')).toEqual([])
  })
})
