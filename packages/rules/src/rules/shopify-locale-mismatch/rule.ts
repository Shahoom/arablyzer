import type { PageFacts } from '@arablyzer/collectors'
import { detectPlatforms } from '../../lib/platforms'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'lang' | 'dir' | 'untranslated'

/** Shopify's own script on a storefront's pages names the language the page is shown in. */
const LOCALE = /\bShopify\.locale\s*=\s*["']([A-Za-z-]+)["']/

/** The language Shopify says the page is in, or null. */
function shopifyLocale(page: PageFacts): string | null {
  if (!detectPlatforms(page).some((tech) => tech.id === 'shopify' && tech.confidence >= 50)) {
    return null
  }
  for (const script of page.html?.scripts ?? []) {
    if (script.src !== null) continue
    const found = LOCALE.exec(script.text)?.[1]
    if (found !== undefined) return found.toLowerCase()
  }
  return null
}

/** Below this share of Arabic among a page's letters, the page's text is not in Arabic. */
const ARABIC_SHARE = 0.2
/** Fewer letters than this say too little to judge a page's language by. */
const MIN_LETTERS = 50

/**
 * M10.1: a Shopify store page shown in Arabic (its own script says `Shopify.locale = "ar"`) whose
 * theme does not follow: `<html lang>` is not Arabic, the direction is not right-to-left, or the
 * text is not translated, which is what a store with Arabic switched on and English content looks
 * like. Each is the theme's or the translation's to fix, not the visitor's.
 */
export const rule = defineRule({
  id: 'shopify-locale-mismatch',
  version: '1.0.0',
  category: 'intl',
  severity: 'serious',
  needs: ['html', 'text'],
  messages: ['lang', 'dir', 'untranslated'],
  appliesTo: (page) => shopifyLocale(page)?.split('-')[0] === 'ar',
  detect: ({ page }): DetectorFinding<Message>[] => {
    const html = page.html
    if (html === null) return []
    const findings: DetectorFinding<Message>[] = []
    const { root, body } = html
    const lang = root.lang?.trim().toLowerCase() ?? ''
    if (lang.split('-')[0] !== 'ar') {
      findings.push({ message: 'lang', values: { lang: root.lang ?? '' }, selector: root.selector })
    }
    const dir = (root.dir ?? body?.dir ?? '').trim().toLowerCase()
    if (dir !== 'rtl') {
      findings.push({ message: 'dir', values: { dir }, selector: root.selector })
    }
    const letters = page.text?.letters
    if (
      letters !== undefined &&
      letters.total >= MIN_LETTERS &&
      letters.arabic / letters.total < ARABIC_SHARE
    ) {
      findings.push({
        message: 'untranslated',
        values: { arabicLetters: letters.arabic, totalLetters: letters.total },
      })
    }
    return findings
  },
})
