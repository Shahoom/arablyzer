// The breadcrumb markup generator (M10.2): a BreadcrumbList with numbered positions and full
// addresses, which the breadcrumb-schema-invalid rule passes.

export type BreadcrumbProblem = 'name-blank' | 'url-bad' | 'url-missing' | 'too-few'

export interface BreadcrumbResult {
  readonly jsonLd: string
  readonly problems: readonly {
    readonly problem: BreadcrumbProblem
    readonly line: number
    readonly input: string
  }[]
  readonly count: number
}

/** Lines of `الاسم | https://example.com/path`; the last may have no address (the page itself). */
export function breadcrumbMarkup(input: string): BreadcrumbResult {
  const problems: { problem: BreadcrumbProblem; line: number; input: string }[] = []
  const rows = input
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter(({ raw }) => raw !== '')
  const items: { name: string; item?: string }[] = []
  rows.forEach(({ raw, line }, index) => {
    const cut = raw.search(/\s*[|\t]\s*(?=https?:\/\/|\/)/u)
    const name = (cut === -1 ? raw : raw.slice(0, cut)).trim()
    const address =
      cut === -1
        ? ''
        : raw
            .slice(cut)
            .replace(/^\s*[|\t]\s*/, '')
            .trim()
    if (name === '') {
      problems.push({ problem: 'name-blank', line, input: raw })
      return
    }
    const last = index === rows.length - 1
    if (address === '') {
      if (!last) problems.push({ problem: 'url-missing', line, input: raw })
      else items.push({ name })
      return
    }
    try {
      const url = new URL(address)
      if (!/^https?:$/.test(url.protocol)) throw new TypeError('scheme')
      items.push({ name, item: url.href })
    } catch {
      problems.push({ problem: 'url-bad', line, input: raw })
    }
  })
  if (items.length < 2) problems.push({ problem: 'too-few', line: 0, input: '' })
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      ...(entry.item === undefined ? {} : { item: entry.item }),
    })),
  }
  const json = JSON.stringify(data, null, 2).replaceAll('<', '\\u003c')
  return {
    jsonLd: `<script type="application/ld+json">\n${json}\n</script>`,
    problems,
    count: items.length,
  }
}
