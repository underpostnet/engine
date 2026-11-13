# Git and GitHub Operations

Underpost runs Git as a program and GitHub through its REST API. It adds one GitHub credential for
both, operations whose destructive steps are explicit, change summaries that travel between
repositories as data, and one trace record per operation.

## GitHub credential

One resolution serves every Git transport to GitHub, every REST call and every workflow dispatch. The
first source that holds a token wins.

| Order | Source          | Set by                                                         |
| ----- | --------------- | -------------------------------------------------------------- |
| 1     | `explicit`      | A programmatic caller, for one operation                       |
| 2     | `GITHUB_TOKEN`  | The process environment: GitHub Actions, the fleet, a pod      |
| 3     | `GH_TOKEN`      | The process environment, as the GitHub CLI reads it            |
| 4     | `underpost-env` | `GITHUB_TOKEN` of `./.env`, then of the global Underpost store |

The token reaches Git only through the child environment (`GIT_CONFIG_COUNT`), and only for a remote
of `github.com`: an `Authorization` header scoped to that host, after the inherited header and the
credential helpers of that host are reset, so no stored account answers in its place. A GitHub SSH
remote (`git@github.com:`, `ssh://git@github.com/`) is reached over HTTPS with the token, through
`url.https://github.com/.insteadOf` for that command only; without a token it keeps SSH. Other hosts
keep their own authentication. A remote URL, `.git/config`, a command argument and a log line never
hold the token; a trace names its source only.

## Repository commands

Every command takes any repository Git reaches: `owner/repo` names a GitHub repository over HTTPS, and
a URL, an SSH address or a path stays as given.

| Command                           | Contract                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `clone <repository> [dest]`       | Into a directory that does not exist or is empty. `--replace` clones beside it and swaps it in on success.   |
| `fetch [path]`                    | Remote-tracking refs only; `--prune` drops the ones the remote lost. The work tree stays.                    |
| `pull [path] [repository]`        | Fast-forward only. A diverged history fails as `non-fast-forward`; an overwritten change as `conflict`.      |
| `push [path] [repository]`        | HEAD to the remote branch. `--force-with-lease` replaces only what the tracking ref last saw; `-f` replaces. |
| `sync <path> <repository>`        | Replaces a managed checkout with a branch tip, reporting the commits, changes and files it discards.         |
| `discard <paths...>`              | Lists the changes under each path with its repository root; `--force` discards them, ignored files stay.     |
| `init [path]`                     | A repository with the commit identity of `GITHUB_USERNAME` and `GITHUB_EMAIL`, and `--origin`.               |
| `status [path]`                   | One read-only query: `--branch`, `--log`, `--unpushed`, `--diff`, `--message`, `--changes`, `--reachable`.   |
| `cmt [path] [type] [scope] [msg]` | Commits the staged changes as `type(scope): description`. The index is never changed.                        |
| `merge-dependabot [path]`         | Merges each `origin/dependabot/*` branch into the default branch, or `--base`, and prints `ok` or `failed`.  |

```bash
underpost clone underpostnet/engine-private ./engine-private --depth 1 --sparse conf/dd-core
underpost pull ./engine-private
underpost push . --force-with-lease
underpost sync /home/dd/engine underpostnet/engine-test-core --dry-run
underpost discard /home/dd/engine/engine-private
underpost cmt . ci engine-core-conf 'Update dd-core conf'
underpost status --branch --copy
underpost merge-dependabot ./cyberia-content
```

`sync` is for checkouts that project a remote: deploy sources and node checkouts. A working repository
takes `pull`, which never replaces anything. Git refuses a checkout that another user owns, so `sync`
adds such a checkout to `safe.directory` in the global Git config of the user that runs it.

A failed operation names its reason: `authentication`, `not-found`, `network`, `protected-branch`,
`stale-lease`, `non-fast-forward`, `missing-ref`, `conflict`, `locked` (another Git process holds the
checkout), `dubious-ownership`, `not-a-repository`, `destination-exists`, `missing-remote`,
`invalid-ref` or `timeout`.

`merge-dependabot` merges with Git alone, on the checkout, one branch at a time: it fetches `origin`,
fast-forwards the base branch, and aborts a merge that fails before the next one starts. It stashes the
local changes, untracked files included, and on every path returns the checkout to the branch it was
on, with the stash. A stash that does not come back stays in the stash list, and the command names it.
Nothing is pushed: on the base branch, `underpost push` publishes the merges. A merged branch that
also exists locally is deleted; the remote branches stay.

## Change summaries

A change summary is the list of tagged commits (`[scope] subject`) a pipeline carries from repository to
repository, generated once from the source history:

```json
{
  "schema": 1,
  "source": { "repository": "underpostnet/engine", "revision": "<sha>" },
  "entries": [{ "scope": "cli", "subject": "Add the status command", "revision": "<sha>" }]
}
```

It travels as the `change_summary` input of a workflow dispatch, or inside a commit message as its
`Change-Summary:` trailer, which a workflow started by a push reads back from `head_commit.message`.
Nothing is reconstructed from a commit subject.

```bash
# CHANGE_SUMMARY holds what the hop received: the input, or the commit message.
CHANGE_SUMMARY=$(node bin release --change-summary --fallback "Update repository")
CHANGE_MESSAGE=$(CHANGE_SUMMARY="$CHANGE_SUMMARY" node bin release --change-summary --format message)
git commit -m "$CHANGE_MESSAGE"
node bin github dispatch underpostnet/engine engine-core.ci.yml --input change_summary="$CHANGE_SUMMARY"
```

Without a received summary, `--change-summary` summarizes the latest commits (`--from-n-commit`). The
formats are `json` to forward, `message` to commit (one line per entry, then the trailer) and
`markdown` to read. `release --changelog` writes `CHANGELOG.md` from the same tagged commits.

## GitHub automation

`github dispatch <repository> <workflow>` runs on the default branch unless `--ref` names one, and prints
the run GitHub created. An accepted dispatch is a created run, not a finished one.

## Trace records

Each operation logs one record: `operationId`, the repository (its slug, or its URL without user info),
the path, the remote host, the ref, the revisions before and after, the credential source, the duration,
the status and the failure reason. A dispatch adds its run; a push to GitHub adds its commit URL.
