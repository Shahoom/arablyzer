/**
 * The part of Playwright's core bundle the lab reads: its registry of browser executables, which
 * names the headless shell the render runs. Playwright exports the bundle (lib/coreBundle) without
 * types; this is its shape in playwright-core 1.63.0, which the lab pins, and its tests check.
 */
declare module 'playwright-core/lib/coreBundle' {
  const core: {
    readonly registry: {
      readonly registry: {
        findExecutable(
          name: string,
        ): { executablePath(language: string): string | undefined } | undefined
      }
    }
  }
  export default core
}
