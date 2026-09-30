import type { GlossaryTermDefinition } from '../../glossary'

export const definition: GlossaryTermDefinition = {
  slug: 'canonical-url',
  term: 'Canonical URL',
  tools: ['canonical-check'],
  rules: ['canonical-conflict'],
  guides: [
    'duplicate-without-user-selected-canonical',
    'duplicate-google-chose-different-canonical-than-user',
    'alternate-page-with-proper-canonical-tag',
  ],
  related: ['hreflang', 'http-redirect'],
  updated: '2026-09-29',
}
