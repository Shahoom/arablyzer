import { ALERT_TEXT } from '@arablyzer/i18n/alerts'
import type { Language } from './messages'

export type MailKind = 'alert' | 'summary' | 'test'

export interface Composed {
  readonly subject: string
  readonly text: string
  readonly html: string
  readonly headers: Readonly<Record<string, string>>
}

const escape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** Turns the addresses of an already escaped line into links; nothing else is added to it. */
const linked = (escaped: string): string =>
  escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)

/** One line of a header or a subject: no line breaks may come from what a scan or a person typed. */
const oneLine = (value: string): string => value.replace(/[\r\n\u2028\u2029]+/g, ' ').trim()

/**
 * An alert as an email: the same sentences the webhook carries, in the person's language, then why
 * they are getting it and the way to stop it. Text and a small HTML part (right to left for
 * Arabic); every value is escaped, nothing is styled but the direction. The two headers are what
 * mail clients' own "unsubscribe" button reads (RFC 2369, RFC 8058: one click, a POST).
 */
export function composeMail(args: {
  readonly language: Language
  readonly kind: MailKind
  /** The site the alert is about (for the subject); absent for a summary or a test. */
  readonly site?: string
  readonly lines: readonly string[]
  readonly unsubscribeUrl: string
}): Composed {
  const m = ALERT_TEXT[args.language].mail
  const subject = oneLine(
    args.kind === 'summary'
      ? m.summarySubject
      : args.kind === 'test'
        ? m.testSubject
        : m.subject(args.site ?? ''),
  )
  const footer = [m.why, m.noReply]
  const text = [...args.lines, '', ...footer, `${m.unsubscribe} ${args.unsubscribeUrl}`].join('\n')
  const paragraph = (line: string) => `<p>${linked(escape(line))}</p>`
  const html = [
    '<!doctype html>',
    `<html lang="${args.language}" dir="${args.language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"></head><body>`,
    ...args.lines.map(paragraph),
    '<hr>',
    ...footer.map(paragraph),
    `<p>${escape(m.unsubscribe)} <a href="${escape(args.unsubscribeUrl)}">${escape(args.unsubscribeUrl)}</a></p>`,
    '</body></html>',
  ].join('\n')
  return {
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${args.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
