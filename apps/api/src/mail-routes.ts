import { ALERT_TEXT } from '@arablyzer/i18n/alerts'
import { quietly, type MonitorData } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { UNSUBSCRIBE_PATH, type Unsubscribe } from './monitor/unsubscribe'

export interface UnsubscribeDeps {
  readonly monitors: MonitorData
  readonly unsubscribe: Unsubscribe
  readonly log: ((message: string) => void) | undefined
}

/** The page loads nothing, and posts only to itself. */
const PAGE_POLICY = "default-src 'none'; form-action 'self'; base-uri 'none'"

const esc = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

type Step = 'ask' | 'done' | 'invalid'

/** Both languages on one page: the link carries no language, and the page needs no script. */
function page(step: Step, token: string): string {
  const section = (lang: 'ar' | 'en'): string => {
    const t = ALERT_TEXT[lang].mail.page
    const body =
      step === 'invalid'
        ? `<p>${esc(t.invalid)}</p>`
        : step === 'done'
          ? `<p>${esc(t.done)}</p>`
          : `<p>${esc(t.lead)}</p>`
    return `<section lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><h1>${esc(t.title)}</h1>${body}${
      step === 'ask'
        ? `<form method="post" action="${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}"><button type="submit">${esc(t.button)}</button></form>`
        : ''
    }</section>`
  }
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(ALERT_TEXT.ar.mail.page.title)} / ${esc(ALERT_TEXT.en.mail.page.title)}</title></head><body>
${section('ar')}
<hr>
${section('en')}
</body></html>`
}

/**
 * The way out of email alerts (M5.5). The link in every mail opens a page that asks; its button, or a
 * mail client's own "unsubscribe" (RFC 8058: a POST with no cookie and no Origin), turns that
 * person's email alerts off. Nothing else is touched. A GET never changes anything, because link
 * checkers open every link in a mail. The token is the only proof asked for, and the only thing it
 * can do is this.
 */
export function mountUnsubscribe(app: Hono, deps: UnsubscribeDeps): void {
  const told = quietly('Unsubscribe', deps.log)
  const answer = (c: Context, step: Step, token: string, status: 200 | 400 = 200): Response => {
    c.header('Content-Security-Policy', PAGE_POLICY)
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Robots-Tag', 'noindex')
    return c.html(page(step, token), status)
  }
  const tokenOf = (c: Context): string => c.req.query('t') ?? ''

  app.get(UNSUBSCRIBE_PATH, (c) => {
    const token = tokenOf(c)
    return deps.unsubscribe.read(token) === null
      ? answer(c, 'invalid', '', 400)
      : answer(c, 'ask', token)
  })

  app.post(
    UNSUBSCRIBE_PATH,
    bodyLimit({ maxSize: 1024, onError: (c) => answer(c, 'invalid', '', 400) }),
    async (c) => {
      const token = tokenOf(c)
      const userId = deps.unsubscribe.read(token)
      if (userId === null) return answer(c, 'invalid', '', 400)
      try {
        await deps.monitors.saveAlerts(userId, { email: false })
      } catch (error) {
        told(new Error(error instanceof Error ? error.message : 'Unsubscribing failed'))
        return c.text('Unavailable', 503)
      }
      return answer(c, 'done', token)
    },
  )
}
