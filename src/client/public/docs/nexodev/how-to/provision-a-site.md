# Provision a Site

`underpost site` adds websites to the configuration of a deployment: clients, host/path routes, and the existing APIs and components they use. It changes files in `engine-private/conf/<deploy-id>/` and `src/client/`. It does not deploy to Kubernetes, change DNS or issue certificates.

## How an operation runs

1. The operation validates the deployment, the ids, the hostnames and the paths.
2. It plans every file change in memory and prints the plan.
3. It writes the changes as one change set: all files change, or none do.
4. It regenerates the default configuration of each changed deployment (`underpost new --default-conf`).

Add `--dry-run` to stop after step 2. Run an operation again and it plans no change.

`--deploy-id` always names the deployment that changes. `--from-deploy-id` names a different source deployment.

## Create a site

```bash
underpost site create example.com --client example --deploy-id dd-core
```

The command:

- Clones the `default` client of the default template as `example` (`--from` and `--from-deploy-id` select another source).
- Adds the route `www.example.com/` that serves `example`, in `conf.server.json` and `conf.server.dev.example.json`.
- Adds the route `example.com/` that redirects to `https://www.example.com`.
- Points the route database name at `env:DB_NAME_EXAMPLE` and adds `DB_NAME_EXAMPLE=example` to each env file of the deployment that lacks it.

`--path /app` puts both routes on `/app`. A hostname with Unicode letters is stored in Punycode.

## Clone a client

```bash
underpost site clone-client dogmadual shop --deploy-id dd-core
```

The clone gets the `conf.client.json` and `conf.ssr.json` entries, the components, the services, the SSR components, the index module and the public assets of the source client. Each route of the deployment that serves the source client gets a sibling route for the clone: `/` becomes `/shop`.

Renames follow the context of the name:

- `Dogmadual` changes as a part of a PascalCase identifier: `AppShellDogmadual` becomes `AppShellShop`.
- `dogmadual` changes as a path segment or a whole string: `'../services/dogmadual/...'` and `'dogmadual'`.
- API ids under `services`, the `metadata` block and binary assets do not change.

The command stops when the clone has an SSR component or a relative import that does not resolve.

## Clone a route

```bash
underpost site clone-route www.dogmadual.com www.newsite.com/app --deploy-id dd-other --from-deploy-id dd-core --client newsite
```

The route and each development variant that carries it go to the files of the same name in the target deployment. With `--client`, the route serves that client and its database name reads `DB_NAME_<CLIENT>`.

## Register an API or a component

```bash
underpost site add-api cyberia-dialogue --deploy-id dd-cyberia --client cyberia-portal
underpost site add-component ColorPaletteElement --deploy-id dd-cyberia --client cyberia-portal --submodule core
```

`add-api` attaches an API that exists in `src/api/<api-id>`. It goes to every route with a non-empty `apis` list and no redirect (`--host` limits the hostname), in the main file, the development variants and the built replicas. `--client` adds it to the `services` of that client. To generate a new API, use `underpost new api`.

`add-component` adds the component to each component list whose `src/client/components/<submodule>/<component>.js` exists. Name the scope: `--deploy-id <deploy-id>`, or `--all-deploys` for every deployment in `dd.routes`.

## Conflicts and recovery

A route that exists with other content is a conflict. The command writes nothing and names the route. `--replace` replaces the conflicting site routes; it changes no other resource. A client that exists with other content is always a conflict.

A change set records a journal in `.underpost/change-sets/` before its first file changes. When a process stops in the middle, the next site operation that writes restores the previous files first.
