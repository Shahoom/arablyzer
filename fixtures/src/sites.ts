import { fileURLToPath } from 'node:url'

/** Absolute path of a shared fixture site: fixtures/sites/<name>/. */
export function sitePath(name: string): string {
  return fileURLToPath(new URL(`../sites/${name}/`, import.meta.url))
}
