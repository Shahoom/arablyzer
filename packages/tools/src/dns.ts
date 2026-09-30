/** One TXT record of a DNS example: the name it is at, and its strings joined. */
export interface TxtRecord {
  /** Lowercased, without the final dot. */
  readonly name: string
  readonly value: string
}

/** A name, an optional TTL and class, TXT, then the record's strings. */
const TXT_LINE = /^(\S+)[\t ]+(?:\d+[\t ]+)?(?:IN[\t ]+)?TXT[\t ]+(.*)$/i
/** One string of a record: in double quotes, a backslash quoting the character after it. */
const STRING = /"((?:[^"\\]|\\.)*)"[\t ]*/y

/**
 * A DNS example on a tool's page (M2.3c): TXT records, one to a line, as a zone file writes
 * them: a name, TXT, and the record's strings in double quotes, which make one record, joined
 * without spaces (RFC 7208 §3.3); blank lines apart. Throws on anything else, so a page never
 * shows records its test cannot read.
 */
export function parseDnsExample(code: string): TxtRecord[] {
  const lines = code
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  if (lines.length === 0) throw new Error('a DNS example needs a TXT record')
  return lines.map((line) => {
    const match = TXT_LINE.exec(line)
    if (match === null) {
      throw new Error(
        `each line is a TXT record, such as 'example.com. TXT "v=spf1 -all"', not "${line}"`,
      )
    }
    const strings: string[] = []
    const rest = match[2] ?? ''
    STRING.lastIndex = 0
    while (STRING.lastIndex < rest.length) {
      const at = STRING.lastIndex
      const string = STRING.exec(rest)
      if (string?.index !== at) {
        throw new Error(`a TXT record's strings are each in double quotes: "${line}"`)
      }
      strings.push((string[1] ?? '').replace(/\\(.)/g, '$1'))
    }
    if (strings.length === 0) throw new Error(`a TXT record needs a string: "${line}"`)
    return { name: nameOf(match[1] ?? ''), value: strings.join('') }
  })
}

/** What DNS answers for a name's TXT records, from an example's records: a lookup's answer. */
export function txtOf(
  records: readonly TxtRecord[],
  name: string,
): { readonly outcome: 'found' | 'none'; readonly records: readonly string[] } {
  const asked = nameOf(name)
  const values = records.filter((record) => record.name === asked).map((record) => record.value)
  return { outcome: values.length === 0 ? 'none' : 'found', records: values }
}

function nameOf(name: string): string {
  return name.toLowerCase().replace(/\.$/, '')
}
