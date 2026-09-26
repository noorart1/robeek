#!/usr/bin/env bash
# Local, offline copy of the app for testing before a deploy. Run from the
# repo root in Git Bash:
#
#   scripts/local.sh db               start MariaDB (leave it running)
#   scripts/local.sh sync user@host   copy the newest production backup
#                                     here and restore it (needs network)
#   npm run dev                       the app, at http://localhost:3000
#
# MARIADB_DIR        portable MariaDB 10.11 (same as production), default
#                    ../mariadb, with its config in data/my.ini
# LOCAL_BACKUP_DIR   where synced backups are kept, default ../local-backups
#                    (outside the repo: they hold children's personal data)
# DEPLOY_KEY         SSH key, default ~/.ssh/robeek_deploy
#
# `sync` refuses to run unless .env points at a database on this machine.

set -eo pipefail

mariadb=${MARIADB_DIR:-../mariadb}
backups=${LOCAL_BACKUP_DIR:-../local-backups}
key=${DEPLOY_KEY:-$HOME/.ssh/robeek_deploy}

case "$1" in
  db)
    exec "$mariadb/bin/mariadbd.exe" --defaults-file="$mariadb/data/my.ini" --console
    ;;

  sync)
    target=${2:?usage: scripts/local.sh sync user@host}

    if ! grep -qE '^DATABASE_URL="?mysql://[^ ]*@(127\.0\.0\.1|localhost)(:[0-9]+)?/' .env; then
      echo ".env does not point at a local database; refusing to overwrite it." >&2
      exit 1
    fi

    mkdir -p "$backups"

    names=$(ssh -i "$key" -o BatchMode=yes "$target" \
      'cd ~/backups/school-app && ls -t db-*.sql.gz | head -1 && ls -t photos-*.tar.gz | head -1')

    for name in $names; do
      [ -f "$backups/$name" ] || scp -q -i "$key" "$target:backups/school-app/$name" "$backups/"
      echo "restoring $name"
      BACKUP_DIR="$backups" \
      MYSQL="$mariadb/bin/mariadb.exe" \
      MYSQLDUMP="$mariadb/bin/mariadb-dump.exe" \
        node -e '
          require("dotenv").config();
          require("./lib/backup").restore(process.argv[1])
            .then((safety) => console.log(`  done; previous local state saved as ${safety}`))
            .catch((error) => { console.error(error.message); process.exit(1); });
        ' "$name"
    done
    ;;

  *)
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
