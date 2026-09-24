import { RULES } from '../src/index'

// Design decision 7: a rule stays red in CI until the owner has read its Arabic copy.
const pending = RULES.filter((rule) => rule.copy.ar.reviewed !== true).map((rule) => rule.id)

if (pending.length > 0) {
  console.error(
    [
      `Arabic copy waiting for the owner's review (${pending.length} of ${RULES.length} rules):`,
      ...pending.map((id) => `  - packages/rules/src/rules/${id}/copy.ar.md`),
      'Read each file and set "reviewed: true" in its front matter.',
    ].join('\n'),
  )
  process.exitCode = 1
} else {
  console.log(`Arabic copy reviewed for all ${RULES.length} rules.`)
}
