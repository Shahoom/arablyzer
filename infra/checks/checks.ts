import { docker, inSubnet, type HostProbe, type Stack } from './stack'

// What the stack must be, as checks that each give the problems they find, and none when there
// are none. The end-to-end test asserts each is empty on the stack CI starts; the post-deploy
// script (infra/verify-deploy.ts) runs them on the stack that was deployed and prints what they
// find. Nothing here changes the stack, and nothing writes to its data: what is tried that could
// (a statement the database's role must refuse) is tried inside a transaction that is rolled back.
// A message never holds a secret.

/** The services that stay up: what runs a scan, and what it stores. */
export const SERVICES = ['web', 'api', 'worker', 'scanner', 'egress', 'valkey', 'postgres'] as const
/** The services that run Node, which reaps no process it did not start. */
export const NODE_SERVICES = ['api', 'worker', 'scanner'] as const
/** The database's own step: it runs once, and is gone. */
const ONE_SHOT = ['migrate'] as const

/** A name the container's networks do not have: Docker's DNS knows it not, or cannot ask on. */
const UNRESOLVED = /^(?:ENOTFOUND|EAI_AGAIN)$/

/** The role the API and the worker connect as, and the one the database's own step makes. */
const APP_ROLE = 'arablyzer_app'
const WORKER_ROLE = 'arablyzer_worker'

/** The oldest Docker Engine that gives the internal networks no address for the host. */
const MIN_ENGINE = 28

/** Docker Engine 28 or later: its `isolated` gateway mode is what keeps the host off the bridges. */
export function dockerEngine(): string[] {
  const version = docker('version', '--format', '{{.Server.Version}}')
  const major = Number.parseInt(version, 10)
  return Number.isInteger(major) && major >= MIN_ENGINE
    ? []
    : [
        `Docker Engine ${version} is older than ${MIN_ENGINE}: it ignores gateway mode isolated, and the internal networks give the host an address that the scanner and the worker reach`,
      ]
}

/** Every service is up, and healthy where it has a health check; the database's step has finished. */
export function servicesUp(stack: Stack): string[] {
  const problems: string[] = []
  for (const service of stack.services()) {
    const { State: state } = stack.inspect(service)
    if ((ONE_SHOT as readonly string[]).includes(service)) {
      if (state.Status !== 'exited' || state.ExitCode !== 0) {
        problems.push(`${service} did not finish: ${state.Status}, exit code ${state.ExitCode}`)
      }
    } else if (state.Status !== 'running') {
      problems.push(`${service} is ${state.Status}`)
    } else if (state.Health !== undefined && state.Health.Status !== 'healthy') {
      problems.push(`${service} is ${state.Health.Status}`)
    }
  }
  return problems
}

/** Read-only, unprivileged, with caps on CPU, processes, memory and logs; an init where Node runs. */
export function containersHardened(stack: Stack): string[] {
  const problems: string[] = []
  for (const service of [...SERVICES, ...ONE_SHOT]) {
    const { HostConfig: config } = stack.inspect(service)
    const say = (what: string) => problems.push(`${service} ${what}`)
    if (!config.ReadonlyRootfs) say('has a writable root filesystem')
    if (config.CapDrop?.join() !== 'ALL') say('keeps a capability')
    if (config.SecurityOpt?.includes('no-new-privileges:true') !== true) {
      say('may gain privileges (no-new-privileges)')
    }
    if (config.NanoCpus <= 0) say('has no CPU cap')
    if ((config.PidsLimit ?? 0) <= 0) say('has no process cap')
    if (config.Memory <= 0) say('has no memory cap')
    // No swap past the memory limit.
    if (config.MemorySwap !== config.Memory) say('may swap past its memory limit')
    const { Type: type, Config: options } = config.LogConfig
    if (type !== 'json-file' || options['max-size'] !== '10m' || options['max-file'] !== '3') {
      say('has no cap on its log')
    }
  }
  for (const service of [...NODE_SERVICES, ...ONE_SHOT]) {
    if (stack.inspect(service).HostConfig.Init !== true) problems.push(`${service} has no init`)
  }
  return problems
}

/** The scanner has the egress proxy and the worker, and no store, no site, and no way out. */
export function scannerReach(stack: Stack): string[] {
  const problems: string[] = []
  if (stack.reachOne('scanner', 'egress', 4750) !== 'open') {
    problems.push('the scanner does not reach the egress proxy')
  }
  for (const [name, port] of [
    ['valkey', 6379],
    ['postgres', 5432],
    ['api', 8787],
    ['web', 8080],
  ] as const) {
    const outcome = stack.reachOne('scanner', name, port) ?? ''
    if (!UNRESOLVED.test(outcome)) {
      problems.push(
        `the scanner knows ${name}, and ${port} answers ${outcome}: it is on a network with it`,
      )
    }
  }
  if (stack.reachOne('scanner', stack.options.probe, 80) === 'open') {
    problems.push(`the scanner reaches ${stack.options.probe} directly`)
  }
  return problems
}

/** The worker has the stores and the scanner, and no way out, not even the egress proxy. */
export function workerReach(stack: Stack): string[] {
  const problems: string[] = []
  if (stack.reachOne('worker', 'scanner', 8788) !== 'open') {
    problems.push('the worker does not reach the scanner')
  }
  if (stack.reachOne('worker', 'valkey', 6379) !== 'open') {
    problems.push('the worker does not reach Valkey')
  }
  if (!UNRESOLVED.test(stack.reachOne('worker', 'egress', 4750) ?? '')) {
    problems.push('the worker resolves the egress proxy')
  }
  if (stack.reachOne('worker', stack.options.probe, 80) === 'open') {
    problems.push(`the worker reaches ${stack.options.probe} directly`)
  }
  return problems
}

/** The networks that have no way out are `internal`, and give the host no address on their bridges. */
export function internalNetworks(stack: Stack, host: HostProbe): string[] {
  const problems: string[] = []
  if (host.addresses.length === 0) problems.push('the host has no address to check against')
  const names = stack.internalNetworks()
  for (const required of ['data', 'scan', 'isolated']) {
    if (!names.includes(required)) problems.push(`${required} is not an internal network`)
  }
  for (const name of names) {
    const network = stack.network(name)
    if (!network.Internal) problems.push(`${name} is not internal`)
    if (network.Options['com.docker.network.bridge.gateway_mode_ipv4'] !== 'isolated') {
      problems.push(
        `${name} has no gateway mode isolated: this Docker gives the host an address on it`,
      )
    }
    for (const { Subnet } of network.IPAM.Config) {
      for (const address of host.addresses.filter((entry) => inSubnet(entry, Subnet))) {
        problems.push(`the host has the address ${address} on ${name} (${Subnet})`)
      }
    }
  }
  return problems
}

/** The scanner and the worker cannot reach a service on the host's own network, on any of its addresses. */
export function hostServicesOutOfReach(stack: Stack, host: HostProbe): string[] {
  const problems: string[] = []
  if (host.port <= 0) return ['no listener was started on the host']
  for (const service of ['scanner', 'worker']) {
    for (const [address, outcome] of Object.entries(
      stack.reach(service, host.addresses, host.port),
    )) {
      // Refused would mean the host answered: an address of its, reached.
      if (/^(?:open|ECONNREFUSED)$/.test(outcome)) {
        problems.push(`${service} reaches the host at ${address} (${outcome})`)
      }
    }
  }
  return problems
}

/** The scanner and the worker have no IPv6 address but loopback. */
export function noIpv6(stack: Stack): string[] {
  const problems: string[] = []
  for (const service of ['scanner', 'worker']) {
    const table = stack.inside(
      service,
      "try { console.log(require('fs').readFileSync('/proc/net/if_inet6', 'utf8')) } catch { console.log('') }",
    )
    const interfaces = table
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.trim().split(/\s+/).at(-1))
      .filter((name) => name !== 'lo')
    if (interfaces.length > 0)
      problems.push(`${service} has an IPv6 address on ${interfaces.join()}`)
  }
  return problems
}

/**
 * The scanner's own check of its network, made again where it runs: no default route, and no
 * outside name that resolves (apps/scanner/src/check-isolation.ts).
 */
export function scannerNetworkClosed(stack: Stack): string[] {
  let output: string
  try {
    output = stack.compose(
      'exec',
      '-T',
      'scanner',
      'node',
      '--import',
      'tsx',
      'apps/scanner/src/check-isolation.ts',
    )
  } catch (error) {
    // It exits 1 when it finds something, and says what on its standard output.
    const { stdout } = error as { stdout?: string }
    if (typeof stdout !== 'string' || stdout === '') throw error
    output = stdout.trim()
  }
  return (JSON.parse(output) as { problems: string[] }).problems.map(
    (problem) => `the scanner's network is not closed: ${problem}`,
  )
}

/** A public address opens on ports 80 and 443 alone, through the egress proxy. */
export function egressPorts(stack: Stack): string[] {
  const problems: string[] = []
  const { probe } = stack.options
  if (!/^HTTP\/1\.[01] 200/.test(stack.tunnel(`${probe}:80`))) {
    problems.push(`the egress proxy does not open ${probe}:80`)
  }
  if (!stack.tunnel(`${probe}:8080`).startsWith('HTTP/1.1 500')) {
    problems.push(`the egress proxy does not refuse port 8080`)
  }
  return problems
}

/** Every private, local and metadata address is refused, and so are the stack's own services. */
export function egressRefusals(stack: Stack): string[] {
  const problems: string[] = []
  for (const authority of [
    '10.0.0.1:80',
    '127.0.0.1:80',
    '169.254.169.254:80',
    '172.17.0.1:80',
    '192.168.1.1:443',
    '100.64.0.1:80',
    '[::1]:80',
    '[fd00::1]:443',
    'valkey:6379',
    'postgres:80',
    'api:80',
  ]) {
    if (!/^HTTP\/1\.1 (407|502)/.test(stack.tunnel(authority))) {
      problems.push(`the egress proxy does not refuse ${authority}`)
    }
  }
  return problems
}

/**
 * Addresses that lead nowhere off the machine or its network, which every deployment's ranges
 * refuse already (the generic refusals are checked on their own): private, loopback, link-local,
 * CGNAT, multicast. A host has dozens of them, one for each container's interface.
 */
const LOCAL_ONLY = [
  /^(?:0|10|127)\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^(?:22[4-9]|2[3-5]\d)\./,
  /^::1?$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
  /^ff[0-9a-f]{2}:/i,
]

/**
 * The server's own addresses are refused by the egress proxy, which the API and the scanner are
 * given the same list as (ARABLYZER_DENY_CIDRS): each range of it, and each address the host has,
 * IPv4 and IPv6. A host address that neither the private ranges nor the list covers would be a
 * public address of the server that a name can point at, and the proxy would connect to it.
 */
export function egressRefusesTheServer(stack: Stack, host: HostProbe): string[] {
  const problems: string[] = []
  const given = (['egress', 'api', 'scanner'] as const).map(
    (service) => stack.env(service, 'ARABLYZER_DENY_CIDRS') ?? '',
  )
  if (new Set(given).size !== 1)
    problems.push(
      'the egress proxy, the API and the scanner are given different ARABLYZER_DENY_CIDRS',
    )
  const cidrs = (given[0] ?? '')
    .split(',')
    .map((cidr) => cidr.trim())
    .filter((cidr) => cidr !== '')
  if (cidrs.length === 0) problems.push('ARABLYZER_DENY_CIDRS names no address')
  interface Asked {
    readonly what: string
    readonly address: string
    /** Held by the host: a range that names it is what the operator adds, if it is refused by none. */
    readonly held: boolean
  }
  const asked: Asked[] = [
    ...cidrs.map((cidr) => ({
      what: `${cidr} of ARABLYZER_DENY_CIDRS`,
      address: cidr.split('/')[0] ?? '',
      held: false,
    })),
    ...host.addresses
      .filter((address) => !LOCAL_ONLY.some((pattern) => pattern.test(address)))
      .map((address) => ({ what: `the host's own address ${address}`, address, held: true })),
  ]
  for (const { what, address, held } of asked) {
    if (address === '') continue
    const authority = address.includes(':') ? `[${address}]` : address
    // Refused for the rule, not unreachable: 407 is the refusal's own answer.
    if (!stack.tunnel(`${authority}:80`).startsWith('HTTP/1.1 407')) {
      const fix = held ? ': add it to ARABLYZER_DENY_CIDRS' : ''
      problems.push(`the egress proxy does not refuse ${what}${fix}`)
    }
  }
  return problems
}

/**
 * The API believes the address in X-Forwarded-For only of a request with the site server's
 * secret. Asked in the API's own container, as anything on the edge network can ask; an empty
 * Turnstile token fails before any request is made, so nothing is queued.
 */
export function apiBelievesTheProxyAlone(stack: Stack): string[] {
  const ask = (withSecret: boolean): { status: number; body: unknown } =>
    JSON.parse(
      stack.inside(
        'api',
        `const headers = { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' };
         // From the site's own origin, as a browser on the site sends every scan request.
         if (process.env.ARABLYZER_SITE) headers.origin = new URL(process.env.ARABLYZER_SITE).origin;
         if (${String(withSecret)}) headers['x-arablyzer-proxy-secret'] = process.env.ARABLYZER_PROXY_SECRET;
         fetch('http://127.0.0.1:8787/api/scans', {
           method: 'POST',
           headers,
           body: JSON.stringify({ url: 'http://example.com/', turnstileToken: '' }),
         }).then(async (r) => console.log(JSON.stringify({ status: r.status, body: await r.json() })));`,
      ),
    ) as { status: number; body: unknown }
  const problems: string[] = []
  const without = ask(false)
  if (without.status !== 503) {
    problems.push(`the API answered ${without.status} to a request with no proxy secret, not 503`)
  }
  const withSecret = ask(true)
  if (withSecret.status !== 403) {
    problems.push(
      `the API answered ${withSecret.status} to a request with the proxy secret, not 403`,
    )
  }
  return problems
}

/** Every value of a service's environment. */
function environment(stack: Stack, service: string): string[] {
  return stack.inspect(service).Config.Env.map((entry) => entry.slice(entry.indexOf('=') + 1))
}

/**
 * The API and the worker connect to PostgreSQL as a role that is no superuser and changes no
 * schema (it reads, writes and deletes scans), and never hold the bootstrap user's password. What the role must refuse is tried in
 * a transaction that is rolled back.
 */
export function databaseRoles(stack: Stack): string[] {
  const problems: string[] = []
  const bootstrap = stack.env('postgres', 'POSTGRES_PASSWORD') ?? ''
  for (const [service, role] of [
    ['api', APP_ROLE],
    ['worker', WORKER_ROLE],
  ] as const) {
    const url = stack.env(service, 'DATABASE_URL') ?? ''
    let user = ''
    try {
      user = decodeURIComponent(new URL(url).username)
    } catch {
      problems.push(`${service}'s DATABASE_URL is not a URL`)
    }
    if (user !== role) problems.push(`${service} connects as ${user}, not ${role}`)
  }
  if (bootstrap !== '') {
    for (const service of ['api', 'worker', 'scanner', 'web', 'egress', 'valkey']) {
      if (environment(stack, service).some((value) => value.includes(bootstrap))) {
        problems.push(`${service} holds the bootstrap user's password`)
      }
    }
  }
  const tried = JSON.parse(
    stack.inside(
      'api',
      `const { createRequire } = require('node:module');
       const path = require('node:path');
       const need = createRequire(path.join(process.cwd(), 'apps/api/package.json'));
       const pg = need('pg');
       (async () => {
         const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
         await client.connect();
         const out = {};
         const who = await client.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = current_user');
         out.attributes = who.rows[0];
         out.reads = (await client.query('SELECT count(*)::int AS n FROM scans')).rows[0].n >= 0;
         for (const sql of [
           'CREATE TABLE verify_deploy_probe (a integer)',
           'ALTER TABLE scans ADD COLUMN verify_deploy_probe integer',
           'TRUNCATE scans',
           'SELECT * FROM drizzle.__drizzle_migrations LIMIT 0',
           "COPY (SELECT 1) TO PROGRAM 'true'",
           'SET ROLE arablyzer_migrate',
         ]) {
           try {
             await client.query('BEGIN');
             await client.query(sql);
             out[sql] = 'allowed';
           } catch (error) {
             out[sql] = 'refused';
           } finally {
             await client.query('ROLLBACK');
           }
         }
         await client.end();
         console.log(JSON.stringify(out));
       })();`,
    ),
  ) as Record<string, unknown>
  const attributes = tried.attributes as Record<string, boolean> | undefined
  for (const [attribute, set] of Object.entries(attributes ?? {})) {
    if (set) problems.push(`${APP_ROLE} has ${attribute}`)
  }
  if (tried.reads !== true) problems.push(`${APP_ROLE} cannot read the scans`)
  for (const [statement, outcome] of Object.entries(tried)) {
    if (outcome === 'allowed') problems.push(`${APP_ROLE} may run: ${statement}`)
  }
  // The worker faces the web's results and reads the scans alone: not one row of the accounts. It
  // connects from the API's container (which has the driver), with the worker's own URL.
  const workerUrl = stack.env('worker', 'DATABASE_URL') ?? ''
  const worker = JSON.parse(
    stack.inside(
      'api',
      `const { createRequire } = require('node:module');
       const path = require('node:path');
       const need = createRequire(path.join(process.cwd(), 'apps/api/package.json'));
       const pg = need('pg');
       (async () => {
         const client = new pg.Client({ connectionString: ${JSON.stringify(workerUrl)} });
         await client.connect();
         const out = {};
         for (const sql of [
           'SELECT count(*) FROM scans',
           'SELECT count(*) FROM sessions',
           'SELECT count(*) FROM users',
           'SELECT count(*) FROM accounts',
           'SELECT count(*) FROM verifications',
           'SELECT count(*) FROM sites',
           'SELECT count(*) FROM account_scans',
           "INSERT INTO scans (id, url, state, created_at) VALUES ('verify_deploy_probe', 'https://example.com/', 'queued', now())",
           'CREATE TABLE verify_deploy_probe (a integer)',
         ]) {
           try {
             await client.query('BEGIN');
             await client.query(sql);
             out[sql] = 'allowed';
           } catch (error) {
             out[sql] = 'refused';
           } finally {
             await client.query('ROLLBACK');
           }
         }
         await client.end();
         console.log(JSON.stringify(out));
       })();`,
    ),
  ) as Record<string, string>
  for (const [statement, outcome] of Object.entries(worker)) {
    const mayRun = statement === 'SELECT count(*) FROM scans'
    if (mayRun && outcome !== 'allowed') problems.push(`${WORKER_ROLE} cannot read the scans`)
    if (!mayRun && outcome === 'allowed') problems.push(`${WORKER_ROLE} may run: ${statement}`)
  }
  return problems
}

/**
 * Valkey takes no connection without a name and a password, gives the application's user the
 * commands of the queue, the events and the limits and not the administrative ones, and its
 * password is not on its command line, where the host's `ps` shows it to every user of the host.
 */
export function valkeyAccess(stack: Stack): string[] {
  const problems: string[] = []
  const ask = (command: string): string =>
    stack.compose(
      'exec',
      '-T',
      'valkey',
      'sh',
      '-c',
      `REDISCLI_AUTH="$VALKEY_PASSWORD" valkey-cli --user arablyzer --no-auth-warning ${command} 2>&1`,
    )
  const anonymous = stack.compose('exec', '-T', 'valkey', 'sh', '-c', 'valkey-cli ping 2>&1')
  if (!anonymous.includes('NOAUTH')) problems.push('Valkey answers a connection with no password')
  if (ask('ping') !== 'PONG') problems.push('the application user cannot connect to Valkey')
  for (const command of ['flushall', 'flushdb', "keys '*'", 'config get save', 'shutdown nosave']) {
    if (!ask(command).includes('NOPERM')) {
      problems.push(`the application user may run ${command.split(' ')[0] ?? command} on Valkey`)
    }
  }
  if (!ask('get outside:key').includes('NOPERM')) {
    problems.push('the application user reaches keys the stores do not use')
  }
  const password = stack.env('valkey', 'VALKEY_PASSWORD') ?? ''
  if (password !== '') {
    const processes = docker('top', stack.inspect('valkey').Id)
    if (processes.includes(password)) problems.push("Valkey's password is on its command line")
  }
  return problems
}

/**
 * The site's server is published on the host's loopback alone, for the host's own proxy. Another
 * address is the operator's decision (ARABLYZER_BIND), told here.
 */
export function siteOnLoopback(stack: Stack): string[] {
  const published = stack.compose('port', 'web', '8080')
  return /^127\.0\.0\.1:\d+$/.test(published)
    ? []
    : [`the site's server is published on ${published}, not on the host's loopback`]
}

/**
 * The host's own firewall, which the stack cannot make: input from the Docker bridges is dropped
 * but for DNS (infra/README.md), so a container on the edge network, the API among them, reaches
 * none of the host's services. Tried with a listener on the host's network.
 */
export function hostFirewall(stack: Stack, host: HostProbe): string[] {
  const reached = Object.entries(stack.reach('api', host.addresses, host.port))
    .filter(([, outcome]) => outcome === 'open')
    .map(([address]) => address)
  return reached.length === 0
    ? []
    : [
        `the API's container reaches a service on the host, at ${reached.join(', ')}: the host's firewall does not drop input from the Docker bridges (infra/README.md, "The host's firewall")`,
      ]
}

export interface Check {
  readonly name: string
  readonly run: (stack: Stack, host: HostProbe) => readonly string[]
  /**
   * `warn`: what it finds is for the operator to put right and the stack cannot (the host's
   * firewall, the address it is published on); it does not fail the deploy.
   */
  readonly level: 'fail' | 'warn'
}

/** What a deployed stack is checked for, in the order it is printed. */
export const DEPLOY_CHECKS: readonly Check[] = [
  { name: 'Docker Engine 28 or later', run: () => dockerEngine(), level: 'fail' },
  {
    name: 'every service is up and healthy, and the database step has finished',
    run: servicesUp,
    level: 'fail',
  },
  {
    name: 'every container runs read-only, unprivileged, with caps',
    run: containersHardened,
    level: 'fail',
  },
  { name: 'the internal networks give the host no address', run: internalNetworks, level: 'fail' },
  { name: 'the scanner has no way out but the egress proxy', run: scannerReach, level: 'fail' },
  { name: "the scanner's own check of its network", run: scannerNetworkClosed, level: 'fail' },
  {
    name: 'the worker has the stores and the scanner, and no way out',
    run: workerReach,
    level: 'fail',
  },
  {
    name: "the host's services are out of the scanner's and the worker's reach",
    run: hostServicesOutOfReach,
    level: 'fail',
  },
  { name: 'the scanner and the worker have no IPv6 address', run: noIpv6, level: 'fail' },
  { name: 'the egress proxy opens ports 80 and 443 alone', run: egressPorts, level: 'fail' },
  {
    name: 'the egress proxy refuses private, local and metadata addresses',
    run: egressRefusals,
    level: 'fail',
  },
  {
    name: "the egress proxy refuses the server's own addresses, IPv4 and IPv6",
    run: egressRefusesTheServer,
    level: 'fail',
  },
  {
    name: 'the API believes X-Forwarded-For only from the site server',
    run: apiBelievesTheProxyAlone,
    level: 'fail',
  },
  {
    name: 'the API and the worker connect as a role that changes nothing',
    run: databaseRoles,
    level: 'fail',
  },
  {
    name: "Valkey's user has the queue's commands and not the dangerous ones",
    run: valkeyAccess,
    level: 'fail',
  },
  {
    name: "the site's server is published on the host's loopback",
    run: siteOnLoopback,
    level: 'warn',
  },
  {
    name: "the host's firewall drops input from the Docker bridges",
    run: hostFirewall,
    level: 'warn',
  },
]
