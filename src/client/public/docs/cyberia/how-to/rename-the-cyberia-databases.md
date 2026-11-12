# Rename the Cyberia databases

`DB_NAME_CYBERIA` and `DB_NAME_CYBERIA_CONTENT` of `engine-private/conf/dd-cyberia/.env.<env>` name
the runtime database and the content base of `services.cyberiaonline.com`. Each content release
lives in `<content base>-<release id>`, and the release ledger records that name. A rename moves the
data, then the ledger, then the engine. The old databases stay until you drop them.

The steps below move `example2-cyberia` to `cyberia`, the names of the public release.

## Before you start

- Run the commands on the production control host, as for a deploy.
- Plan a maintenance window: no write may reach the old databases after the backup.
- Rehearse in the development sandbox first ([Rehearse](#rehearse)).

## Steps

1. Read what the newest backup holds, and note the users and Object Layer counts:

   ```bash
   underpost db dd-cyberia --inspect --hosts services.cyberiaonline.com
   ```

2. Stop the writes to `services.cyberiaonline.com`, then take a fresh backup:

   ```bash
   underpost db dd-cyberia --export
   underpost db dd-cyberia --list
   ```

3. Put the new names on the control host: sync `engine-private` with
   `DB_NAME_CYBERIA=cyberia` and `DB_NAME_CYBERIA_CONTENT=cyberia-content`. The import reads them.

4. Restore the backup under the new names. One pair renames the runtime database, the content base
   and every release database:

   ```bash
   underpost db dd-cyberia --inspect --backup <backup-id> --hosts services.cyberiaonline.com \
     --rename-database example2-cyberia:cyberia
   underpost db dd-cyberia --import --backup <backup-id> --hosts services.cyberiaonline.com \
     --rename-database example2-cyberia:cyberia --drop
   ```

5. Point the release ledger at the new databases. The plan lists each release and its new name; a
   release whose data is still only under the old name stops the command:

   ```bash
   node bin/cyberia content release rebase
   node bin/cyberia content release rebase --apply
   ```

6. Deploy `dd-cyberia`. Each engine binds the active release under its new name.

7. Verify:

   ```bash
   node bin/cyberia content release status
   underpost db collection inspect user --deploy-id dd-cyberia --host services.cyberiaonline.com
   ```

   Sign in at `https://services.cyberiaonline.com/log-in` and open the Object Layer viewer.

8. After a full day of service, drop the `example2-cyberia*` databases.

## Revert

Until step 8 the old databases hold the data as it was at the backup. To revert, set the old names
again in `engine-private`, run `node bin/cyberia content release rebase --apply`, and deploy. A
write made after step 6 stays in the new databases only.

## Rehearse

Restore the same backup into the development sandbox with the rename, then run steps 5 and 7 there:

```bash
underpost db dd-cyberia --import --dev --backup <backup-id> \
  --hosts services.cyberiaonline.com --rename-database example2-cyberia:cyberia --drop
underpost sandbox up
node bin/cyberia content release rebase --dev --apply
```

[DB and backup management](../../nexodev/how-to/manage-databases-and-backups.md#restore-under-another-name)
describes the restore under another name.
