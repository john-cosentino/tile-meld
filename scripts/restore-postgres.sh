#!/usr/bin/env bash
# Restores a backup produced by scripts/backup-postgres.sh. See
# docs/backup-restore.md for the full drill (this script only handles
# getting a decrypted dump back into a database -- deciding *which*
# database, and validating the result, is on you, deliberately: this
# should never be one command away from silently overwriting a live
# database).
#
# Usage: scripts/restore-postgres.sh <path-or-rclone-remote-to-backup.sql.gz.gpg> <target-db-container-or-name>
#
# Required env var:
#   BACKUP_PASSPHRASE -- the same passphrase backup-postgres.sh used to
#                        encrypt this file.
#
# The second argument is passed straight to `docker exec <name> psql`,
# so it can be any running Postgres container -- the real `db` service,
# or (strongly recommended for a real restore, not just a drill) a
# throwaway container spun up just to validate the backup first. See the
# drill in docs/backup-restore.md for exactly that pattern.

set -euo pipefail

: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE (the same one used to encrypt this backup)}"

SOURCE="${1:?Usage: $0 <backup-file-or-rclone-remote-path> <target-container-name>}"
TARGET_CONTAINER="${2:?Usage: $0 <backup-file-or-rclone-remote-path> <target-container-name>}"
POSTGRES_USER="${POSTGRES_USER:-tilemeld}"
POSTGRES_DB="${POSTGRES_DB:-tilemeld}"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

ENCRYPTED_FILE="$WORKDIR/backup.sql.gz.gpg"
if [[ "$SOURCE" == *:* ]]; then
  echo "==> Downloading $SOURCE via rclone..."
  rclone copyto "$SOURCE" "$ENCRYPTED_FILE"
else
  cp "$SOURCE" "$ENCRYPTED_FILE"
fi

echo "==> Decrypting..."
gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --pinentry-mode loopback \
  --decrypt --output "$WORKDIR/backup.sql.gz" "$ENCRYPTED_FILE"

echo "==> Restoring into container '$TARGET_CONTAINER' (this REPLACES the public schema there)..."
docker exec -i "$TARGET_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "drop schema public cascade; create schema public;"
gunzip -c "$WORKDIR/backup.sql.gz" | docker exec -i "$TARGET_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "==> Restore complete."
