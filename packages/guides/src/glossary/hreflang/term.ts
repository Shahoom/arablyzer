import type { GlossaryTermDefinition } from '../../glossary'

export const definition: GlossaryTermDefinition = {
  slug: 'hreflang',
  term: 'hreflang',
  tools: ['hreflang-check', 'language-check'],
  rules: ['hreflang-invalid-code'],
  guides: ['alternate-page-with-proper-canonical-tag'],
  related: ['canonical-url', 'lang-attribute'],
  updated: '2026-09-29',
}
