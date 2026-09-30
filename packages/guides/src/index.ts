import { defineFixGuide, type FixGuide } from './fix'
import { FIX_GUIDE_DEFINITIONS } from './fix-registry'
import { defineTerm, type GlossaryTerm } from './glossary'
import { GLOSSARY_DEFINITIONS } from './glossary-registry'

export {
  parseDocument,
  type DocumentCopy,
  type DocumentSchema,
  type FaqEntry,
  type Lang,
} from './document'
export {
  FIX_SCHEMA,
  defineFixGuide,
  type FixGuide,
  type FixGuideDefinition,
  type FixSection,
  type FixSource,
} from './fix'
export { FIX_GUIDE_DEFINITIONS } from './fix-registry'
export {
  TERM_SCHEMA,
  defineTerm,
  type GlossaryTerm,
  type GlossaryTermDefinition,
  type TermSection,
} from './glossary'
export { GLOSSARY_DEFINITIONS } from './glossary-registry'

/** Every /fix guide with its copy, in the report's order. */
export const FIX_GUIDES: readonly FixGuide[] = FIX_GUIDE_DEFINITIONS.map(defineFixGuide)

/** Every glossary term with its copy, sorted by slug. */
export const GLOSSARY: readonly GlossaryTerm[] = GLOSSARY_DEFINITIONS.map(defineTerm)
