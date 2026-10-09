#!/usr/bin/env bash
# Starts (or updates) the whole stack on a single Linux VPS behind Cloudflare, with the TLS proxy
# of compose.vps.yaml: web, api, worker, scanner, egress proxy, Valkey, PostgreSQL, migrate, tls.
# docs/deploy/staging.md, section 0.
#
#   ./infra/deploy-staging.sh                 # build the images for this commit and start the stack
#   ./infra/deploy-staging.sh --check         # the same, then pnpm verify:deploy and pnpm smoke
#   ./infra/deploy-staging.sh --rollback REL  # start release REL again, from the images on this server
#
# It reads infra/.env (cp infra/.env.example infra/.env, then fill it in), and keeps three lines
# there so that every later `docker compose` run in infra/ sees the same stack: COMPOSE_FILE,
# ARABLYZER_RELEASE and ARABLYZER_HOST. It prints no secret.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

die() { echo "deploy-staging: $*" >&2; exit 1; }

mode=up; check=0; release=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) check=1 ;;
    --rollback) mode=rollback; release="${2:-}"; [ -n "$release" ] || die "--rollback needs a release (the 12 characters of a commit)"; shift ;;
    -h|--help) sed -n 2,12p "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option $1 (see --help)" ;;
  esac
  shift
done

command -v docker >/dev/null || die "Docker is not installed"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is not installed"
engine="$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
[ -n "$engine" ] || die "Docker cannot be asked: is the daemon running, and is this user in the docker group?"
[ "${engine%%.*}" -ge 28 ] 2>/dev/null || die "Docker Engine $engine is older than 28: the internal networks would give the host an address (infra/README.md, Requirements)"

[ -f .env ] || die "infra/.env is missing: cp infra/.env.example infra/.env, then fill it in"
mode_bits="$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env)"
[ "$mode_bits" = "600" ] || { chmod 600 .env; echo "infra/.env was mode $mode_bits; now 600"; }

# Reads one setting from .env without sourcing it (a value may hold characters a shell would act on).
getenv() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]\$//" || true; }
# Sets one line of .env, replacing an earlier one; the file keeps its mode.
setenv() {
  if grep -qE "^$1=" .env; then
    awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' .env > .env.tmp && cat .env.tmp > .env && rm -f .env.tmp
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

site="$(getenv ARABLYZER_SITE)"
case "$site" in https://*) ;; *) die "ARABLYZER_SITE in infra/.env must be the https:// address, e.g. https://staging.arablyzer.com" ;; esac
host="${site#https://}"; host="${host%%/*}"; host="${host%%:*}"
[ -f certs/origin.pem ] && [ -f certs/origin.key ] || die "infra/certs/origin.pem and origin.key are missing: a Cloudflare Origin CA certificate for $host (docs/deploy/staging.md, section 3.3)"
chmod 600 certs/origin.key 2>/dev/null || true
# The proxy runs as an unprivileged user; it must be able to read the key.
chmod 644 certs/origin.pem certs/origin.key

if [ "$mode" = rollback ]; then
  for service in web api worker scanner egress; do
    docker image inspect "arablyzer/$service:$release" >/dev/null 2>&1 \
      || die "the image arablyzer/$service:$release is not on this server: docker image ls 'arablyzer/*' lists the releases kept"
  done
  build=--no-build
else
  release="$(git rev-parse --short=12 HEAD)"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || echo "warning: the working tree has uncommitted changes; the images are named for $release all the same"
  build=--build
fi

setenv COMPOSE_FILE compose.yaml:compose.staging.yaml:compose.vps.yaml
setenv ARABLYZER_RELEASE "$release"
setenv ARABLYZER_HOST "$host"

echo "Release $release for $host (Docker Engine $engine)"
docker compose config --quiet || die "the settings are not complete (the message above names the variable)"
docker compose up --detach $build --wait --remove-orphans
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}'

echo
echo "Up. Cloudflare must point $host at this server (proxied) with SSL/TLS mode Full (strict)."
if [ "$check" = 1 ]; then
  command -v pnpm >/dev/null || die "--check needs pnpm (corepack enable; pnpm install --frozen-lockfile --filter @arablyzer/infra)"
  cd ..
  pnpm verify:deploy
  pnpm smoke --url "$site"
else
  echo "Then: pnpm verify:deploy && pnpm smoke --url $site   (or run this again with --check)"
fi
