import { describe, expect, it } from 'vitest'
import { collectPage, type PageFacts } from '../src/page'
import { utf8 } from './helpers'

function html(source: string) {
  const facts: PageFacts = collectPage({
    url: 'https://example.com/ar/contact',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: utf8(source),
  })
  if (facts.html === null) throw new Error('expected HTML facts')
  return facts.html
}

describe('collectPage: the title element', () => {
  it('says where the title is', () => {
    expect(html('<head>\n  <title>متجر</title></head>').titleElement).toEqual({
      selector: 'head > title',
      location: { line: 2, column: 3 },
      snippet: '<title>',
    })
    expect(html('<p>نص</p>').titleElement).toBeNull()
  })
})

describe('collectPage: headings', () => {
  it('lists h1 to h6 with their level, text and location', () => {
    const facts = html(`<!doctype html><body>
<h1>  متجر
  العطور </h1>
<section><h2 id="offers">العروض</h2><h6>ملاحظة</h6></section>
</body>`)
    expect(facts.headings).toEqual([
      expect.objectContaining({ level: 1, text: 'متجر العطور', location: { line: 2, column: 1 } }),
      expect.objectContaining({ level: 2, text: 'العروض', selector: '#offers' }),
      expect.objectContaining({ level: 6, text: 'ملاحظة' }),
    ])
  })

  it('counts the alt text of images as heading text, as screen readers read it', () => {
    const facts = html('<body><h1><img src="/logo.png" alt="متجر الواحة"></h1><h1> </h1></body>')
    expect(facts.headings.map((heading) => heading.text)).toEqual(['متجر الواحة', ''])
  })

  it('leaves out headings inside <template>, which the page never shows', () => {
    expect(html('<body><template><h1>مخفي</h1></template></body>').headings).toEqual([])
  })
})

describe('collectPage: form fields', () => {
  const facts = html(`<!doctype html><body>
<form>
  <label for="name">الاسم الكامل</label>
  <input id="name" name="full_name" pattern="[A-Za-z ]+" autocomplete="Name" dir="ltr">
  <label>رقم الجوال <input type="TEL" name="phone" inputmode="Numeric" placeholder="05xxxxxxxx"></label>
  <input type="unknown-type" name="city" aria-label="المدينة">
  <textarea name="message"></textarea>
  <select name="country"><option>عُمان</option></select>
  <label>الدولة <select name="region"><option>مسقط</option></select></label>
</form>
<input type="search" name="q">
</body>`)

  it('lists inputs, textareas and selects, in and out of forms, with what tells them apart', () => {
    expect(facts.fields.map((field) => [field.tag, field.type, field.name])).toEqual([
      ['input', 'text', 'full_name'],
      ['input', 'tel', 'phone'],
      ['input', 'text', 'city'],
      ['textarea', 'textarea', 'message'],
      ['select', 'select', 'country'],
      ['select', 'select', 'region'],
      ['input', 'search', 'q'],
    ])
    expect(facts.fields[0]).toMatchObject({
      id: 'name',
      pattern: '[A-Za-z ]+',
      autocomplete: ['name'],
      dir: 'ltr',
      label: 'الاسم الكامل',
      selector: '#name',
      location: { line: 4, column: 3 },
    })
    expect(facts.fields[1]).toMatchObject({
      inputmode: 'numeric',
      placeholder: '05xxxxxxxx',
      label: 'رقم الجوال',
    })
    expect(facts.fields[2]).toMatchObject({ ariaLabel: 'المدينة', label: null })
  })

  it('takes a wrapping label as HTML does: its text, without the options of a select inside it', () => {
    expect(facts.fields[5]?.label).toBe('الدولة')
  })

  it('gives a field every label that points at it', () => {
    const two = html(
      '<body><label for="e">البريد</label><label for="e">(إلزامي)</label><input id="e" type="email"></body>',
    )
    expect(two.fields[0]?.label).toBe('البريد (إلزامي)')
  })

  it('does not let a label with a for attribute label the field inside it', () => {
    const other = html('<body><label for="x">اسم<input name="inner"></label><input id="x"></body>')
    expect(other.fields.map((field) => field.label)).toEqual([null, 'اسم'])
  })
})
