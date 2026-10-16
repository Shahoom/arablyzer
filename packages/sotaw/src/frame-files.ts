import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { parseFrameCsv, type Frame, type FrameMeta, type FrameRow } from './frame'

/** Where the frames are committed: `data/frames/<list id>.csv` and `<list id>.json`. */
export const FRAMES_DIR = fileURLToPath(new URL('../data/frames/', import.meta.url))
export const OPT_OUT_FILE = fileURLToPath(new URL('../data/opt-out.txt', import.meta.url))

const count = z.number().int().nonnegative()
export const FrameMetaShape = z.strictObject({
  source: z.literal('tranco'),
  listId: z.string().regex(/^[A-Z0-9]{4,8}$/),
  listCreatedOn: z.string().nullable(),
  seed: z.string().min(1),
  cap: count,
  floor: count,
  total: count,
  populations: z.record(z.string(), count),
  sampled: z.record(z.string(), count),
  optedOut: count,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

export function metaOf(
  frame: Frame,
  options: Omit<FrameMeta, 'total' | 'populations' | 'sampled' | 'optedOut' | 'sha256' | 'source'>,
  csv: string,
): FrameMeta {
  return {
    source: 'tranco',
    ...options,
    total: frame.rows.length,
    populations: frame.populations,
    sampled: frame.sampled,
    optedOut: frame.optedOut,
    sha256: sha256(csv),
  }
}

/** The ids of the frames committed, newest id last. */
export function frameIds(dir: string = FRAMES_DIR): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .sort()
  } catch {
    return []
  }
}

/** A frame as committed, checked: its rows are the file the metadata hashes, and as many as it says. */
export function loadFrame(
  listId: string,
  dir: string = FRAMES_DIR,
): { rows: FrameRow[]; meta: z.infer<typeof FrameMetaShape> } {
  if (!/^[A-Z0-9]{4,8}$/.test(listId))
    throw new Error('A Tranco list id is 4 to 8 capital letters and digits')
  const base = join(dir, listId)
  const csv = readFileSync(`${base}.csv`, 'utf8')
  const meta = FrameMetaShape.parse(JSON.parse(readFileSync(`${base}.json`, 'utf8')))
  if (sha256(csv) !== meta.sha256)
    throw new Error(`The frame ${listId} is not the file its metadata hashes`)
  const rows = parseFrameCsv(csv)
  if (rows.length !== meta.total)
    throw new Error(
      `The frame ${listId} has ${String(rows.length)} sites, not ${String(meta.total)}`,
    )
  return { rows, meta }
}
