import { defineRule, type DetectorFinding } from '../../rule'

/** The Gulf payment methods the plan names (BUILD-PLAN §5.1), as the rule reports them. */
type Method = 'mada' | 'Apple Pay' | 'STC Pay' | 'Tabby' | 'Tamara'

/**
 * Each method's names, as a logo's text alternative writes them once lowercased and without its
 * spaces and punctuation: in Latin letters and in Arabic.
 */
const NAMES: readonly (readonly [Method, readonly string[]])[] = [
  ['mada', ['mada', 'مدى']],
  ['Apple Pay', ['applepay', 'ابلباي', 'أبلباي', 'آبلباي']],
  ['STC Pay', ['stcpay', 'استيسيباي', 'إستيسيباي']],
  ['Tabby', ['tabby', 'تابي']],
  ['Tamara', ['tamara', 'تمارا']],
]

/** Words a logo's name may have beside the method's: "mada logo", «شعار مدى». */
const BESIDE: ReadonlySet<string> = new Set([
  'logo',
  'logos',
  'icon',
  'icons',
  'image',
  'card',
  'cards',
  'payment',
  'payments',
  'method',
  'شعار',
  'أيقونة',
  'ايقونة',
  'صورة',
  'بطاقة',
  'بطاقات',
  'الدفع',
])

/**
 * The hosts each provider's own documentation loads its script from: Tabby's promo and card
 * snippets (checkout.tabby.ai), Tamara's widget (cdn.tamara.co) and Apple's Apple Pay JS SDK
 * (applepay.cdn-apple.com).
 */
const WIDGET_HOSTS: ReadonlyMap<string, Method> = new Map([
  ['checkout.tabby.ai', 'Tabby'],
  ['cdn.tamara.co', 'Tamara'],
  ['applepay.cdn-apple.com', 'Apple Pay'],
])

/** Marks (harakat among them) and tatweel. */
const MARKS = /[\p{M}ـ]/gu

/** The method a logo's name names, alone or with a word such as logo; null for anything else. */
function methodNamed(text: string): Method | null {
  const words = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(MARKS, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '' && !BESIDE.has(word))
  const name = words.join('')
  return NAMES.find(([, names]) => names.includes(name))?.[0] ?? null
}

/** A script type the browser runs: none, a JavaScript MIME type, or module (HTML). */
function runs(type: string | null): boolean {
  const value = type?.trim().toLowerCase() ?? ''
  return value === '' || value === 'module' || /(?:java|ecma)script/.test(value)
}

/**
 * Information alone (M2.3c): the Gulf payment methods the page shows, never deducted. A method is
 * shown when an image, icon or control on the page is named for it (its alt, its SVG title or
 * its aria-label is the method's name, alone or with a word such as logo), or when the page loads
 * its provider's own script. Text elsewhere is not read: «مدى» is also a common word, and a page
 * may speak of payment methods it does not offer. Nothing is clicked, sent or started. Each method
 * once, where the page first shows it.
 */
export const rule = defineRule({
  id: 'payment-methods',
  version: '1.0.0',
  category: 'commerce',
  severity: 'info',
  needs: ['html'],
  messages: ['named', 'widget'],
  appliesTo: (page) => page.html !== null,
  detect: ({ page }): DetectorFinding<'named' | 'widget'>[] => {
    const html = page.html
    if (html === null) return []
    const found = new Map<Method, DetectorFinding<'named' | 'widget'>>()
    const signals: {
      line: number
      column: number
      method: Method
      finding: DetectorFinding<'named' | 'widget'>
    }[] = []
    for (const alternative of html.textAlternatives) {
      const method = methodNamed(alternative.text)
      if (method === null) continue
      signals.push({
        line: alternative.location?.line ?? 0,
        column: alternative.location?.column ?? 0,
        method,
        finding: {
          message: 'named',
          values: { method, text: alternative.text },
          selector: alternative.selector,
          ...(alternative.snippet === null ? {} : { snippet: alternative.snippet }),
          ...(alternative.location === null ? {} : { location: alternative.location }),
          key: method,
        },
      })
    }
    for (const script of html.scripts) {
      if (script.src === null || !runs(script.type)) continue
      let host: string
      try {
        host = new URL(script.src, html.baseUrl).hostname
      } catch {
        continue
      }
      const method = WIDGET_HOSTS.get(host)
      if (method === undefined) continue
      signals.push({
        line: script.location?.line ?? 0,
        column: script.location?.column ?? 0,
        method,
        finding: {
          message: 'widget',
          values: { method, host },
          selector: script.selector,
          ...(script.snippet === null ? {} : { snippet: script.snippet }),
          ...(script.location === null ? {} : { location: script.location }),
          key: method,
        },
      })
    }
    signals.sort((a, b) => a.line - b.line || a.column - b.column)
    for (const signal of signals) {
      if (!found.has(signal.method)) found.set(signal.method, signal.finding)
    }
    return [...found.values()]
  },
})
