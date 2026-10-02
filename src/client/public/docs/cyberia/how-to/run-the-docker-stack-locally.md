# Run the Cyberia Docker Stack Locally

The Docker Compose stack runs the full Cyberia ecosystem on one host: MongoDB, Valkey, IPFS, the
engine, one game server and one game client for each release instance, and one nginx gateway.
`cyberia run-workflow dev-env` builds the three images from one source and runs the stack on them.
It commits nothing, pushes nothing and publishes nothing.

## Run the stack

```bash
node bin/cyberia run-workflow dev-env                                  # this workspace, every image
node bin/cyberia run-workflow dev-env cyberia-client                   # build one image again
node bin/cyberia run-workflow dev-env --source clone --channel private # the private repositories
node bin/cyberia run-workflow dev-env --no-build                       # the images already loaded
node bin/cyberia run-workflow dev-env --test                           # probe the routes
node bin/cyberia run-workflow dev-env --reset                          # tear the stack down
```

A run does these steps in this order:

1. Reset the stack: its containers, network and volumes.
2. Build the images, unless `--no-build` is set.
3. Write the `/etc/hosts` block of the gateway names and of every engine domain.
4. Generate the stack, then start it on the local images.

Step 2 keeps the root disk small. Before and after each image, it prunes the untagged images of
podman and Docker: the images a newer build or load replaced. Each image then leaves two copies on
the host:

- The image in Docker, which the stack runs.
- Its `builder` stage in podman, tagged `localhost/<image>-dev:builder`, the cache of the next build.

The podman copy of the image and its archive are removed after Docker loads it.

Step 4 sets `ENGINE_CYBERIA_IMAGE`, `CYBERIA_SERVER_IMAGE`, `CYBERIA_CLIENT_IMAGE` and their `_TAG`
variables in the environment of the compose command. That environment wins over `compose.env`,
so the run never edits `compose.env`.

## Sources

`--source` selects where every image takes its sources. Each image is `localhost/<image>-dev:<version>`.

| Source            | Engine image                                                                        | Game images                                                     |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `local` (default) | The engine and deployment working trees and the content `dist/`, not pinned         | The `cyberia-server` and `cyberia-client` checkouts             |
| `clone`           | The engine, deployment and content repositories of `--channel`, cloned by the build | Clones at the revisions the deployment lock of the channel pins |

A `local` run first runs `cyberia release build --dev` for the repositories its images take. The
build context of the engine image is `build/dev-env/engine-cyberia/`. Its `source/` directory holds
the tracked and untracked files of each working tree. Ignored files stay out.

A `clone` run passes the repositories to `Dockerfile.dev` as build args, resolved from the channel:

| `--channel`         | Engine                | Deployment and content |
| ------------------- | --------------------- | ---------------------- |
| `public`            | `engine-cyberia`      | `<name>`               |
| `private` (default) | `engine-test-cyberia` | `<name>-private`       |

The engine build takes the content at the revision the lock pins, then verifies it against the
lock. The private channel needs `GITHUB_TOKEN`. The build reads it as a build secret and scrubs it.

## The generated stack

`engine-private/conf/dd-cyberia/docker-compose/cyberia/` holds the stack. Only `compose.env` is
written by hand.

| File                                              | Source                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `compose.env`                                     | The operator: credentials, images, public origins and `PORT`                                       |
| `docker-compose.yml`                              | `src/projects/cyberia/compose-stack.js`, from `conf.server.json`, `PORT` and the release instances |
| `nginx.conf`                                      | The same stack, through the primitives of `src/runtime/nginx/Nginx.js`                             |
| `mongodb/entrypoint.sh`, `ipfs/configure-ipfs.sh` | The platform init scripts of `node bin docker-compose`                                             |

```bash
node bin docker-compose --generate --deploy-id dd-cyberia --docker-compose-id cyberia
node bin docker-compose --generate --deploy-id dd-cyberia --docker-compose-id cyberia --env production
```

`--up` generates the stack before it starts it. `--env production` sets the release images and
`NODE_ENV=production` as defaults; `compose.env` can override each one. `cyberia release build`
generates the stack again and copies it into `src/runtime/engine-cyberia/`.

The services start in this order: MongoDB, Valkey and IPFS, then the engine, then the content
job. The content job runs `cyberia run-workflow import-content`: it imports the artifact the image
carries into the workspace the engine serves, the foundation first, then the sagas and the
instances. It is a development bootstrap: it builds no release, and a rerun is safe. Only after it
completes do the game servers start, so each one finds its world. A game server reports
`CYBERIA_SERVER_PUBLIC_ORIGIN` and its path to the engine registry, and a promotion reloads it.

The engine publishes one port for each domain of `conf.server.json`, from `PORT+1` upward, as one block.

| Address                                   | Serves                                                 |
| ----------------------------------------- | ------------------------------------------------------ |
| `http://localhost/<path>`, `:8082/<path>` | The game client of the world at `<path>`               |
| `http://localhost:8081/<path>`            | The game server of the world at `<path>`               |
| `/api/`, `/assets/` on port 80            | The engine host that serves the `cyberia-instance` API |
| `http://<domain>/`                        | The engine port of that domain                         |
| `http://engine-cyberia/`                  | The same host as `/api/`, for every container          |

`--test` requests the engine, then the client and the server readiness of each world, by these
names. It exits with code 1 if one request fails or answers 400 or more.

## Release instances

The instances of the [release content](../explanation/content-artifact.md#release-content),
`src/projects/cyberia/release-content.js`, link each public path to the instance code that it
serves. `/` is first, and it serves `DEFAULT_INSTANCE_CODE` of `SharedDefaultsCyberia.js`, which the
portal reads too.

| Path    | Instance code               |
| ------- | --------------------------- |
| `/`     | `amethyst-strata-expansion` |
| `/test` | `test`                      |

The same module checks the release content and applies it:

- `cyberia release build` writes the paths into `multiInstance.variants` of `mmo-server` and
  `mmo-client` in `conf.instances.json`.
- Each game instance env file gets `INSTANCE_CODE` or `CYBERIA_INSTANCE_CODE` from its path, and
  `CYBERIA_DEFAULT_INSTANCE` from the `/` world. Every manifest build writes both env files.
- The compose stack runs one game server and one game client for each instance.
- A content release and `run-workflow import-content` import the release sagas, then these
  instances, and no other saga or instance of the artifact.

To change the worlds, change `release-content.js`, then run `cyberia release build`.
