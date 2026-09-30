/** A URL that is safe to put in results and logs: any user name and password are removed. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.username === '' && url.password === '') return value
    url.username = ''
    url.password = ''
    return url.href
  } catch {
    // Not parseable as a URL: strip anything that looks like "//user:password@".
    return value.replace(/\/\/[^/?#\s]*@/, '//')
  }
}
