#!/usr/bin/env bash
# The outside view of arablyzer.com, every 15 minutes (.github/workflows/uptime.yml): the site, the
# API, and the TLS certificate. Writes two files into $UPTIME_OUT: `failed` (the names of the
# checks that fail, comma-separated, empty when all is well) and `report.md` (one line per check,
# for the issue and the run summary). Needs curl and openssl. Always exits 0 unless it cannot run.
#
# There is no /health route in the API (its container's own check is a TCP connect). The probe
# asks for a scan that cannot exist: the API looks the id up in PostgreSQL and answers 404 with a
# JSON body, which Caddy's HTML 404 page, a Cloudflare error page and a 5xx are not. So a pass
# means: Cloudflare, Caddy, the API and the database all answered.
set -uo pipefail

SITE_URL=${SITE_URL:-https://arablyzer.com/}
API_URL=${API_URL:-https://arablyzer.com/api/scans/uptime-probe}
TLS_HOST=${TLS_HOST:-arablyzer.com}
TLS_WARN_DAYS=${TLS_WARN_DAYS:-14}
OUT=${UPTIME_OUT:-uptime-out}
ATTEMPTS=3 # a blip is not an outage: a check fails only when all attempts do
UA='ArablyzerUptime/1.0 (+https://github.com/Shahoom/arablyzer)'

mkdir -p "$OUT"
failed=()
: >"$OUT/report.md"
line() { printf '%s\n' "$1" | tee -a "$OUT/report.md"; }

# probe NAME URL WANTED_STATUS [BODY_FRAGMENT]
probe() {
  local name=$1 url=$2 want=$3 fragment=${4:-} code='000' try
  for ((try = 1; try <= ATTEMPTS; try++)); do
    code=$(curl -sS -m 10 -A "$UA" -o "$OUT/body" -w '%{http_code}' "$url" 2>"$OUT/curl-error") || code='000'
    if [[ $code == "$want" ]] && { [[ -z $fragment ]] || grep -q -- "$fragment" "$OUT/body"; }; then
      line "- ok: $name answered $code ($url)"
      return
    fi
    ((try < ATTEMPTS)) && sleep 5
  done
  local why="answered $code, wanted $want"
  [[ $code == "$want" ]] && why="answered $code but the body lacks \`$fragment\`"
  [[ $code == '000' ]] && why="no answer: $(tr '\n' ' ' <"$OUT/curl-error" | cut -c1-160)"
  line "- FAILING: $name $why ($url)"
  failed+=("$name")
}

epoch_of() { date -u -d "$1" +%s 2>/dev/null || date -u -j -f '%b %e %T %Y %Z' "$1" +%s; }

tls_check() {
  local cert end left limit=''
  command -v timeout >/dev/null && limit='timeout 15' # absent on a Mac, present on the runner
  cert=$($limit openssl s_client -connect "$TLS_HOST:443" -servername "$TLS_HOST" </dev/null 2>/dev/null |
    openssl x509 2>/dev/null)
  if [[ -z $cert ]]; then
    line "- FAILING: tls could not read the certificate of $TLS_HOST:443"
    failed+=(tls)
    return
  fi
  end=$(openssl x509 -noout -enddate <<<"$cert" | cut -d= -f2)
  left=$((($(epoch_of "$end") - $(date -u +%s)) / 86400))
  if ((left < TLS_WARN_DAYS)); then
    line "- FAILING: tls the certificate of $TLS_HOST expires $end ($left days left, warning under $TLS_WARN_DAYS)"
    failed+=(tls)
  else
    line "- ok: tls the certificate of $TLS_HOST expires $end ($left days left)"
  fi
}

probe site "$SITE_URL" 200
probe api "$API_URL" 404 '"error":"not-found"'
tls_check

(IFS=,; printf '%s' "${failed[*]:-}" >"$OUT/failed")
echo "failed: ${failed[*]:-none}"
