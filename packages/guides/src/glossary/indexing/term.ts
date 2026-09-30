import type { GlossaryTermDefinition } from '../../glossary'

export const definition: GlossaryTermDefinition = {
  slug: 'indexing',
  term: 'Indexing',
  tools: ['indexability-check'],
  rules: ['page-noindex'],
  guides: ['crawled-currently-not-indexed', 'discovered-currently-not-indexed'],
  related: ['crawling', 'noindex', 'canonical-url'],
  updated: '2026-09-29',
}
