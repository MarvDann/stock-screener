#!/usr/bin/env bash
# Deploys one commit of stockwatch.cloud. Runs on the server as the
# `stockwatch` user; GitHub Actions pipes it over SSH after the tests pass:
#
#   ssh stockwatch@<host> 'bash -s -- <commit-sha>' < deploy/deploy.sh
#
# Each commit is built in its own releases/<sha> directory, migrated, then
# switched to by swapping the `current` symlink (which nginx and PM2 both
# use). If the new server doesn't come up healthy, `current` goes back to the
# previous release.
set -euo pipefail

SHA="${1:?usage: deploy.sh <commit-sha>}"
REPO="https://github.com/MarvDann/stock-screener.git"
APP_DIR="/var/www/stockwatch.cloud"
ENV_FILE="$HOME/config/.env"
RELEASE="$APP_DIR/releases/$SHA"
KEEP_RELEASES=5
HEALTH_URL="http://127.0.0.1:3001/api/auth-providers"

# Non-interactive shells don't read .bashrc, so load nvm (Node, pnpm, PM2) here.
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

log() { echo "==> $*"; }

log "Fetching $SHA"
rm -rf "$RELEASE"
mkdir -p "$RELEASE"
git -C "$RELEASE" init -q
git -C "$RELEASE" fetch -q --depth 1 "$REPO" "$SHA"
git -C "$RELEASE" checkout -q FETCH_HEAD

log "Installing and building"
cd "$RELEASE"
pnpm install --frozen-lockfile --silent
pnpm --dir client install --frozen-lockfile --silent
pnpm run build
pnpm --dir client run build

log "Migrating the database"
node --env-file="$ENV_FILE" dist/migrate.js

PREVIOUS="$(readlink "$APP_DIR/current" || true)"
switch_to() {
  ln -sfn "$1" "$APP_DIR/current.tmp"
  mv -T "$APP_DIR/current.tmp" "$APP_DIR/current"
  pm2 startOrReload "$1/deploy/ecosystem.config.cjs" --update-env >/dev/null
}

log "Switching to $SHA"
switch_to "$RELEASE"

for _ in $(seq 1 30); do
  if curl -fs -o /dev/null "$HEALTH_URL"; then
    pm2 save >/dev/null
    log "Healthy"
    # Keep the newest few releases (and whatever `current` points at) for rollbacks.
    ls -1dt "$APP_DIR"/releases/*/ | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
      [ "${old%/}" != "$RELEASE" ] && rm -rf "$old"
    done
    log "Deployed $SHA"
    exit 0
  fi
  sleep 1
done

echo "!! $SHA didn't become healthy; recent logs:" >&2
pm2 logs stockwatch --lines 40 --nostream >&2 || true
if [ -n "$PREVIOUS" ]; then
  echo "!! Rolling back to $PREVIOUS" >&2
  switch_to "$PREVIOUS"
fi
exit 1
