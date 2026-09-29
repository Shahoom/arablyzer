import { headerValues } from '@arablyzer/collectors'
import { asciiLowercase } from '../../lib/headers'
import { isPublicUrl } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'missing' | 'invalid'

/** The referrer policies (W3C Referrer Policy §3). */
const POLICIES: ReadonlySet<string> = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'same-origin',
  'origin',
  'strict-origin',
  'origin-when-cross-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
])

/** Old values a <meta name="referrer"> may still hold, and the policy each stands for (HTML). */
const LEGACY: Readonly<Record<string, string>> = {
  never: 'no-referrer',
  default: 'strict-origin-when-cross-origin',
  always: 'unsafe-url',
  'origin-when-crossorigin': 'origin-when-cross-origin',
}

/**
 * The policy the Referrer-Policy headers set, or null (Referrer Policy "parse a referrer policy
 * from a Referrer-Policy header"): their values split at commas, the last one browsers know wins,
 * so a new value can fall back on an older one. A value that is not letters and hyphens makes the
 * header invalid. Names are read whatever their case, as Chromium reads them.
 */
function headerPolicy(values: readonly string[]): string | null {
  let policy: string | null = null
  for (const token of values.join(',').split(',')) {
    const value = asciiLowercase(token.trim())
    if (POLICIES.has(value)) policy = value
    else if (!/^[a-z-]*$/.test(value)) return null
  }
  return policy
}

/** The policy a <meta name="referrer"> sets, or null: its content lowercased, one value (HTML). */
function metaPolicy(content: string | null): string | null {
  if (content === null || content === '') return null
  const value = asciiLowercase(content)
  const policy = LEGACY[value] ?? value
  return POLICIES.has(policy) ? policy : null
}

/**
 * A public HTML page that sets no referrer policy: browsers then use their own default,
 * strict-origin-when-cross-origin since the Referrer Policy change of 2020, which sends other
 * sites the origin alone. Information, never deducted: the page states no choice, and browsers
 * from before the change send more.
 */
export const rule = defineRule({
  id: 'referrer-policy-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'info',
  needs: ['headers', 'html'],
  messages: ['missing', 'invalid'],
  appliesTo: (page) => page.html !== null && isPublicUrl(page.url),
  detect: ({ page }): DetectorFinding<Message>[] => {
    const values = headerValues(page.headers, 'referrer-policy')
    const metas = (page.html?.metas ?? []).filter(
      (meta) => meta.name === 'referrer' && meta.content !== null && meta.content !== '',
    )
    if (headerPolicy(values) !== null || metas.some((meta) => metaPolicy(meta.content) !== null)) {
      return []
    }
    const findings: DetectorFinding<Message>[] = []
    if (values.length > 0) {
      const value = values.join(', ')
      findings.push({ message: 'invalid', values: { value }, snippet: `Referrer-Policy: ${value}` })
    }
    for (const meta of metas) {
      findings.push({
        message: 'invalid',
        values: { value: meta.content ?? '' },
        selector: meta.selector,
        ...(meta.snippet === null ? {} : { snippet: meta.snippet }),
        ...(meta.location === null ? {} : { location: meta.location }),
        key: meta.selector,
      })
    }
    return findings.length > 0 ? findings : [{ message: 'missing' }]
  },
})
