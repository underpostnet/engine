# File storage

`underpost fs` uploads, pulls, and deletes Cloudinary assets while it synchronizes the selected local manifest.
Filesystem paths, Git tracking, and manifest filters select the assets for these operations.

## Manifest selection

Each command requires `--deploy-id <id>`.
The default manifest is `engine-private/conf/<id>/storage.json`.
Use `--storage-id assets` to select `storage.assets.json` in the same directory.
The sub-id accepts letters, digits, hyphens, and underscores. It must start with a letter or digit.
Manifest path overrides are not supported.

## Path selection

| Selector    | Candidate paths                                      |
| ----------- | ---------------------------------------------------- |
| Default     | One local file, or all files below a local directory |
| `--git`     | The filesystem candidates that Git tracks            |
| `--tracked` | The selected manifest entries, in declared key order |

Default selection and `--git` require a path.
Directories include nested files without `--recursive`. Directory links are not followed during traversal.
Git selection includes unchanged tracked files. It excludes untracked files, ignored untracked files, and missing local files.
Storage commands do not change the Git index or commits.

`--tracked` accepts an optional file or directory path scope.
It does not read Git or discover local files.
Use it to pull or delete assets that are missing locally.
An upload fails if a selected file is missing locally.
Do not combine `--git` with `--tracked`.

## Manifest filters

| Option                              | Selection                                         |
| ----------------------------------- | ------------------------------------------------- |
| `--key <path>`                      | One exact manifest key                            |
| `--from-key <path>`                 | That key through the last key, inclusive          |
| `--from-key <start> --to-key <end>` | The inclusive range in declared key order         |
| `--to-key <path>`                   | The first key through that key, inclusive         |
| `--key-regex <pattern>`             | Keys that match the JavaScript regular expression |

Range bounds refer to the full manifest, before path scope or predicates apply.
Scope, range, regex, and exact key filters can be combined.
Unknown bounds, reversed ranges, invalid regex patterns, and conflicting exact keys cause an error before remote access.
An empty regex result selects no files.

With default selection or `--git`, manifest filters restrict the filesystem candidates.
They cannot add missing local files or discover new paths.

## Operations

Upload is the default operation. `--pull` downloads assets. `--rm` deletes remote assets and their manifest entries.
Do not combine `--pull` with `--rm`.

New uploads use raw resources, private delivery, and token access control.
Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the environment configuration.

`--force` permits overwrites for uploads and downloads. It does not change selection.
When Cloudinary retains an existing asset, the manifest records that asset's remote metadata.
Pull requires a manifest entry. It skips an existing local file unless `--force` is set.
`--omit-unzip` keeps the downloaded archive at `<asset-path>.zip`.
Remote deletion preserves local files, including with `--force`.

Each successful operation writes the manifest through an atomic file replacement.
Failed remote operations preserve the manifest entry. Failed downloads preserve existing local files.
The command stops at the first error. Earlier successful operations remain saved.
Cloudinary and the local file cannot share a transaction. A local write failure after remote success requires a retry.
Do not run concurrent commands against the same manifest.

## Examples

```bash
node bin fs path/to/file.png --deploy-id dd-cyberia
node bin fs src/client/public/cyberia --git --deploy-id dd-cyberia
node bin fs --tracked --pull --storage-id assets --deploy-id dd-cyberia
node bin fs --tracked --rm --key assets/gone.png --deploy-id dd-cyberia
node bin fs assets --tracked --from-key assets/a.png --to-key assets/z.png --key-regex '\.png$' --deploy-id dd-cyberia
```

## Verification

Run these tests with Node.js, Git, and the installed project dependencies:

```bash
node_modules/.bin/vitest run --project unit test/unit/fs-storage-paths.test.js test/unit/client-bundle.test.js
```

Tests use temporary directories and temporary Git repositories. Cloudinary and download requests are mocked.
No live Cloudinary credentials or service are required.
