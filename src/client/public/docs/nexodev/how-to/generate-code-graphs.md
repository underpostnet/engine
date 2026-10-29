# Generate Code Graphs

A code graph is an architecture report of one repository. [Graphify](https://pypi.org/project/graphifyy/)
builds it from the code alone: no model, no API key and no network. A release builds the graph of each
repository that declares one, and the later stages check it against the revision they ship.

`src/server/release/graphify.js` is the adapter. A product CLI calls it from its release commands, and
`underpost graphify` calls it for the engine.

## Install Graphify

The platform pins one Graphify release: `GRAPHIFY_VERSION` in `src/server/release/graphify.js`. Every
host and runner that builds a graph uses this version. Graphify needs Python 3.10 or later. Rocky Linux 9
and RHEL 9 have Python 3.9 as `python3`, so install Python 3.11 from AppStream:

```bash
sudo dnf install -y python3.11 python3.11-pip
python3.11 -m pip install --user pipx
python3.11 -m pipx ensurepath
python3.11 -m pipx install --force graphifyy==0.9.97
```

Open a new shell, then verify the version:

```bash
graphify --version
# graphify 0.9.97
```

pipx installs Graphify and its Python dependencies in their own environment. The platform adds no
other package: no Graphviz, no Matplotlib and no system Python module.

A release command never installs Graphify. It stops with the install command when `graphify` is not on
the `PATH`, or when the installed version is not the pinned one.

To change the pin, change `GRAPHIFY_VERSION`, install that version, then build and lock the release
again. A graph that another version built is stale.

## Configure a product

| Setting                       | Where                    | Means                                                     |
| ----------------------------- | ------------------------ | --------------------------------------------------------- |
| `graphify`                    | The product catalog      | The release stages build and check code graphs: on or off |
| `releaseRepositories[].graph` | Each repository entry    | The graph directory, relative to the repository root      |
| `.graphifyignore`             | The root of a repository | What Graphify scans, in `.gitignore` syntax               |
| `.graphifyrc`                 | The root of a repository | Graphify options, such as language mappings; optional     |

The platform default is off: `graphify: false` in `EMPTY_CATALOG` of `src/server/build/catalog.js`.
Cyberia sets `graphify: true` in `src/projects/cyberia/catalog-cyberia.js`, and declares a graph
directory for each code repository:

| Repository        | Graph directory     | `.graphifyignore` scans                   |
| ----------------- | ------------------- | ----------------------------------------- |
| `cyberia-client`  | `docs/graphify-out` | `src/`, except `src/shell.html`           |
| `cyberia-server`  | `docs/graphify-out` | The Go packages, except tests             |
| `cyberia-content` | `docs/graphify-out` | `src/`, except the data in `src/content/` |
| `cyberia-audio`   | `docs/graphify-out` | `src/`                                    |

`cyberia-deployment` holds no code and declares no graph.

A repository without a `graph` directory never gets a graph. To add one, declare the directory, add a
`.graphifyignore`, and add the graph files to its `.gitignore`:

```gitignore
# graphify: share only the graph, its report and its stamp.
/docs/graphify-out/*
!/docs/graphify-out/graph.json
!/docs/graphify-out/GRAPH_REPORT.md
!/docs/graphify-out/graph.stamp.json
```

## Turn the graphs on or off

The flag wins over the catalog, and the catalog wins over the platform default:

1. `--no-graphify`: no stage builds or checks a graph.
2. `--graphify`: every stage builds or checks the graphs, also when the catalog sets `graphify: false`.
3. The `graphify` setting of the product catalog.
4. Off.

Each stage reads the flag again. To release without code graphs, give `--no-graphify` to every stage:

```bash
cyberia release build --commit --no-graphify
cyberia release lock --commit --no-graphify
cyberia release publish --private --no-graphify
```

A stage never builds a graph that an earlier stage skipped. When the graphs are on, `lock` and `publish`
refuse a stale graph and name the command that builds it again.

## What a release does

| Stage               | With the graphs on                                                                      |
| ------------------- | --------------------------------------------------------------------------------------- |
| `build`             | Builds each graph that is not fresh, then commits the graph files with `--commit`       |
| `lock`              | Checks each graph at the revision it pins; refuses a stale one and writes no lock       |
| `publish`           | Checks each graph at the revision the lock pins; refuses a stale one and pushes nothing |
| `publish --dry-run` | Makes the same check, and exits 1 on a stale graph before it changes a checkout         |

`build` runs `graphify update .` in the repository root with these variables:

| Variable                   | Value               | Effect                                       |
| -------------------------- | ------------------- | -------------------------------------------- |
| `GRAPHIFY_OUT`             | The graph directory | Where Graphify writes                        |
| `GRAPHIFY_BACKEND`         | `none`              | No model backend: code-only extraction       |
| `GRAPHIFY_NO_AUTO_REFRESH` | `1`                 | No change to the Graphify skills of the host |
| `GRAPHIFY_NO_TIPS`         | `1`                 | No tips in the output                        |

A release commits three files of the graph directory, and only these files:

| File               | Holds                                                          |
| ------------------ | -------------------------------------------------------------- |
| `GRAPH_REPORT.md`  | The architecture report                                        |
| `graph.json`       | The graph                                                      |
| `graph.stamp.json` | The Graphify version, the inputs digest and the two file blobs |

Graphify also writes `graph.html`, `manifest.json` and `cache/` in the graph directory. These files are
local: `.gitignore` keeps them out of each commit. Open `graph.html` to see the graph in a browser.

A repository with a build commit, such as `cyberia-client`, commits the graph in that commit. Another
repository gets one commit, `Update the code graph`, before its build. `cyberia-content` needs this
order: its `pack` records the commit it builds from, and refuses a work tree with changes.

## Freshness

A graph is fresh when its stamp matches the revision:

- The stamp names the pinned Graphify version.
- `GRAPH_REPORT.md` and `graph.json` are not empty, and their blobs are the blobs in the stamp.
- The inputs digest of the revision is the digest in the stamp.

The inputs are the tracked files that the root `.graphifyignore` keeps, outside the graph directory,
plus `.graphifyignore` and `.graphifyrc`. Git reads `.graphifyignore` with its own ignore rules, so the
scope is the scope Graphify scans, or a larger one. A change to a scanned file, or to the scan
configuration, makes the graph stale. A change to another file does not.

The check reads Git objects through a temporary index. It does not change the index, the work tree or
the commit of the repository, and it does not need Graphify.

`build` checks the work tree first. A fresh graph stays as it is, and the build does not run Graphify.
Graphify keeps its own incremental state in `manifest.json` and `cache/`. A new clone has no such state,
so its first `graphify update` extracts all the code.

The report also shows the commit that was `HEAD` when Graphify ran. This is the commit before the
release commit. The stamp, not that line, is the freshness proof.

## Deploy nodes and image builds

A deploy node builds the game checkouts with `--no-graphify`: the pinned checkouts already carry their
graphs. A local stack image build also uses `--no-graphify`. Deploy nodes do not need Graphify.

## The engine graph

The engine declares its graph in `ENGINE_GRAPH` of `src/projects/underpost/catalog-underpost.js`. It
commits only two files of `docs/graphify-out`: `GRAPH_REPORT.md` and `graph.stamp.json`. The engine
`graph.json` is large, so it stays local with the other Graphify files.

| Command                                   | Does                                                             |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `underpost graphify`                      | Builds the graph of the checkout, unless it is fresh             |
| `underpost graphify --check`              | Checks the graph against the work tree; exits 1 when it is stale |
| `underpost graphify --revision <rev>`     | Checks the graph that a commit holds                             |
| `underpost release --build`               | Builds the graph as its last step, after all other regenerations |
| `underpost release --build --no-graphify` | Builds the release without the graph                             |

`release --build --dry-run` does not touch the graph. `release --deploy` commits the graph files with
the release.

The root `.graphifyignore` keeps the graph directory out of the scan. All other files that `.gitignore`
does not exclude are inputs, so the release changes make the graph stale, and each release builds it
again.

The template build removes the engine graph: it describes the engine tree, not the template.

## Troubleshooting

| Message                                          | Cause and fix                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `graphify is not on the PATH`                    | Install the pinned version, then open a new shell                                  |
| `… is graphify X, not Y`                         | Install the pinned version with `pipx install --force graphifyy==<pin>`            |
| `graphify update failed in <root> (exit N)`      | Read the Graphify output above the error. Fix the cause, then build again          |
| `graphify wrote no <file>`                       | Graphify found no code in the scope. Check `.graphifyignore`                       |
| `the code graph <dir> has no graph.stamp.json`   | No release built this graph. Build it, then lock again                             |
| `the code graph <dir> is older than its sources` | A scanned file changed after the build. Build, then lock again                     |
| `… changed after its build`                      | A graph file changed after the build. Build again; do not edit graph files by hand |
| `The working tree has changes` (content)         | The content checkout has uncommitted changes. Commit them, then build again        |

`graphify update` can refuse a graph with fewer nodes than the previous one. After a refactor that
removes code, build once with `GRAPHIFY_FORCE=1` in the environment.
