import type { ArabicTextBlock, Engine, RenderedFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import {
  applies,
  arabicBlock,
  detectAll,
  htmlPage,
  renderedEvidence,
  renderedFacts,
} from '../../../test/helpers'
import { rule } from './rule'

const HEADING = 'قهوة عربية بالهيل'
const PARAGRAPHS = [
  'قهوة عربية محمّصة تحميصاً خفيفاً ومطحونة مع الهيل، في علب تُشحن خلال يومين.',
  'تُحضَّر في الدلة على نار هادئة، وتُقدَّم مع التمر في فناجين صغيرة.',
  'الطلب من ثلاث علب فأكثر يُشحن مجاناً إلى كل مدن السلطنة.',
]

/** The page as sent, with these paragraphs in its HTML. */
const sent = (...paragraphs: string[]) =>
  htmlPage(
    `<html lang="ar" dir="rtl"><body><main id="app"><h1>${HEADING}</h1>${paragraphs
      .map((text) => `<p>${text}</p>`)
      .join('')}</main></body></html>`,
  )

/** One engine's render: the heading, then these paragraphs, each a block of its own. */
const drawn = (engine: Engine, ...paragraphs: string[]): RenderedFacts =>
  renderedFacts(engine, {
    arabicText: [
      arabicBlock({ selector: 'h1', text: HEADING }),
      ...paragraphs.map((text, index) =>
        arabicBlock({ selector: `#app > p:nth-of-type(${String(index + 1)})`, text }),
      ),
    ],
  })

describe('js-only-content', () => {
  it('fires when most of the Arabic words drawn are not in the HTML as sent', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([drawn('chromium', ...PARAGRAPHS), drawn('firefox', ...PARAGRAPHS)], sent()),
    )
    expect(findings).toEqual([
      {
        message: 'scripted',
        values: { missing: 34, total: 39, share: 87 },
        selector: '#app > p:nth-of-type(1)',
        snippet: PARAGRAPHS[0],
        engines: ['chromium', 'firefox'],
        box: { x: 20, y: 40, width: 350, height: 24 },
      },
    ])
  })

  it('passes a page whose words are in its HTML, which scripts may redraw', () => {
    const evidence = renderedEvidence([drawn('chromium', ...PARAGRAPHS)], sent(...PARAGRAPHS))
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('counts more than half the words, not half', () => {
    // Four words drawn, two of them in the HTML.
    const half = renderedEvidence(
      [
        renderedFacts('chromium', {
          arabicText: [arabicBlock({ selector: 'p', text: 'قهوة عربية جديدة طازجة' })],
        }),
      ],
      htmlPage('<html lang="ar"><body><p>قهوة عربية</p></body></html>'),
    )
    expect(detectAll(rule, half)).toEqual([])
    const more = renderedEvidence(
      [
        renderedFacts('chromium', {
          arabicText: [arabicBlock({ selector: 'p', text: 'قهوة جديدة طازجة' })],
        }),
      ],
      htmlPage('<html lang="ar"><body><p>قهوة عربية</p></body></html>'),
    )
    expect(detectAll(rule, more)).toMatchObject([{ values: { missing: 2, total: 3, share: 67 } }])
  })

  it('names only the engines where most of the words are missing', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([drawn('chromium', ...PARAGRAPHS), drawn('firefox')], sent()),
    )
    expect(findings).toMatchObject([{ engines: ['chromium'] }])
  })

  it('reads words as the same whatever their marks, tatweel or presentation forms', () => {
    const block: Partial<ArabicTextBlock> = { selector: 'p', text: 'مُـحـمّـد يُرحّب بكم' }
    const evidence = renderedEvidence(
      [renderedFacts('chromium', { arabicText: [arabicBlock(block)] })],
      htmlPage('<html lang="ar"><body><p>محمد يرحب بكم</p></body></html>'),
    )
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('leaves out the last word of a block its engine cut short', () => {
    // The engines keep the first 200 characters of a block; its last word may be cut in two.
    const long = `${'كلمة '.repeat(39)}مقطوعة`.slice(0, 200)
    expect(long).toHaveLength(200)
    const evidence = renderedEvidence(
      [renderedFacts('chromium', { arabicText: [arabicBlock({ selector: 'p', text: long })] })],
      htmlPage(`<html lang="ar"><body><p>${'كلمة '.repeat(39)}مقطوعةتماماً</p></body></html>`),
    )
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('applies to a page drawn with Arabic text', () => {
    expect(applies(rule, renderedEvidence([drawn('chromium')], sent()))).toBe(true)
    expect(
      applies(rule, renderedEvidence([renderedFacts('chromium', { arabicText: [] })], sent())),
    ).toBe(false)
  })
})
