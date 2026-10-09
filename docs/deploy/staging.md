# Staging: Arablyzer on a server of its own, behind Cloudflare

Milestone M2.5 ([issue #26](https://github.com/Shahoom/arablyzer/issues/26); Phase 2 design §5 and §7,
decision 4): the whole stack on the owner's existing server, protected by Cloudflare Access, and the
list it is accepted on. This page is for the owner, who decides and holds the accounts, and for whoever
operates the server after. Every step is a command or a setting, and says what to expect.

> **Prepared, not run.** Nothing here has deployed anything, and nothing has contacted the server or a
> Cloudflare account. The Docker parts (start, verify, roll back, back up, restore, the load test) were
> tried on a local stack on a Mac, and are marked **Tried**. The Cloudflare, host-proxy and firewall
> parts depend on the server and its accounts, could not be tried, and are marked **Not tried**.
> **Deploying waits for the owner's word** (CLAUDE.md, "Ask first").

The kit: this page; [`infra/deploy-staging.sh`](../../infra/deploy-staging.sh), the one command (§0);
[`infra/compose.vps.yaml`](../../infra/compose.vps.yaml), the TLS proxy for one VPS behind Cloudflare;
[`infra/smoke.ts`](../../infra/smoke.ts), the HTTP checks of a site; [`infra/compose.staging.yaml`](../../infra/compose.staging.yaml), which names the
images by release, for the way back; [`infra/verify-deploy.ts`](../../infra/verify-deploy.ts), which checks
the isolation on the stack that is deployed; [`infra/README.md`](../../infra/README.md), which has the
requirements, the databases' roles and the host's firewall rule; and
[`infra/load/`](../../infra/load/README.md), the load test.

## 0. The short path: one VPS behind Cloudflare, one command

For `staging.arablyzer.com` (production will be `arablyzer.com`, the same way) on **one Linux VPS** whose DNS is on
Cloudflare. The rest of this page is the detail behind each step, and the acceptance list. Anything that needs
the owner's account is marked **Owner**; nothing here has deployed anything.

**The layout.** Cloudflare (proxied, SSL/TLS mode **Full (strict)**) reaches `:443` of the VPS, where `tls`
([`infra/compose.vps.yaml`](../../infra/compose.vps.yaml), Caddy with a Cloudflare Origin CA certificate)
terminates TLS and passes to `web`, which passes `/api/` to the API. Only `tls` is published on a public
address; `web` stays on loopback, and Valkey, PostgreSQL, the worker, the scanner and the egress proxy have no
published port. The visitor's address is `CF-Connecting-IP`, believed only from Cloudflare's ranges (§3.5).
**Tried:** the Caddyfile validates, `docker compose config` merges the three files, and a throwaway proxy passes
a Cloudflare peer's `CF-Connecting-IP` as `X-Forwarded-For` and replaces a forged `X-Forwarded-For` with the
peer's own address when the peer is not Cloudflare. **Not tried:** a VPS, and Cloudflare.

### 0.1 Once, before the first deploy

1. **The VPS.** Ubuntu 24.04 LTS or Debian 13, 8 vCPU and 16 GB as `infra/compose.yaml` assumes (a smaller one:
   §2.3), 60 GB of disk, Docker Engine 28 or later with Compose v2, `git`, `openssl`, and Node 22.12+ with
   pnpm 10.32.1 (`corepack enable`) for the checks. Start Docker at boot (§2.1).
2. **Firewall.** Allow SSH, and 443 **from Cloudflare's ranges alone** (https://www.cloudflare.com/ips/); drop
   the rest of the input, and add the rule of `infra/README.md`, "The host's firewall" (§2.2). With `ufw`:
   `for r in $(curl -s https://www.cloudflare.com/ips-v4; echo; curl -s https://www.cloudflare.com/ips-v6; echo); do ufw allow from $r to any port 443 proto tcp; done`,
   then `ufw allow OpenSSH`, `ufw default deny incoming`, `ufw enable`. Docker publishes ports around `ufw`'s
   input rules, so check from outside that 443 refuses a machine that is not Cloudflare (§9, C2). Port 80 stays
   closed: Cloudflare's "Always Use HTTPS" answers it.
3. **Owner: Cloudflare.** The record `staging` (A, and AAAA if the VPS has one) to the VPS, **proxied**. SSL/TLS
   mode **Full (strict)**, "Always Use HTTPS" on, and the §3.3 list of what to leave off. An **Origin CA
   certificate** for `staging.arablyzer.com` (SSL/TLS, Origin Server, create, RSA, 15 years): save the certificate
   as `infra/certs/origin.pem` and the key as `infra/certs/origin.key` on the VPS. `infra/certs/` is out of git. For
   production, issue one for `arablyzer.com` and `*.arablyzer.com`. A **Turnstile** widget for the hostname (§3.6).
   Cloudflare Access in front (§3.1 to §3.2) is the owner's choice for staging: the smoke script sends a service
   token when `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` are set.
4. **Owner: the numbers** in §1: the ten limits, the retention days, the Turnstile keys, and the VPS's public
   IPv4 and IPv6 addresses (`ARABLYZER_DENY_CIDRS`). Optional keys (Google signals, CrUX, BigQuery, AI providers)
   are listed in `infra/.env.example` with what each costs; leave a key empty and its check says so in the report.

### 0.2 Secrets

- Every secret is a 64-character hex string, one each, never reused: `openssl rand -hex 32` for `ARABLYZER_LIMIT_SECRET`,
  `ARABLYZER_SCANNER_TOKEN`, `ARABLYZER_PROXY_SECRET`, `VALKEY_PASSWORD`, `POSTGRES_PASSWORD`,
  `POSTGRES_APP_PASSWORD` and `POSTGRES_WORKER_PASSWORD`. Hex, not base64: they go into connection URLs.
- They live in `infra/.env` on the VPS, mode 600 (the deploy script sets it), outside git and outside the images, and in
  the owner's password manager, which is the only other copy. Third-party keys (Turnstile secret, Google, AI
  providers) are restricted at the provider to the API they serve, and to a spending limit where the provider has one.
- The Origin CA key (`infra/certs/origin.key`) is as secret as the passwords. Rotating a password: change it in
  `.env` and run the deploy command; `POSTGRES_APP_PASSWORD` and `POSTGRES_WORKER_PASSWORD` are set on every deploy. Rotating `VALKEY_PASSWORD`
  restarts the queue, so do it with no scan running.
- Nothing in this repository holds a value: CI uses test values only (`compose.e2e.yaml`).

### 0.3 First deploy

```bash
git clone https://github.com/Shahoom/arablyzer.git /opt/arablyzer && cd /opt/arablyzer
git checkout <the commit the owner named>
cp infra/.env.example infra/.env && chmod 600 infra/.env   # fill section 1 (and the optional keys you want)
mkdir infra/certs                                          # then origin.pem and origin.key from Cloudflare

./infra/deploy-staging.sh --check
```

**That one command** checks Docker, `.env` and the certificate, names the images for the commit, builds, starts
the eight services of the stack and the TLS proxy with `--wait`, then runs `pnpm verify:deploy` (isolation, §6.1) and
`pnpm smoke --url $ARABLYZER_SITE` (HTTP, §0.5). It keeps `COMPOSE_FILE`, `ARABLYZER_RELEASE` and
`ARABLYZER_HOST` in `infra/.env`, so later `docker compose` commands in `infra/` see the same stack. Without
`--check` it only starts the stack. The first build takes some minutes and several GB (§2.3). Install the checks'
dependencies first: `pnpm install --frozen-lockfile --filter @arablyzer/infra`.

### 0.4 A smaller shared server

`compose.yaml` is sized for the whole stack with three browsers in one scanner (2,480 MiB of caps), and stays
the same: do not lower its limits. On a smaller or shared server, run **one browser**: `ARABLYZER_ENGINES=chromium`
in `infra/.env`. The scanner then starts one browser, not three, so a scan's report has Chromium's results alone, and the
caps remain as a ceiling. There is one scanner either way (§2.3). The
peak with one engine **has not been measured**; watch `docker stats` during the acceptance scans (§9, B3) and
lower the scanner's `mem_limit` only from what they show, in a file of your own beside the three.

### 0.5 The checks, in code

| Command                                   | Needs        | What it asks                                                                                                                                                                       |
| ----------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify:deploy`                      | Docker       | The isolation of the containers: 17 checks (§6.1, §9 B and J).                                                                                                                      |
| `pnpm smoke --url https://staging.arablyzer.com` | the network  | The site as a visitor sees it: the pages in both languages, 404s, headers, robots.txt, sitemaps, an image, the API's refusals, HTTP to HTTPS (§9 C, D, G, H, I). Starts no scan. |
| `pnpm load:stack`                         | Docker, a stack on this machine | The load test (§10).                                                                                                                                              |

`pnpm smoke` exits 1 when a check fails; "plain HTTP goes to HTTPS" is a warning, as Cloudflare answers it.
The unit test of the checks is `pnpm --filter @arablyzer/infra test` (no network, in CI). A whole scan, a tool scan,
the limits seen from two networks and the owner's sign-off are not scriptable (Turnstile): they stay in §9.

### 0.6 Afterwards

Logs and stopping: §6. **Backups and retention:** §7 (a dump of PostgreSQL, with a restore tried) and
`ARABLYZER_REPORT_RETENTION_DAYS` (§1; the worker deletes older reports every hour). **Rollback:**
`./infra/deploy-staging.sh --rollback <the release before>`, from the images kept on the server, with no build
(§8). **Upgrade:** `git pull` or check out the new commit, back up (§7), and run the deploy command again; a
change of `ARABLYZER_SITE` or the Turnstile site key rebuilds the pages, and the script always builds.

## 1. What the owner decides and gives

None of this has a default that anyone else may choose (CLAUDE.md; Phase 2 design §7).

| What                                                                                     | Where it goes                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Approval to deploy, and the commit                                                       | issue #26                                          |
| The staging hostname, on a zone that is on the owner's Cloudflare                        | `ARABLYZER_SITE` (§4), the Access application (§3) |
| Who may open it: the emails, or the identity provider, of the people who review          | the Access policy (§3)                             |
| A Turnstile widget for that hostname: its site key and its secret                        | `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`    |
| The limits: ten numbers (design §7.2)                                                    | `ARABLYZER_LIMIT_*` (§4)                           |
| The days reports are kept (design §7.3, issue #33), or none: kept for ever               | `ARABLYZER_REPORT_RETENTION_DAYS`                  |
| The server's public IPv4 and IPv6 addresses                                              | `ARABLYZER_DENY_CIDRS`                             |
| Optional: a CrUX key from Google Cloud, for the field data of Core Web Vitals            | `ARABLYZER_CRUX_KEY`                               |
| Reading the Arabic copy, which keeps CI's `arabic-copy` job red until it is done         | `reviewed: true` in each `copy.ar.md`              |

The public domain is a separate decision (design §7.5: `arablyzer.com`, before anything is public).
Staging needs only a hostname on a zone that the owner already has on Cloudflare.

## 2. Prerequisites

### 2.1 The server

- **Docker Engine 28 or later, and Compose v2.** The internal networks give the host no address only
  through Engine 28's gateway mode `isolated`. An older Engine ignores the option and starts the stack
  all the same, and the first check of `pnpm verify:deploy` fails on it (`infra/README.md`,
  "Requirements"). The stack was measured with Engine 29.5 and Compose 5.1.
  `docker version --format '{{.Server.Version}}'` says what the server has. `docker info` should print
  no warning about memory or swap limit support: the caps are the point of the stack (§2.3).
- **Docker's address pools must not overlap what else the server routes.** The stack makes four
  networks, and Docker gives each a range from its default pools. BUILD-PLAN §18.3.1 names WireGuard among
  the networks that the egress proxy refuses, so the server may have one. After the first start, compare
  `ip route` with `docker network ls`; if a range is taken twice, give Docker pools that avoid it
  (`default-address-pools` in `/etc/docker/daemon.json`). **Not tried.**
- **Docker starts at boot** (`systemctl enable docker`). Every service is `restart: unless-stopped`, except
  `migrate`, which runs once.
- **Outbound access:** ports 80 and 443, and DNS. The scans go out through the egress proxy, and so does
  the API's check of Turnstile.
- On the machine that runs the commands below: `git`, `openssl`, `curl`, and, for `pnpm verify:deploy`,
  Node 22.12 or later and pnpm 10.32.1 (`corepack enable`). Only the infra package is needed:
  `pnpm install --frozen-lockfile --filter @arablyzer/infra` installs 167 packages and 158 MB, against
  607 MB for the whole workspace. **Tried.**

### 2.2 The host's firewall

The containers on the `edge` network reach the host's own services through the Docker bridge, and the
rule that stops that is the host's to make: drop input from the bridges but for DNS and the answers to
what the host started. The rule, for iptables and for nftables, and how it was tried, are in
`infra/README.md`, "The host's firewall". Make it permanent as the distribution does, before the first
start. The last check of `pnpm verify:deploy` is a **warning** where the rule is missing, and staging is
not accepted with it (§9, B2).

### 2.3 Memory, CPU and disk

The server is shared (8 vCPU and 16 GB, with other services), and Arablyzer's budget on it is about 3.5 GB
(BUILD-PLAN §18.3.1). The caps in `compose.yaml` keep the browsers from slowing the rest:

| Service    | Memory cap | CPU cap | Peak, MiB | What it is                         |
| ---------- | ---------: | ------: | --------: | ---------------------------------- |
| `web`      |     64 MiB |     0.5 |      44.0 | the site's server (Caddy)          |
| `api`      |    256 MiB |     1   |      95.5 | the API                            |
| `worker`   |    256 MiB |     0.5 |      99.0 | the queue's worker; no browser     |
| `scanner`  |   1200 MiB |     2   |     577.7 | the engine and the three browsers  |
| `egress`   |     64 MiB |     0.5 |       9.6 | the egress proxy (Smokescreen)     |
| `valkey`   |    128 MiB |     0.5 |       9.4 | the queue, the events, the limits  |
| `postgres` |    512 MiB |     1   |     109.6 | scans and reports                  |
| **Total**  | **2480 MiB** | **6.0** |         |                                    |

`migrate`, the database's own step, adds up to 256 MiB and 0.5 CPU for the seconds it runs at each deploy.
The peaks are cgroup high-water marks (`memory.peak`, page cache included), measured on the Mac's Docker
after a load test and one whole scan of golden site 04 (§10). That is one small page: they say the caps have
room on it, not that a heavy page will not need more of the scanner's 1200 MiB. **Watch `docker stats` during
the acceptance scans** (§9, B3).

- **One scanner.** BUILD-PLAN allows at most two browser workers (1.2 GB each), which with the rest is
  3,616 MB. The worker takes one scan at a time (`SCAN_WORKER.concurrency` is 1), so a second scanner would
  sit idle, and it would take the caps to 3,680 MiB, past the budget. More capacity is a server of its own
  (BUILD-PLAN: when the queue's wait passes 30 seconds), not a bigger stack here.
- **Free memory:** `free -m` should show 3.5 GB **available** on the server, with the other services running.
- **Disk.** On this Mac the images are 3.97 GB (scanner), 1.21 GB each (API and worker; `migrate` runs the
  API's), 0.22 GB (site) and 0.02 GB (egress proxy), and layers are shared, so the disk holds less than the
  sum. A second release beside the first added **1.6 GB** (`docker system df` before and after removing it).
  The build cache is the larger part: 16 GB after a day's builds here. Prune it (`docker builder prune`) when
  the disk asks, and old releases with `docker image rm` (§8).

### 2.4 The host's own proxy

On a VPS of its own, `compose.vps.yaml` is this proxy (§0) and this section is not needed. On a shared server:

Something on the server already publishes sites and terminates TLS: Coolify's proxy, nginx, or a Cloudflare
Tunnel. For Arablyzer it must:

1. terminate TLS for the staging hostname, and pass every path (`/api/` included) to
   `http://127.0.0.1:${ARABLYZER_PORT}` (8080 by default), where the site's server is published on the
   loopback alone (`ARABLYZER_BIND`);
2. **not buffer a response**: a scan's events are one response that lasts up to five minutes, the API pings
   it every 15 seconds, and it sends `X-Accel-Buffering: no`, which nginx obeys. Any other proxy needs
   buffering off for `text/event-stream`;
3. **add the address it sees to `X-Forwarded-For`**, not replace the header: the API counts its limits by
   the address that comes out of it (§3.5);
4. take connections **only from Cloudflare**, or be a Tunnel. Nothing in the stack checks that a request
   went through Access, so an origin that anyone can reach has no Access in front of it (§3.4).

If Coolify deploys the stack, it runs the compose file itself and names the project (`docker compose ls`
says which: `pnpm verify:deploy --project <name>`), and it may take one compose file and not two. Then skip
`compose.staging.yaml`, and take Coolify's redeploy of the commit before as the way back. **Not tried.**

## 3. Cloudflare Access in front of the hostname

**The owner does this. Nothing here has been done**, and the dashboard's labels move: this is what to set,
not where to click. Do 3.1 to 3.4 **before** the hostname points at the server, so that it is never open
without Access, even for a moment. **Not tried.**

### 3.1 The application

In Zero Trust, Access, add a **self-hosted application** for exactly the staging hostname, with no path: the
whole hostname is behind Access, `/api/` and `/robots.txt` included. **Add no Bypass policy and no path
exception.** Search engines then meet the login and index nothing, which is the point. The scan form's
requests to `/api/` are from the same origin, carry the login's cookie, and work once its owner has logged in.

### 3.2 The policies

- **Allow**, for the people who review: their emails (a one-time PIN is the built-in way to log in), or the
  identity provider that the owner already uses.
- **Service Auth**, for the operator's checks with `curl` (§9): make a **service token**, put its Client ID
  and Client Secret in the password manager (the secret is shown once), and add a policy of that action that
  includes it. It is sent as two headers, `CF-Access-Client-Id` and `CF-Access-Client-Secret`. Revoke it when
  M2.5 is accepted.

### 3.3 DNS and TLS

- The hostname's record is **proxied** (the orange cloud), to the server's public address, or a CNAME to a
  Tunnel. Access applies only to what goes through Cloudflare.
- TLS mode **Full (strict)**, with a certificate on the host's proxy that Cloudflare accepts (its Origin CA,
  or a public one). A Tunnel needs none.
- Turn off what rewrites a page or adds a script for the hostname (Rocket Loader, Email Address Obfuscation,
  Web Analytics' automatic beacon). **The pages carry a Content-Security-Policy in a `<meta>`, with the hashes
  of their own inline scripts**: `script-src` names the site and `challenges.cloudflare.com` and nothing
  else, `connect-src` only the site, so a script that Cloudflare changes or adds is one the browser refuses.
- Leave caching at its default: HTML is not cached by default, and the API answers `Cache-Control: no-store`.

### 3.4 The origin is Cloudflare's alone

Because nothing in the stack checks that a request came through Access, **an origin that can be reached
directly is not protected**. Either publish through a **Tunnel** (`cloudflared` connects out, and no port is
open), or open the host's 443 to **Cloudflare's published ranges alone** (https://www.cloudflare.com/ips/),
IPv4 and IPv6, in the firewall. Authenticated Origin Pulls (mutual TLS) is a stricter third way. §9, C2
checks it from outside.

### 3.5 The visitors' addresses

The API counts its limits by the visitor's address, which Caddy takes out of `X-Forwarded-For`, read from the
right, **past the addresses it trusts** (`ARABLYZER_TRUSTED_PROXIES`; the private ranges when it is empty).
Behind Cloudflare and a host's proxy the header is `visitor, Cloudflare's address` and the host's proxy is the
peer, so both must be trusted, or every visitor behind one Cloudflare address shares one limit:

```
ARABLYZER_TRUSTED_PROXIES=private_ranges <Cloudflare's IPv4 ranges> <Cloudflare's IPv6 ranges>
```

Take the ranges from https://www.cloudflare.com/ips/ on the day, separated by spaces: they change now and
then, and this page does not copy them. On the single VPS of §0 the TLS proxy does this reading itself, from `CF-Connecting-IP`, and the site's server
trusts it as a private address: leave `ARABLYZER_TRUSTED_PROXIES` empty there. Behind a Tunnel the peer is the Tunnel's and the header's last
address the visitor's, and the default is enough. §9, C5 tests it with two networks.

### 3.6 Turnstile

In Cloudflare's Turnstile, add a widget for the staging hostname alone. Its **site key** is
`PUBLIC_TURNSTILE_SITE_KEY` and its **secret** is `TURNSTILE_SECRET`. The form sets the action `scan`, and the
API asks the answer to name it and the host of `ARABLYZER_SITE`. Cloudflare's test keys pass every token, so
the API refuses them: it always runs as production.

## 4. The settings: every variable

They are in `infra/.env`, which is out of git and out of the images (`.dockerignore`), and which Compose
reads by itself, being next to `compose.yaml`. `infra/.env.example` is the list, with the reason for each.

**Secrets.** Each is made with `openssl rand -hex 32`. Every service refuses one shorter than 32 characters,
and says which, never its value. **Hex, not base64**: these go into URLs, and a `/` breaks them.

| Variable                  | What it is                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ARABLYZER_LIMIT_SECRET`  | keys the per-visitor limits; changing it starts every visitor's count afresh                                                                                                      |
| `ARABLYZER_SCANNER_TOKEN` | what the worker shows the scanner; the scanner answers no one else                                                                                                                |
| `ARABLYZER_PROXY_SECRET`  | what the site's server shows the API, so that the API believes `X-Forwarded-For` only from it                                                                                     |
| `VALKEY_PASSWORD`         | Valkey's one user; rotate it by restarting the API, the worker and Valkey together                                                                                                |
| `POSTGRES_PASSWORD`       | the bootstrap superuser, which only `migrate` holds. **The image reads it only when it makes the database**: to change it later, run `ALTER ROLE arablyzer PASSWORD '…'` in the running database too |
| `POSTGRES_APP_PASSWORD`   | `arablyzer_app`, the role the API uses. It is set on every deploy, so changing it rotates it                                                                                      |
| `POSTGRES_WORKER_PASSWORD` | `arablyzer_worker`, the worker's role: scans only, never the accounts. Set on every deploy like the one above                                                                    |

```bash
cd /opt/arablyzer && umask 077 && cp infra/.env.example infra/.env
for name in ARABLYZER_LIMIT_SECRET ARABLYZER_SCANNER_TOKEN ARABLYZER_PROXY_SECRET \
            VALKEY_PASSWORD POSTGRES_PASSWORD POSTGRES_APP_PASSWORD POSTGRES_WORKER_PASSWORD; do
  sed -i.bak "s|^${name}=.*|${name}=$(openssl rand -hex 32)|" infra/.env
done && rm infra/.env.bak
```

**Tried.** Keep a copy of the file in the owner's password manager. A lost `POSTGRES_PASSWORD` can be reset
from inside the container, whose local socket is trusted, but that is one more step on a bad day.

**Accounts, plan numbers and monitoring** (only with `ARABLYZER_ACCOUNTS=on`). The owner's recommended numbers
for the free account (decided 2026-10), to set as they are on staging:

| Variable                                    | Value   | What it is                                                                       |
| ------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `ARABLYZER_PLAN_ACCOUNT_SCANS`              | `5`     | scans a signed-in person may start in the window                                 |
| `ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS`       | `86400` | the window: a day                                                                |
| `ARABLYZER_PLAN_ACCOUNT_INFLIGHT`           | `1`     | scans queued or running at once                                                  |
| `ARABLYZER_PLAN_ACCOUNT_SAVED_SITES`        | `3`     | sites a person may save                                                          |
| `ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS`       | `5`     | days their scans and reports are kept                                            |
| `ARABLYZER_PLAN_ACCOUNT_MONITORED_SITES`    | empty   | sites monitored; empty is `1`                                                    |
| `ARABLYZER_PLAN_ACCOUNT_MONITOR_EVERY_DAYS` | empty   | days between two scans of a monitored site; empty is `7` (weekly)                |
| `ARABLYZER_MAIL_PROVIDER`                   | empty   | email alerts: no provider is built yet, so leave it empty (a value stops the API) |
| `ARABLYZER_PLAN_ACCOUNT_CRAWL_PAGES`        | empty   | pages one deep crawl checks; empty is `50`                                       |
| `ARABLYZER_CRAWL_DELAY_MS`                  | empty   | pause between two pages of a crawl; empty is `1000`                              |
| `ARABLYZER_CRAWL_REPRESENTATIVES`           | empty   | pages per template scanned in the browsers; empty is `1`                         |
| `ARABLYZER_CRAWL_RENDERED_TEMPLATES`        | empty   | templates that get any; empty is `10`                                            |

The API refuses to start when the free account would get less than an anonymous visitor, so the anonymous limits
(`ARABLYZER_LIMIT_CONNECTION_*`, `ARABLYZER_LIMIT_INFLIGHT`) must be no larger than the line above: at most 5 scans a
day from one visitor and one scan at a time. The `monitor` service (192 MiB, 0.5 CPU, on the API's image) runs
the scheduler; it starts a monitored site's scan only into the lower half of the queue, and sends the alerts as signed
webhooks (Slack, Discord or JSON) through the egress proxy. The `crawler` service (192 MiB, 0.5 CPU, the same image)
runs the deep crawls through the scanner and needs no other way out.

**Given by Cloudflare and Google** (the owner's accounts):

| Variable                    | Secret | What it is                                                                                                       |
| --------------------------- | :----: | ---------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_TURNSTILE_SITE_KEY` |   no   | the widget's site key. **Built into the pages**, so a change needs `--build`                                     |
| `TURNSTILE_SECRET`          |  yes   | the widget's secret; never Cloudflare's test keys                                                                |
| `ARABLYZER_CRUX_KEY`        |  yes   | optional. Restrict it, in Google Cloud, to the Chrome UX Report API: a browser that a page took over can read it |

**The site and the network:**

| Variable                    | What it is                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ARABLYZER_SITE`            | the staging origin, `https://staging.example.com`. A scan request's `Origin` must be exactly this, Turnstile's answer must name its host, and the pages' canonical addresses and sitemaps are built from it, **so a change needs `--build`**                                                             |
| `ARABLYZER_BIND`            | where the site's server listens on the host: `127.0.0.1`, for the host's own proxy. Anything else is a warning of `verify:deploy`                                                                                                                                                                      |
| `ARABLYZER_PORT`            | its port, 8080 by default: the host proxy's target                                                                                                                                                                                                                                                     |
| `ARABLYZER_TRUSTED_PROXIES` | whose `X-Forwarded-For` the site's server believes (§3.5)                                                                                                                                                                                                                                              |
| `ARABLYZER_DENY_CIDRS`      | **the server's own public addresses, each as a CIDR, IPv4 and IPv6** (`203.0.113.7/32`; `2001:db8::7/128` or its `/64`), comma-separated. The egress proxy, the API and the scanner refuse them, so that a name that points at the server does not reach its services. Behind NAT no interface has the public address: take it from the provider. `ip -o addr show scope global` lists the rest. Compose does not start without it |

**The limits** are the owner's (design §7.2), and the API does not start without all ten. A visitor is an IPv4
address, or an IPv6 address's /48. Each pair is a token bucket: the scans allowed at once, refilled evenly over
the seconds (`packages/store/src/limits.ts`). The day turns at 00:00 UTC, which starts every bucket afresh.

| Variables                                       | Limit                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ARABLYZER_LIMIT_CONNECTION_SCANS`, `…_SECONDS` | the scans one visitor may start in the window                                                                                    |
| `ARABLYZER_LIMIT_NETWORK_SCANS`, `…_SECONDS`    | the same for one IPv6 network (a /32), all its visitors together                                                                 |
| `ARABLYZER_LIMIT_ATTEMPT_REQUESTS`, `…_SECONDS` | the requests one visitor may make to start a scan, valid or not, counted **before** Turnstile is asked, so more than the scans   |
| `ARABLYZER_LIMIT_HOST_SCANS`, `…_SECONDS`       | the scans of one site by everyone together: of the site asked for, and of the site a scan ends at                                |
| `ARABLYZER_LIMIT_QUEUE`                         | the scans waiting; past it, 503 `unavailable`                                                                                    |
| `ARABLYZER_LIMIT_INFLIGHT`                      | the scans one visitor may have queued or running at once                                                                         |

The queue is one lane: the worker takes one scan at a time, so `ARABLYZER_LIMIT_QUEUE` times the length of a
scan is the longest a visitor can wait. A scan of golden site 04 in three browsers took about 6 seconds on the
Mac; a real site takes what it takes, up to the plan's budget of 120 seconds. CI's stack uses connection 10,
network 100, attempts 60 and host 20 (each per 3600 seconds), queue 50 and in flight 2: they are
`DEVELOPMENT_LIMITS` (`packages/plans`), for tests, and not anyone's decision.

**The rest:**

| Variable                          | What it is                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ARABLYZER_REPORT_RETENTION_DAYS` | the owner's number of days: the worker deletes older scans and reports every hour. **Empty keeps everything**, and the worker says so in its log |
| `ARABLYZER_ENGINES`               | optional: fewer of `chromium,firefox,webkit`; all three by default                                                                               |
| `ARABLYZER_DOH_URL`               | optional: the DNS-over-HTTPS resolver for SPF and DMARC, Cloudflare's by default. The domain's name goes to it, and nothing else of the page     |
| `COMPOSE_FILE`                    | **staging only**: `compose.yaml:compose.staging.yaml`. Compose reads it from `infra/.env`, so every command run in `infra/` uses both files       |
| `ARABLYZER_RELEASE`               | **staging only**: the release the images are named for, `git rev-parse --short=12 HEAD` (§5, §8)                                                  |

Compose passes on the variables that `compose.yaml` names, and no others. `ARABLYZER_ALLOW_TURNSTILE_TEST_KEYS`
(the end-to-end stack's) and `ARABLYZER_INDEXNOW_KEY` (the launch's, Phase 3) are not staging's: nothing sends
staging's sitemaps to a search engine (`pnpm --filter @arablyzer/web indexnow` is for the launch).

## 5. Deploy

Every `docker compose` command below runs **in `infra/`**, where `.env` is. Two lines of it are staging's:
`COMPOSE_FILE` (both compose files) and `ARABLYZER_RELEASE`. Written in the shell from the repository's root, a
relative `COMPOSE_FILE` breaks `pnpm verify:deploy`, which runs its `docker compose` in `infra/`; in `.env` it
works for both. **Tried.**

```bash
# 1. The code, at the commit the owner named.
git clone https://github.com/Shahoom/arablyzer.git /opt/arablyzer && cd /opt/arablyzer
git checkout <the commit>

# 2. The settings (§4): infra/.env, its two staging lines included.
#    ...make the secrets, and fill in the owner's numbers...
sed -i.bak -E '/^(COMPOSE_FILE|ARABLYZER_RELEASE)=/d' infra/.env && rm infra/.env.bak
printf 'COMPOSE_FILE=compose.yaml:compose.staging.yaml\nARABLYZER_RELEASE=%s\n' \
  "$(git rev-parse --short=12 HEAD)" >> infra/.env

# 3. Check the settings, then build and start. --wait returns when every service is healthy and
#    `migrate` has finished; it fails, and says which service, if one is not.
cd infra
docker compose config --quiet        # fails naming a variable that is missing
docker compose up --detach --build --wait --wait-timeout 900
docker compose ps

# 4. The isolation checks, on the stack that is up (§6.1).
cd .. && pnpm install --frozen-lockfile --filter @arablyzer/infra
pnpm verify:deploy
```

**Tried**, on a local stack under a project of its own: `config`; `up --wait` (31 seconds with the images
built: PostgreSQL and Valkey first, then `migrate`, then the egress proxy and the API, the scanner, the worker,
and last the site's server); and `verify:deploy` (8.5 seconds). The first build downloads the browsers and the
dependencies, so it needs the network and, on a first server, time and disk (§2.3). It was not measured here,
where the cache was warm; `--wait-timeout 900` is what CI allows it.

If `ARABLYZER_DENY_CIDRS` names no IPv6 range, the API and the scanner say at the start what the list leaves
open: put the range in, and start again. Then do §3.1 to §3.4 if they are not done, point the hostname at the
server, and go through §9.

**A change to `ARABLYZER_SITE` or `PUBLIC_TURNSTILE_SITE_KEY` is a change to the pages: always `up --build`
after one**, since Compose does not rebuild an image whose build arguments changed.

## 6. Operating it

### 6.1 Is it right: `pnpm verify:deploy`

It needs Docker and this checkout with its dependencies (§2.1), and no compose file: it finds the stack by
the labels Compose put on its containers (`--project <name>` where the project is not `arablyzer`). It changes
nothing: it starts a listener on the host's network for a moment, connects out of the containers, and tries
what the database's role must refuse inside a transaction it rolls back. **It makes 17 checks and exits 1 when
one fails. A warning is what the operator must put right on the host.** What it printed on the local stack,
whose Docker has no firewall rule:

```
Checking the stack arablyzer-load
  ok    Docker Engine 28 or later
  ok    every service is up and healthy, and the database step has finished
  ok    every container runs read-only, unprivileged, with caps
  ok    the internal networks give the host no address
  ok    the scanner has no way out but the egress proxy
  ok    the scanner's own check of its network
  ok    the worker has the stores and the scanner, and no way out
  ok    the host's services are out of the scanner's and the worker's reach
  ok    the scanner and the worker have no IPv6 address
  ok    the egress proxy opens ports 80 and 443 alone
  ok    the egress proxy refuses private, local and metadata addresses
  ok    the egress proxy refuses the server's own addresses, IPv4 and IPv6
  ok    the API believes X-Forwarded-For only from the site server
  ok    the API and the worker connect as a role that changes nothing
  ok    Valkey's user has the queue's commands and not the dangerous ones
  ok    the site's server is published on the host's loopback
  warn  the host's firewall drops input from the Docker bridges
17 checks: 16 ok, 1 warning, 0 failed
```

| A check that says                                                 | Means, and what to do                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker Engine 28 or later` FAIL                                  | the Engine is older: upgrade it (§2.1). Nothing else on the list can be trusted on it                                                                       |
| `every service is up and healthy…` FAIL                           | it says which: `docker compose ps`, then that service's log (§6.2). A `migrate` that did not exit 0 is the database: its log names the variable or the role |
| `the egress proxy refuses the server's own addresses` FAIL        | an address that the host has is not in `ARABLYZER_DENY_CIDRS`: the message names it. Add it, and start the stack again                                      |
| `the site's server is published on the host's loopback` warn      | `ARABLYZER_BIND` is not `127.0.0.1`: correct it, unless the host's proxy is on another machine, and then tell the owner                                     |
| `the host's firewall drops input from the Docker bridges` warn    | §2.2: the rule is not in. The message lists the addresses at which the API's container reached a service on the host                                        |
| any other isolation check FAIL (networks, roles, Valkey, the API) | the release or the Docker is wrong, and not a setting: **stop, roll back (§8), and tell the owner**                                                         |

### 6.2 Logs

```bash
docker compose ps                                  # state and health
docker compose logs --no-color --tail 100 api      # or worker, scanner, egress, web, valkey, postgres, migrate
docker compose logs --since 1h --no-color worker scanner
docker compose logs --no-color egress | grep '"allow":false'    # the addresses the proxy refused, and why
docker stats --no-stream                           # memory against the caps
```

Every container keeps three files of 10 MB (`json-file`), and no more. **The logs hold no visitor's address
or header**: Caddy writes no access log and filters what its error log takes, and the API tells a failure by
its message alone, once in a while. The egress log holds the hosts that the scans asked for, so it is not for
a public issue. What is normal:

| Service    | Says                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`      | `API on port 8787` at the start, and after that almost nothing. A line that names Valkey or PostgreSQL is a store that is away                                                                                    |
| `worker`   | `ARABLYZER_REPORT_RETENTION_DAYS is not set: …` or `Reports and scans older than N days are deleted.`, then `Worker ready`. `Scan <id> could not run: …` is a scan that failed                                    |
| `scanner`  | `Scanner on port 8788`. After each scan that started a browser, `A browser ran in this scan: the scanner ends its process, for a clean one`, and Compose starts it again (its restart count grows, by design). `A scan did not stop when told` is not normal |
| `egress`   | one JSON line per connection, `CANONICAL-PROXY-DECISION`: `"allow":false` is an address refused (private, local, or the server's own), and `port N is refused` a port that is not 80 or 443                       |
| `postgres` | checkpoints, and at every deploy `WARNING: role "arablyzer_app" has not been granted membership in role "arablyzer_migrate"`: that is `migrate`'s `REVOKE` finding nothing to revoke                              |
| `web`      | Caddy's start-up lines, and nothing per request                                                                                                                                                                   |

Valkey holds only the queue, the events and the limits, in memory, and saves nothing: a restart of it loses the
scans that were waiting (the worker's sweep fails them, and their pages are told) and every limit's count. To
look inside it: `infra/README.md`, "The databases".

### 6.3 Stopping and starting

`docker compose stop` (the worker and the scanner have 270 seconds to finish the scan they run),
`docker compose start`, `docker compose restart api`. **Never `docker compose down --volumes`**: it deletes the
database's volume; `down` alone keeps it. After the host restarts, Docker restarts every service: run
`docker compose ps` and `pnpm verify:deploy`, and `docker compose up --detach --wait` if one is not healthy.
**Not tried.**

### 6.4 Deleting a report

A report is deleted by whoever holds the token that its creation gave (`DELETE /api/reports/:id` with
`Authorization: Bearer <token>`; the API keeps only its hash). Where the token is lost and the visitor asks
for the deletion, the operator can delete the row: `docker compose exec -T postgres psql -U arablyzer -d
arablyzer -c "DELETE FROM scans WHERE id = '<id>'"`.

## 7. Backups of PostgreSQL

The database is the only state: `scans`, with each scan's address, its state, its times, its score, its report
as JSON, and the **hash** of its deletion token. It holds no visitor's address or header (BUILD-PLAN §14). A
dump holds the addresses that people scanned, so keep it as private as the server.

```bash
mkdir -p /var/backups/arablyzer && chmod 700 /var/backups/arablyzer
docker compose exec -T postgres pg_dump --username arablyzer --dbname arablyzer --format custom \
  > /var/backups/arablyzer/arablyzer-$(date -u +%Y%m%dT%H%M%SZ).dump
```

**Tried:** 6 KB for three scans, in 0.14 seconds. How often, and how many to keep, are the owner's decision;
the one that matters is before every upgrade (§8). A dump is not a backup until it has been read back, so read
it into a scratch database, and count:

```bash
f=/var/backups/arablyzer/arablyzer-<time>.dump
docker compose exec -T postgres psql -U arablyzer -d postgres -c 'CREATE DATABASE restore_check'
docker compose exec -T postgres pg_restore -U arablyzer -d restore_check --no-owner --no-privileges < "$f"
docker compose exec -T postgres psql -U arablyzer -d restore_check -Atc 'SELECT count(*) FROM scans'
docker compose exec -T postgres psql -U arablyzer -d postgres -c 'DROP DATABASE restore_check'
```

**Restoring** loads the rows into a database that `migrate` has made, so that its tables, its roles and their
rights are as they are meant to be. While it runs, the site's pages are still served and no scan is taken:

```bash
docker compose stop api worker
docker compose exec -T postgres psql -U arablyzer -d arablyzer -c 'TRUNCATE scans'
docker compose exec -T postgres pg_restore -U arablyzer -d arablyzer --data-only --table=scans \
  --single-transaction < "$f"
docker compose start api worker
```

**Tried** on the local stack, with the rows deleted first: the three rows came back, and the API read them (a
report with a body answered 200, a failed scan 404 `{"state":"failed"}`), because the table's rights, which
`migrate` gave, were untouched. On a new volume, start the stack first (§5), so that `migrate` makes the schema,
then stop `api` and `worker` and restore; that case is the same commands, and was not tried apart.

## 8. Rollback and upgrading

Every image is named by its release (`arablyzer/api:<release>`; `compose.staging.yaml`), so the release before
is on the server until it is removed: `docker images arablyzer/api --format '{{.Tag}}\t{{.CreatedSince}}'` lists
them. Migrations only move forward (`packages/store/drizzle`), and the database is not part of an image.

**Upgrading**

```bash
cd /opt/arablyzer
git fetch --tags origin && git log --oneline HEAD..<the new commit>                  # what changes
git diff HEAD <the new commit> --stat -- infra/.env.example packages/store/drizzle   # new settings, new migrations
# 1. Back up the database (§7).   2. Add to infra/.env what .env.example gained.
git checkout <the new commit>
sed -i.bak '/^ARABLYZER_RELEASE=/d' infra/.env && rm infra/.env.bak
echo "ARABLYZER_RELEASE=$(git rev-parse --short=12 HEAD)" >> infra/.env
cd infra && docker compose config --quiet
docker compose up --detach --build --wait --wait-timeout 900
cd .. && pnpm install --frozen-lockfile --filter @arablyzer/infra && pnpm verify:deploy
```

What changed is recreated: on the local stack, `migrate`, the egress proxy, the API, the scanner, the worker and
the site's server were, and PostgreSQL and Valkey were not, so the data stayed. The worker and the scanner wait
for a scan that is running (up to 270 seconds), and the API's event streams end, and their pages reconnect.
The base images are pinned by digest in the Dockerfile and `compose.yaml`, and moved by a change to those files.
An upgrade of the Docker Engine usually restarts the containers, and the first check of `verify:deploy` says it is
still 28 or later. A new major of PostgreSQL is a dump into a new volume, not an upgrade in place: not staging's.

**Rolling back** to the release before. Its images are there, so nothing is built and nothing is fetched.

```bash
docker images arablyzer/api --format '{{.Tag}}\t{{.CreatedSince}}'    # the release before
git checkout <the release before>        # its compose files must be the ones its images ran with
sed -i.bak '/^ARABLYZER_RELEASE=/d' infra/.env && rm infra/.env.bak
echo "ARABLYZER_RELEASE=<the release before>" >> infra/.env
cd infra && docker compose up --detach --no-build --wait --wait-timeout 900
cd .. && pnpm verify:deploy
```

**Tried:** two releases built, the second deployed, and the first started again in 31 seconds, the site's server
showing the first's Caddyfile and the data as it was. A release whose images are not there stops at `No such
image: arablyzer/egress:<release>` and **leaves the running containers as they are**. Without
`ARABLYZER_RELEASE`, `config` fails naming it.

**The one rollback that needs a decision** is across a migration. So far `0000` made the table and `0001` and
`0002` each added a nullable column, which an earlier release ignores, and going back is safe. If the release
being left added one that the release before cannot read, restore the backup taken before the upgrade (§7): the
rows, into a database that the earlier release's `migrate` has made.

Remove a release that is no longer wanted with
`docker image rm arablyzer/{web,api,worker,scanner,egress}:<release>`.

## 9. Acceptance: M2.5

The Phase 2 design accepts the phase when **a whole scan works on staging, the self-audit passes at 100%, and
the pages take 100 in Lighthouse**. Each item below says how it is checked. `$site` is `ARABLYZER_SITE`, and
`auth` is the service token's two headers:

```bash
site=https://staging.example.com
auth=(-H "CF-Access-Client-Id: $CF_ID" -H "CF-Access-Client-Secret: $CF_SECRET")
```

`pnpm smoke --url $site` (§0.5) runs the HTTP parts of C1 (the pages, not the login), D1 to D4 and D6, G1, H1 to H3 and
the headers of I1 and I2, for the pages it names; the rest below is done by hand, and the whole list is signed off by
the owner.

### A. The release

- [ ] **A1.** The owner has named the commit and approved the deploy (issue #26).
- [ ] **A2.** CI is green on that commit in every job **but `arabic-copy`**, which stays red until the owner has
      read the Arabic copy (design decision 7): `checks` (Node 22 and 24), `audit`, `browsers`, `lighthouse`,
      `services`, `image`, `stack`. `gh run list --commit <sha> --repo Shahoom/arablyzer` lists them. They carry
      the self-audit of every page, the schema check, and Lighthouse on the pages, whose own gate is 100 for
      accessibility, best practices and SEO, and for performance at least 95 on a phone and 100 on a desktop.

### B. The stack

- [ ] **B1.** `docker compose ps`: every service `running`, and `healthy` where it has a check; `migrate` exited 0.
- [ ] **B2.** `pnpm verify:deploy`: **17 checks, 0 failed, 0 warnings.** The two warnings are the host's: its
      firewall (§2.2) and the loopback (`ARABLYZER_BIND`).
- [ ] **B3.** After the scans of E and F, `docker stats --no-stream` shows every container below its cap (§2.3),
      and `docker inspect -f '{{.Name}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' $(docker compose ps -q)`
      shows none OOM-killed. The scanner's restarts are by design: one for each scan that started a browser.

### C. Access, and the edge

- [ ] **C1.** From a machine that is not logged in, `curl -s -o /dev/null -w '%{http_code}\n' $site/`, and the same for
      `$site/api/reports/AbCdEfGhIjKlMnOpQrSt_-` and `$site/robots.txt`: **not 200**, but a redirect to Cloudflare's
      login or a refusal, and a body with none of Arablyzer's pages (`lang="ar"`).
- [ ] **C2.** **The origin is not reachable directly.** From a machine that is neither the server nor Cloudflare,
      `curl -sI --max-time 10 --resolve staging.example.com:443:<the server's address> https://staging.example.com/`,
      and the same on port 80 with `http://`: refused or timed out. An answer from Arablyzer is a failure of §3.4.
- [ ] **C3.** With the token, `curl -s "${auth[@]}" -o /dev/null -w '%{http_code}\n' $site/` is 200.
- [ ] **C4.** The owner logs in with a browser, and the pages below work in it, the scan form's requests among them.
- [ ] **C5.** **The visitors are told apart.** From one network, start scans of different public sites, one each,
      until the page says that the limit is reached and when to try again (the owner's connection limit: if it is
      large, lower `ARABLYZER_LIMIT_CONNECTION_SCANS` for this test, and put it back). Then, from another network (a
      phone on mobile data), one scan of another site must start. Different sites, so that the per-site limit
      answers for no one, and not near 00:00 UTC, when the buckets start afresh. This is the test that the
      addresses in `X-Forwarded-For` are the visitors' (§3.5).

### D. The pages

In the browser, and with the token, `curl -s "${auth[@]}" $site<path>` for the status and the `lang`:

- [ ] **D1.** `/` (`lang="ar" dir="rtl"`) and `/en/` (`lang="en"`). The scan form is there, and Turnstile's widget loads.
- [ ] **D2.** `/tools`, `/en/tools`, a tool page (`/tools/rtl-check`) and its English (`/en/tools/rtl-check`).
- [ ] **D3.** `/rules` and one rule's page, `/fix` and one guide, `/glossary` and one term, `/methodology` and `/bot`,
      each in both languages.
- [ ] **D4.** An address with no page answers **404 with the site's 404 page** of its language, and
      `X-Robots-Tag: noindex, nofollow`: `/no-such-page` and `/en/no-such-page`.
- [ ] **D5.** The browser's console shows **no blocked script or request** (the Content-Security-Policy has no
      exception to spare), and the IBM Plex Sans Arabic text draws.
- [ ] **D6.** `/tools/rtl-check/` (with a slash) goes to `/tools/rtl-check` with 308, the query along.

### E. A free scan, end to end

The widget passes on its own (managed mode). Scan **a public page of a site that the owner names**, or
`https://example.com/` for a check that proves only the way out. Staging's own address is behind Access, and a
scan of it sees the login.

- [ ] **E1.** Paste the address on `/`. `/r/<id>` opens **at once** and shows the steps **as they happen**, not all at
      the end (the events pass Cloudflare and the host's proxy unbuffered): the fetch, `robots.txt`, each of the
      three browsers, the rules, the score.
- [ ] **E2.** It ends with the report: the score, the notices, the three engines' results. Note how long it took (the
      plan's budget is 120 seconds).
- [ ] **E3.** Reload the report: the same report, from PostgreSQL. The same in English (`/en/`, `/en/r/<id>`).
- [ ] **E4.** The scanner restarted once (`docker compose ps scanner`), and takes the next scan.
- [ ] **E5.** **The honest states** that the design lists. An address that is not scanned: `http://169.254.169.254/`, and
      `http://<the server's public address>/` (both refused, with the page's words for it; the second proves
      `ARABLYZER_DENY_CIDRS`). The limit reached (C5). And where a site at hand does it, a site that blocks the
      scan, and a partial report.
- [ ] **E6.** Where a name of the owner's points at the server (a DNS-only record such as `ssrf-test.example.com`, made
      for this and then removed), a scan of it is refused: the API resolves names, and the address is the server's own.

### F. A tool scan

- [ ] **F1.** On `/tools/rtl-check`, scan a page. The result has **that tool's rules alone** (`ar-html-lang` and
      `rtl-html-dir`), and no browser started: no step for one, and the scanner's restart count did not move.
- [ ] **F2.** The scan says so: `curl -s "${auth[@]}" $site/api/scans/<id>` has `"tool":"rtl-check"`.

### G. The report page

- [ ] **G1.** `/r/<id>` and `/en/r/<id>`: `curl -sI "${auth[@]}" $site/r/<id>` has `X-Robots-Tag: noindex, nofollow`, and
      the page's `<head>` has `<meta name="robots" content="noindex, nofollow">`.
- [ ] **G2.** The report is deleted by its token, which the page does not show yet: it is in the answer of
      `POST /api/scans` (the browser's network panel: `id` and `deleteToken`). `curl -s -o /dev/null -w '%{http_code}\n'
      -X DELETE "${auth[@]}" -H "Authorization: Bearer <token>" $site/api/reports/<id>` is **204**, and the report
      then answers 404.
- [ ] **G3.** No visitor's data is kept: `docker compose exec -T postgres psql -U arablyzer -d arablyzer -c '\d scans'`
      has no column for an address or a header, and `docker compose logs web api` shows none.
- [ ] **G4.** `ARABLYZER_REPORT_RETENTION_DAYS` is what the owner said: the worker's log says it at its start
      (`Reports and scans older than N days are deleted.`, or that they are kept).

### H. robots.txt, sitemaps and images

- [ ] **H1.** `/robots.txt` is 200, `text/plain`, and says `Disallow: /api/` and `Sitemap: $site/sitemap.xml`.
- [ ] **H2.** `/sitemap.xml` and each sitemap it names are 200 XML, and **every address in them is on `$site`**:

```bash
for map in $(curl -s "${auth[@]}" $site/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//'); do
  route=${map#"$site"}
  printf '%s %s ' "$route" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "${auth[@]}" "$site$route")"
  echo "off-site: $(curl -s "${auth[@]}" "$site$route" | grep -o '<loc>[^<]*' | sed 's/<loc>//' | grep -vc "^$site")"
done      # on the local stack: five sitemaps, each 200 text/xml, off-site 0
```

- [ ] **H3.** A page's image, `/og/tools/rtl-check.png` and `/og/en/index.png`: 200, `image/png`.

### I. Headers, and the server's own three rules

- [ ] **I1.** **At the origin**, on the server, `curl -sI http://127.0.0.1:8080/` (the port of `ARABLYZER_PORT`) has
      `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
      `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy`, `Cross-Origin-Opener-Policy: same-origin`
      and `Permissions-Policy`, and **no `Server`**. The same on a 404. **Tried:** all seven, and no `Server`.
- [ ] **I2.** Through Cloudflare, with the token: the same headers arrive (`server: cloudflare` is Cloudflare's own).
- [ ] **I3.** The three rules that judge the server, which CI's self-scan leaves out because staging is where they are
      answered (M2.1 plan §3). **`https-missing`:** `curl -sI http://staging.example.com/` goes to HTTPS, and not to a
      page. **`hsts-missing`:** I2 shows a `max-age` above zero. **`tls-expiring`:**
      `echo | openssl s_client -connect staging.example.com:443 -servername staging.example.com 2>/dev/null | openssl x509 -noout -dates`
      leaves more than 14 days, or a third of the certificate's life where that is shorter. Arablyzer cannot scan
      the staging site itself for these: its scan sees Access's login.

### J. Isolation

- [ ] **J1.** `pnpm verify:deploy` (B2), on the server, **after** the scans above.
- [ ] **J2.** After it, `docker compose logs --no-color egress | grep -c '"allow":false'` is above zero: the proxy
      refused the private, local and metadata addresses and the server's own that the check tried, and said why.

### K. Sign-off

- [ ] **K1.** The owner has read the results, and says so in issue #26. Then: revoke the service token, and decide
      whether staging stays up.

## 10. The load test

`pnpm load:stack` sends **a stack on this machine** what visitors send: the pages, scans from many visitors, the
reads of a finished scan, and one visitor that asks for more than its limits allow (`infra/load/README.md` has
the options and the guards). It is not for staging. A stack that is deployed refuses the test Turnstile token, so
it runs against the stack that `compose.e2e.yaml` makes, on the operator's own machine. **It refuses any target
that is not loopback unless `--target` names it, and it never runs in CI.** One consequence is worth knowing:
**the e2e stack's API asks Cloudflare's Turnstile check for each scan request that passes the visitor's throttle**,
with the public test secret and through the egress proxy, as the stack's own test does. `--dry-run` says beforehand
how many at most.

```bash
pnpm load:stack --dry-run                              # what it would send
pnpm load:stack --full 1 --json load.json              # what the numbers below are
```

**Measured on this Mac, on 2026-09-30, against a stack of its own** (project `arablyzer-load`, port 18080, beside
an idle stack of the owner's): Apple silicon (aarch64), Colima's Docker VM of 4 CPUs and 6 GiB, Docker Engine
29.5.2, Compose 5.1.4, Node 22.22.0, the code of `sec/hardening` at 024c8ad, which this branch is based on.
Limits: connection 3 per hour, network 100, attempts 40, host 60, queue 50, in flight 2. 1,442 requests, 8 at
once, one run, of which 17 asked to start a scan:

```
series                                          n  p50 ms  p95 ms  max ms   per s  statuses     errors
GET /                                         300    5.74    48.0    56.4   755.2  200×300           0
GET /tools/rtl-check                          300    2.88    47.6    53.6  1418.8  200×300           0
POST /api/scans, from another origin          100    1.44    14.2    17.5  2816.3  400×100           0
POST /api/scans, an internal host name        100    1.80    24.7    25.4  1901.6  422×100           0
POST /api/scans, one visitor each               6     261     305     305     6.3  202×6             0
events of a tool scan, to its end               6     154     289     289     6.3  200×6             0
GET /api/scans/:id                            200    3.16    7.74    20.9  2033.5  200×200           0
GET /api/scans/:id/events, finished           200    3.72    6.88    30.4  1636.5  200×200           0
GET /api/reports/:id                          200    3.15    7.33    31.0  1791.2  200×200           0
POST /api/scans, one visitor past its limits   10     196     210     210    12.7  202×2 429×8       0
POST /api/scans, a whole scan                   1     193     193     193     0.2  202×1             0
events of a whole scan, to its end              1    5906    5906    5906     0.2  200×1             0
DELETE /api/reports/:id                         9    10.7    13.3    13.3   657.0  204×9             0

Limits: one visitor asked for 10 scans and had 2 (202).
  429 with a Retry-After (a window is used up): 7, to wait up to 1200 s
  429 with none (scans queued or running, at the visitor's cap): 1

0 errors. As designed.
```

**Reading it.**

- **0 errors, and the limits refused as designed.** The visitor that asked for ten scans had two. The third was
  refused by its cap of two scans queued or running (a 429 with no `Retry-After`), which still took one of its
  three scans of the hour, so the seven after it were refused with a `Retry-After` of up to 1200 seconds (an hour
  over three scans is 20 minutes for each). Every refusal said `rate-limited`. The refusals that need no
  visitor (another origin, an internal name) cost the API 1 to 2 ms at the median.
- **The pages' 95th percentile, 48 ms against a median of 3 to 6, matches the site server's CPU cap.** It has half a
  CPU (`cpus: 0.5`) and compresses each 116 KB page as it sends it, and its cgroup counted 7 throttled periods of
  242 over the runs. Nothing of a network is in it: the requests were from the same machine.
- **`POST /api/scans` took 190 to 260 ms**, against 1 to 4 ms for the refusals and the reads. By elimination, what
  is left is the round trip to Cloudflare's Turnstile check, which depends on the network and is not the stack's
  (it was not timed on its own).
- **A whole scan of golden site 04, in the three browsers, took 5.6 to 6.7 seconds** (three runs: 6.7, 5.9, 5.6), and
  the scanner's memory peaked at 577.7 MiB of its 1200. That page is one small file served inside the stack: it is
  about the fastest a scan gets, and says nothing of a real site's, whose scan runs up to the plan's budget. These
  numbers are a baseline to compare a change against on the same machine, and not capacity.

The first draft of the test also found what the API's order is: a private address written as an address
(`http://10.0.0.1/`) is refused in the name lookup, **after** Turnstile and the visitor's limits, so each such request
costs an attempt, a scan of the visitor's window, and a call to Turnstile. An internal name (`http://localhost/`) and
another origin are refused before any of them, and those are what the test sends.

## 11. When it goes wrong

| What you see                                                        | Look at                                                                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose config` says a variable is missing                  | `infra/.env`: the message names it. `ARABLYZER_RELEASE` too (§5)                                                                                                                  |
| `migrate` exits 1, "password authentication failed"                 | `POSTGRES_PASSWORD` differs from the one the volume was made with (§4): `ALTER ROLE arablyzer PASSWORD '…'` in the database, or an empty volume if there is nothing to keep      |
| The API or the worker exits at its start, naming a variable         | it names the variable and never the value: 32 characters or more, hex, and no `/` in what goes into a URL                                                                          |
| Every scan is refused, 403 `turnstile-failed`                       | the secret and the site key are of one widget; the widget names the staging hostname; `ARABLYZER_SITE` is that origin exactly; the server reaches `challenges.cloudflare.com` (§2.1) |
| Every scan is refused, 400 `bad-request`                            | the page's origin is not `ARABLYZER_SITE` exactly: a `www.`, `http:` in place of `https:`, a port                                                                                  |
| Everyone is refused at once, 429                                    | one address for every visitor: `ARABLYZER_TRUSTED_PROXIES` (§3.5), and C5                                                                                                          |
| Every scan is 503 `unavailable`                                     | the API has no address for the visitor (the request has no proxy secret, or the header is not an address), or a store is away: `docker compose logs api valkey postgres`           |
| A scan stays `queued`                                               | the scanner is starting again after a browser scan, and takes the next one when it is healthy: `docker compose ps scanner`. Or it is stuck: its log says `A scan did not stop when told`, and it restarts itself |
| The progress page shows nothing until the end                       | the host's proxy buffers `text/event-stream` (§2.4, 2)                                                                                                                             |
| A page loads, and the scan form does nothing                        | the browser's console: a blocked script means that Cloudflare rewrote or added one (§3.3)                                                                                          |
| `pnpm verify:deploy`: "No container carries the label…"             | the project is not named `arablyzer`: `docker compose ls`, and `--project <name>`                                                                                                  |
| Access loops, or refuses the owner                                  | the policy's emails, the session's length, and that the hostname is the application's exactly                                                                                      |

## 12. What this kit does not do

- It has **deployed nothing** and contacted no server or account. The load test and the local stack ran on the
  Mac alone, except that the stack's API asked Cloudflare's public Turnstile check, with the test secret, for the
  scan requests it took.
- The Cloudflare setup (§3), the host's proxy (§2.4), the firewall rule on the server (§2.2) and Docker's address
  pools (§2.1) are **written, not tried**: they need the server and the accounts.
- **The first build's time and disk** on the server are not measured; §2.3 has what was measured on the Mac.
- **There is no monitoring or alert**: nothing tells anyone that a container has stopped. `docker compose ps` and
  `pnpm verify:deploy` are what there is; an uptime check would need a service token of its own.
- **Backups are commands, not a schedule** (§7): how often, and where to, are the owner's.
- **No search engine hears of staging**: no IndexNow, no Search Console (Phase 3), and Access is in the way.
