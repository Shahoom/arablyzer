import manifest from '../package.json' with { type: 'json' }

/**
 * The optional packages' pinned versions, from this package's own manifest, which the build
 * bundles: the install hints need no optional package to name them.
 */
export const OPTIONAL_VERSIONS: Readonly<Record<string, string>> = manifest.optionalDependencies
