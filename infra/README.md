# The stack: running it, and what to check after

`compose.yaml` runs Arablyzer on one host: the site's server (Caddy), the API, the worker, the
scanner with its browsers, the egress proxy, Valkey and PostgreSQL. This page is what an operator
needs beyond the main README's short account: the requirements, the secrets, the roles the
databases have, the rule the host's firewall needs, and the script that checks all of it after a
deploy. The design is `docs/design/plans/m2.1-landing-scan.md` §5b; the threats are BUILD-PLAN §13.

## Requirements

- **Docker Engine 28 or later.** The networks the browsers run on are `internal`, and must also give
  the host no address on their bridges: with one, a container on them reaches every service the host
  runs, around the egress proxy. Engine 28 has Docker's own way, gateway mode `isolated`
  (`com.docker.network.bridge.gateway_mode_ipv4`), and `compose.yaml` sets `inhibit_ipv4` beside it,
  which older Engines honour. Docker ignores an option it does not know, and starts the stack all the
  same, so nothing but a check says that the host has an address on a bridge: Engine 28 is what the
  stack was tested on, and `pnpm verify:deploy` and the stack's test fail on an older one. Measured with
  Docker Engine 29.5 and Docker Compose 5.1.
- **The host's firewall rule below**, on a host that runs anything else.
- **A public address for `ARABLYZER_DENY_CIDRS`**, IPv4 and IPv6: see "The server's own addresses".

```bash
cp infra/.env.example infra/.env        # then fill it in
docker compose -f infra/compose.yaml up --build --wait
pnpm verify:deploy                      # after it: see "After a deploy"
```

The order Compose starts them in: PostgreSQL and Valkey, then `migrate` (the database's own step,
which finishes and stays down), then the egress proxy and the API, the scanner, the worker, and last
the site's server. `--wait` waits through the one-shot `migrate` service.

## Secrets

`infra/.env` holds every one, and stays out of git and out of the images (`.dockerignore` lists what
the images take, and it is not in the list). Make each with `openssl rand -hex 32`; every service
refuses to start with one shorter than 32 characters, and says which, never its value.

- **Hex, not `openssl rand -base64`.** `VALKEY_PASSWORD`, `POSTGRES_PASSWORD` and
  `POSTGRES_APP_PASSWORD` go into connection URLs (`redis://`, `postgres://`), and one base64 secret in
  three holds a `/`, which no URL reads. A service that cannot read a URL says which variable is at
  fault and never prints the URL: its password would be in the log, and ioredis, left to itself,
  prints it whole.
- `ARABLYZER_LIMIT_SECRET` keys the per-visitor limits: changing it starts every visitor's count afresh.
- `ARABLYZER_SCANNER_TOKEN` is what the worker shows the scanner; the scanner answers no one else.
- `ARABLYZER_PROXY_SECRET`: see "Forwarded addresses".
- `VALKEY_PASSWORD` and `POSTGRES_APP_PASSWORD`: see "The databases". Changing the second and
  deploying again rotates it; the first needs the API, the worker and Valkey restarted together.
- `POSTGRES_PASSWORD` is the bootstrap superuser's, and only `migrate` holds it.
- `TURNSTILE_SECRET` and `ARABLYZER_CRUX_KEY` are Cloudflare's and Google's, not ours to size.
  The CrUX key lives in the scanner's environment, which a browser that a page took over could
  read: restrict it, in Google Cloud, to the Chrome UX Report API.

## The databases

**PostgreSQL** has three roles. The API and the worker connect as `arablyzer_app`, which can read,
write and delete the scans (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) and nothing else: no DDL, no other schema, no
`COPY ... PROGRAM`, no temporary table, no extension, and it is no superuser, which the image's
`POSTGRES_USER` is (a superuser reaches the container's shell with `COPY ... TO PROGRAM`).
`arablyzer_migrate` owns the tables and cannot log in. `arablyzer` is the bootstrap superuser.
Only the one-shot `migrate` service (`packages/store/src/migrate.ts`) connects as it: it makes the
roles, becomes `arablyzer_migrate` for the migrations, sets the application role's password, and
stops. Every step can be run again, so a deploy rotates the password, adopts a database that an
older version made under the bootstrap user, and puts back a role that drifted (a superuser, a
member of the owner role, a right to a schema or a table that it was not given). `DELETE` is for
retention and a visitor's deletion of their own report; `TRUNCATE`, and every change to the schema, are
never given. `APP_PRIVILEGES` in `packages/store/src/postgres/provision.ts` is where the rights are asked for.

Where the database is not Compose's, run the step by hand, once per release, as the bootstrap user:

```bash
DATABASE_URL=postgres://arablyzer:...@host:5432/arablyzer \
ARABLYZER_APP_DATABASE_PASSWORD=... \
  node --import tsx packages/store/src/migrate.ts
```

**Valkey** has no default user: it takes no connection without a name and a password. `arablyzer`,
whom the API and the worker connect as (`redis://arablyzer:<VALKEY_PASSWORD>@valkey:6379`), has
the keys the queue, the events and the limits use (`arablyzer:*` and `bull:arablyzer-scans:*`)
and every command but the administrative and dangerous ones (`FLUSHALL`, `KEYS`, `CONFIG`,
`DEBUG`, `SHUTDOWN`, `REPLICAOF` ...). The container writes its settings to memory as it starts,
from `VALKEY_PASSWORD`; the file holds a SHA-256 of it, and the password is on no command line,
where the host's `ps` would show it to every user of the host. To look inside:

```bash
docker compose -f infra/compose.yaml exec valkey \
  sh -c 'REDISCLI_AUTH="$VALKEY_PASSWORD" valkey-cli --user arablyzer --no-auth-warning info keyspace'
```

## The server's own addresses

`ARABLYZER_DENY_CIDRS` names the server's own public addresses, which none of the stack's processes
can see behind NAT. The egress proxy, the API and the scanner refuse them: a name that points at
one would otherwise reach the server's own services. Each is a CIDR written out in full:
`203.0.113.7/32` for an IPv4 address, `2001:db8::7/128` for an IPv6 one, or its `/64`. **List both
families if the host has both**: a host with an IPv6 address that the list leaves out has a public
address that a name can point at. Every reader of the list takes each entry for the same range
(`203.0.113/24`, an octal `010.0.0.1`, an IPv6 zone and `::ffff:203.0.113.7` are refused, since
the API's parser and the egress proxy's would read them differently), and production refuses to start
without one, or with `0.0.0.0/0`. Each says what a valid list leaves open: no IPv6 range, or no public
range at all.

The host's addresses: `ip -o addr show scope global`. Behind NAT (most clouds), the public address is
not on any interface: take it from the provider. `pnpm verify:deploy` takes every public-looking
address the host has, from its interfaces, to the egress proxy, and fails on one that it does not refuse.

## Forwarded addresses

The site's visitors reach the host's own proxy, which terminates TLS and passes them to Caddy on
the loopback; Caddy sets `X-Forwarded-For` to the visitor's address (`ARABLYZER_TRUSTED_PROXIES`
names whose header it believes) and passes the request to the API. The API counts its limits by
that address, so it must be the visitor's and nobody's word: but the API's port is reachable by
whatever else is on the edge network, and by any process on the host, which reaches the bridge.
Caddy therefore adds `X-Arablyzer-Proxy-Secret` (`ARABLYZER_PROXY_SECRET`, replacing a header of that
name that a visitor sends), and the API believes `X-Forwarded-For` only of a request that carries it,
compared in constant time. A request without it has no visitor, and starts no scan. Behind
Cloudflare, add its published ranges to `ARABLYZER_TRUSTED_PROXIES`; the secret is the same.

## The host's firewall

The containers on the `edge` network (Caddy, the API, the egress proxy) have a way out, through the
host: a bridge with the host's own address as its gateway. So they reach the host's own services,
its SSH and whatever else listens on all addresses, and a compromised API has the run of them. The
internal networks give the host no address at all; the edge network cannot, and the rule below is
the answer: **drop input from the Docker bridges but for DNS** (a resolver on the host, which the
containers may use) **and the answers to what the host itself started** (the host's proxy reaching
the site's published port on the loopback). Forwarded traffic, containers to the internet, is
Docker's, and not touched.

With iptables (and `ip6tables` for IPv6, with ICMPv6 neighbour discovery let through too if you have
enabled IPv6 on a Docker network):

```bash
iptables -N ARABLYZER-BRIDGES
iptables -A ARABLYZER-BRIDGES -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A ARABLYZER-BRIDGES -p udp --dport 53 -j ACCEPT
iptables -A ARABLYZER-BRIDGES -p tcp --dport 53 -j ACCEPT
iptables -A ARABLYZER-BRIDGES -j DROP
iptables -I INPUT 1 -i docker0 -j ARABLYZER-BRIDGES
iptables -I INPUT 1 -i br-+ -j ARABLYZER-BRIDGES     # every bridge Docker names br-<id>
```

or with nftables (both families at once), in `/etc/nftables.conf`:

```
table inet arablyzer {
	chain input {
		type filter hook input priority -10; policy accept;
		iifname "docker0" jump bridges
		iifname "br-*" jump bridges
	}
	chain bridges {
		ct state established,related accept
		udp dport 53 accept
		tcp dport 53 accept
		drop
	}
}
```

Both were tried in a throwaway container with a bridge and a network namespace standing for a
container: a service on the "host" was reached before the rule and not after, its DNS was reached
both ways, and a connection the host started to the "container" worked with the rule in. Make it
permanent as the distribution does (`netfilter-persistent save`, or the nftables service). A host
whose firewall is `ufw` or `firewalld` with input denied by default drops the bridges already: check.
A bridge that a compose file or `daemon.json` gives another name than `br-<id>` needs its name in the
rule (`docker network ls`, then `docker network inspect`).

## After a deploy

```bash
pnpm verify:deploy                        # the stack named `arablyzer`
pnpm verify:deploy --project my-project   # Coolify names its own: `docker compose ls`
```

It needs Docker and this checkout with its dependencies installed, and no compose file: it finds the
stack by the labels Compose put on its containers. It changes nothing: it starts a listener on the
host's network for a moment, connects out of the containers, and tries what the database's role must
refuse inside a transaction it rolls back. It runs the checks that the stack's own test asserts
(`infra/checks/checks.ts`), and exits 1 when one fails:

- Docker Engine 28 or later; every service up and healthy, and `migrate` finished; every container
  read-only, unprivileged and capped;
- the internal networks give the host no address; the scanner has the egress proxy alone and the
  worker has the stores and the scanner, and neither has a way out (an address that answers on port 80,
  `1.1.1.1` unless `--probe` names another, is out of their reach); the host's listener is out of their
  reach; no IPv6 address; the scanner's own check of its network (`apps/scanner/src/check-isolation.ts`:
  no default route, no outside name that resolves);
- the egress proxy opens ports 80 and 443 alone, refuses private, local and metadata addresses, and
  refuses every range of `ARABLYZER_DENY_CIDRS` and every public address the host has;
- the API believes `X-Forwarded-For` only from the site's server; the API and the worker connect as
  `arablyzer_app`, which is no superuser and refuses DDL, `COPY ... PROGRAM`, `DELETE` and the
  migrations' schema, and do not hold the bootstrap password; Valkey takes no connection without a
  password, refuses the application user its dangerous commands and its other keys, and has its
  password on no command line.

Two are warnings, which the stack cannot fix and which do not fail it: the site's server published
on an address other than the host's loopback (`ARABLYZER_BIND`), and a container on the edge network
that reaches a listener on the host: the firewall rule above is not in.

The scanner makes its own check as it starts, too, and refuses to start where its network has a way
out and `ARABLYZER_NETWORK_ISOLATED` says it has none: WebKit runs only where the network reaches the
egress proxy alone, and Compose's word for that is not the container's.

## The stack's test

`pnpm test:stack` runs the same checks and more against the stack CI starts, with golden site 04
served inside it on a network of its own:

```bash
docker compose -f infra/compose.yaml -f infra/compose.e2e.yaml up -d --build --wait
pnpm test:stack
```

Beside another stack on the same Docker, `COMPOSE_PROJECT_NAME`, `ARABLYZER_PORT` and
`ARABLYZER_STACK_URL` give the stack a project, a port and an address of its own. The test's own
network has a fixed subnet, `93.184.215.0/24`, so two stacks with `compose.e2e.yaml` do not run at
once (`load/compose.parallel.yaml` moves it, for a load test beside CI's stack); one without it runs
beside any.

## The load test

`pnpm load:stack` sends the stack that `compose.e2e.yaml` starts, on this machine, what visitors send
it: the pages, scans from many visitors, the reads of a finished scan, and one visitor that asks for
more than its limits allow. It prints the p50, p95 and largest time of each kind of answer, and the
errors. It refuses a target that is not loopback unless `--target` names it, and it does not run in CI:
[`load/README.md`](load/README.md).

## Smaller images: not done, and why

The API's and the worker's images hold the whole workspace with its development tools (1.2 GB each).
`pnpm deploy --prod --legacy` gives a package its production dependencies alone, at the versions the
lockfile names (measured: every one of the 157, 40 and 40 packages of the API's, the worker's and the
store's is in the lockfile at that version), and the worker's runs under `tsx` from there: 45 MB, against
246 MB for the API, which imports the engine's user agent and so the engine's dependencies. It was
left, for what it needs first:

- `--legacy`, since pnpm 10's own way needs `inject-workspace-packages` for the whole workspace, which
  changes how packages link in development; and `--legacy` resolves again, so a version in the lockfile
  that is younger than `minimumReleaseAge` (a week) fails the build: `--config.minimumReleaseAge=0` in the
  Dockerfile's deploy step, the lockfile having chosen the versions already;
- `tsx` as a dependency of each app, and the API's `@arablyzer/scanner` (used by `dev.ts` alone) among
  its development ones, both changes to package files and the lockfile that other work touches;
- the API not importing the engine for one constant, or its image keeps Playwright and Lighthouse;
- the paths the compose file, the stack's test and the checks name (`apps/api/src/server.ts`,
  `packages/store/src/migrate.ts`) becoming the deployed directory's.
