import type { AnchorElement } from '@arablyzer/collectors'
import { normalizeArabic } from '../../lib/ar-normalize'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * Link texts that say nothing about where the link goes, in Arabic and English, as the whole text
 * of a link once its harakat and tatweel are gone and its case and punctuation folded.
 */
const GENERIC: ReadonlySet<string> = new Set([
  'اضغط هنا',
  'انقر هنا',
  'اضغط هنا للمزيد',
  'انقر هنا للمزيد',
  'اضغط للمزيد',
  'هنا',
  'المزيد',
  'اقرا المزيد',
  'قراءة المزيد',
  'المزيد من التفاصيل',
  'تفاصيل اكثر',
  'التفاصيل',
  'رابط',
  'هذا الرابط',
  'click here',
  'click',
  'here',
  'read more',
  'more',
  'learn more',
  'more info',
  'more details',
  'see more',
  'details',
  'link',
  'this link',
])

/** Folds a text for the list: letters only, spaces single, Arabic spellings of alef merged. */
function fold(text: string): string {
  return normalizeArabic(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * M6.1: links whose whole text is «اضغط هنا», «المزيد», "click here" or "read more". The text of a
 * link is what search engines read to learn what is behind it, and what a screen reader's list of
 * links gives a person: a list of fifteen "Read more" says nothing. A link with an aria-label that
 * says more is not judged. One finding for each text, with how many links and the first.
 */
export const rule = defineRule({
  id: 'anchor-text-generic',
  version: '1.0.0',
  category: 'links',
  severity: 'minor',
  needs: ['html'],
  messages: ['generic'],
  appliesTo: (page) => (page.html?.anchors.length ?? 0) > 0,
  detect: ({ page }): DetectorFinding<'generic'>[] => {
    const groups = new Map<string, { count: number; first: AnchorElement }>()
    for (const anchor of page.html?.anchors ?? []) {
      if (anchor.tag !== 'a') continue
      const text = fold(anchor.text)
      if (!GENERIC.has(text)) continue
      const label = fold(anchor.ariaLabel ?? '')
      if (label !== '' && !GENERIC.has(label)) continue
      const group = groups.get(text)
      if (group === undefined) groups.set(text, { count: 1, first: anchor })
      else group.count++
    }
    return [...groups].map(([text, { count, first }]) => ({
      message: 'generic' as const,
      values: { text: first.text, count, href: first.href },
      selector: first.selector,
      ...(first.snippet === null ? {} : { snippet: first.snippet }),
      ...(first.location === null ? {} : { location: first.location }),
      key: text,
    }))
  },
})
