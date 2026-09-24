import { TOOLS } from '../src/index'

// Design decision 7, as for rules: a tool stays red in CI until the owner has read its Arabic copy.
const pending = TOOLS.filter((tool) => tool.copy.ar.reviewed !== true).map((tool) => tool.slug)

if (pending.length > 0) {
  console.error(
    [
      `Arabic copy waiting for the owner's review (${pending.length} of ${TOOLS.length} tools):`,
      ...pending.map((slug) => `  - packages/tools/src/tools/${slug}/copy.ar.md`),
      'Read each file and set "reviewed: true" in its front matter.',
    ].join('\n'),
  )
  process.exitCode = 1
} else {
  console.log(`Arabic copy reviewed for all ${TOOLS.length} tools.`)
}
