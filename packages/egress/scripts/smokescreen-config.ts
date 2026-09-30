import { writeFile } from 'node:fs/promises'
import { smokescreenConfig } from '../src/smokescreen'

// Writes infra/egress/smokescreen.yaml from the egress package's ranges (M2.1 plan §5b).
const out = new URL('../../../infra/egress/smokescreen.yaml', import.meta.url)
await writeFile(out, smokescreenConfig())
console.log(`Wrote ${out.pathname}`)
