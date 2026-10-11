import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule, SOFT_404_MAX_LETTERS } from './rule'

const page = (title: string, h1: string, status = 200, extra = '') =>
  htmlPage(
    `<html lang="ar"><head><title>${title}</title></head><body><h1>${h1}</h1><p>مرحبا</p>${extra}</body></html>`,
    {
      status,
    },
  )
const messages = (title: string, h1: string, status = 200, extra = '') =>
  detectAll(rule, evidenceOf(page(title, h1, status, extra))).map(
    (finding) => finding.values?.source,
  )

describe('soft-404-signals', () => {
  it('fails the wrong fixture: a page that says it is not found and answers 200', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.values?.source)).toEqual(['title'])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    'الصفحة غير موجودة',
    'الصفحة المطلوبة غير موجودة',
    'صفحة غير موجودة',
    'لم يتم العثور على الصفحة',
    'لم نعثر على الصفحة المطلوبة',
    'عذراً، لم نجد ما تبحث عنه',
    'خطأ 404',
    'خطأ ٤٠٤',
    '404',
    'Error 404',
    'Page not found',
    'Oops! The page was not found',
    'This page does not exist',
    "We couldn't find that page",
  ])('%s is a not-found page', (heading) => {
    expect(messages('متجر', heading)).toEqual(['heading'])
  })

  it.each([
    'عطر العود الملكي',
    'الصفحة الرئيسية',
    'منتج موجود في المخزون',
    'المنتج غير متاح حالياً',
    'أكثر من 4040 عميل',
    'السعر 404.5 ريال',
    'العثور على العطر المناسب',
    'Find the right perfume',
  ])('%s is not', (heading) => {
    expect(messages('متجر', heading)).toEqual([])
  })

  it('reads the title as well as the first heading', () => {
    expect(messages('الصفحة غير موجودة | متجر', 'متجر الواحة')).toEqual(['title'])
  })

  it('passes a server that answers 404 or 410, and does not judge other statuses', () => {
    expect(messages('متجر', 'الصفحة غير موجودة', 404)).toEqual([])
    expect(messages('متجر', 'الصفحة غير موجودة', 410)).toEqual([])
    expect(rule.appliesTo(page('x', 'y', 404))).toBe(true)
    expect(rule.appliesTo(page('x', 'y', 500))).toBe(false)
    expect(rule.appliesTo(page('x', 'y', 302))).toBe(false)
  })

  it('does not take a long page for an error page, even if it speaks of one', () => {
    const long = `<p>${'كلمة '.repeat(SOFT_404_MAX_LETTERS)}</p>`
    expect(messages('متجر', 'ما معنى خطأ 404', 200, long)).toEqual([])
  })

  it('does not apply to a response that is no HTML page', () => {
    const json = htmlPage('{"error":"not found"}', {
      headers: [['content-type', 'application/json']],
    })
    expect(rule.appliesTo(json)).toBe(false)
  })
})
