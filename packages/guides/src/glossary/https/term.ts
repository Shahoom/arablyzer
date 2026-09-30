import type { GlossaryTermDefinition } from '../../glossary'

export const definition: GlossaryTermDefinition = {
  slug: 'https',
  term: 'HTTPS',
  tools: ['mixed-content'],
  rules: ['https-missing', 'tls-expiring'],
  guides: [],
  related: ['hsts', 'mixed-content'],
  updated: '2026-09-29',
}
