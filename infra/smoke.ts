import { parseArgs } from 'node:util'
import { formatSmoke, runSmoke } from './checks/smoke'

// The runbook's HTTP checks (docs/deploy/staging.md, §9), asked of a site as a visitor asks:
//
//   pnpm smoke                                   # ARABLYZER_SITE of infra/.env, else the first argument
//   pnpm smoke --url https://staging.arablyzer.com
//   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... pnpm smoke --url ...   # behind Cloudflare Access
//
// It starts no scan and changes nothing. Exit 1 when a check fails; the isolation checks of the
// containers are `pnpm verify:deploy`, which needs Docker on the server.

const { values } = parseArgs({
  options: {
    url: { type: 'string', short: 'u' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help === true) {
  console.log('Usage: pnpm smoke [--url https://staging.arablyzer.com]')
  process.exit(0)
}

const given = values.url ?? process.env.ARABLYZER_SITE
if (given === undefined || given === '') {
  console.error('Name the site: --url https://staging.arablyzer.com, or set ARABLYZER_SITE.')
  process.exit(2)
}
let site: URL
try {
  site = new URL(given)
} catch {
  console.error(`Not an address: ${given}`)
  process.exit(2)
}

const headers: Record<string, string> = {}
const id = process.env.CF_ACCESS_CLIENT_ID
const secret = process.env.CF_ACCESS_CLIENT_SECRET
if (id !== undefined && secret !== undefined) {
  headers['CF-Access-Client-Id'] = id
  headers['CF-Access-Client-Secret'] = secret
}

console.log(`Checking ${site.origin}`)
const { text, failed } = formatSmoke(await runSmoke({ site, headers }))
console.log(text)
process.exit(failed === 0 ? 0 : 1)
