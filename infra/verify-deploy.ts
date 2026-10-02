import { parseArgs } from 'node:util'
import { DEPLOY_CHECKS } from './checks/checks'
import { Stack, type HostProbe } from './checks/stack'

// The post-deploy check: the isolation the stack depends on, asked of the stack that is running,
// with the checks the end-to-end test asserts on the stack CI starts (infra/checks/checks.ts).
//
//   pnpm verify:deploy                          # the stack named `arablyzer`, found by its labels
//   pnpm verify:deploy --project my-project     # Coolify names its own
//   pnpm verify:deploy --file compose.yaml --file compose.e2e.yaml   # the CI stack, with its golden site
//
// It needs Docker and this checkout's dependencies (`pnpm install`), and no compose file: the
// stack is found by the labels Compose put on its containers. It changes nothing in the stack: it
// starts a listener on the host's network for a moment, connects out of the containers, and tries
// what the database's role must refuse inside a transaction it rolls back. It exits 1 when a check
// fails; a warning is what the operator must put right on the host (its firewall), and does not.

const { values } = parseArgs({
  options: {
    project: { type: 'string', short: 'p' },
    file: { type: 'string', short: 'f', multiple: true },
    probe: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help === true) {
  console.log(`Usage: pnpm verify:deploy [--project NAME] [--file COMPOSE_FILE]... [--probe ADDRESS]

  --project, -p  Compose's project name (default: COMPOSE_PROJECT_NAME, else arablyzer)
  --file, -f     a compose file, relative to infra/; none needed: containers are found by label
  --probe        an address that answers on port 80 and that no container of the stack should reach
                 (default 1.1.1.1; the end-to-end test's stack has its own golden site)`)
  process.exit(0)
}

const project = values.project ?? process.env.COMPOSE_PROJECT_NAME ?? 'arablyzer'
const stack = new Stack({
  files: values.file ?? [],
  project,
  probe: values.probe ?? '1.1.1.1',
})

console.log(`Checking the stack ${project}`)
if (stack.services().length === 0) {
  console.error(
    `No container carries the label of a Compose project named ${project}: \`docker compose ls\` lists the projects that are running, and --project names one.`,
  )
  process.exit(1)
}
let host: HostProbe
try {
  host = await stack.startHostProbe()
} catch (error) {
  console.error(
    `The stack ${project} is not there, or Docker cannot be asked: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}

let failed = 0
let warned = 0
try {
  for (const check of DEPLOY_CHECKS) {
    let problems: readonly string[]
    try {
      problems = check.run(stack, host)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // The first line of what a failed command said: never its whole output.
      problems = [`could not be checked: ${message.split('\n')[0] ?? message}`]
    }
    if (problems.length === 0) {
      console.log(`  ok    ${check.name}`)
      continue
    }
    if (check.level === 'warn') warned++
    else failed++
    console.log(`  ${check.level === 'warn' ? 'warn' : 'FAIL'}  ${check.name}`)
    for (const problem of problems) console.log(`          - ${problem}`)
  }
} finally {
  host.stop()
}

const total = DEPLOY_CHECKS.length
console.log(
  `${total} checks: ${total - failed - warned} ok, ${warned} warning${warned === 1 ? '' : 's'}, ${failed} failed`,
)
process.exit(failed === 0 ? 0 : 1)
