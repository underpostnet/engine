# Organization Mirroring and Publishing

The personal account `underpostnet` holds the source repositories. The organization `underpost`
holds a force-synced mirror of each one, and publishes the organization-scoped packages from it.
Three pieces make that work: the mirror workflow, owner-aware publish workflows, and the Actions
secrets each side needs.

---

## Repositories

| Source (`underpostnet`)            | Mirror (`underpost`)               | Publishes                                                        |
| ---------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `pwa-microservices-template`       | `pwa-microservices-template`       | source: `underpost` on npm. Mirror: nothing.                     |
| `pwa-microservices-template-ghpkg` | `pwa-microservices-template-ghpkg` | `@<owner>/underpost` on npm and GitHub Packages, from each side. |
| `engine-cyberia`                   | `engine-cyberia`                   | source: `cyberia` on npm. Mirror: nothing.                       |
| `engine-ghpkg-cyberia`             | `engine-ghpkg-cyberia`             | `@<owner>/cyberia` on npm and GitHub Packages, from each side.   |

An unscoped package name has one publisher, because npm accepts a version once. The scoped
package takes the repository owner as its scope, so `@underpostnet/...` and `@underpost/...` are
two packages with two provenance origins.

---

## Mirror workflow

`.github/workflows/mirror-to-org.yml` lives in `underpostnet/engine` only. For each repository in
`vars.MIRROR_REPOS` it clones `underpostnet/<repo>` with `--mirror` and force-syncs
`refs/heads/*` and `refs/tags/*` into `underpost/<repo>`, pruning refs the source no longer has.

It runs in exactly two cases:

| Trigger             | Condition                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow_dispatch` | Manual, from the UI, `gh workflow run` or the API. Input `repos` narrows the set; without it, `vars.MIRROR_REPOS`.                                                                                                      |
| `workflow_run`      | `CI \| Publish npm repository package` (`npmpkg.ci.yml`) completed with `success` on `master`, from a push or a dispatch in `underpostnet/engine`, and its package job succeeded. Mirrors `pwa-microservices-template`. |

The `workflow_run` condition matters: `npmpkg.ci.yml` runs on every push, and a run whose package job
was skipped also concludes `success`. The gate job reads the triggering run's jobs through the API and
mirrors nothing unless one of them succeeded. A `pull_request` run and a fork head never pass the
gate, because a `workflow_run` job holds this repository's secrets whatever triggered it.

`npmpkg.ci.yml` pushes only the template. The other repositories are pushed later by the workflows
it starts, and each one dispatches the mirror for the repository it just pushed, so a mirror never
copies a state whose build has not finished:

| Producer                      | Pushes                                          | Dispatches `repos=`                |
| ----------------------------- | ----------------------------------------------- | ---------------------------------- |
| `ghpkg.ci.yml` (template job) | `underpostnet/pwa-microservices-template-ghpkg` | `pwa-microservices-template-ghpkg` |
| `engine-cyberia.ci.yml`       | `underpostnet/engine-cyberia`                   | `engine-cyberia`                   |
| `ghpkg.ci.yml` (engine job)   | `underpostnet/engine-ghpkg-<conf-id>`           | `engine-ghpkg-<conf-id>`           |

```bash
gh workflow run mirror-to-org.yml -R underpostnet/engine                         # every repository
gh workflow run mirror-to-org.yml -R underpostnet/engine -f repos="engine-cyberia"
```

| Input                    | Where            | Purpose                                                                                                                                        |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `vars.MIRROR_ORG`        | Actions variable | Target organization. Default `underpost`.                                                                                                      |
| `vars.MIRROR_REPOS`      | Actions variable | Space-separated repository names. Default: the four repositories above.                                                                        |
| `secrets.MIRROR_TOKEN`   | Actions secret   | PAT: read on the sources; contents and `workflow` write on the organization repositories.                                                      |
| `secrets.GIT_AUTH_TOKEN` | Actions secret   | Fallback credential when one PAT already covers both accounts. Producers dispatch with it: it needs `actions: write` on `underpostnet/engine`. |

Rules the job applies:

- `workflow_run` reads `mirror-to-org.yml` from the default branch of `underpostnet/engine`. A change
  to the trigger takes effect once it is on `master`.
- It mirrors only into a repository that exists and that the token reaches. Create the
  organization repository to opt it in, and add its name to `vars.MIRROR_REPOS` if it is not a default.
- The credential reaches git through `gh auth setup-git`, never through a URL or git config.
- A mirror must accept force pushes on every branch: a branch protection rule on the mirror
  breaks the sync. Pushing `.github/workflows` changes needs the `workflow` scope.
- The push uses a PAT, so the mirror's own workflows run on the synced tags. That is what lets
  the organization publish.
- A producer dispatches the mirror only after its push succeeds, and fails its job when the
  dispatch fails. `npmpkg.ci.yml` fails when a downstream dispatch fails, so a successful run
  means every downstream build was started.
- Runs are serialized per requested repository set, so dispatches from several producers queue
  instead of cancelling each other.

---

## Publish workflows

`publish.ci.yml` (template lineage) and `publish.cyberia.ci.yml` (cyberia lineage) each carry
two jobs:

| Job                       | Runs in                                                     | Package                                     |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `build-and-publish`       | `underpostnet/<source>` only                                | Unscoped, with provenance.                  |
| `build-and-publish-ghpkg` | `<owner>/<source>-ghpkg` for `underpostnet` and `underpost` | `@<owner>/<name>`, npm and GitHub Packages. |

The ghpkg job aligns the package with the repository it runs in before publishing:

```bash
node bin package --rename "@<owner>/<name>" --set-repo "<owner>/<repository>"
```

Provenance is refused when `repository.url` in the manifest differs from the repository the
workflow runs in, and GitHub Packages accepts only the owner's scope; the committed manifest
names the personal account, so the organization run rewrites both. On the source the command
changes nothing. The cyberia jobs then restore the published dependency set
(`publishedProductPackageJson`) as before, so the tarball declares `underpost` and the catalog
pins rather than the engine's runtime set.

Prerequisites on the organization side:

- An npm organization `underpost`, and an `NPM_TOKEN` with publish rights on the `@underpost`
  scope.
- `GIT_AUTH_TOKEN` with `write:packages` for GitHub Packages.
- Both secrets present in the mirror repositories (below).

---

## Secrets on both sides

`underpost secret rotate --args secret=` distributes any Actions secret to the repositories of a
deploy, under either account; see
[SOPS Age Secret Management](./SOPS%20Age%20Secret%20Management.md#rotating-github-actions-secrets).

| Secret                 | Source repositories (`underpostnet`) | Mirrors (`underpost`)              |
| ---------------------- | ------------------------------------ | ---------------------------------- |
| `GIT_AUTH_TOKEN`       | CI checkouts, GitHub Packages        | Same.                              |
| `NPM_TOKEN`            | npm publish                          | Same, with rights on `@underpost`. |
| `MIRROR_TOKEN`         | `underpostnet/engine` only           | Not needed.                        |
| `SOCKET_CLI_API_TOKEN` | `underpost socketsecurity --ci`      | Same.                              |
| `SOCKET_CLI_ORG_SLUG`  | `underpost socketsecurity --ci`      | Same.                              |

Declare the values once, in the host configuration, and sync them from there:

```bash
# engine-private/deploy/scopes/host.env.production
GITHUB_TARGET_TYPE=user            # or org
GITHUB_USERNAME=underpostnet
GITHUB_ORG_NAME=underpost
GITHUB_SECRET_TOKEN=github_pat_... # repo (+ admin:org for level=org)
SOCKET_CLI_API_TOKEN=sktsec_...
SOCKET_CLI_ORG_SLUG=<socket-org-slug>
# engine-private/deploy/scopes/publishing.env.production
NPM_TOKEN=npm_...
```

```bash
# Personal account: every repository of the template and cyberia lineages.
node bin secret rotate --args "secret=NPM_TOKEN|SOCKET_CLI_API_TOKEN|SOCKET_CLI_ORG_SLUG,source=host,deploy-id=template|dd-cyberia" --dry-run

# Organization mirrors: the same keys, re-owned to the organization.
node bin secret rotate --args "secret=NPM_TOKEN|SOCKET_CLI_API_TOKEN|SOCKET_CLI_ORG_SLUG,source=host,target=org,deploy-id=template|dd-cyberia" --dry-run

# GIT_AUTH_TOKEN has no place in the host configuration: pipe it, to each side.
printf %s "$GIT_AUTH_TOKEN" | node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=template|dd-cyberia"
printf %s "$GIT_AUTH_TOKEN" | node bin secret rotate --args "secret=GIT_AUTH_TOKEN,target=org,deploy-id=template|dd-cyberia"

# The mirror credential lives where the mirror workflow runs.
printf %s "$MIRROR_TOKEN" | node bin secret rotate --args "secret=MIRROR_TOKEN,repos=underpostnet/engine"
```

Drop `--dry-run` to write. Repositories the credential cannot reach are reported and skipped.
