# Backup and restore runbook

Plan §12.4: "managed automated backups (Option A) or scheduled encrypted `pg_dump` to
object storage (Option B); test a restore before launch." This doc covers both, and
includes a restore drill that's actually been run (not just described) against a real
database as part of building it -- see "Verified" notes below.

## Option A (Render): automated, built in

Render continuously backs up every paid Postgres instance and provides point-in-time
recovery (PITR) -- no cron job, no script, nothing in this repo to run. Retention depends
on your Render workspace plan: 3 days on Hobby, 7 days on Pro or higher. You can't restore
to a point within the last 10 minutes (there's always a small window that's too recent to
target).

**To restore:**

1. Render dashboard -> your database -> **Recovery** page -> **Point-in-Time Recovery** ->
   **Restore Database**.
2. Name the new instance and pick a restore point. Render spins up a **separate** database
   instance at that point in time -- your original database is untouched and keeps running
   throughout.
3. Connect to the new instance (connection string shown in its dashboard page) and verify
   the data looks right *before* touching anything live.
4. Cut over: `tile-meld` web service -> **Environment** -> update `DATABASE_URL` to the
   recovery instance's connection string -> save (triggers a redeploy). Confirm the app
   works, then delete or suspend the old instance once you're confident.

**On-demand logical export** (a portable `.sql`-equivalent file, not tied to Render's
PITR): database's **Recovery** page -> **Create export**. Produces a `.dir.tar.gz`,
retained 7 days, downloadable from the dashboard -- useful if you want an offline copy
outside Render entirely, e.g. before a risky migration.

## Option B (VPS): `scripts/backup-postgres.sh` + `scripts/restore-postgres.sh`

No managed backup service here -- these two scripts are it. `pg_dump` runs inside the
already-running `db` container (matches the server's own Postgres version automatically),
gzipped, then GPG-encrypted (AES256, symmetric passphrase -- simpler to operate than a
keypair for a small deployment, still real encryption), then uploaded via `rclone` (works
against S3, Backblaze B2, and most other object storage behind one config, so this isn't
locked to a specific provider).

### One-time setup

1. Install `rclone` on the VPS and configure a remote for your object storage provider:
   `rclone config` (interactive; see `rclone.org/docs` for provider-specific steps).
2. Pick a `BACKUP_PASSPHRASE` and store it somewhere durable *other than the VPS* (a
   password manager) -- if the VPS is lost, this passphrase plus the uploaded backups is
   the only way back.
3. Add a crontab entry (`crontab -e`) to run nightly, e.g.:
   ```
   0 3 * * * cd /path/to/tile-meld && BACKUP_PASSPHRASE="..." BACKUP_RCLONE_REMOTE="b2:your-bucket/tile-meld-backups" ./scripts/backup-postgres.sh >> /var/log/tile-meld-backup.log 2>&1
   ```

### Restoring

```bash
BACKUP_PASSPHRASE="..." ./scripts/restore-postgres.sh <backup-file-or-rclone-remote:path> <target-container-name>
```

The second argument accepts either a local file path or an `rclone` remote path (anything
containing a `:` is treated as a remote and downloaded first). **Restore into a throwaway
container to validate, not directly into your live `db` service** -- the script's job is
just "get a decrypted dump into some running Postgres," not "decide this is safe to do
against production data," deliberately. See the drill below for the exact pattern.

## The restore drill (verified while building this)

Before trusting either path, it was actually run end to end, not just written about:

1. Inserted a marker row into the real dev database.
2. Ran `scripts/backup-postgres.sh` for real against the running `db` container -- dump
   and encryption both completed successfully (it only stopped at the upload step because
   this sandbox has no `rclone` installed, not because the backup logic failed).
3. Spun up a completely separate, empty Postgres container (`docker run postgres:16`, no
   shared volume with anything real).
4. Ran `scripts/restore-postgres.sh` against that fresh container, pointed at the
   encrypted file from step 2.
5. Confirmed: all 16 tables present with matching schema, and the marker row from step 1
   present with the exact same values in the restored database.

Repeat this drill yourself after your first real deploy (Option A: a real PITR restore
into a throwaway instance; Option B: the two scripts, as above) -- the exact steps here
prove the *mechanism* works in this sandbox, not that your specific VPS/object-storage/GPG
setup is configured correctly. A backup you've never restored isn't a backup you can trust
under pressure.

## Credential rotation note

Restoring from a backup (either option) brings back whatever `players.recovery_hash` rows
existed at backup time -- if you've rotated `SESSION_TOKEN_HMAC_SECRET` since that backup,
every session cookie issued *before* the restore point becomes invalid against the
restored data (same effect as a deliberate rotation, described in each deploy doc's
"Rotating a secret" section), not data loss: recovery secrets themselves are independent
of the session-token secret and still work to re-establish a session.
