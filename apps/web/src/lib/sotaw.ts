import raw from '../generated/sotaw.json'
import type { SotawData } from './sotaw-model'

export * from './sotaw-model'

/** The frame and the newest edition, as scripts/sotaw-data.ts wrote them before the build. */
export const SOTAW_DATA = raw as unknown as SotawData
