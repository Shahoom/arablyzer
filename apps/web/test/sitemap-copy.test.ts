import {
  SITEMAP_LIMIT,
  SITEMAP_MAX_ATTRIBUTES,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_DEPTH,
  SITEMAP_TIMEOUT_MS,
} from '@arablyzer/engine'
import { ruleById } from '@arablyzer/rules'
import { toolBySlug } from '@arablyzer/tools'
import { describe, expect, it } from 'vitest'

// M2.3c review: the copy of the rule and of the tool says how many sitemaps a check fetches, how
// much of each it reads, and how long it takes, in Markdown that no code fills in. As the bot's
// page is given the code's own numbers (bot-data.test.ts), these are held to them: when a limit
// changes, the copy that states it fails here until it is written again.
const mib = SITEMAP_MAX_BYTES / (1024 * 1024)
const seconds = SITEMAP_TIMEOUT_MS / 1000
const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]
const inWords = (count: number) => WORDS[count] ?? String(count)

describe('the sitemap copy’s numbers', () => {
  it('are whole ones the phrases below can state', () => {
    expect(Number.isInteger(mib)).toBe(true)
    expect(Number.isInteger(seconds)).toBe(true)
    expect(seconds).toBeLessThanOrEqual(10)
  })

  it.each([
    [
      'en',
      [
        `first ${String(SITEMAP_LIMIT)} sitemaps`,
        `up to \`${String(mib)} MB\``,
        `no more than ${inWords(seconds)} seconds`,
        `more than ${String(SITEMAP_MAX_DEPTH)} levels`,
        `more than ${String(SITEMAP_MAX_ATTRIBUTES)} attributes`,
      ],
    ],
    [
      'ar',
      [
        `أول ${String(SITEMAP_LIMIT)} خرائط`,
        `حتى \`${String(mib)} MB\``,
        `أكثر من ${String(seconds)} ثوانٍ`,
        `${String(SITEMAP_MAX_DEPTH)} مستوى`,
        `${String(SITEMAP_MAX_ATTRIBUTES)} سمة`,
      ],
    ],
  ] as const)('are the code’s own in how sitemap-invalid detects (%s)', (lang, phrases) => {
    const detect = ruleById('sitemap-invalid')?.copy[lang].sections.detect ?? ''
    for (const phrase of phrases) expect(detect, phrase).toContain(phrase)
  })

  it.each([
    [
      'en',
      [
        `first ${String(SITEMAP_LIMIT)} sitemaps`,
        `up to \`${String(mib)} MB\``,
        `no more than ${inWords(seconds)} seconds`,
      ],
    ],
    [
      'ar',
      [
        `أول ${String(SITEMAP_LIMIT)} خرائط`,
        `حتى \`${String(mib)} MB\``,
        `أكثر من ${String(seconds)} ثوانٍ`,
      ],
    ],
  ] as const)('are the code’s own on the sitemap checker’s page (%s)', (lang, phrases) => {
    const copy = toolBySlug('sitemap-check')?.copy[lang]
    const text = [
      copy?.methodology ?? '',
      ...(copy?.faq.map((entry) => entry.answer) ?? []),
      ...(copy?.checks ?? []),
    ].join('\n')
    for (const phrase of phrases) expect(text, phrase).toContain(phrase)
  })

  it('leave no other count of the sitemaps to be out of date: none is an ordinal', () => {
    for (const lang of ['en', 'ar'] as const) {
      const rule = ruleById('sitemap-invalid')?.copy[lang].sections.detect ?? ''
      expect(rule, lang).not.toMatch(/past the third|بعد الثالثة/)
    }
  })
})
