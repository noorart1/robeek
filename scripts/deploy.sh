#!/usr/bin/env bash
# Deploys local `main` to the production host, following "Deployment" in
# CLAUDE.md. Run from the repo root (Git Bash on Windows is fine):
#
#   scripts/deploy.sh user@host [https://public-url]
#
# DEPLOY_KEY  SSH key, default ~/.ssh/robeek_deploy
# NODEVENV    host's Node environment, default ~/nodevenv/school-app/24
#
# Stops without touching the server when the range contains a new
# migration or a dependency change: those need the manual steps in
# CLAUDE.md. A failed build restores the previous build and commit.

set -eo pipefail

target=${1:?usage: scripts/deploy.sh user@host [https://public-url]}
url=$2
key=${DEPLOY_KEY:-$HOME/.ssh/robeek_deploy}
nodevenv=${NODEVENV:-'~/nodevenv/school-app/24'}

remote() { ssh -i "$key" -o BatchMode=yes "$target" "$@"; }

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Uncommitted changes here; commit them first." >&2
  exit 1
fi

new=$(git rev-parse main)
old=$(remote 'cd ~/school-app && git rev-parse HEAD')

if [ "$old" = "$new" ]; then
  echo "Server is already at $(git log --oneline -1 main)."
  exit 0
fi

if ! git merge-base --is-ancestor "$old" main; then
  echo "Server HEAD $old is not an ancestor of main; deploy by hand." >&2
  exit 1
fi

manual=$(git diff --name-only "$old" main -- prisma/manual-migrations/ package.json package-lock.json)
if [ -n "$manual" ]; then
  echo "These need the manual steps in CLAUDE.md (migration / npm install):" >&2
  echo "$manual" >&2
  exit 1
fi

echo "Deploying:"
git log --oneline "$old..main"

bundle=$(mktemp -d)/robeek.bundle
git bundle create "$bundle" "$old..main" 2>/dev/null
scp -q -i "$key" "$bundle" "$target:robeek.bundle"
rm -rf "$(dirname "$bundle")"

remote "NODEVENV=$nodevenv URL=$url bash -s" <<'REMOTE'
set -eo pipefail
cd ~/school-app
source "$NODEVENV/bin/activate"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status -s --untracked-files=no
  echo "The server has local changes; nothing was deployed." >&2
  exit 1
fi

old_head=$(git rev-parse HEAD)
old_build=$(cat .next/BUILD_ID)

node scripts/backup.js
rm -rf .next.rollback
cp -a .next .next.rollback
git pull -q --ff-only ~/robeek.bundle main
rm ~/robeek.bundle

rollback() {
  echo "BUILD FAILED: restoring the previous build and commit." >&2
  rm -rf .next
  mv .next.rollback .next
  git reset -q --hard "$old_head"
  exit 1
}

# `npm run build` runs prisma generate first (package.json).
npm run build || rollback

errors=$(stat -c %s stderr.log)
cloudlinux-selector restart --json --interpreter nodejs --app-root school-app >/dev/null
sleep 10

# The restart leaves the old lsnode processes running beside the new one;
# piled up, their threads hit the account's process limit and the next
# build fails with EAGAIN (CLAUDE.md, Deployment 7). Keep only the newest
# (fewest seconds running) of this app's, after one request has made sure
# the new one is up (when the public URL was given).
[ -z "$URL" ] || curl -fsS -o /dev/null "$URL/login" || true
old_nodes=$(ps -u "$USER" -o pid=,etimes=,args= | awk '$3 == "lsnode:" home "/school-app/" { print $2, $1 }' home="$HOME" | sort -n | tail -n +2 | cut -d' ' -f2)
if [ -n "$old_nodes" ]; then
  echo "Stopping old lsnode processes: $(echo $old_nodes)"
  kill $old_nodes || true
fi

[ "$(cat .next/BUILD_ID)" != "$old_build" ] || { echo "BUILD_ID did not change." >&2; exit 1; }

if [ "$(stat -c %s stderr.log)" != "$errors" ]; then
  echo "stderr.log grew after the restart:" >&2
  tail -c +"$((errors + 1))" stderr.log | tail -20 >&2
  exit 1
fi

echo "Built $(cat .next/BUILD_ID) from $(git log --oneline -1)."
REMOTE

if [ -n "$url" ]; then
  headers=$(curl -fsS -D- -o /dev/null "$url/login")
  curl -fsS "$url/login" | grep -q 'lang="ar"' || { echo "$url/login is not the app's login page." >&2; exit 1; }
  echo "$headers" | grep -qi '^content-security-policy' || { echo "No CSP header on $url/login." >&2; exit 1; }
  echo "$url/login serves the new build."
fi

echo "Done. Once satisfied: ssh $target 'rm -rf ~/school-app/.next.rollback'"
