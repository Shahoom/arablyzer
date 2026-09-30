import { describe, expect, it } from 'vitest'
import { decodeHtml, decodeWindows1252, sniffEncoding } from '../src/encoding'
import { concat, encodeSingleByte, utf8 } from './helpers'

const ARABIC = 'مرحبا بكم في موقعنا العربي'
const cp1256 = (text: string) => encodeSingleByte(text, 'windows-1256')
const ascii = (text: string) => utf8(text)

describe('sniffEncoding (WHATWG HTML §13.2.3)', () => {
  it('lets a BOM win over everything else', () => {
    const bytes = concat(new Uint8Array([0xef, 0xbb, 0xbf]), utf8(ARABIC))
    expect(sniffEncoding(bytes, 'text/html; charset=windows-1256')).toEqual({
      name: 'utf-8',
      source: 'bom',
    })
    expect(sniffEncoding(new Uint8Array([0xff, 0xfe, 0x3c, 0x00]), null).name).toBe('utf-16le')
    expect(sniffEncoding(new Uint8Array([0xfe, 0xff, 0x00, 0x3c]), null).name).toBe('utf-16be')
  })

  it('uses the Content-Type charset next, mapping labels as browsers do', () => {
    expect(sniffEncoding(cp1256(ARABIC), 'text/html; charset=windows-1256')).toEqual({
      name: 'windows-1256',
      source: 'http',
    })
    expect(sniffEncoding(ascii('x'), 'text/html; Charset="CP1256"').name).toBe('windows-1256')
    expect(sniffEncoding(ascii('x'), 'text/html;charset=latin1').name).toBe('windows-1252')
  })

  it('ignores an unknown Content-Type charset and falls through', () => {
    const page = ascii('<meta charset="windows-1256">')
    expect(sniffEncoding(page, 'text/html; charset=nonsense')).toEqual({
      name: 'windows-1256',
      source: 'meta',
    })
  })

  it('finds <meta charset> in the first 1024 bytes', () => {
    const page = ascii('<!doctype html><html><head><META CHARSET=windows-1256></head>')
    expect(sniffEncoding(page, 'text/html')).toEqual({ name: 'windows-1256', source: 'meta' })
  })

  it('finds the http-equiv content-type pragma, in either attribute order', () => {
    const page = ascii(`<meta content='text/html; charset="iso-8859-6"' http-equiv="Content-Type">`)
    expect(sniffEncoding(page, null)).toEqual({ name: 'iso-8859-6', source: 'meta' })
  })

  it('ignores a content charset without the pragma, and metas inside comments', () => {
    expect(
      sniffEncoding(ascii('<meta content="text/html; charset=windows-1256">'), null).source,
    ).toBe('default')
    expect(
      sniffEncoding(ascii('<!-- <meta charset="windows-1256"> --><p>x</p>'), null).source,
    ).toBe('default')
  })

  it('skips attributes of other tags, even when they look like a meta', () => {
    const page = ascii(`<div title="<meta charset=windows-1256>"></div>`)
    expect(sniffEncoding(page, null).source).toBe('default')
  })

  it('stops the prescan after 1024 bytes', () => {
    const page = ascii(`${' '.repeat(1024)}<meta charset="windows-1256">`)
    expect(sniffEncoding(page, null).source).toBe('default')
  })

  it('treats a UTF-16 meta declaration as UTF-8, and x-user-defined as windows-1252', () => {
    expect(sniffEncoding(ascii('<meta charset="utf-16">'), null).name).toBe('utf-8')
    expect(sniffEncoding(ascii('<meta charset="x-user-defined">'), null).name).toBe('windows-1252')
  })

  it('without a declaration, recognises UTF-8, legacy Arabic and legacy Latin text', () => {
    expect(sniffEncoding(utf8(`<p>${ARABIC}</p>`), null)).toEqual({
      name: 'utf-8',
      source: 'sniffed',
    })
    expect(sniffEncoding(concat(ascii('<p>'), cp1256(ARABIC)), null)).toEqual({
      name: 'windows-1256',
      source: 'sniffed',
    })
    const german = encodeSingleByte('Grüße aus Köln, schöne Straße', 'windows-1252')
    expect(sniffEncoding(german, null)).toEqual({ name: 'windows-1252', source: 'sniffed' })
    expect(sniffEncoding(ascii('<p>hello</p>'), null)).toEqual({
      name: 'utf-8',
      source: 'default',
    })
  })
})

describe('decodeHtml', () => {
  // Node's TextDecoder takes windows-1252 as ISO-8859-1 for 0x80–0x9F (checked on Node 22.22);
  // browsers follow the WHATWG index: 0x80 is €, 0x85 …, 0x93 and 0x94 curly quotes.
  it('decodes windows-1252 as browsers do, including 0x80–0x9F', () => {
    const bytes = new Uint8Array([0x93, 0x41, 0x94, 0x20, 0x80, 0x35, 0x85, 0x20, 0xe9, 0x81])
    for (const charset of ['windows-1252', 'iso-8859-1', 'us-ascii']) {
      expect(decodeHtml(bytes, `text/html; charset=${charset}`).text).toBe('“A” €5… é\u0081')
    }
    expect(decodeWindows1252(new Uint8Array([0x8d, 0x8f, 0x90, 0x9d, 0x9f]))).toBe(
      '\u008d\u008f\u0090\u009d\u0178',
    )
  })

  it('decodes a windows-1256 page declared in the Content-Type header', () => {
    const page = concat(ascii('<p>'), cp1256(ARABIC), ascii('</p>'))
    const decoded = decodeHtml(page, 'text/html; charset=windows-1256')
    expect(decoded.text).toBe(`<p>${ARABIC}</p>`)
    expect(decoded.encoding).toEqual({ name: 'windows-1256', source: 'http' })
  })

  it('drops the BOM from the text', () => {
    const decoded = decodeHtml(concat(new Uint8Array([0xef, 0xbb, 0xbf]), utf8('<p>')), null)
    expect(decoded.text).toBe('<p>')
  })
})
