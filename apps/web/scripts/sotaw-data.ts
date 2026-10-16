import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Aggregates } from '@arablyzer/sotaw/aggregate'
import { FRAMES_DIR, frameIds, loadFrame } from '@arablyzer/sotaw/frame-files'
import { Manifest } from '@arablyzer/sotaw/manifest'
import type { SotawData } from '../src/lib/sotaw'

// What the State of the Arabic Web page needs (M9), for src/generated/sotaw.json: the sample frame
// as committed (a count for each country: real before any crawl) and, once the crawl has been
// exported and its files put in public/data/state-of-arabic-web/<edition>/, the newest edition's
// numbers. The page shows no figure that is not here.

export const EDITIONS_DIR = fileURLToPath(
  new URL('../public/data/state-of-arabic-web/', import.meta.url),
)

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

export function sotawData(options: { editions?: string; frames?: string } = {}): SotawData {
  const framesDir = options.frames ?? FRAMES_DIR
  const editionsDir = options.editions ?? EDITIONS_DIR
  const listId = frameIds(framesDir).at(-1)
  const frame =
    listId === undefined
      ? null
      : (() => {
          const { meta } = loadFrame(listId, framesDir)
          return {
            listId: meta.listId,
            listCreatedOn: meta.listCreatedOn,
            total: meta.total,
            cap: meta.cap,
            floor: meta.floor,
            seed: meta.seed,
            populations: meta.populations,
            sha256: meta.sha256,
          }
        })()
  const names = existsSync(editionsDir)
    ? readdirSync(editionsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : []
  const id = names.at(-1)
  if (id === undefined) return { frame, edition: null }
  const dir = join(editionsDir, id)
  const manifest = Manifest.parse(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')))
  // A copy that is not what was exported (a file missing, a file changed) must not be published.
  for (const file of manifest.files) {
    const bytes = readFileSync(join(dir, file.name))
    if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) {
      throw new Error(`${join(dir, file.name)} is not the file the manifest lists`)
    }
  }
  if (!manifest.files.some((file) => file.name === 'aggregates.json')) {
    throw new Error(`${dir} has no aggregates.json in its manifest`)
  }
  const aggregates = Aggregates.parse(
    JSON.parse(readFileSync(join(dir, 'aggregates.json'), 'utf8')),
  )
  if (aggregates.edition !== id || manifest.edition !== id) {
    throw new Error(`${dir} holds the edition ${aggregates.edition}`)
  }
  return {
    frame,
    edition: {
      id,
      aggregates,
      files: manifest.files.map(({ name, bytes, sha256: hash, description }) => ({
        name,
        bytes,
        sha256: hash,
        description,
      })),
    },
  }
}
