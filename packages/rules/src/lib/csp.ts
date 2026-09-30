import {
  headerValues,
  type MetaElement,
  type PageFacts,
  type SourceLocation,
} from '@arablyzer/collectors'

const UPGRADE = 'upgrade-insecure-requests'

/** A policy: its directives by name, lowercased, each with its value's words. */
export type Policy = ReadonlyMap<string, readonly string[]>

const ASCII_WHITESPACE = /[\t\n\f\r ]+/
const EDGE_WHITESPACE = /^[\t\n\f\r ]+|[\t\n\f\r ]+$/g
// eslint-disable-next-line no-control-regex -- ASCII is U+0000 to U+007F, controls included.
const NOT_ASCII = /[^\x00-\x7f]/

/**
 * One serialized policy as browsers read it (CSP3 "parse a serialized CSP"): directives split at
 * semicolons, each named by its first word whatever its case; an empty directive, or one that is
 * not ASCII, is skipped, and a name given twice keeps its first value.
 */
export function parsePolicy(serialized: string): Policy {
  const policy = new Map<string, readonly string[]>()
  for (const token of serialized.split(';')) {
    const trimmed = token.replace(EDGE_WHITESPACE, '')
    if (trimmed === '' || NOT_ASCII.test(trimmed)) continue
    const [name = '', ...value] = trimmed.split(ASCII_WHITESPACE)
    const key = name.toLowerCase()
    if (!policy.has(key)) policy.set(key, value)
  }
  return policy
}

/**
 * The policies the response's headers deliver: `Content-Security-Policy`, which browsers enforce,
 * or `Content-Security-Policy-Report-Only`, which only reports. One header may hold several,
 * separated by commas; a policy without a directive is none (CSP3 "parse a response's Content
 * Security Policies").
 */
export function headerPolicies(
  page: PageFacts,
  disposition: 'enforce' | 'report' = 'enforce',
): Policy[] {
  const name =
    disposition === 'enforce' ? 'content-security-policy' : 'content-security-policy-report-only'
  return headerValues(page.headers, name)
    .flatMap((value) => value.split(','))
    .map(parsePolicy)
    .filter((policy) => policy.size > 0)
}

/** Directives a policy in a <meta> cannot set: browsers drop them (HTML, CSP3 §3.3). */
const NOT_IN_META: readonly string[] = ['report-uri', 'frame-ancestors', 'sandbox']

/** A <meta http-equiv="Content-Security-Policy">, whatever it enforces. */
export function isPolicyMeta(meta: MetaElement): boolean {
  return meta.httpEquiv === 'content-security-policy'
}

/**
 * What a <meta http-equiv="Content-Security-Policy"> enforces, as HTML reads it: nothing outside
 * <head> or without content, and never the directives a <meta> cannot set. Null when that leaves
 * no directive.
 */
export function metaPolicy(meta: MetaElement): Policy | null {
  if (!isPolicyMeta(meta) || !meta.inHead || meta.content === null || meta.content === '') {
    return null
  }
  const policy = new Map(parsePolicy(meta.content))
  for (const name of NOT_IN_META) policy.delete(name)
  return policy.size > 0 ? policy : null
}

/**
 * Where the page asks browsers to fetch its http: resources over https: instead (the CSP directive
 * upgrade-insecure-requests, W3C Upgrade Insecure Requests §4.1, form submissions included):
 * 'header' for a Content-Security-Policy header, which covers the whole page; the location of a
 * <meta http-equiv="Content-Security-Policy"> in <head>, which covers what comes after it; null
 * when it does not. A Report-Only policy upgrades nothing, and a <meta> outside <head> is ignored.
 */
export function upgradeInsecureRequests(page: PageFacts): 'header' | SourceLocation | null {
  if (headerPolicies(page).some((policy) => policy.has(UPGRADE))) return 'header'
  for (const meta of page.html?.metas ?? []) {
    if (meta.location !== null && metaPolicy(meta)?.has(UPGRADE) === true) return meta.location
  }
  return null
}

/** Whether an element at `location` comes after `start` in the document. */
export function comesAfter(location: SourceLocation | null, start: SourceLocation): boolean {
  if (location === null) return false
  return (
    location.line > start.line || (location.line === start.line && location.column > start.column)
  )
}
