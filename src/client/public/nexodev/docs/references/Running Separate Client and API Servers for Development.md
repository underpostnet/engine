# Guide: Running Separate Client and API Servers for Development

This guide explains how to run the client-side and API-side of your application as separate processes. This is particularly useful for development, allowing you to work on the frontend and backend independently. We will configure the API server to accept requests from the client server by setting a custom CORS origin.

## Prerequisites

Ensure your deployment configuration is set up correctly.

If you don't have a deployment configuration, create one using `underpost new --deploy-id <deploy-id>`

Your `package.json` should be configured with the following scripts:

```json
"scripts": {
  "dev:api": "NODE_ENV=development nodemon --watch src --ignore src/client src/api",
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
    - `nodemon` will watch for changes in `src/client` and automatically rebuild the client-side code.

You should now have the API running on port 4001 and the client on port 4004, with the client correctly making API calls to the separate API server.
