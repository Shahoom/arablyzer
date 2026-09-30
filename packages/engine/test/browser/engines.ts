import { engineAvailable } from '@arablyzer/browser'
import { ENGINES, type Engine } from '@arablyzer/collectors'

/**
 * Every engine that launches here. Engines named in ARABLYZER_REQUIRE_ENGINES (CI names all
 * three) must launch, so a missing one fails the run instead of being skipped.
 */
export async function enginesHere(): Promise<Engine[]> {
  const required = (process.env.ARABLYZER_REQUIRE_ENGINES ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
  const engines: Engine[] = []
  for (const engine of ENGINES) {
    if (await engineAvailable(engine)) engines.push(engine)
    else if (required.includes(engine)) {
      throw new Error(`${engine} is required by ARABLYZER_REQUIRE_ENGINES but does not launch`)
    }
  }
  if (engines.length === 0) {
    throw new Error(
      'No browser launches here: install Playwright browsers or set ARABLYZER_CHROMIUM_PATH',
    )
  }
  return engines
}
