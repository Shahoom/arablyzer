import { FIX_GUIDES, GLOSSARY } from '../src/index'

// Design decision 7, as for rules and tools: a guide or a term stays red in CI until the owner has
// read its Arabic copy.
const pending = [
  ...FIX_GUIDES.filter((guide) => guide.copy.ar.reviewed !== true).map(
    (guide) => `packages/guides/src/fix/${guide.slug}/copy.ar.md`,
  ),
  ...GLOSSARY.filter((term) => term.copy.ar.reviewed !== true).map(
    (term) => `packages/guides/src/glossary/${term.slug}/copy.ar.md`,
  ),
]

if (pending.length > 0) {
  console.error(
    [
      `Arabic copy waiting for the owner's review (${pending.length} guides and terms):`,
      ...pending.map((file) => `  - ${file}`),
      'Read each file and set "reviewed: true" in its front matter.',
    ].join('\n'),
  )
  process.exitCode = 1
} else {
  console.log('Arabic copy reviewed for every guide and term.')
}
