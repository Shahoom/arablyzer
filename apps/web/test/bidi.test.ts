import { describe, expect, it } from 'vitest'
import { isolateLatin } from '../src/lib/bidi'

const isolated = (text: string) =>
  isolateLatin(text)
    .filter((part) => part.isolate)
    .map((part) => part.text)

describe('isolateLatin', () => {
  it('isolates code and Latin words inside Arabic, without their trailing stops', () => {
    expect(isolated('لأن نمطه [A-Za-z ]{3,40} لا يسمح بكل الحروف العربية.')).toEqual([
      '[A-Za-z ]{3,40}',
    ])
    expect(isolated('على هذا النص العربي letter-spacing: 3.2px، وقد رسمها المتصفح')).toEqual([
      'letter-spacing: 3.2px',
    ])
    expect(isolated('يقبل «Omar Alabri» ويرفض «محمد العبري»')).toEqual(['Omar Alabri'])
    expect(isolated('حسب ISO 4217: «12.500 ر.ع.».')).toEqual(['ISO 4217'])
    expect(isolated('# صفحة الاختبار 04-rtl-layout، في المتصفحات الثلاثة')).toEqual([
      '04-rtl-layout',
    ])
  })

  it('isolates a rule’s title whole, its quotes with its code', () => {
    expect(isolated('صفحة عربية بلا dir="rtl" في وسم html')).toEqual(['dir="rtl"', 'html'])
    expect(isolated('خطأ في صيغة JSON داخل البيانات المنظّمة (JSON-LD)')).toEqual([
      'JSON',
      '(JSON-LD)',
    ])
  })

  it('isolates a tag with its angle brackets, which a lone bracket would turn round', () => {
    expect(isolated('أغلب نص الصفحة عربي، لكن وسم <html> بلا سمة dir="rtl".')).toEqual([
      '<html>',
      'dir="rtl"',
    ])
    expect(isolated('ضع </body> في آخر الصفحة، لا <عربي>')).toEqual(['</body>'])
  })

  it('leaves brackets around Arabic alone, which a lone isolated bracket would turn round', () => {
    expect(isolated('اختبر الصفحة (الرئيسية) الآن')).toEqual([])
    expect(isolated('الأرقام (١٢٣) و[٤٥٦]')).toEqual([])
  })

  it('isolates numbers joined into one by spaces, brackets or a plus sign', () => {
    expect(isolated('فالرقم المكتوب «+968 9123 4567» يظهر «4567 9123 968+».')).toEqual([
      '+968 9123 4567',
      '4567 9123 968+',
    ])
    expect(isolated('ويرفض «٩١٢٣٤٥٦٧»، ونمطه [0-9]{8}.')).toEqual(['[0-9]{8}'])
  })

  it('leaves numbers alone, and keeps every character', () => {
    const text = 'هاتف عرضها 390 بكسل بمقدار 280 بكسل، و«12.50 ر.ع.» في CSS هنا.'
    expect(isolated(text)).toEqual(['CSS'])
    expect(
      isolateLatin(text)
        .map((part) => part.text)
        .join(''),
    ).toBe(text)
  })

  it('keeps English text whole', () => {
    const text = 'Arabic text here has letter-spacing: 3.2px.'
    expect(
      isolateLatin(text)
        .map((part) => part.text)
        .join(''),
    ).toBe(text)
  })
})
