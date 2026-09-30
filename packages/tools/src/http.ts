/** One response of an HTTP example: its status line's code and its headers. */
export interface HttpResponse {
  readonly status: number
  /** Names lowercased, values without the spaces around them, in order. */
  readonly headers: readonly (readonly [name: string, value: string])[]
}

/** The redirects a fetch follows (egress's safeFetch). */
export const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])

const STATUS_LINE = /^HTTP\/\d(?:\.\d)? (\d{3})(?: .*)?$/
/** RFC 9110 §5.1: a field name is a token; the value follows the colon. */
const HEADER_LINE = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+):(.*)$/

/**
 * An HTTP example on a tool's page (M2.3a): one or more responses, separated by a blank line,
 * each a status line and its headers, as a server sends them. Every response but the last is a
 * redirect with a Location, which the next one answers; the last is the page. Bodies are left
 * out. Throws on anything else, so a page never shows an exchange its test cannot read.
 */
export function parseHttpExample(code: string): HttpResponse[] {
  const blocks = code
    .replace(/\r\n?/g, '\n')
    .split(/\n[\t ]*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
  if (blocks.length === 0) throw new Error('an HTTP example needs a response')
  const responses = blocks.map((block): HttpResponse => {
    const [statusLine = '', ...lines] = block.split('\n')
    const status = STATUS_LINE.exec(statusLine.trim())?.[1]
    if (status === undefined) {
      throw new Error(
        `each response starts with a status line, such as "HTTP/1.1 200 OK", not "${statusLine.trim()}"`,
      )
    }
    const headers = lines.map((line): [string, string] => {
      const header = HEADER_LINE.exec(line.trim())
      if (header === null) throw new Error(`"${line.trim()}" is not a header`)
      return [(header[1] ?? '').toLowerCase(), (header[2] ?? '').trim()]
    })
    return { status: Number(status), headers }
  })
  responses.forEach((response, index) => {
    const last = index === responses.length - 1
    const redirect = REDIRECT_STATUSES.has(response.status)
    if (last && redirect) throw new Error('the last response is the page, not a redirect')
    if (last) return
    const locations = response.headers.filter(([name]) => name === 'location')
    if (!redirect || locations.length !== 1 || locations[0]?.[1] === '') {
      throw new Error(
        'each response before the page is a redirect (301, 302, 303, 307 or 308) with one Location',
      )
    }
  })
  return responses
}

/** The Location of a redirect in an HTTP example, which parseHttpExample made sure it has. */
export function locationOf(response: HttpResponse): string {
  return response.headers.find(([name]) => name === 'location')?.[1] ?? ''
}
