# Guide: Running Separate Client and API Servers for Development

This guide explains how to run the client-side and API-side of your application as separate processes. This is particularly useful for development, allowing you to work on the frontend and backend independently. We will configure the API server to accept requests from the client server by setting a custom CORS origin.

## Prerequisites

Ensure your deployment configuration is set up correctly.

If you don't have a deployment configuration, create one using `underpost new --deploy-id <deploy-id>`

Your `package.json` should be configured with the following scripts:

```json
"scripts": {
  "dev:api": "NODE_ENV=development node src/dev src/api",
  "dev:client": "NODE_ENV=development node src/client.dev"
}
```

And that you have a base development configuration for your `deployId`. For this guide, we'll use:

- **`deployId`**: `dd-default`
- **`subConf`**: `local` (a custom identifier for this setup)
- **`host`**: `default.net`
- **`path`**: `/`
- **Client** will run on `localhost:4004`
- **API** will run on `localhost:4001`

The API port is `PORT + 1` from your `.env.development` (`PORT=4000` listens on `4001`); the runtime
reserves the base port and assigns each instance the next one. The client server takes its port from
the origin you pass to the API server, so the two ports are chosen in one place.

## Create a Local Sub-Configuration

Before running the servers, you need a specific configuration for this local development setup. The `subConf` (`local` in our case) allows you to have a variant of your main `dd-default` deployment configuration.

Run the following command to create the `local` sub-configuration based on your default development configuration:

```bash
underpost new --deploy-id dd-default --sub-conf local
```

This command copies the base configuration files for `dd-default` and creates new versions suffixed with `.local` (e.g., `conf.server.dev.local.json`). You can now customize these new files for your separate server setup without affecting your primary development configuration.

---

## Run the Servers

Now that both configurations are ready, you can start the API and client servers in separate terminal windows.

**Start the API server first.** It derives `conf.server.dev.local-dev-api.json` and
`.env.development.local-dev-api` from your `local` sub-configuration, and the client server reads
both of them. Starting the client first fails with a message naming the missing file.

1.  **Run the API Server:**
    Open a new terminal and run:

    ```bash
    npm run dev:api dd-default local default.net / localhost:4004
    ```

    - This command starts the API server using `src/api.js`.
    - The last argument is the **client** origin. `src/api.js` calls `buildApiConf()`, which writes it
      as the CORS origin of the `local-dev-api` configuration, and then loads that configuration —
      passing no origin here leaves the API on its base `local` configuration instead.
    - The API server will run on `http://localhost:4001` (`PORT + 1` from your `.env.development`).
    - `src/dev.js` restarts the API server when a `.js`, `.mjs`, `.cjs` or `.json` file under `src/`
      changes, except under `src/client/`. It stops the server with `SIGINT`, and with `SIGKILL` after
      5 seconds, so a restart never waits for a process that ignores the signal. The output is never
      cleared. Ctrl+C stops the watcher and the server.

2.  **Run the Client Server:**
    Open another terminal and run:

    ```bash
    npm run dev:client dd-default local default.net /
    ```

    - This command starts the client development server using `src/client.dev.js`.
    - `buildClientStaticConf()` derives the `local-dev-client` configuration from the API server's:
      `apiBaseHost` points at the API port, and the client's own port comes from the origin you gave
      the API server.
    - The script `createClientDevServer` is then called, which uses the `local-dev-client` configuration.
    - It will first build the client assets and then start a server on `http://localhost:4004`.
    - The client server mounts no API. A public route that the API host renders from its own data,
      such as `entry`, is removed from the client configuration, and the client server answers it
      with the plain page shell. The page then loads its data from the API server.
    - A native `fs.watch` watcher follows `src/client` (`.js`, `.mjs`, `.cjs` and `.json` files) and restarts the live build with the changed paths in `/tmp/client.build.json`.

You should now have the API running on port 4001 and the client on port 4004, with the client correctly making API calls to the separate API server.

---

## Run Behind the Dev Proxy With a Real Domain

`node bin run dev` starts the same two servers behind a local dev proxy. A browser on this machine
then opens the real domain, for example `https://www.nexodev.org`, with a trusted local certificate.

```bash
node bin run dev dd-core,nexodev,www.nexodev.org,/,localhost:3333 --tls --kubeadm
```

The argument is `deployId,subConf,host,path,client-host:port`. The runner does these steps in order:

1. It forwards the MongoDB primary and Valkey of the cluster to the host ports `27017` and `6379`
   (`node bin run dev-cluster --expose`). `--kubeadm`, `--k3s` or `--kind` selects the cluster; Kind
   is the default. The API server uses this database.
2. It starts the API server, and waits until it is ready.
3. It starts the client server, and waits until it is ready.
4. It starts the dev proxy (`node src/proxy proxy ...`). The proxy sends `/api` and `/socket.io` to
   the API server, and every other path to the client server. The browser sees one origin.

With `--tls`, the proxy serves HTTPS on port 443; without it, HTTP on port 80. `DEV_PROXY_PORT_OFFSET`
in the deploy's `.env.development` moves both ports, so the proxy does not collide with a production
ingress on the same machine. With `DEV_PROXY_PORT_OFFSET=200`, open `https://www.nexodev.org:643`.
The client configuration and the API CORS origins use the same port.

The dev proxy serves a certificate this machine issues for itself, from `.underpost/ssl/<host>/`. It
never reads or changes the stored certificates of the domain in `engine-private/ssl/`. When no
certificate covers the host, or the certificate expires within 7 days, the proxy issues a new one with
`scripts/ssl.sh`. The script uses mkcert `v1.4.4`, verifies the download against its pinned SHA-256,
and installs the mkcert root CA in the system trust store of this machine, which `curl` and the RHEL
browsers read. A browser on another machine must import `.underpost/ssl/<host>/rootCA.pem`.

The proxy and `dev-cluster` write their host names to `/etc/hosts`, each in its own marked block
(`# underpost hosts dev-proxy-643:begin`). A new run replaces its block and keeps all other lines.

Run the command as root, because the proxy binds a port below 1024 and writes `/etc/hosts`. The host
names apply to this machine only. To use a browser on another machine, add the host name with the
address of this machine to the hosts file of that machine.
