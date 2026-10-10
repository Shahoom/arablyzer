import { describe, expect, it } from 'vitest'
import { checkLogo, logoTypeOf } from '../src/index'
import { jpeg, png, svg, text, webp } from './images'

describe('checkLogo', () => {
  it('accepts a PNG and takes its text and EXIF chunks out', () => {
    const result = checkLogo(png(120, 40))
    expect(result).toMatchObject({ ok: true, type: 'image/png', width: 120, height: 40 })
    if (!result.ok) return
    const kept = text(result.bytes)
    expect(kept).toContain('IHDR')
    expect(kept).toContain('IDAT')
    expect(kept).toContain('IEND')
    expect(kept).not.toContain('tEXt')
    expect(kept).not.toContain('secret author')
    expect(kept).not.toContain('eXIf')
  })

  it('accepts a JPEG and takes its EXIF segment out', () => {
    const result = checkLogo(jpeg(300, 90))
    expect(result).toMatchObject({ ok: true, type: 'image/jpeg', width: 300, height: 90 })
    if (!result.ok) return
    expect(text(result.bytes)).not.toContain('Exif')
    expect([...result.bytes.subarray(0, 2)]).toEqual([0xff, 0xd8])
    expect([...result.bytes.subarray(-2)]).toEqual([0xff, 0xd9])
  })

  it('accepts a WebP, drops its EXIF chunk and clears the flags that named it', () => {
    const result = checkLogo(webp(64, 64))
    expect(result).toMatchObject({ ok: true, type: 'image/webp', width: 64, height: 64 })
    if (!result.ok) return
    expect(text(result.bytes)).not.toContain('EXIF')
    const view = new DataView(result.bytes.buffer, result.bytes.byteOffset)
    // The RIFF size still matches the file, and the VP8X flags have no EXIF or XMP.
    expect(view.getUint32(4, true) + 8).toBe(result.bytes.length)
    expect((result.bytes[20] ?? 0) & (0x08 | 0x04)).toBe(0)
  })

  it('goes by the bytes, not the name: an SVG is refused, and so is anything unknown', () => {
    expect(checkLogo(svg())).toEqual({ ok: false, problem: 'type' })
    expect(checkLogo(new TextEncoder().encode('GIF89a....'))).toEqual({
      ok: false,
      problem: 'type',
    })
    expect(logoTypeOf(svg())).toBeNull()
    expect(checkLogo(new Uint8Array(0))).toEqual({ ok: false, problem: 'type' })
  })

  it('refuses a picture that is too big in weight or in size, and a file cut short', () => {
    expect(checkLogo(png(4000, 10))).toEqual({ ok: false, problem: 'dimensions' })
    expect(checkLogo(jpeg(10, 3000))).toEqual({ ok: false, problem: 'dimensions' })
    const heavy = png(10, 10, 210 * 1024)
    expect(checkLogo(heavy)).toEqual({ ok: false, problem: 'too-large' })
    expect(checkLogo(new Uint8Array(900 * 1024))).toEqual({ ok: false, problem: 'too-large' })
    expect(checkLogo(png(10, 10).subarray(0, 30))).toEqual({ ok: false, problem: 'corrupt' })
  })
})
