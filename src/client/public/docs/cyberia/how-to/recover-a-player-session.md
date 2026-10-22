# Recover a player session

Find why the progress of a player does not save, repair the records the database refuses, and end a
session that must not go on. The model is in
[accounts and persistent players](../explanation/accounts-and-persistence.md#save-health); the routes
and the messages are in [the player service reference](../reference/player-service.md).

## Before you start

- You have an admin account on the portal to end a session; a moderator reads only.
- Back up the host database (the one that holds `users`) before a repair on the live deployment.
- Nothing here edits coins, items, quests or a profile. A repair changes indexes and deletes only
  unkeyed records, which no read reaches; an end of a session discards only what that session has
  not saved.

## 1. Find the session

Open **Cyberia Studio → Cyberia Player Manager**. Search the account name or id, or list the
**Online** profiles. A row shows the status of the session and its save health:

| Health            | Means                                                      | Do                                 |
| ----------------- | ---------------------------------------------------------- | ---------------------------------- |
| Healthy           | The engine holds every change                              | Nothing                            |
| Saving            | A change is on its way                                     | Nothing                            |
| Degraded          | Commits fail and retry: the engine or the database is down | Repair the engine; nothing is lost |
| Recovery required | The engine refuses the state, or the call                  | Step 2 or 3, by the cause shown    |
| Unknown           | The server of the session has not reported yet             | Refresh after 20 s                 |

Open the profile. **Profile** is what persists; **Live session** is the lease one game server holds,
with the last report of its server: how many changes are not saved, since when, and the cause.

The same facts are in the server metrics (`recovery_players`, `integrity_total`, `rejected_total`
of `GET /api/v1/metrics`) and in the engine log, which names the database error once per incident:

```
Commit of player <profile> seq <n> refused by the database: E11000 duplicate key error ... index: <name> ...
```

## 2. Repair the indexes (cause: the database refuses the write)

Every deploy syncs the indexes of the runtime records before its rollout, so a refused write means
a deploy stopped there, or the database changed after it.

1. Compare the indexes with the ones the models declare. It writes nothing:

   ```bash
   node bin/cyberia runtime-indexes --dev
   ```

   Each model lists `toDelete`, the unkeyed records, `toDrop`, the stored indexes no model
   declares, and `toCreate`, the declared keys not stored. An unkeyed record has no value in a
   required field of a unique key, such as quest progress without `player`. No read reaches it.

2. Sync them: `node bin/cyberia runtime-indexes --apply --dev`. On the live deployment, run
   `deploy/dd-cyberia/sync-deploy.sh` again: its Stage D runs the same sync before anything else
   changes, and a second run of a deploy leaves what the first one did. The sync deletes the
   unkeyed records and drops a stale unique index first, so the writes it refused go through at once.

3. A model whose `error` still names a duplicate key keeps two records that share a complete unique
   key. A read reaches both, so the sync deletes neither. Find them with the key in the error, keep
   one, then sync again. The command exits 0 when every model is ready.

The sessions in recovery retry every 30 s and save by themselves: the line under the toolbar of the
player turns to "Progress saved". Nothing of what they kept is lost.

## 3. Repair the link (cause: the engine rejects the call)

A `rejected` cause means the engine refuses the calls of that server: a wrong
`CYBERIA_SERVER_API_KEY`, or a server and an engine of builds that do not speak one protocol. Deploy
the key or the build that matches ([rotate a key](../explanation/accounts-and-persistence.md#trust-boundaries)).
The sessions save at their next try.

## 4. End a session

End a session only when it must not go on and no repair saves it: a server that keeps a session alive
that cannot save, or an operator decision.

1. In the profile, read **Saved**: the changes the session has not saved are discarded by the end.
2. Write the reason and select **End session**, then confirm. The answer is one of:
   - **Session ended**: the epoch of the profile is one higher, so its server can write nothing
     more, and the server ends the session at its next checkpoint (at most 20 s). The player sees
     "The game team ended this session" and plays again from the last save.
   - **The profile changed since this view read it**: refresh and read it again.
   - **No live session plays this profile now**: nothing to end.
3. The **Operator log** of the profile records every request, done or refused, with the operator,
   the reason and the epochs.

## Verify

- `node bin/cyberia runtime-indexes` exits 0.
- The player manager shows the profile **Healthy**, or **Offline** with its last commit sequence.
- The player launches the world and finds what the last save holds. A launch on the server that held
  the session plays even what that session had not saved.
