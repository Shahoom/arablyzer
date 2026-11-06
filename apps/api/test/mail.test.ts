import { DEFAULT_POLICY, type safeFetch } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import { composeMail } from '../src/monitor/email'
import {
  mailerFrom,
  noMailer,
  resendMailer,
  senderFrom,
  type MailMessage,
} from '../src/monitor/mail'
import { unsubscribeFor, unsubscribeFrom } from '../src/monitor/unsubscribe'

const MESSAGE: MailMessage = {
  to: 'ali@example.com',
  subject: 'Subject',
  text: 'Text',
  html: '<p>Text</p>',
  headers: { 'List-Unsubscribe': '<https://arablyzer.example/u>' },
  idempotencyKey: 'alert-1-email',
}

interface Seen {
  url?: string
  options?: Parameters<typeof safeFetch>[1]
}
const stub = (status: number | null, seen: Seen = {}) =>
  ((url: string, options: Parameters<typeof safeFetch>[1]) => {
    seen.url = url
    seen.options = options
    return Promise.resolve({ response: status === null ? null : { status } })
  }) as unknown as typeof safeFetch

describe('the sender of automated mail', () => {
  it('is on a subdomain made for it, with or without a name', () => {
    expect(senderFrom('Arablyzer <alerts@send.arablyzer.com>', 'arablyzer.com')).toEqual({
      from: 'Arablyzer <alerts@send.arablyzer.com>',
      domain: 'send.arablyzer.com',
    })
    expect(senderFrom(' alerts@Send.Arablyzer.com ', 'www.arablyzer.com').from).toBe(
      'alerts@Send.Arablyzer.com',
    )
  })

  it.each([
    ['the site’s own domain, where the mailboxes are', 'Arablyzer <alerts@arablyzer.com>'],
    ['a personal mail domain', 'Arablyzer <someone@gmail.com>'],
    ['another domain', 'Arablyzer <alerts@send.other.com>'],
    ['a look-alike suffix', 'Arablyzer <alerts@sendarablyzer.com>'],
    ['no address', 'Arablyzer'],
    ['an empty value', ''],
    ['a line break in the name', 'Ara\nblyzer <alerts@send.arablyzer.com>'],
  ])('refuses %s', (_why, raw) => {
    expect(() => senderFrom(raw, 'arablyzer.com')).toThrow(/ARABLYZER_MAIL_FROM/)
  })
})

describe('the mailer from the environment', () => {
  const context = { policy: DEFAULT_POLICY, siteHost: 'arablyzer.com' }
  const on = {
    ARABLYZER_MAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_key',
    ARABLYZER_MAIL_FROM: 'Arablyzer <alerts@send.arablyzer.com>',
    ARABLYZER_MAIL_SECRET: 's'.repeat(32),
  }

  it('is off when nothing is set, or when told so, and reads nothing else', () => {
    expect(mailerFrom({}, context)).toBe(noMailer)
    expect(mailerFrom({ ARABLYZER_MAIL_PROVIDER: 'off', RESEND_API_KEY: 'x' }, context)).toBe(
      noMailer,
    )
    expect(noMailer.available).toBe(false)
  })

  it('is on when complete, and refuses to start when half set or unknown', () => {
    expect(mailerFrom(on, context).available).toBe(true)
    expect(() => mailerFrom({ ...on, RESEND_API_KEY: '' }, context)).toThrow(/RESEND_API_KEY/)
    expect(() => mailerFrom({ ...on, ARABLYZER_MAIL_FROM: '' }, context)).toThrow(
      /ARABLYZER_MAIL_FROM/,
    )
    expect(() => mailerFrom({ ...on, ARABLYZER_MAIL_SECRET: 'short' }, context)).toThrow(
      /ARABLYZER_MAIL_SECRET/,
    )
    expect(() => mailerFrom({ ...on, ARABLYZER_MAIL_PROVIDER: 'smtp' }, context)).toThrow(
      /only provider is resend/,
    )
  })
})

describe('Resend', () => {
  const mailer = (fetcher: typeof safeFetch, log?: (message: string) => void) =>
    resendMailer({
      apiKey: 're_secret_key',
      from: 'Arablyzer <alerts@send.arablyzer.com>',
      policy: DEFAULT_POLICY,
      fetcher,
      ...(log === undefined ? {} : { log }),
    })

  it('posts the message through the egress rules, with the key in a header and the idempotency key', async () => {
    const seen: Seen = {}
    expect(await mailer(stub(200, seen)).send(MESSAGE)).toBe('sent')
    expect(seen.url).toBe('https://api.resend.com/emails')
    expect(seen.options?.json).toEqual({
      from: 'Arablyzer <alerts@send.arablyzer.com>',
      to: ['ali@example.com'],
      subject: 'Subject',
      text: 'Text',
      html: '<p>Text</p>',
      headers: { 'List-Unsubscribe': '<https://arablyzer.example/u>' },
    })
    expect(seen.options?.headers).toEqual({
      authorization: 'Bearer re_secret_key',
      'idempotency-key': 'alert-1-email',
    })
    expect(seen.options?.policy).toBe(DEFAULT_POLICY)
  })

  it.each([
    [200, 'sent'],
    [202, 'sent'],
    [400, 'rejected'],
    [422, 'rejected'],
    [401, 'retry'],
    [403, 'retry'],
    [409, 'retry'],
    [429, 'retry'],
    [500, 'retry'],
    [503, 'retry'],
    [null, 'retry'],
  ] as const)('turns an answer of %s into %s', async (status, outcome) => {
    expect(await mailer(stub(status)).send(MESSAGE)).toBe(outcome)
  })

  it('never throws, and tells the log a status but not the key or the address', async () => {
    const told: string[] = []
    const failing = ((): Promise<never> =>
      Promise.reject(
        new Error('connect ECONNREFUSED re_secret_key ali@example.com'),
      )) as unknown as typeof safeFetch
    expect(await mailer(failing, (line) => told.push(line)).send(MESSAGE)).toBe('retry')
    expect(await mailer(stub(500), (line) => told.push(line)).send(MESSAGE)).toBe('retry')
    expect(told).toEqual(['Resend could not be reached', 'Resend answered 500'])
    expect(told.join(' ')).not.toMatch(/re_secret_key|ali@example\.com/)
  })
})

describe('the unsubscribe links', () => {
  const links = unsubscribeFor('k'.repeat(40), 'https://arablyzer.example')

  it('name the person and nobody else, and only for this secret', () => {
    const link = links.link('user-123')
    expect(link.startsWith('https://arablyzer.example/api/mail/unsubscribe?t=')).toBe(true)
    const token = new URL(link).searchParams.get('t') ?? ''
    expect(links.read(token)).toBe('user-123')
    expect(unsubscribeFor('z'.repeat(40), 'https://arablyzer.example').read(token)).toBeNull()
    expect(links.read(token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull()
    expect(links.read('')).toBeNull()
    expect(links.read('a.b.c')).toBeNull()
  })

  it('exist whenever the secret is set, and the secret must be long enough', () => {
    expect(unsubscribeFrom({}, 'https://x.example')).toBeUndefined()
    expect(
      unsubscribeFrom({ ARABLYZER_MAIL_SECRET: 'k'.repeat(32) }, 'https://x.example'),
    ).toBeDefined()
    expect(() => unsubscribeFrom({ ARABLYZER_MAIL_SECRET: 'short' }, 'https://x.example')).toThrow(
      /32 characters/,
    )
  })
})

describe('the mail itself', () => {
  const base = { unsubscribeUrl: 'https://arablyzer.example/api/mail/unsubscribe?t=a.b&x=1' }

  it('is right to left in Arabic, with the way to stop it in the text, the HTML and the headers', () => {
    const mail = composeMail({
      ...base,
      language: 'ar',
      kind: 'alert',
      site: 'example.com',
      lines: ['انخفضت درجة example.com.', 'التقرير: https://arablyzer.example/r/abc'],
    })
    expect(mail.subject).toBe('تنبيه من Arablyzer: example.com')
    expect(mail.html).toContain('lang="ar" dir="rtl"')
    expect(mail.html).toContain('<a href="https://arablyzer.example/r/abc">')
    expect(mail.text).toContain(base.unsubscribeUrl)
    expect(mail.headers).toEqual({
      'List-Unsubscribe': `<${base.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
    expect(mail.html).toContain('x=1')
    expect(mail.html).not.toContain('&x=1')
  })

  it('escapes what a scan can contain, and keeps a subject on one line', () => {
    const mail = composeMail({
      ...base,
      language: 'en',
      kind: 'alert',
      site: 'evil.example\r\nBcc: someone@example.com',
      lines: ['<script>alert(1)</script> & "quoted"'],
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;')
    expect(mail.subject).not.toMatch(/[\r\n]/)
    expect(mail.subject).toBe('Arablyzer alert: evil.example Bcc: someone@example.com')
  })

  it('has its own subjects for a summary and a test', () => {
    const lines = ['x']
    expect(composeMail({ ...base, language: 'en', kind: 'summary', lines }).subject).toBe(
      'Your Arablyzer summary for the week',
    )
    expect(composeMail({ ...base, language: 'en', kind: 'test', lines }).subject).toBe(
      'A test message from Arablyzer',
    )
  })
})
