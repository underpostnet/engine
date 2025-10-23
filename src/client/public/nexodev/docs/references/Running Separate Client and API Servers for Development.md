# Guide: Running Separate Client and API Servers for Development

This guide explains how to run the client-side and API-side of your application as separate processes. This is particularly useful for development, allowing you to work on the frontend and backend independently. We will configure the API server to accept requests from the client server by setting a custom CORS origin.

## Prerequisites

Ensure your deployment configuration is set up correctly.

If you don't have a deployment configuration, create one using `underpost new --deploy-id <deploy-id>`

Your `package.json` should be configured with the following scripts:

```json
"scripts": {
  "dev-api": "env-cmd -f .env.development nodemon --watch src --ignore src/client src/api",
  "dev-client": "env-cmd -f .env.development node src/client.dev"
}
```

And that you have a base development configuration for your `deployId`. For this guide, we'll use:

- **`deployId`**: `dd-default`
- **`subConf`**: `local` (a custom identifier for this setup)
- **`host`**: `default.net`
- **`path`**: `/`
- **Client** will run on `localhost:4004`
- **API** will run on `localhost:4000`

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

1.  **Run the API Server:**
    Open a new terminal and run:

    ```bash
    npm run dev-api dd-default local default.net / localhost:4004
    ```

    - This command starts the API server using `src/api.js`.
    - It will automatically load the `local-dev-api` configuration because `src/api.js` is set up to do so.
    - The API server will run on `http://localhost:4000` (or the port in your `.env.development`).

2.  **Run the Client Server:**
    Open another terminal and run:

    ```bash
    npm run dev-client dd-default local default.net /
    ```

    - This command starts the client development server using `src/client.dev.js`.
    - The script `createClientDevServer` is called, which uses the `local-dev-client` configuration.
    - It will first build the client assets and then start a server on `http://localhost:4004`.
    - `nodemon` will watch for changes in `src/client` and automatically rebuild the client-side code.

You should now have the API running on port 4000 and the client on port 4004, with the client correctly making API calls to the separate API server.
