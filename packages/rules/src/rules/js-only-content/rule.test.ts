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
import { MIN_DRAWN_WORDS, rule } from './rule'

const HEADING = 'قهوة عربية بالهيل'
const PARAGRAPHS = [
  'قهوة عربية محمّصة تحميصاً خفيفاً ومطحونة مع الهيل، في علب تُشحن خلال يومين.',
  'تُحضَّر في الدلة على نار هادئة، وتُقدَّم مع التمر في فناجين صغيرة.',
  'الطلب من ثلاث علب فأكثر يُشحن مجاناً إلى كل مدن السلطنة.',
]

const LETTERS = Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهوي')
/** A word of three letters that no other index gives: the Arabic words a page draws or sends. */
const word = (index: number) =>
  [index % 28, Math.floor(index / 28) % 28, Math.floor(index / 784) % 28]
    .map((letter) => LETTERS[letter])
    .join('')
/** `count` different words from the index on, as a block of text. */
const words = (from: number, count: number) =>
  Array.from({ length: count }, (_, offset) => word(from + offset)).join(' ')

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
    // Twenty words drawn, ten of them in the HTML.
    const drawnWords = words(0, 20)
    const half = renderedEvidence(
      [
        renderedFacts('chromium', {
          arabicText: [arabicBlock({ selector: 'p', text: drawnWords })],
        }),
      ],
      htmlPage(`<html lang="ar"><body><p>${words(0, 10)}</p></body></html>`),
    )
    expect(detectAll(rule, half)).toEqual([])
    // Nine of them: eleven missing of twenty.
    const more = renderedEvidence(
      [
        renderedFacts('chromium', {
          arabicText: [arabicBlock({ selector: 'p', text: drawnWords })],
        }),
      ],
      htmlPage(`<html lang="ar"><body><p>${words(0, 9)}</p></body></html>`),
    )
    expect(detectAll(rule, more)).toMatchObject([{ values: { missing: 11, total: 20, share: 55 } }])
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

  it('applies to a page drawn with Arabic text, enough of it', () => {
    expect(applies(rule, renderedEvidence([drawn('chromium', ...PARAGRAPHS)], sent()))).toBe(true)
    // The heading alone is three words.
    expect(applies(rule, renderedEvidence([drawn('chromium')], sent()))).toBe(false)
    expect(
      applies(rule, renderedEvidence([renderedFacts('chromium', { arabicText: [] })], sent())),
    ).toBe(false)
  })

  // M2.3c review: the test is whether a word is in the HTML as sent, not whether a visitor sees it
  // without JavaScript. A page that sends its text hidden, or in <noscript>, sends it all the same.
  it('reads all the text of the body as sent, hidden or not', () => {
    const text = words(0, MIN_DRAWN_WORDS + 5)
    const drawnWhole = renderedEvidence([
      renderedFacts('chromium', {
        arabicText: [arabicBlock({ selector: 'p', text })],
      }),
    ])
    for (const wrapper of [
      `<div hidden><p>${text}</p></div>`,
      `<div style="display:none"><p>${text}</p></div>`,
      `<noscript><p>${text}</p></noscript>`,
      `<template><p>${text}</p></template>`,
      `<div hidden><div hidden><p>${text}</p></div></div>`,
    ]) {
      const page = htmlPage(`<html lang="ar"><body><div id="app"></div>${wrapper}</body></html>`)
      expect(detectAll(rule, { ...drawnWhole, page }), wrapper).toEqual([])
    }
    // Text in a script is code, not the page's text: a script that holds the words writes them.
    const scripted = htmlPage(
      `<html lang="ar"><body><div id="app"></div><script>const t = "${text}"</script></body></html>`,
    )
    expect(detectAll(rule, { ...drawnWhole, page: scripted })).toHaveLength(1)
  })

  // A language switch, a currency, a cookie notice: a script may add a few Arabic words to a page
  // that is not Arabic, and they say nothing of how it is written.
  it('judges a browser only when it drew at least the minimum number of Arabic words', () => {
    const english = htmlPage('<html lang="en"><body><h1>Coffee shop</h1></body></html>')
    const drew = (count: number, engine: Engine = 'chromium') =>
      renderedFacts(engine, { arabicText: [arabicBlock({ selector: 'p', text: words(0, count) })] })
    // One word: the language switch.
    expect(applies(rule, renderedEvidence([drew(1)], english))).toBe(false)
    expect(detectAll(rule, renderedEvidence([drew(1)], english))).toEqual([])
    // One word short of the minimum, and the minimum.
    expect(applies(rule, renderedEvidence([drew(MIN_DRAWN_WORDS - 1)], english))).toBe(false)
    expect(detectAll(rule, renderedEvidence([drew(MIN_DRAWN_WORDS - 1)], english))).toEqual([])
    expect(applies(rule, renderedEvidence([drew(MIN_DRAWN_WORDS)], english))).toBe(true)
    expect(detectAll(rule, renderedEvidence([drew(MIN_DRAWN_WORDS)], english))).toMatchObject([
      { values: { missing: MIN_DRAWN_WORDS, total: MIN_DRAWN_WORDS, share: 100 } },
    ])
  })

  it('counts the words of a block its engine cut short toward the minimum without the last', () => {
    // A block of the 200 characters an engine keeps has its last word left out.
    const long = words(0, 60).slice(0, 200)
    expect(long).toHaveLength(200)
    const evidence = renderedEvidence(
      [renderedFacts('chromium', { arabicText: [arabicBlock({ selector: 'p', text: long })] })],
      htmlPage('<html lang="en"><body>x</body></html>'),
    )
    const counted = long.trim().split(' ').length - 1
    expect(counted).toBeGreaterThanOrEqual(MIN_DRAWN_WORDS)
    expect(detectAll(rule, evidence)).toMatchObject([{ values: { total: counted } }])
  })

  it('judges each browser on its own, and only those that drew enough', () => {
    const english = htmlPage('<html lang="en"><body>x</body></html>')
    const evidence = renderedEvidence(
      [
        renderedFacts('chromium', { arabicText: [arabicBlock({ text: words(0, 30) })] }),
        renderedFacts('firefox', { arabicText: [arabicBlock({ text: words(0, 3) })] }),
      ],
      english,
    )
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toMatchObject([{ engines: ['chromium'] }])
  })

  // The message says what was measured, and no more: which words are not in the HTML the scan
  // received, not who wrote them.
  it('says of the words only that the HTML the scan received lacks them', () => {
    expect(rule.copy.en.messages.scripted).toMatch(/\bmay\b/)
    expect(rule.copy.en.messages.scripted).not.toMatch(/scripts write them/i)
    expect(rule.copy.ar.messages.scripted).toContain('قد')
    for (const lang of ['ar', 'en'] as const) {
      for (const name of ['missing', 'total', 'share']) {
        expect(rule.copy[lang].messages.scripted, `${lang} ${name}`).toContain(`{${name}}`)
      }
    }
  })
})
