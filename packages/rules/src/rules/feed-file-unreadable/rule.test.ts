import { collectFeed } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, feedEvidence, fixtureFeed, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const finding = (text: string) => detectAll(rule, feedEvidence(text)).map((item) => item.message)

describe('feed-file-unreadable', () => {
  it('fails the wrong fixture: a sitemap is no feed, and the finding names its root', () => {
    const evidence = fixtureFeed(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page, evidence)).toBe(true)
    const [only] = detectAll(rule, evidence)
    expect(only).toMatchObject({ message: 'not-a-feed', values: { root: 'urlset' } })
  })

  it('passes the right fixture', () => {
    const evidence = fixtureFeed(rule.id, 'right')
    expect(rule.appliesTo(evidence.page, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['', 'empty'],
    ['<!doctype html><title>x</title>', 'html'],
    ['<rss version="2.0"><channel><title>t</title></channel></rss>', 'no-items'],
    ['<rss>\n<channel>\n<item></channel>', 'not-xml'],
    ['name\tcolour\nx\ty', 'no-columns'],
  ])('%j → %s', (text, message) => {
    expect(finding(text)).toEqual([message])
  })

  it('says where broken XML breaks', () => {
    const [only] = detectAll(rule, feedEvidence('<rss>\n<channel>\n<item></channel>'))
    expect(only?.location).toEqual({ line: 3, column: expect.any(Number) as number })
  })

  it('could not check a gzip file served as it is, and judges nothing of it', () => {
    const body = Uint8Array.of(0x1f, 0x8b, 8, 0)
    const evidence = { ...feedEvidence(''), feed: collectFeed({ body }) }
    expect(rule.couldNotCheck?.(evidence)).toBe('feed-compressed')
    expect(detectAll(rule, evidence)).toEqual([])
    expect(rule.couldNotCheck?.(fixtureFeed(rule.id, 'wrong'))).toBeNull()
  })

  it('does not apply to a scan that read no feed', () => {
    const page = htmlPage('<p>مرحبا</p>')
    expect(rule.appliesTo(page, evidenceOf(page))).toBe(false)
  })
})
