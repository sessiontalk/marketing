#!/bin/sh
# /usr/local/bin/crm-worker (root:root 0755). Called by /etc/cron.d/marketing-crm.
# Usage: crm-worker sequences|trial-nurture|nurture-health
# Reads CRON_SECRET from /etc/marketing-crm/cron.env (root:crm 0640) and calls the
# local app with the same GET + "Authorization: Bearer $CRON_SECRET" that Vercel
# Cron used. The secret is passed to curl on stdin (--config -), so it never
# appears in argv / ps, and it is never echoed or logged.
set -eu

case "${1:-}" in
  sequences|trial-nurture|nurture-health) job="$1" ;;
  *) echo "usage: crm-worker sequences|trial-nurture|nurture-health" >&2; exit 2 ;;
esac

ENV_FILE=/etc/marketing-crm/cron.env
if [ ! -r "$ENV_FILE" ]; then
  logger -t crm-worker "job=$job error=cron_env_unreadable"
  exit 1
fi
CRON_SECRET=$(sed -n 's/^CRON_SECRET=//p' "$ENV_FILE" | head -n 1)
if [ -z "$CRON_SECRET" ]; then
  logger -t crm-worker "job=$job error=cron_secret_unset"
  exit 1
fi

# flock -n: skip this run if the previous one for the same job is still going.
exec 9>"/run/lock/crm-worker-$job.lock"
if ! flock -n 9; then
  logger -t crm-worker "job=$job skipped=previous_run_active"
  exit 0
fi

status=$(printf 'header = "Authorization: Bearer %s"\n' "${CRON_SECRET}" \
  | curl --config - -sS -m 110 -o /dev/null -w '%{http_code}' \
      "http://127.0.0.1:3000/api/worker/$job" 2>/dev/null) || true
logger -t crm-worker "job=$job http=${status:-000}"
[ "${status:-000}" = "200" ]
