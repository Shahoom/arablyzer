import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { countByReason, exclusionsCsv, parseExclusionsCsv, type ExcludedRow } from './exclusions'
import { parseFrameCsv, type Frame, type FrameMeta, type FrameRow, type TrancoEntry } from './frame'

/**
 * Where the frames are committed: `data/frames/<list id>.csv` and `<list id>.json`, and
 * `<list id>.exclusions.csv`: the sites of the list's Arab domains that are left out, and why.
 */
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
  excluded: count,
  exclusions: z.record(z.string(), count),
  exclusionsSha256: z.string().regex(/^[0-9a-f]{64}$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

export function metaOf(
  frame: Frame,
  options: Omit<
    FrameMeta,
    | 'total'
    | 'populations'
    | 'sampled'
    | 'optedOut'
    | 'excluded'
    | 'exclusions'
    | 'exclusionsSha256'
    | 'sha256'
    | 'source'
  >,
  csv: string,
): FrameMeta {
  return {
    source: 'tranco',
    ...options,
    total: frame.rows.length,
    populations: frame.populations,
    sampled: frame.sampled,
    optedOut: frame.optedOut,
    excluded: frame.excluded.length,
    exclusions: countByReason(frame.excluded),
    exclusionsSha256: sha256(exclusionsCsv(frame.excluded)),
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

/** A frame as committed, checked: its rows (and its exclusions) are the files the metadata hashes, and as many as it says. */
export function loadFrame(
  listId: string,
  dir: string = FRAMES_DIR,
): { rows: FrameRow[]; excluded: ExcludedRow[]; meta: z.infer<typeof FrameMetaShape> } {
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
  const exclusions = readFileSync(`${base}.exclusions.csv`, 'utf8')
  if (sha256(exclusions) !== meta.exclusionsSha256)
    throw new Error(`The exclusions of ${listId} are not the file its metadata hashes`)
  const excluded = parseExclusionsCsv(exclusions)
  if (excluded.length !== meta.excluded)
    throw new Error(
      `The frame ${listId} leaves out ${String(excluded.length)} sites, not ${String(meta.excluded)}`,
    )
  return { rows, excluded, meta }
}

const PriorMeta = z.looseObject({
  listId: z.string().regex(/^[A-Z0-9]{4,8}$/),
  listCreatedOn: z.string().nullable(),
  seed: z.string().min(1),
  cap: count,
  floor: count,
  optedOut: count,
  populations: z.record(z.string(), count),
  sampled: z.record(z.string(), count),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})

/**
 * The list's sites on Arab domains as a committed frame holds them, to make the frame again under
 * other rules without the list: only possible when the frame is all of them (no country was
 * sampled), which is the case while a list has fewer sites on these domains than the cap. A
 * frame's exclusions, when it has them, are put back, so the same rules give the same frame whether
 * it is made from the list or from this.
 */
export function entriesOfFrame(
  listId: string,
  dir: string = FRAMES_DIR,
): {
  entries: TrancoEntry[]
  meta: Pick<z.infer<typeof PriorMeta>, 'listCreatedOn' | 'seed' | 'cap' | 'floor' | 'optedOut'>
} {
  if (!/^[A-Z0-9]{4,8}$/.test(listId))
    throw new Error('A Tranco list id is 4 to 8 capital letters and digits')
  const base = join(dir, listId)
  const csv = readFileSync(`${base}.csv`, 'utf8')
  const meta = PriorMeta.parse(JSON.parse(readFileSync(`${base}.json`, 'utf8')))
  if (sha256(csv) !== meta.sha256)
    throw new Error(`The frame ${listId} is not the file its metadata hashes`)
  const rows = parseFrameCsv(csv, { keepExcluded: true })
  for (const [code, population] of Object.entries(meta.populations)) {
    if ((meta.sampled[code] ?? 0) !== population)
      throw new Error(`The frame ${listId} is a sample of ${code}: make it from the list again`)
  }
  let left: ExcludedRow[] = []
  try {
    left = parseExclusionsCsv(readFileSync(`${base}.exclusions.csv`, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const entries = [...rows, ...left].map(({ rank, domain }) => ({ rank, domain }))
  return {
    entries,
    meta: {
      listCreatedOn: meta.listCreatedOn,
      seed: meta.seed,
      cap: meta.cap,
      floor: meta.floor,
      optedOut: meta.optedOut,
    },
  }
}
