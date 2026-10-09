import type { Context, MiddlewareHandler } from 'hono'

/** Whether a Content-Type header names JSON: the type alone, in any case, with any parameters. */
export function isJson(contentType: string | undefined): boolean {
  return contentType?.split(';')[0]?.trim().toLowerCase() === 'application/json'
}

/**
 * A state-changing request comes from the site's own page: from the site's origin, and, where it
 * carries a body, JSON. A browser sends Origin with every POST, and a page on another site can
 * send no JSON type without a preflight, which the API never answers, so neither check lets such
 * a page act for a visitor (security review, issue #30). Both come before the body is read. Where
 * the site's origin is not known (development), only the type is asked.
 */
export function fromTheSite(options: {
  readonly origin: string | undefined
  /** Whether the request has a JSON body to check the type of. */
  readonly json: boolean
  readonly refuse: (c: Context) => Response
  /** Told once in a while, never with the Origin it sent: that is the sender's to write. */
  readonly foreign: (error: Error) => void
}): MiddlewareHandler {
  return async (c, next) => {
    if (options.origin !== undefined && c.req.header('origin') !== options.origin) {
      options.foreign(new Error('A request did not come from the origin ARABLYZER_SITE names'))
      return options.refuse(c)
    }
    if (options.json && !isJson(c.req.header('content-type'))) return options.refuse(c)
    await next()
  }
}
