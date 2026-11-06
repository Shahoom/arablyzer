#!/usr/bin/env bash
# Turns the result of uptime-check.sh into at most one open issue labelled `uptime`, so GitHub's
# own email reaches the owner: a failure opens it (or, when it is open already, comments on it
# when the set of failing checks changes or six hours pass), and a clean run closes it with a
# comment. Needs gh, GH_TOKEN with issues: write, and GH_REPO. $UPTIME_NOTE (optional) is added to
# the issue, for a run made by hand to test this.
set -euo pipefail

OUT=${UPTIME_OUT:-uptime-out}
NOTE=${UPTIME_NOTE:-}
REMIND_AFTER=$((6 * 3600))
failed=$(<"$OUT/failed")
run_url=${GITHUB_SERVER_URL:-https://github.com}/${GH_REPO}/actions/runs/${GITHUB_RUN_ID:-0}

gh label create uptime --color B60205 --description 'arablyzer.com is down or its certificate is close to expiry' 2>/dev/null || true
number=$(gh issue list --label uptime --state open --json number --jq '.[0].number // empty')

if [[ -z $failed ]]; then
  if [[ -n $number ]]; then
    gh issue comment "$number" --body "Recovered: every check passes again ($(date -u '+%Y-%m-%d %H:%M UTC')). [Run]($run_url)

$(<"$OUT/report.md")"
    gh issue close "$number" --reason completed
    echo "closed #$number"
  else
    echo 'all well, nothing open'
  fi
  exit 0
fi

if [[ $failed == *site* || $failed == *api* ]]; then
  title='Uptime: arablyzer.com is not answering as it should'
else
  title='Uptime: the TLS certificate of arablyzer.com expires soon'
fi
[[ -n $NOTE ]] && title="[test] $title"
marker="<!-- uptime-failed: $failed -->"
body="$marker
${NOTE:+$NOTE

}Checked $(date -u '+%Y-%m-%d %H:%M UTC') from GitHub Actions ([run]($run_url)); every check retried $((3)) times before it counted.

$(<"$OUT/report.md")

This issue closes itself when every check passes again. It is commented on when the failing checks change, and every six hours while it stays open."

if [[ -z $number ]]; then
  gh issue create --label uptime --title "$title" --body "$body"
  exit 0
fi

current=$(gh issue view "$number" --json body,updatedAt)
old_failed=$(jq -r '.body' <<<"$current" | sed -n 's/^<!-- uptime-failed: \(.*\) -->$/\1/p' | head -n1)
age=$(($(date -u +%s) - $(date -u -d "$(jq -r '.updatedAt' <<<"$current")" +%s 2>/dev/null ||
  date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$(jq -r '.updatedAt' <<<"$current")" +%s)))
if [[ $old_failed != "$failed" ]]; then
  gh issue edit "$number" --title "$title" --body "$body"
  gh issue comment "$number" --body "Now failing: ${failed//,/, } (was: ${old_failed//,/, }). [Run]($run_url)

$(<"$OUT/report.md")"
elif ((age >= REMIND_AFTER)); then
  gh issue comment "$number" --body "Still failing: ${failed//,/, }. [Run]($run_url)

$(<"$OUT/report.md")"
else
  echo "#$number is open and nothing changed"
fi
