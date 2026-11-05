import { spec as arabicSlugGenerator } from './arabic-slug-generator'
import { spec as errorDecoder } from './error-decoder'
import type { TextToolSpec } from './spec'
import { spec as titleFixer } from './title-fixer'

/** The tools whose page mounts TextTool, by slug. */
export const TEXT_TOOLS: Readonly<Record<string, TextToolSpec | undefined>> = {
  'arabic-slug-generator': arabicSlugGenerator,
  'error-decoder': errorDecoder,
  'title-fixer': titleFixer,
}
