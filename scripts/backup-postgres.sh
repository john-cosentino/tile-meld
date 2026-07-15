#!/usr/bin/env bash
# Encrypted Postgres backup for the VPS deployment (Option B -- see
# docs/deploy-vps.md and docs/backup-restore.md). Run via cron; nothing
# here is specific to this being run interactively.
#
# Dumps the database from inside the running `db` container (pg_dump
# always matches the server version that way, no local Postgres client
# tools needed on the VPS itself), gzips it, encrypts it with a
# passphrase (GPG symmetric -- AES256), and uploads it via rclone, which
# works against S3, Backblaze B2, and most other object storage providers
# behind one config (`rclone config`) rather than provider-specific
# tooling.
#
# Required env vars (put these in the crontab entry or a sourced env
# file -- never commit them):
#   BACKUP_PASSPHRASE     -- the GPG symmetric passphrase. Losing this
#                            means losing every backup encrypted with it;
#                            store it in a password manager, not just on
#                            the VPS.
#   BACKUP_RCLONE_REMOTE  -- an rclone remote:path, e.g.
#                            b2:my-bucket/tile-meld-backups
# Optional:
#   COMPOSE_FILE  (default: docker-compose.prod.yml)
#   POSTGRES_USER (default: tilemeld)
#   POSTGRES_DB   (default: tilemeld)

set -euo pipefail

: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE (the GPG symmetric encryption passphrase)}"
: "${BACKUP_RCLONE_REMOTE:?Set BACKUP_RCLONE_REMOTE, e.g. b2:my-bucket/tile-meld-backups}"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
POSTGRES_USER="${POSTGRES_USER:-tilemeld}"
POSTGRES_DB="${POSTGRES_DB:-tilemeld}"

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

DUMP_FILE="$WORKDIR/tile-meld-${TIMESTAMP}.sql.gz"
ENCRYPTED_FILE="${DUMP_FILE}.gpg"

echo "==> Dumping database..."
docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DUMP_FILE"

echo "==> Encrypting..."
gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --pinentry-mode loopback \
  --symmetric --cipher-algo AES256 --output "$ENCRYPTED_FILE" "$DUMP_FILE"

echo "==> Uploading to $BACKUP_RCLONE_REMOTE..."
rclone copy "$ENCRYPTED_FILE" "$BACKUP_RCLONE_REMOTE"

echo "==> Backup complete: $(basename "$ENCRYPTED_FILE")"
