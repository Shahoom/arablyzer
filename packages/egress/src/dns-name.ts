/** RFC 1035 §2.3.4: a name is 255 octets on the wire, which is 253 characters written out. */
export const MAX_DNS_NAME_LENGTH = 253
/** RFC 1035 §2.3.4: a label is 63 octets at most. */
export const MAX_DNS_LABEL_LENGTH = 63

/** A label of letters, digits, hyphens and underscores (_dmarc, _domainkey), as a lookup sends it. */
const LABEL = /^[A-Za-z0-9_-]+$/

/**
 * The name a TXT lookup may send, in lower case and without the dot that ends it; null for a name
 * it must not send (M2.3c review). The resolver asks, so a caller that forgot the check cannot make
 * it send anything else: at most MAX_DNS_NAME_LENGTH characters, every label from 1 to
 * MAX_DNS_LABEL_LENGTH characters of ASCII letters, digits, hyphens and underscores. A name in
 * another script goes in its ASCII form (xn--…), which is made of those.
 */
export function dnsName(name: string): string | null {
  const bare = name.endsWith('.') ? name.slice(0, -1) : name
  if (bare.length === 0 || bare.length > MAX_DNS_NAME_LENGTH) return null
  const labels = bare.split('.')
  for (const label of labels) {
    if (label.length === 0 || label.length > MAX_DNS_LABEL_LENGTH || !LABEL.test(label)) {
      return null
    }
  }
  return bare.toLowerCase()
}
