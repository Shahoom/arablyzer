import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_CODE_POINTS, inRanges } from '../src/code-points'
import { decodeStylesheet, readStylesheet } from '../src/stylesheet'
import { encodeSingleByte } from './helpers'

const BASE = 'https://example.com/assets/css/site.css'

describe('readStylesheet: @font-face', () => {
  it('reads the family, the url() sources resolved in order, and unicode-range', () => {
    const { fontFaces } = readStylesheet(
      `@font-face {
        font-family: "Noto Kufi Arabic";
        src: local("Noto Kufi Arabic"), url("../fonts/kufi.woff2") format("woff2"),
          url(/fonts/kufi.woff?v=2#iefix) format("woff");
        unicode-range: U+0600-06FF, U+200C-200E;
      }`,
      BASE,
    )
    expect(fontFaces).toEqual([
      {
        family: 'Noto Kufi Arabic',
        sources: [
          { kind: 'url', url: 'https://example.com/assets/fonts/kufi.woff2' },
          { kind: 'url', url: 'https://example.com/fonts/kufi.woff?v=2' },
        ],
        unicodeRange: [
          [0x600, 0x6ff],
          [0x200c, 0x200e],
        ],
      },
    ])
  })

  it('takes a family name as identifiers or with escapes, and reads rules inside @media', () => {
    const { fontFaces } = readStylesheet(
      `@media screen { @font-face { font-family: Brand   Arabic; src: url(a.woff2) } }
       @font-face { font-family: "\\62F\\627 \\631"; src: url(b.woff2) }`,
      BASE,
    )
    expect(fontFaces.map((face) => face.family)).toEqual(['Brand Arabic', 'دار'])
  })

  it('gives a rule without unicode-range, or with one the browser ignores, all of Unicode', () => {
    const { fontFaces } = readStylesheet(
      `@font-face { font-family: A; src: url(a.woff2) }
       @font-face { font-family: B; src: url(b.woff2); unicode-range: U+06FF-0600 }`,
      BASE,
    )
    expect(fontFaces.map((face) => face.unicodeRange)).toEqual([ALL_CODE_POINTS, ALL_CODE_POINTS])
  })

  it('reads a font inlined as a base64 data: URL', () => {
    const font = readFileSync(
      new URL(
        '../../../fixtures/shared/fonts/arablyzer-test-arabic-partial.woff2',
        import.meta.url,
      ),
    )
    const { fontFaces } = readStylesheet(
      `@font-face { font-family: Inline; src: url(data:font/woff2;base64,${font.toString('base64')}) format("woff2") }`,
      BASE,
    )
    const [source] = fontFaces[0]?.sources ?? []
    expect(source?.kind).toBe('data')
    const coverage = source?.kind === 'data' ? source.coverage : null
    expect(coverage).not.toBeNull()
    expect(inRanges(coverage ?? [], 0x627)).toBe(true)
    expect(inRanges(coverage ?? [], 0x6a4)).toBe(false)
  })

  it('leaves out a rule without a valid family', () => {
    expect(
      readStylesheet('@font-face { src: url(a.woff2) } @font-face { font-family: A, B }', BASE)
        .fontFaces,
    ).toEqual([])
  })
})

describe('readStylesheet: sides set by left or right', () => {
  it('finds physical properties and values, with where they are', () => {
    const facts = readStylesheet(
      `.card { margin-left: 12px; padding: 4px }
.menu > li { float: right; text-align: left !important }
.box { border-top-right-radius: 4px; text-align: start; float: inline-start }`,
      BASE,
    )
    expect(facts.physicalCount).toBe(4)
    expect(facts.physical).toEqual([
      { selector: '.card', property: 'margin-left', value: '12px', line: 1, column: 9 },
      { selector: '.menu > li', property: 'float', value: 'right', line: 2, column: 14 },
      {
        selector: '.menu > li',
        property: 'text-align',
        value: 'left !important',
        line: 2,
        column: 28,
      },
    ])
  })

  it('leaves out both sides set alike, and blocks that set their own direction', () => {
    const facts = readStylesheet(
      `.overlay { position: absolute; left: 0; right: 0 }
.center { margin-left: auto; margin-right: auto }
pre { direction: ltr; text-align: left; padding-left: 1em }
.half { margin-left: 0; margin-right: 8px }`,
      BASE,
    )
    expect(facts.physicalCount).toBe(2)
    expect(facts.physical.map((item) => item.property)).toEqual(['margin-left', 'margin-right'])
  })

  it('leaves out rules written for one direction or language', () => {
    const facts = readStylesheet(
      `[dir="rtl"] .a { margin-right: 4px }
html[dir=ltr] .b { margin-left: 4px }
.c:dir(rtl) { padding-left: 2px }
body.rtl .d { float: right }
:lang(ar) .e { text-align: right }
[lang|=en] .f { left: 0 }
[dir=rtl] { .nested { margin-left: 1px } }
@keyframes slide { from { left: 0 } to { left: 100px } }
.x-rtl-y { float: left }`,
      BASE,
    )
    expect(facts.physicalCount).toBe(1)
    expect(facts.physical[0]?.selector).toBe('.x-rtl-y')
  })

  it('reads declarations nested in rules and in conditional rules inside them', () => {
    const facts = readStylesheet(
      `.card { @media (min-width: 40em) { padding-right: 2rem } & .icon { float: left } }
@media print { .page { margin-left: 0 } }`,
      BASE,
    )
    expect(facts.physical.map((item) => [item.selector, item.property])).toEqual([
      ['.card', 'padding-right'],
      ['& .icon', 'float'],
      ['.page', 'margin-left'],
    ])
  })

  it('counts every one but keeps only the first examples', () => {
    const css = Array.from({ length: 50 }, (_, index) => `.c${index} { margin-left: ${index}px }`)
    const facts = readStylesheet(css.join('\n'), BASE)
    expect(facts.physicalCount).toBe(50)
    expect(facts.physical).toHaveLength(3)
  })

  it('gets through hostile CSS quickly', () => {
    const shapes = [
      `${'@media screen {'.repeat(20_000)}a { margin-left: 1px }${'}'.repeat(20_000)}`,
      `a { content: "${'x'.repeat(2_000_000)}"; margin-left: 1px }`,
      '{{{{'.repeat(200_000),
      `a { margin-left: 1px; ${'b { '.repeat(100_000)}`,
    ]
    for (const css of shapes) {
      const started = performance.now()
      const facts = readStylesheet(css, BASE)
      expect(facts.physicalCount).toBeLessThanOrEqual(1)
      expect(performance.now() - started).toBeLessThan(5_000)
    }
  }, 60_000)
})

describe('decodeStylesheet', () => {
  const arabic = 'a::after { content: "مرحبا" }'

  it('reads UTF-8 by default and after a byte order mark', () => {
    const bytes = new TextEncoder().encode(arabic)
    expect(decodeStylesheet(bytes, 'text/css')).toBe(arabic)
    expect(decodeStylesheet(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]), null)).toBe(arabic)
  })

  it('follows the Content-Type charset, then @charset', () => {
    const legacy = encodeSingleByte(arabic, 'windows-1256')
    expect(decodeStylesheet(legacy, 'text/css; charset=windows-1256')).toBe(arabic)
    const declared = encodeSingleByte(`@charset "windows-1256";\n${arabic}`, 'windows-1256')
    expect(decodeStylesheet(declared, 'text/css')).toBe(`@charset "windows-1256";\n${arabic}`)
  })

  it('reads a stylesheet that claims UTF-16 in ASCII as UTF-8, and ignores unknown labels', () => {
    const claimed = new TextEncoder().encode(`@charset "utf-16";\n${arabic}`)
    expect(decodeStylesheet(claimed, null)).toBe(`@charset "utf-16";\n${arabic}`)
    const bytes = new TextEncoder().encode(arabic)
    expect(decodeStylesheet(bytes, 'text/css; charset=no-such-encoding')).toBe(arabic)
  })
})
