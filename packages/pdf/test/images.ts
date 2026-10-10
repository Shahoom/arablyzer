// Tiny image files with the structure a logo check reads (headers, chunks, segments); their picture
// data is not real, which the check never decodes.

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const ascii = (text: string) => Array.from(text).map((c) => c.charCodeAt(0))
const bytes = (...parts: readonly (readonly number[] | Uint8Array)[]) =>
  Uint8Array.from(parts.flatMap((part) => [...part]))

function chunk(name: string, data: readonly number[]): number[] {
  return [...u32be(data.length), ...ascii(name), ...data, 0, 0, 0, 0]
}

export function png(width: number, height: number, picture = 4): Uint8Array {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]),
    chunk('tEXt', ascii('Comment\0secret author')),
    chunk('eXIf', ascii('GPS 25.2N 55.3E')),
    chunk('IDAT', new Array<number>(picture).fill(1)),
    chunk('IEND', []),
  )
}

export function jpeg(width: number, height: number): Uint8Array {
  const app1 = [0xff, 0xe1, 0, 11, ...ascii('Exif\0\0GPS')]
  const sof = [
    0xff,
    0xc0,
    0,
    11,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    1,
    1,
    0x11,
    0,
  ]
  const sos = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0]
  return bytes([0xff, 0xd8], app1, sof, sos, [9, 9, 9, 9], [0xff, 0xd9])
}

export function webp(width: number, height: number): Uint8Array {
  const vp8x = [
    ...ascii('VP8X'),
    ...u32le(10),
    0x08 | 0x04, // the EXIF and XMP flags are set
    0,
    0,
    0,
    (width - 1) & 255,
    ((width - 1) >> 8) & 255,
    ((width - 1) >> 16) & 255,
    (height - 1) & 255,
    ((height - 1) >> 8) & 255,
    ((height - 1) >> 16) & 255,
  ]
  const exif = [...ascii('EXIF'), ...u32le(4), 1, 2, 3, 4]
  const image = [...ascii('VP8 '), ...u32le(4), 0, 0, 0, 0]
  const body = [...ascii('WEBP'), ...vp8x, ...exif, ...image]
  return bytes(ascii('RIFF'), u32le(body.length), body)
}

export const svg = (): Uint8Array =>
  new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  )

export const text = (data: Uint8Array): string => new TextDecoder('latin1').decode(data)
