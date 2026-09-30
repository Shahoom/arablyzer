import { writeFileSync } from 'node:fs'
import { SCHEMA_VERSION, reportJsonSchema } from '../src/index'

const target = new URL('../report.schema.json', import.meta.url)
writeFileSync(target, `${JSON.stringify(reportJsonSchema(), null, 2)}\n`)
console.log(`Wrote report.schema.json for report schema ${SCHEMA_VERSION}`)
