import type { AnchorElement, PageFacts } from '@arablyzer/collectors'
import { detectPlatforms } from '../../lib/platforms'
import { defineRule, type DetectorFinding } from '../../rule'

type Policy = 'privacy' | 'terms' | 'returns' | 'shipping'

interface Pattern {
  readonly text: RegExp
  readonly href: RegExp
}

/**
 * How each policy page is named by a link, in Arabic and English: its text («سياسة الخصوصية»,
 * "Privacy Policy") or the words of its address (/privacy, /pages/الشروط-والأحكام). Loose on
 * purpose: the rule reports a policy only when nothing on the page points at one.
 */
const POLICIES: Readonly<Record<Policy, Pattern>> = {
  privacy: { text: /خصوصي|privacy/i, href: /privacy|خصوصي/i },
  terms: {
    text: /الشروط|الأحكام|شروط|terms|conditions/i,
    href: /terms|conditions|\btos\b|شروط|أحكام|احكام/i,
  },
  returns: {
    text: /استرجاع|إرجاع|ارجاع|استبدال|استرداد|return|refund|exchange/i,
    href: /return|refund|exchange|استرجاع|إرجاع|ارجاع|استبدال|استرداد/i,
  },
  shipping: {
    text: /شحن|توصيل|shipping|delivery/i,
    href: /shipping|delivery|شحن|توصيل/i,
  },
}

/** The platforms that are stores: a page of one is a store's, whatever it shows. */
const STORE_PLATFORMS: ReadonlySet<string> = new Set([
  'salla',
  'zid',
  'youcan',
  'expandcart',
  'shopify',
  'woocommerce',
  'magento',
  'prestashop',
  'opencart',
  'bigcommerce',
  'ecwid',
])

/** A cart or checkout in a link's address, or the words people give the cart. */
const CART_HREF = /(?:^|\/)(?:cart|checkout|basket|bag)(?:\/|$|\?|#)/i
const CART_TEXT = /سلة المشتريات|عربة التسوق|عربة المشتريات|shopping cart|view cart/i

function decoded(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function pathOf(anchor: AnchorElement): string {
  try {
    const url = new URL(anchor.href, 'https://page.invalid/')
    return decoded(url.pathname)
  } catch {
    return decoded(anchor.href)
  }
}

/** Why the page looks like a store's: a link to its cart, or a store platform; null if neither. */
function storeEvidence(page: PageFacts): string | null {
  const anchors = page.html?.anchors ?? []
  if (anchors.some((a) => CART_HREF.test(pathOf(a)) || CART_TEXT.test(a.text))) return 'cart link'
  const platform = detectPlatforms(page).find(
    (tech) => STORE_PLATFORMS.has(tech.id) && tech.confidence >= 50,
  )
  return platform?.name ?? null
}

function names(anchor: AnchorElement, pattern: Pattern): boolean {
  return (
    pattern.text.test(anchor.text) ||
    pattern.text.test(anchor.ariaLabel ?? '') ||
    pattern.href.test(pathOf(anchor))
  )
}

/**
 * M6.1: a store page (it links to a cart or checkout, or runs on a store platform) whose HTML
 * points at no privacy policy, terms, return policy or shipping policy page. Merchant Center asks a
 * store to show its return and shipping information, and its customers look for all four before
 * they pay. A link is found by its text, its aria-label or the words of its address; a page that
 * has no links in its HTML (its menu is drawn by a script) is not judged.
 */
export const rule = defineRule({
  id: 'policy-pages-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'moderate',
  needs: ['html'],
  messages: ['privacy', 'terms', 'returns', 'shipping'],
  appliesTo: (page) => (page.html?.anchors.length ?? 0) > 0 && storeEvidence(page) !== null,
  detect: ({ page }): DetectorFinding<Policy>[] => {
    const evidence = storeEvidence(page)
    const anchors = page.html?.anchors ?? []
    if (evidence === null) return []
    return (Object.keys(POLICIES) as Policy[]).flatMap((policy) =>
      anchors.some((anchor) => names(anchor, POLICIES[policy]))
        ? []
        : [{ message: policy, values: { evidence }, key: policy }],
    )
  },
})
