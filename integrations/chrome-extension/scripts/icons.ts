import { crc32, deflateSync } from 'node:zlib'

// The mark (apps/web/src/components/Logo.astro) drawn as a PNG, so the extension's icons are made
// from the same shape as the site's and no binary image is kept in the repository: a rounded
// square in the brand gradient with three white lines aligned to the right, each shorter than the
// one above. Drawn at 4 x 4 samples a pixel for smooth edges.

const FROM = [0x00, 0x7d, 0x88] as const
const TO = [0x4f, 0x46, 0xe5] as const
const SAMPLES = 4
/** The lines in the logo's 32-unit box: [y, x from, x to], and the half width of their stroke. */
const LINES = [
  [10.5, 8.5, 24],
  [16, 12.5, 24],
  [21.5, 16.5, 24],
] as const
const HALF_STROKE = 1.2

/** Whether a point (0 to 1 each way) is inside a rounded square with corner radius r. */
function inRoundedSquare(x: number, y: number, r: number): boolean {
  const dx = Math.max(r - x, x - (1 - r), 0)
  const dy = Math.max(r - y, y - (1 - r), 0)
  return dx * dx + dy * dy <= r * r
}

function inLine(x: number, y: number): boolean {
  const u = x * 32
  const v = y * 32
  return LINES.some(([ly, from, to]) => {
    const cx = Math.min(Math.max(u, from), to)
    return (u - cx) ** 2 + (v - ly) ** 2 <= HALF_STROKE ** 2
  })
}

/** RGBA pixels of the mark, `size` pixels square. */
export function drawMark(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let inside = 0
      let white = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size
          const y = (py + (sy + 0.5) / SAMPLES) / size
          if (!inRoundedSquare(x, y, 0.3125)) continue
          inside++
          if (inLine(x, y)) white++
        }
      }
      const total = SAMPLES * SAMPLES
      const t = (px + 0.5 + (py + 0.5)) / (2 * size)
      const o = (py * size + px) * 4
      // White over the gradient where a line is, by how much of the pixel it covers.
      const cover = inside === 0 ? 0 : white / inside
      for (let c = 0; c < 3; c++) {
        const from = FROM[c] ?? 0
        const base = from + ((TO[c] ?? 0) - from) * t
        pixels[o + c] = Math.round(base + (255 - base) * cover)
      }
      pixels[o + 3] = Math.round((inside / total) * 255)
    }
  }
  return pixels
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

/** A PNG (8-bit RGBA) of the mark. */
export function markPng(size: number): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const pixels = drawMark(size)
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0
    rows.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}
