import { describe, expect, it } from 'vitest'
import { whatsAppText } from '../../lib/whatsapp'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const found = (href: string) =>
  detectAll(
    rule,
    evidenceOf(htmlPage(`<html lang="ar"><body><a href="${href}">واتساب</a></body></html>`)),
  ).map((finding) => finding.message)

const HELLO = '%D9%85%D8%B1%D8%AD%D8%A8%D8%A7'

describe('whatsapp-text-encoding', () => {
  it('fails the wrong fixture: one finding for each way an Arabic message goes wrong', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'double-encoded',
      'invalid-utf8',
      'hash-truncates',
      'template',
      'garbled',
      'bad-escape',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    [`https://wa.me/96891234567?text=${HELLO}`, []],
    [`https://wa.me/?text=${HELLO}`, []],
    ['https://wa.me/96891234567?text=hello%20there', []],
    ['https://wa.me/96891234567?text=hello+there', []],
    [`https://api.whatsapp.com/send?phone=96891234567&text=${HELLO}`, []],
    [`whatsapp://send?text=${HELLO}`, []],
    ['https://wa.me/96891234567?text=%25D9%2585', ['double-encoded']],
    ['https://wa.me/96891234567?text=%E3%D1%CD%C8%C7', ['invalid-utf8']],
    ['https://wa.me/96891234567?text=100%', ['bad-escape']],
    ['https://wa.me/96891234567?text=%zz', ['bad-escape']],
    [`https://wa.me/96891234567?text=${HELLO}%20#12`, ['hash-truncates']],
    [`https://wa.me/96891234567?text=${HELLO}%20%7B%7Bname%7D%7D`, ['template']],
    ['https://wa.me/96891234567?text=Hi%20%24%7Bname%7D', ['template']],
    ['https://wa.me/96891234567?text=Hi%20%7Bproduct_name%7D', ['template']],
  ])('%s → %j', (href, messages) => {
    expect(found(href)).toEqual(messages)
  })

  it('reads the Arabic characters written in the link as they are', () => {
    expect(found('https://wa.me/96891234567?text=مرحبا')).toEqual([])
  })

  it('names the text and what is lost', () => {
    const [finding] = detectAll(
      rule,
      evidenceOf(
        htmlPage(
          `<html lang="ar"><body><a href="https://wa.me/1?text=ab%20#1234">x</a></body></html>`,
        ),
      ),
    )
    expect(finding?.values).toEqual({ text: 'ab%20', lost: '1234' })
  })

  it('does not apply to other links, nor to a WhatsApp link without a message', () => {
    for (const href of [
      'https://example.com/?text=%25D9',
      'https://wa.me/96891234567',
      'https://chat.whatsapp.com/AbCd?text=1',
      'https://wa.me/message/ABC',
    ]) {
      const page = htmlPage(`<html lang="ar"><body><a href="${href}">x</a></body></html>`)
      expect(rule.appliesTo(page), href).toBe(false)
    }
  })

  it('reads the text of the forms of a click-to-chat link', () => {
    expect(whatsAppText('https://wa.me/1?lang=ar&text=a')).toEqual({ text: 'a', fragment: '' })
    expect(whatsAppText('https://web.whatsapp.com/send?text=a#x')).toEqual({
      text: 'a',
      fragment: 'x',
    })
    expect(whatsAppText('https://wa.me/1?text=')).toEqual({ text: '', fragment: '' })
    expect(whatsAppText('https://wa.me/1')).toBeNull()
    expect(whatsAppText('not a url')).toBeNull()
  })
})
