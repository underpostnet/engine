# Source releases

How a product repository is released from an exact source revision: the source channel it is
fetched from, the source lock that pins the revision, the release profile that says what releasing
it means, and the two execution primitives a profile may use.

## Source channels

A source channel selects only the repository a revision is fetched from:

| Channel   | Product repository            | Engine source repository        |
| --------- | ----------------------------- | ------------------------------- |
| `public`  | `underpostnet/<name>`         | `underpostnet/engine-<id>`      |
| `private` | `underpostnet/<name>-private` | `underpostnet/engine-test-<id>` |

The channel is provenance. It is never a lifecycle, an environment or a target: a release from
the private channel is a production release. One resolver names the product repository of a
channel:

```bash
underpost source-release repository underpostnet/cyberia-content --channel private
# underpostnet/cyberia-content-private
```

The engine pair is resolved in `deploy/lib/host.sh` (`engine_source_repo`), because it names the
repository that makes the CLI runnable.

A release resolves every repository to an exact 40-character revision before it runs. A branch
is never a release input.

## The source lock

A deployment repository pins the exact revision of every source it ships in `underpost.lock.json`.
A repository never pins itself, so the deployment repository holds the lock and pins all the others.

```json
{
  "lockVersion": 1,
  "sources": {
    "cyberia-content": {
      "repository": "underpostnet/cyberia-content",
      "revision": "04f978b0c3b704b22d29813d291fab1240cb1991",
      "artifact": { "version": "3.0.0", "digest": "sha256:6768c5c7…" }
    },
    "cyberia-server": {
      "repository": "underpostnet/cyberia-server",
      "revision": "70efab747c44561a9ec39874cfae0c24b96c2b38"
    }
  }
}
```

| Field            | Holds                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| `lockVersion`    | The version of the document: `1`                                                |
| `sources.<name>` | One entry per repository, by repository name, in name order                     |
| `repository`     | The public `owner/name`; the source channel resolves the private mirror         |
| `revision`       | The exact 40-character commit                                                   |
| `artifact`       | For a repository that builds an artifact: its `version` and its `sha256` digest |

The lock names no channel: the same lock deploys from either channel. A reader refuses an unknown
field, a moving reference and a private repository name. `src/server/release/source-lock.js` reads,
writes and checks it; a product CLI writes it from its checkouts and checks an installed artifact
against it.

## Release profiles

| Profile               | Means                                                             | Credentials               | Artifact            |
| --------------------- | ----------------------------------------------------------------- | ------------------------- | ------------------- |
| `application-release` | Source sync, configuration, image rollout and readiness           | The deploy's own          | Runtime image       |
| `data-release`        | Content built in a Release Job, ingested, validated and activated | The `data-release` Secret | Content in MongoDB  |
| `container-release`   | An OCI image, pulled from CI or built on the host                 | Registry, where required  | OCI image digest    |
| `source-sync`         | The exact revision checked out on the node                        | Git, on the host only     | Filesystem snapshot |

A product catalog names the profile of each repository in `releaseRepositories`. The build of a
repository stays in its own package scripts, Makefile and Dockerfile.

## The release workspace

A data release builds from a workspace the host fetches into the release store
(`UNDERPOST_RELEASE_STORE`, `/home/dd/release-store` by default):

| Path                        | Holds                                                   |
| --------------------------- | ------------------------------------------------------- |
| `<release-id>/release.json` | What the release is built from: source, channel, inputs |
| `<release-id>/source/`      | The source at exactly its revision, with its history    |
| `.engine/`                  | The engine a Release Job runs                           |

The fetch passes the Git credential in the child environment and configures no remote, so the
workspace holds no credential. The workspace is read only from the moment it exists. A retry of
the same release reuses it; another revision needs another release id.

The store is a cache of exact revisions, and only the host writes it. After a release commits, the
host removes every workspace but that release's; a release that needs its workspace again fetches
the same revision:

```bash
underpost source-release prune <release-id>
```

## The Release Job

A release that runs in the cluster runs in a `batch/v1` Job, never in a serving pod. The Job:

- runs one command once, with no retry of its own;
- runs the deployed image, pinned to the node that holds the release store;
- runs the engine revision the deploy runs, not the CLI its image was published with: the host
  stages the tracked files of that revision, with the deploy's `conf.*.json` files and package
  manifest, at `.engine/`, and the Job copies them over its image's engine and installs the
  dependencies;
- reads the release store read only, through a `hostPath`: the host gives the store the container
  label (`container_file_t` where SELinux enforces) and opens every entry to any reader, since the
  Job runs as the image's user;
- reads one Secret: the `app apply` projection of one configuration scope;
- gets plain, non-secret values as environment entries.

```bash
underpost app apply --env production --args deploy-id=dd-cyberia,scope=data-release
underpost source-release job <release-id> --deploy-id dd-cyberia --scope data-release \
  --image <deployed-image> --set-env NODE_ENV=production --cmd '<command>'
```

The `data-release` scope entitles the deploy identity, the database credentials and the domain
service key, and nothing else: no GitHub credential and no host configuration.

## Container releases

`underpost image --release --image-name <repository> --revision <sha>` names the image of an exact
revision by digest. On the public channel it pulls the image CI pushed as `sha-<sha>`; with
`--path <checkout>` it builds the image on the host. On a kubeadm node the image lands where the
runtime reads it: CRI-O shares root Podman's storage, containerd imports it with its digests.
`underpost run instance --source-revision <sha> [--build-path <checkout>]` deploys an instance on
that digest.

## The source mirror

After a release from the private channel serves, its exact revision is published to the public
repository:

```bash
underpost source-release mirror underpostnet/cyberia-content --revision <sha>
```

The public branch moves forward to the revision, or stays when it already holds it. Public history
is never rewritten and no commit is made, so nothing is rebuilt. A failed mirror is reported and
leaves the release as it is.
