# The load test

`pnpm load:stack` sends a stack that runs on this machine what visitors send it, and prints how long
each kind of answer took (p50, p95, the largest) and how many went wrong. It is a script of Node's own
`fetch`, with no dependency of its own: `load.ts` holds the requests, `measure.ts` the arithmetic and
the guards, `run.ts` the command line. The numbers it gave on the maintainer's Mac are in
[`docs/deploy/staging.md`](../../docs/deploy/staging.md), "The load test".

## What it sends

The stack is the one `compose.e2e.yaml` makes: golden site 04 is served inside it, and Cloudflare's
Turnstile test keys are taken, so a scan request needs no browser to pass.

- **Pages:** `GET /` and `GET /tools/<tool>`, `--pages` times each. Expected: 200.
- **Refusals:** `POST /api/scans` from another origin, and for `http://localhost/`, `--refusals` times
  each. The API refuses both before it counts a visitor or asks Turnstile. Expected: 400 and 422.
- **Scans:** `--visitors` visitors, each with an address of its own, ask for one tool scan (the test
  token, the site's `Origin`) and follow its events to their end. Expected: 202, then the scan's `done`.
- **Reads:** `GET /api/scans/:id`, `GET /api/scans/:id/events` and `GET /api/reports/:id` for the scans
  that finished, `--reads` times each. Expected: 200.
- **Limits:** one visitor asks for `--burst` scans, three at a time. Expected: 202 while it may, then 429.
- **Whole scans:** `--full` scans in the three browsers, one after another; none by default.
- **Clean-up:** `DELETE /api/reports/:id` for every scan the run made, with that scan's own token
  (`--keep` leaves them). Expected: 204.

A visitor is an address in `X-Forwarded-For`, from 198.18.0.0/15, RFC 2544's range for benchmarks,
which is not a private one. The stack's site server believes the header from the addresses in
`ARABLYZER_TRUSTED_PROXIES`, the private ranges when it is empty, and a request from this machine
comes from one of them. If the stack is set otherwise, every visitor is one address, and the run says so.

The table has a row for each kind of request: how many were answered, p50, p95 and the largest time,
answers per second over the row, the statuses, and the errors. An error is a request with no answer (a
refused connection, a timeout) or with a status the stack is not meant to give that request. **A 429
to the visitor that asks for too much is not one: it is what the limits are for.** It is counted in
words below the table: 429 with a `Retry-After` is a window that is used up (scans, requests, or one
site's), and 429 with none is a visitor with as many scans queued or running as it may have. The run is
_as designed_ when there is no error and that visitor was refused at least once. If the stack's limits
are larger than `--burst`, it says so and exits 1.

The time of a request is until its whole answer has been read. `POST /api/scans` includes the stack's
own request to Cloudflare's Turnstile check, so it depends on the network. The time of a scan's events
is from asking for them to the scan's end.

## What leaves the machine

The requests go to the target and nowhere else, and the target must be on this machine: **loopback,
unless `--target` names another address in full.** The default is `http://127.0.0.1:8080`. The address
in `ARABLYZER_STACK_URL`, which the stack's own test reads too, is taken only if it is loopback, and
`--target` is the one way to name a host that is not (the run then says it is not on this machine). The
script refuses to run where `CI` is set unless `--allow-ci` is given, and nothing in CI runs it: CI's
`test:unit` runs the script's own unit tests, which need no stack, and `pnpm test:stack` is another
script. Load only a stack that is yours: `--target` is for one on another machine of yours, started
with `compose.e2e.yaml`. A stack that is deployed refuses the test keys, and its Turnstile check fails
the run's token.

The stack itself makes one request of its own beyond the machine: for each scan request that gets past
the visitor's throttle, its API asks Cloudflare's Turnstile check (`siteverify`, with the public test
secret) through its egress proxy, as the stack's own test does. `--dry-run` says how many requests of a
run can do that: `--visitors` + `--burst` + `--full`, so 16 by default and 17 with one whole scan. A
refused request does not.

## Running it

Start the stack as CI does (`.github/workflows/ci.yml`, "The stack's settings, for this run"):

```bash
docker compose -f infra/compose.yaml -f infra/compose.e2e.yaml up --detach --build --wait --wait-timeout 900
pnpm load:stack
```

CI's limits work. To see the window's refusal (the 429 with a `Retry-After`) among the ten scans that
one visitor asks for, start it with these instead: `ARABLYZER_LIMIT_CONNECTION_SCANS=3` (a burst uses
a visitor's scans up), `ARABLYZER_LIMIT_ATTEMPT_REQUESTS=40` (more than `--burst`), and
`ARABLYZER_LIMIT_HOST_SCANS=60` (every scan is of the one golden page, and a run makes about twenty).

**Beside another stack that was started with `compose.e2e.yaml`** on the same Docker, this one needs a
project, a port and a subnet of its own: the other holds the test network's subnet, 93.184.215.0/24,
which Docker will not give twice. `load/compose.parallel.yaml` moves the network and the golden site's
address to 93.184.216.0/24. Write the stack's settings in a file of its own, `infra/.env.load`, with
`ARABLYZER_PORT=18080` and `ARABLYZER_DENY_CIDRS=93.184.216.61/32,2a01:4f8:c17:1234::1/128` (an address
of the new subnet that nothing holds, and an IPv6 one, as CI's list has), and:

```bash
files="-f infra/compose.yaml -f infra/compose.e2e.yaml -f infra/load/compose.parallel.yaml"
docker compose --project-name arablyzer-load --env-file infra/.env.load $files up --detach --build --wait
pnpm load:stack --target http://127.0.0.1:18080 --scan-url http://93.184.216.50/
docker compose --project-name arablyzer-load --env-file infra/.env.load $files down --volumes
```

On Colima and Docker Desktop, a checkout outside the home directory is not shared with the VM, and
the golden site's bind mount (`compose.e2e.yaml`) is empty there: the scans then find nothing to scan.

| Option               | Default                                            | Is                                                           |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `--target URL`       | `http://127.0.0.1:8080`, or `ARABLYZER_STACK_URL`  | the site's server; loopback unless it is named here          |
| `--origin URL`       | `https://example.com`, or `ARABLYZER_STACK_ORIGIN` | the stack's `ARABLYZER_SITE`, which a scan request comes from |
| `--scan-url URL`     | `http://93.184.215.50/`                            | what the scans ask for: golden site 04 in the stack          |
| `--tool SLUG`        | `rtl-check`                                        | the tool page fetched, and the tool the tool scans run       |
| `--pages N`          | 300                                                | requests for each of the two pages                           |
| `--refusals N`       | 100                                                | requests for each kind of refusal                            |
| `--visitors N`       | 6                                                  | visitors that each start one tool scan                       |
| `--reads N`          | 200                                                | requests for each read of a finished scan                    |
| `--burst N`          | 10                                                 | scans that one visitor asks for, past its limits             |
| `--full N`           | 0                                                  | whole scans, in the three browsers                           |
| `--concurrency N`    | 8                                                  | requests at once for pages, refusals and reads               |
| `--keep`             |                                                    | leave the scans the run made                                 |
| `--json FILE`        |                                                    | write the numbers to a file                                  |
| `--dry-run`          |                                                    | say what would be sent, and send nothing                     |
| `--allow-ci`         |                                                    | run where `CI` is set                                        |

The exit code is 0 when the run was as designed, 1 when it was not, and 2 for a request that the script
did not understand or refused (a target that is not on this machine, `CI`). The script's own tests,
which use no stack, are `pnpm --filter @arablyzer/infra test`.

## What it does not say

Golden site 04 is one small page served inside the stack, so the times of a scan are those of a page
that costs the browsers next to nothing, and its whole scan (three browsers) is about the fastest a
scan gets: a real site takes what it takes, up to the plan's budget. The pages are fetched from the same
machine as the stack, so they say what the server's work costs and nothing of a network in between.
Read the numbers as a baseline to compare a change against, on the same machine, and not as capacity.
