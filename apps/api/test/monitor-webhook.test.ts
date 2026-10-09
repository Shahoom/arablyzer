import { createHmac } from 'node:crypto'
import type { safeFetch } from '@arablyzer/egress'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import {
  bodyFor,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  webhookSender,
  webhookTarget,
  type AlertMessage,
} from '../src/monitor/webhook'

const AT = new Date('2026-10-09T12:00:00.000Z')
const MESSAGE: AlertMessage = {
  type: 'monitor.alert',
  lines: [
    'The score of example.com dropped from 92 to 74.',
    'Report: https://arablyzer.example/en/r/x',
  ],
  data: {
    site: { url: 'https://example.com/' },
    events: [{ type: 'score-drop', from: 92, to: 74 }],
  },
  at: AT,
}

describe('the bodies', () => {
  it('fits Slack’s text, Discord’s content (cut to its limit) and the generic JSON', () => {
    expect(bodyFor('slack', MESSAGE)).toEqual({ text: MESSAGE.lines.join('\n') })
    expect(bodyFor('discord', MESSAGE)).toEqual({ content: MESSAGE.lines.join('\n') })
    expect(
      (bodyFor('discord', { ...MESSAGE, lines: ['x'.repeat(3000)] }) as { content: string })
        .content,
    ).toHaveLength(2000)
    expect(bodyFor('generic', MESSAGE)).toMatchObject({
      type: 'monitor.alert',
      version: 1,
      at: AT.toISOString(),
      site: { url: 'https://example.com/' },
      events: [{ type: 'score-drop', from: 92, to: 74 }],
    })
  })
})

describe('the sender', () => {
  const stub = (
    status: number | null,
    seen: { url?: string; options?: Parameters<typeof safeFetch>[1] },
  ) =>
    ((url: string, options: Parameters<typeof safeFetch>[1]) => {
      seen.url = url
      seen.options = options
      return Promise.resolve({
        response: status === null ? null : { status },
      })
    }) as unknown as typeof safeFetch

  it('signs the exact bytes it sends, with a timestamp, and counts 2xx as delivered', async () => {
    const seen: { url?: string; options?: Parameters<typeof safeFetch>[1] } = {}
    const sender = webhookSender({ policy: DEFAULT_POLICY, fetcher: stub(200, seen) })
    const delivery = await sender.send(
      { url: 'https://hooks.example/x', secret: 'shh', kind: 'generic' },
      MESSAGE,
    )
    expect(delivery).toEqual({ status: 200, ok: true })
    expect(seen.url).toBe('https://hooks.example/x')
    const body = JSON.stringify(seen.options?.json)
    const stamp = seen.options?.headers?.[TIMESTAMP_HEADER] ?? ''
    expect(stamp).toBe(String(AT.getTime() / 1000))
    expect(seen.options?.headers?.[SIGNATURE_HEADER]).toBe(
      `sha256=${createHmac('sha256', 'shh').update(`${stamp}.${body}`).digest('hex')}`,
    )
  })

  it('does not count another status, or no answer, or a throw, as delivered', async () => {
    for (const status of [301, 400, 500, null]) {
      const sender = webhookSender({ policy: DEFAULT_POLICY, fetcher: stub(status, {}) })
      const delivery = await sender.send(
        { url: 'https://h.example/', secret: 's', kind: 'slack' },
        MESSAGE,
      )
      expect(delivery).toEqual({ status, ok: false })
    }
    const throwing = webhookSender({
      policy: DEFAULT_POLICY,
      fetcher: () => Promise.reject(new Error('boom')),
    })
    expect(
      await throwing.send({ url: 'https://h.example/', secret: 's', kind: 'slack' }, MESSAGE),
    ).toEqual({
      status: null,
      ok: false,
    })
  })
})

describe('webhookTarget', () => {
  it('takes https addresses, with the kind from the host', () => {
    expect(webhookTarget(' https://hooks.slack.com/services/a/b ', DEFAULT_POLICY)).toMatchObject({
      ok: true,
      kind: 'slack',
      host: 'hooks.slack.com',
    })
    expect(webhookTarget('https://discordapp.com/api/webhooks/1/a', DEFAULT_POLICY)).toMatchObject({
      kind: 'discord',
    })
    expect(webhookTarget('http://hooks.slack.com/x', DEFAULT_POLICY)).toEqual({
      ok: false,
      code: 'unsupported-scheme',
    })
  })
})
