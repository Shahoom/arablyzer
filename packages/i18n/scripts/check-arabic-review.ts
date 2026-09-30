import { ALL_COPY } from '../src/index'

// Design decision 7, for the site's own words: CI stays red until the owner has read the Arabic
// copy and set `reviewed: true` in its file.
const files = Object.keys(ALL_COPY)
const pending = files.filter((file) => ALL_COPY[file]?.reviewed !== true)

if (pending.length > 0) {
  console.error(
    [
      `Interface copy waiting for the owner's review (${pending.length} of ${files.length} files):`,
      ...pending.map((file) => `  - packages/i18n/src/${file}`),
      'Read the Arabic in each file and set "reviewed: true" there.',
    ].join('\n'),
  )
  process.exitCode = 1
} else {
  console.log(`Interface copy reviewed in all ${files.length} files.`)
}
