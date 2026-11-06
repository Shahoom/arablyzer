import type { GlossaryTermDefinition } from '../../glossary'

export const definition: GlossaryTermDefinition = {
  slug: 'utf-8',
  term: 'UTF-8',
  tools: ['arabic-encoding-check'],
  rules: ['ar-mojibake'],
  guides: [],
  related: ['mojibake', 'lang-attribute', 'percent-encoding'],
  updated: '2026-11-06',
}
