import { describe, expect, it } from 'vitest'
import { matchesAll, searchable, searchWords } from '../src/lib/search'

/** Whether the typed words find a card with this text, as the directory's search does. */
const finds = (typed: string, text: string) => matchesAll(searchable(text), searchWords(typed))

describe('the tools’ search', () => {
  it('reads the alef with a hamza or a madda, and alef wasla, as a bare alef', () => {
    expect(finds('اداة', 'أداة')).toBe(true)
    expect(finds('أداة', 'اداة')).toBe(true)
    expect(finds('اسم', 'إسم')).toBe(true)
    expect(finds('امن', 'آمن')).toBe(true)
    expect(finds('الاتجاه', 'ٱلاتجاه')).toBe(true)
  })

  it('reads taa marbuta as haa, and alef maqsura as yaa', () => {
    expect(finds('صفحه', 'صفحة')).toBe(true)
    expect(finds('صفحة', 'صفحه')).toBe(true)
    expect(finds('مبنى', 'مبني')).toBe(true)
  })

  it('leaves out tatweel and harakat', () => {
    expect(finds('خط', 'خــط')).toBe(true)
    expect(finds('خُطُوط', 'خطوط')).toBe(true)
    expect(finds('خطوط', 'خُطُوطٌ')).toBe(true)
    expect(finds('رحمن', 'رحمٰن')).toBe(true)
  })

  it('finds a word with its «ال» or without it', () => {
    expect(finds('الاتجاه', 'فحص اتجاه الصفحة')).toBe(true)
    expect(finds('اتجاه', 'فحص الاتجاه')).toBe(true)
    // «ال» is not dropped from a word it leaves too short to mean anything.
    expect(finds('الو', 'وسم')).toBe(false)
  })

  it('wants every word, in any case, and nothing for nothing typed', () => {
    expect(finds('whatsapp رابط', 'فحص رابط WhatsApp')).toBe(true)
    expect(finds('whatsapp خط', 'فحص رابط WhatsApp')).toBe(false)
    expect(searchWords('   ')).toEqual([])
    expect(finds('', 'أي نص')).toBe(true)
  })
})
