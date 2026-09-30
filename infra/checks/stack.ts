import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// The stack as Compose runs it, asked from outside: the containers' settings, the networks they
// are on, and what a connection from inside one of them reaches. The end-to-end test
// (infra/test/stack.test.ts) and the post-deploy script (infra/verify-deploy.ts) both use it,
// with the same checks (checks.ts): the test on the stack CI starts, the script on the one that
// was deployed.

/** The infra directory, where the compose files are. */
export const INFRA = fileURLToPath(new URL('..', import.meta.url))

export interface Container {
  readonly Id: string
  readonly Config: { readonly Image: string; readonly Env: readonly string[] }
  readonly State: {
    readonly Status: string
    readonly ExitCode: number
    readonly Health?: { readonly Status: string }
  }
  readonly HostConfig: {
    readonly NanoCpus: number
    readonly PidsLimit: number | null
    readonly Memory: number
    readonly MemorySwap: number
    readonly ReadonlyRootfs: boolean
    readonly CapDrop: readonly string[] | null
    readonly SecurityOpt: readonly string[] | null
    readonly Init: boolean | null
    readonly LogConfig: { readonly Type: string; readonly Config: Readonly<Record<string, string>> }
  }
}

export interface Network {
  readonly Internal: boolean
  readonly Options: Readonly<Record<string, string>>
  readonly IPAM: {
    readonly Config: readonly { readonly Subnet: string; readonly Gateway?: string }[]
  }
}

export interface StackOptions {
  /**
   * The compose files, in order, relative to infra/. None: the project is found by its name, from
   * the labels Compose put on its containers, which is all the checks need of a stack that was
   * deployed by something else (Coolify) from files that are not here.
   */
  readonly files: readonly string[]
  /** Compose's name for the project: `name` in compose.yaml, unless another is asked for. */
  readonly project: string
  /**
   * An address that answers on port 80 to whoever can reach it, and that no container of the stack
   * should: the end-to-end test's golden site, and the internet's for a stack that was deployed.
   */
  readonly probe: string
}

/** The services on the host's own network while they are asked: a listener, and its addresses. */
export interface HostProbe {
  readonly port: number
  /** The host's own addresses, IPv4 and IPv6, from its interfaces (the loopback's left out). */
  readonly addresses: readonly string[]
  stop(): void
}

export function only<T>(items: readonly T[], what: string): T {
  const [item] = items
  if (item === undefined || items.length !== 1) throw new Error(`Not one ${what}`)
  return item
}

/** docker, with its standard output. */
export function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 120_000 }).trim()
}

export class Stack {
  readonly options: StackOptions

  constructor(options: StackOptions) {
    this.options = options
  }

  /** docker compose, on the stack: its standard output. */
  compose(...args: string[]): string {
    const files = this.options.files.flatMap((file) => ['-f', file])
    return execFileSync(
      'docker',
      ['compose', '--project-name', this.options.project, ...files, ...args],
      { cwd: INFRA, encoding: 'utf8', timeout: 120_000 },
    ).trim()
  }

  /** The names of the stack's services, by the labels Compose puts on their containers. */
  services(): string[] {
    const names = docker(
      'ps',
      '--all',
      '--filter',
      `label=com.docker.compose.project=${this.options.project}`,
      '--filter',
      'label=com.docker.compose.oneoff=False',
      '--format',
      '{{.Label "com.docker.compose.service"}}',
    )
    return [...new Set(names.split('\n').filter((name) => name !== ''))].sort()
  }

  /** What `docker inspect` says of a service's container, running or not. */
  inspect(service: string): Container {
    return only(
      JSON.parse(docker('inspect', this.compose('ps', '--all', '--quiet', service))) as Container[],
      service,
    )
  }

  network(name: string): Network {
    return only(
      JSON.parse(docker('network', 'inspect', `${this.options.project}_${name}`)) as Network[],
      name,
    )
  }

  /** The stack's networks that have no way out, by their names in the compose files. */
  internalNetworks(): string[] {
    const ids = docker(
      'network',
      'ls',
      '--quiet',
      '--filter',
      `label=com.docker.compose.project=${this.options.project}`,
    )
      .split('\n')
      .filter((id) => id !== '')
    if (ids.length === 0) return []
    const networks = JSON.parse(docker('network', 'inspect', ...ids)) as {
      Internal: boolean
      Labels: Record<string, string>
    }[]
    return networks
      .filter((network) => network.Internal)
      .map((network) => network.Labels['com.docker.compose.network'] ?? '')
      .filter((name) => name !== '')
      .sort()
  }

  /** The value of one of a service's environment variables, or undefined. */
  env(service: string, name: string): string | undefined {
    const prefix = `${name}=`
    return this.inspect(service)
      .Config.Env.find((entry) => entry.startsWith(prefix))
      ?.slice(prefix.length)
  }

  /** A Node script run in one of the stack's containers: its standard output. */
  inside(service: string, script: string): string {
    return this.compose('exec', '-T', service, 'node', '-e', script)
  }

  /** TCP connections from a container, all at once: 'open', 'timeout' or the error's code, by host. */
  reach(service: string, hosts: readonly string[], port: number): Record<string, string> {
    return JSON.parse(
      this.inside(
        service,
        `const net = require('net');
       Promise.all(${JSON.stringify(hosts)}.map((host) => new Promise((done) => {
         const s = net.connect(${String(port)}, host);
         s.setTimeout(3000, () => { s.destroy(); done([host, 'timeout']) });
         s.on('connect', () => { s.destroy(); done([host, 'open']) });
         s.on('error', (e) => done([host, e.code || e.message]));
       }))).then((all) => console.log(JSON.stringify(Object.fromEntries(all))));`,
      ),
    ) as Record<string, string>
  }

  reachOne(service: string, host: string, port: number): string | undefined {
    return this.reach(service, [host], port)[host]
  }

  /** A CONNECT through the egress proxy, from the scanner: the proxy's status line. */
  tunnel(authority: string): string {
    return this.inside(
      'scanner',
      `const s = require('net').connect(4750, 'egress', () =>
       s.write('CONNECT ${authority} HTTP/1.1\\r\\nHost: ${authority}\\r\\n\\r\\n'));
     let seen = '';
     s.on('data', (d) => { seen += d; if (seen.includes('\\r\\n')) { console.log(seen.split('\\r\\n')[0]); process.exit(0) } });
     s.on('error', (e) => { console.log(e.code); process.exit(0) });
     setTimeout(() => { console.log('timeout'); process.exit(0) }, 15000);`,
    )
  }

  /** The processes in a container, by the kernel's name for each, and their state. */
  processes(service: string): { name: string; state: string }[] {
    return JSON.parse(
      this.inside(
        service,
        `const fs = require('fs');
       const all = [];
       for (const pid of fs.readdirSync('/proc').filter((entry) => /^\\d+$/.test(entry))) {
         try {
           const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
           const close = stat.lastIndexOf(')');
           all.push({ name: stat.slice(stat.indexOf('(') + 1, close), state: stat.slice(close + 2, close + 3) });
         } catch {}
       }
       console.log(JSON.stringify(all));`,
      ),
    ) as { name: string; state: string }[]
  }

  /**
   * A listener on the host's own network, and the host's addresses: what the networks' checks
   * put a container against. Started from the API's image, which has Node, on the host network
   * (the Docker's: on a VM, the VM's). It must be stopped.
   */
  async startHostProbe(): Promise<HostProbe> {
    const image = this.inspect('api').Config.Image
    const listener = docker(
      'run',
      '--detach',
      '--rm',
      '--network',
      'host',
      '--entrypoint',
      'node',
      image,
      '-e',
      "const s = require('net').createServer((c) => { c.on('error', () => {}); c.end('host\\n') }); s.listen(0, () => console.log(s.address().port))",
    )
    let port = 0
    for (let tries = 0; port === 0 && tries < 100; tries++) {
      const logged = docker('logs', listener)
      if (/^\d+$/.test(logged)) port = Number(logged)
      else await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const addresses = JSON.parse(
      docker(
        'run',
        '--rm',
        '--network',
        'host',
        '--entrypoint',
        'node',
        image,
        '-e',
        "console.log(JSON.stringify(Object.values(require('os').networkInterfaces()).flat().filter((a) => !a.internal).map((a) => a.address.split('%')[0])))",
      ),
    ) as string[]
    return {
      port,
      addresses,
      stop: () => {
        // Started with --rm: killed, it removes itself, and `rm` would race it.
        try {
          execFileSync('docker', ['kill', listener], { stdio: 'ignore' })
        } catch {
          // Already gone.
        }
      },
    }
  }
}

const addressNumber = (address: string) =>
  address.split('.').reduce((number, part) => number * 256 + Number(part), 0)

/** Whether an IPv4 address is in a subnet, `93.184.215.0/24`; an IPv6 one is never in an IPv4 subnet. */
export function inSubnet(address: string, cidr: string): boolean {
  if (address.includes(':') || cidr.includes(':')) return false
  const [base = '', bits = '32'] = cidr.split('/')
  const size = 2 ** (32 - Number(bits))
  const start = Math.floor(addressNumber(base) / size) * size
  const number = addressNumber(address)
  return number >= start && number < start + size
}
