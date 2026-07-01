/**
 * @description Docker Compose pipeline CLI for the local development stack that
 * mirrors the Kubernetes manifests under `manifests/`. Manages dynamic
 * generation of supporting config (nginx router, env-file) and the compose
 * lifecycle (up/down/logs/...). General-purpose: any compose subcommand can be
 * forwarded via `--exec`.
 * @module src/cli/docker-compose.js
 * @namespace UnderpostDockerCompose
 */

import fs from 'fs-extra';
import nodePath from 'path';
import { getRootDirectory, shellExec } from '../server/process.js';
import { loggerFactory } from '../server/logger.js';
import Nginx from '../runtime/nginx/Nginx.js';

const logger = loggerFactory(import.meta);

/**
 * Reverse-proxy route table derived from
 * manifests/deployment/dd-default-development/proxy.yaml (Contour HTTPProxy).
 * Longer prefixes precede '/' so nginx matches them first.
 * @constant PROXY_HOSTS
 * @memberof UnderpostDockerCompose
 */
const PROXY_HOSTS = [
  {
    host: 'default.net',
    routes: [
      { location: '/peer', service: 'app', port: 4002 },
      { location: '/', service: 'app', port: 4001 },
    ],
  },
  {
    host: 'www.default.net',
    routes: [{ location: '/', service: 'app', port: 4003 }],
  },
];

/** Fallback upstream for unmatched Host headers and the proxy healthcheck. */
const DEFAULT_UPSTREAM = { service: 'app', port: 4001 };

/** Prometheus scrape target: the app's /metrics endpoint on its base port. */
const METRICS_TARGET = { service: 'app', port: 4001 };

/** Default deployment identifier (the self-bootstrapping engine deploy). */
const DEFAULT_DEPLOY_ID = 'dd-default';

/**
 * Generated artifact paths (relative to repo root) that `--generate` produces
 * and `--reset` prunes. The working env-file (docker/compose.env) is excluded
 * so a reset never destroys configured credentials.
 */
const GENERATED_ARTIFACTS = [
  'docker/mongodb/entrypoint.sh',
  'docker/nginx/default.conf',
  'docker/prometheus/prometheus.yml',
  'docker/grafana/provisioning',
  'docker/compose.app.yml',
  'docker/compose.env.example',
];

/**
 * @class UnderpostDockerCompose
 * @description Docker Compose development pipeline. A single {@link UnderpostDockerCompose.API.callback}
 * dispatches actions based on flag options, mirroring the cluster CLI pattern.
 * @memberof UnderpostDockerCompose
 */
class UnderpostDockerCompose {
  /**
   * Resolves a repo-root-relative path to an absolute path.
   * @param {string} relPath - Path relative to the engine root.
   * @returns {string} Absolute path.
   * @memberof UnderpostDockerCompose
   */
  static resolve(relPath) {
    return nodePath.isAbsolute(relPath) ? relPath : nodePath.join(getRootDirectory(), relPath);
  }

  /**
   * Resolves the canonical directory for a custom docker-compose workflow,
   * keyed by `--deploy-id` + `--docker-compose-id`:
   * `engine-private/conf/<deploy-id>/docker-compose/<docker-compose-id>`.
   * This directory ships its own `docker-compose.yml`, `compose.env`, and
   * `nginx.conf` (used as-is, never generated). Returns null when
   * `--docker-compose-id` is not set (the default, self-generating workflow).
   * @param {object} options - CLI options.
   * @returns {string|null} Repo-root-relative canonical dir, or null.
   * @memberof UnderpostDockerCompose
   */
  static composeIdBase(options = {}) {
    if (!options.dockerComposeId) return null;
    const deployId = options.deployId || DEFAULT_DEPLOY_ID;
    return `engine-private/conf/${deployId}/docker-compose/${options.dockerComposeId}`;
  }

  /**
   * Builds the base `docker compose` invocation with explicit file and env-file,
   * so behavior is independent of the caller's working directory.
   *
   * Custom workflow (`--docker-compose-id`): the compose file, env-file, and
   * bind-mounted config (nginx.conf, mongodb/) all live in the canonical dir, so
   * compose runs with `--project-directory` pinned there and no app-override.
   * @param {object} options - CLI options.
   * @returns {string} The base command string (without a subcommand).
   * @memberof UnderpostDockerCompose
   */
  static baseCmd(options = {}) {
    const base = UnderpostDockerCompose.composeIdBase(options);
    if (base) {
      const projectDir = UnderpostDockerCompose.resolve(base);
      const composeFile = UnderpostDockerCompose.resolve(options.composeFile || `${base}/docker-compose.yml`);
      const envFile = UnderpostDockerCompose.resolve(options.envFile || `${base}/compose.env`);
      return `docker compose --project-directory ${projectDir} --env-file ${envFile} -f ${composeFile}`;
    }
    const composeFile = UnderpostDockerCompose.resolve(options.composeFile || 'docker-compose.yml');
    const envFile = UnderpostDockerCompose.resolve(options.envFile || 'docker/compose.env');
    const overrideFile = UnderpostDockerCompose.resolve(options.appOverride || 'docker/compose.app.yml');
    const overrideFlag = fs.existsSync(overrideFile) ? ` -f ${overrideFile}` : '';
    return `docker compose --env-file ${envFile} -f ${composeFile}${overrideFlag}`;
  }

  /**
   * Resolves the app container start command for a deployment, mirroring
   * src/cli/deploy.js. The `dd-default` deploy self-bootstraps a fresh engine
   * (matching manifests/deployment/dd-default-development); any other deploy-id
   * follows the standard deploy command (matching
   * manifests/deployment/dd-test-development and
   * UnderpostDeploy.deploymentYamlPartsFactory's default cmd).
   * @param {string} deployId - Deployment identifier (conf id, e.g. `dd-test`).
   * @param {string} env - Deployment environment (e.g. `development`).
   * @returns {string[]} Ordered shell steps joined with `&&` at render time.
   * @memberof UnderpostDockerCompose
   */
  static appCommand(deployId = DEFAULT_DEPLOY_ID, env = 'development') {
    if (deployId === DEFAULT_DEPLOY_ID)
      return [
        // `$$` escapes to a literal `$` so /bin/sh (not Compose) performs the
        // command/variable substitution at container runtime.
        'cd $$(underpost root)/underpost',
        'node bin new --default-conf --conf-workflow-id template',
        // Point the template .env.example at the Docker service-discovery hosts
        // before `new engine` copies it. The generated dd-engine/.env.development
        // is seeded from this file and is applied over the process env by
        // loadConf (src/server/conf.js), so without this the engine would fall
        // back to the .env.example localhost defaults for DB_HOST/VALKEY_HOST.
        'sed -i "s#^DB_HOST=.*#DB_HOST=$${DB_HOST}#" .env.example',
        'sed -i "s#^VALKEY_HOST=.*#VALKEY_HOST=$${VALKEY_HOST}#" .env.example',
        'mkdir -p /home/dd',
        'cd /home/dd',
        'underpost new engine',
      ];
    return ['underpost secret underpost --create-from-env', `underpost start --build --run ${deployId} ${env}`];
  }

  /**
   * Renders a Compose override file that sets only the `app` service command
   * for the selected deployment. Keeping the command in an override file makes
   * the generator the single source of truth and leaves docker-compose.yml
   * deployment-agnostic.
   * @param {string} deployId - Deployment identifier.
   * @param {string} env - Deployment environment.
   * @returns {string} The override YAML document.
   * @memberof UnderpostDockerCompose
   */
  static appOverrideContent(deployId = DEFAULT_DEPLOY_ID, env = 'development') {
    const steps = UnderpostDockerCompose.appCommand(deployId, env).join(' &&\n        ');
    return `# Generated by 'underpost docker-compose --generate --deploy-id ${deployId}' — do not hand-edit.
# Overrides the app service start command for deploy '${deployId}' (${env}).
services:
  app:
    command:
      - /bin/sh
      - -c
      - >
        ${steps}
`;
  }

  /**
   * Renders the dynamic env-file example content for the compose stack.
   * @returns {string} The env-file template.
   * @memberof UnderpostDockerCompose
   */
  static envExampleContent() {
    return `# Generated by 'underpost docker-compose --generate' — copy to docker/compose.env.
# Loaded explicitly via --env-file so container service-discovery values are not
# overridden by the application's host-local (127.0.0.1) root .env.

# --- Container images ----------------------------------------------------
MONGO_IMAGE=mongo:latest
VALKEY_IMAGE=valkey/valkey:latest
APP_IMAGE=underpost/underpost-engine
APP_TAG=v3.2.30
PROXY_IMAGE=nginx:stable-alpine
PROMETHEUS_IMAGE=prom/prometheus:latest
GRAFANA_IMAGE=grafana/grafana:latest

# --- MongoDB (translation of Secret mongodb-secret) ----------------------
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=changeme

# --- Application DB connection (Docker service discovery, not localhost) --
NODE_ENV=development
DB_PROVIDER=mongoose
DB_HOST=mongodb://mongodb:27017
DB_NAME=default
DB_REPLICA_SET=rs0
DB_AUTH_SOURCE=admin

# --- Valkey (Docker service discovery) -----------------------------------
VALKEY_HOST=valkey-service
VALKEY_PORT=6379

# --- Monitoring ----------------------------------------------------------
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin

# --- Host-published ports ------------------------------------------------
PROXY_HTTP_PORT=80
MONGO_HOST_PORT=27017
VALKEY_NODEPORT=32079
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
APP_PORT_4001=4001
APP_PORT_4002=4002
APP_PORT_4003=4003
APP_PORT_4004=4004
`;
  }

  /**
   * Renders the MongoDB container entrypoint. Mirrors src/db/mongo/MongoBootstrap.js:
   * generates the cluster-auth keyfile, launches mongod (replSet + keyFile + auth),
   * and bootstraps the replica set + root user over the loopback localhost
   * exception (single-node member is the `mongodb` service name so app clients
   * connecting with replicaSet=rs0 resolve a reachable host). Idempotent across
   * restarts: re-runs are no-ops once auth is enforced.
   * @returns {string} entrypoint.sh content.
   * @memberof UnderpostDockerCompose
   */
  static mongoEntrypointContent() {
    return `#!/usr/bin/env bash
# Generated by 'underpost docker-compose --generate' — do not hand-edit.
set -e

KEYFILE=/opt/keyfile/mongodb-keyfile
RS="\${DB_REPLICA_SET:-rs0}"
MEMBER_HOST="mongodb:27017"

if [ ! -s "$KEYFILE" ]; then
  openssl rand -base64 756 > "$KEYFILE"
fi
chmod 400 "$KEYFILE"
chown 999:999 "$KEYFILE"
mkdir -p /data/db
chown -R 999:999 /data/db

# One-time replica-set + root-user bootstrap via the localhost exception,
# performed in the background once mongod accepts loopback connections.
(
  for i in $(seq 1 60); do
    if mongosh --quiet --host 127.0.0.1 --eval 'db.adminCommand({ ping: 1 })' >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  cat > /tmp/mongo-bootstrap.js <<JS
var RS = "$RS";
var HOST = "$MEMBER_HOST";
var U = "$MONGO_INITDB_ROOT_USERNAME";
var P = "$MONGO_INITDB_ROOT_PASSWORD";
function waitPrimary() {
  for (var i = 0; i < 60; i++) {
    var h = db.hello();
    if (h.isWritablePrimary) return true;
    sleep(1000);
  }
  return false;
}
var initialized = false;
try {
  var s = rs.status();
  if (s && s.ok === 1) initialized = true;
} catch (e) {
  var m = String(e);
  if (m.indexOf("requires authentication") >= 0 || m.indexOf("not authorized") >= 0 || m.indexOf("Unauthorized") >= 0) {
    initialized = true;
  } else if (m.indexOf("NotYetInitialized") < 0 && m.indexOf("no replset config") < 0) {
    throw e;
  }
}
if (!initialized) {
  rs.initiate({ _id: RS, members: [{ _id: 0, host: HOST }] });
  waitPrimary();
  var admin = db.getSiblingDB("admin");
  try {
    admin.createUser({ user: U, pwd: P, roles: [{ role: "root", db: "admin" }] });
    print("BOOTSTRAP_USER_CREATED");
  } catch (e) {
    var s2 = String(e);
    if (s2.indexOf("already exists") < 0 && s2.indexOf("not authorized") < 0 && s2.indexOf("requires authentication") < 0) {
      throw e;
    }
    print("BOOTSTRAP_USER_SKIP");
  }
  print("BOOTSTRAP_DONE");
} else {
  print("BOOTSTRAP_ALREADY_INITIALIZED");
}
JS

  mongosh --quiet --host 127.0.0.1 /tmp/mongo-bootstrap.js > /tmp/mongo-bootstrap.log 2>&1 || true
) &

exec gosu mongodb mongod \\
  --replSet "$RS" --auth --clusterAuthMode keyFile --keyFile "$KEYFILE" --bind_ip_all
`;
  }

  /**
   * Renders the Prometheus scrape config (mirrors manifests/prometheus).
   * @returns {string} prometheus.yml content.
   * @memberof UnderpostDockerCompose
   */
  static prometheusContent() {
    return `# Generated by 'underpost docker-compose --generate' — do not hand-edit.
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'underpost-app'
    metrics_path: /metrics
    scheme: http
    static_configs:
      - targets: ['${METRICS_TARGET.service}:${METRICS_TARGET.port}']
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
`;
  }

  /**
   * Renders the Grafana datasource provisioning file wiring the Prometheus
   * service as the default datasource.
   * @returns {string} datasource.yml content.
   * @memberof UnderpostDockerCompose
   */
  static grafanaDatasourceContent() {
    return `# Generated by 'underpost docker-compose --generate' — do not hand-edit.
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
`;
  }

  /**
   * Renders all dynamic supporting files: the nginx reverse-proxy config (from
   * PROXY_HOSTS), the monitoring configs (Prometheus + Grafana datasource), and
   * the env-file example. Creates a working env-file from the example only when
   * one does not already exist (never overwrites credentials).
   * @param {object} options - CLI options.
   * @returns {void}
   * @memberof UnderpostDockerCompose
   */
  static generate(options = {}) {
    // Custom workflow: docker-compose.yml, compose.env, and nginx.conf are
    // pre-authored in the canonical dir and used as-is — do NOT generate them.
    // Only (re)write the required MongoDB entrypoint (replica-set bootstrap),
    // the single generated infra artifact, into <canonical>/mongodb so the
    // stack stays self-contained under `--project-directory`.
    const composeIdBase = UnderpostDockerCompose.composeIdBase(options);
    if (composeIdBase) {
      const mongoEntrypointPath = UnderpostDockerCompose.resolve(`${composeIdBase}/mongodb/entrypoint.sh`);
      fs.mkdirpSync(nodePath.dirname(mongoEntrypointPath));
      fs.writeFileSync(mongoEntrypointPath, UnderpostDockerCompose.mongoEntrypointContent(), { mode: 0o755 });
      logger.info('mongodb entrypoint written (custom workflow)', { path: mongoEntrypointPath });
      return;
    }

    Nginx.removeRouter();
    for (const { host, routes } of PROXY_HOSTS) Nginx.createApp({ host, routes });
    Nginx.createDefaultServer(DEFAULT_UPSTREAM);
    Nginx.writeConf(UnderpostDockerCompose.resolve(options.nginxConf || 'docker/nginx/default.conf'));

    const mongoEntrypointPath = UnderpostDockerCompose.resolve('docker/mongodb/entrypoint.sh');
    fs.mkdirpSync(nodePath.dirname(mongoEntrypointPath));
    fs.writeFileSync(mongoEntrypointPath, UnderpostDockerCompose.mongoEntrypointContent(), { mode: 0o755 });
    logger.info('mongodb entrypoint written', { path: mongoEntrypointPath });

    const promPath = UnderpostDockerCompose.resolve('docker/prometheus/prometheus.yml');
    fs.mkdirpSync(nodePath.dirname(promPath));
    fs.writeFileSync(promPath, UnderpostDockerCompose.prometheusContent(), 'utf8');
    const grafanaDsPath = UnderpostDockerCompose.resolve('docker/grafana/provisioning/datasources/datasource.yml');
    fs.mkdirpSync(nodePath.dirname(grafanaDsPath));
    fs.writeFileSync(grafanaDsPath, UnderpostDockerCompose.grafanaDatasourceContent(), 'utf8');
    logger.info('monitoring config written', { prometheus: promPath, grafanaDatasource: grafanaDsPath });

    const examplePath = UnderpostDockerCompose.resolve('docker/compose.env.example');
    fs.mkdirpSync(nodePath.dirname(examplePath));
    fs.writeFileSync(examplePath, UnderpostDockerCompose.envExampleContent(), 'utf8');
    logger.info('env example written', { path: examplePath });

    const envPath = UnderpostDockerCompose.resolve(options.envFile || 'docker/compose.env');
    if (!fs.existsSync(envPath)) {
      fs.copySync(examplePath, envPath);
      logger.warn('created working env-file from example — set real credentials', { path: envPath });
    } else logger.info('working env-file already present (left untouched)', { path: envPath });

    const deployId = options.deployId || DEFAULT_DEPLOY_ID;
    const env = options.env || 'development';
    const overridePath = UnderpostDockerCompose.resolve(options.appOverride || 'docker/compose.app.yml');
    fs.writeFileSync(overridePath, UnderpostDockerCompose.appOverrideContent(deployId, env), 'utf8');
    logger.info('app command override written', { path: overridePath, deployId, env });
  }

  /**
   * Installs Docker Engine and the Compose v2 plugin on RHEL-compatible hosts
   * (Rocky Linux) from the official Docker CE repository. Idempotent and
   * host-safe: skips installation when `docker compose` already works (unless
   * `--force`), validates the platform, enables the service, and adds the
   * invoking user to the `docker` group.
   * @param {object} options - CLI options.
   * @param {boolean} [options.force] - Reinstall even if Compose is already present.
   * @returns {void}
   * @memberof UnderpostDockerCompose
   */
  static install(options = {}) {
    if (process.platform !== 'linux') {
      logger.warn('docker-compose --install only supports Linux (RHEL/Rocky); skipping', {
        platform: process.platform,
      });
      return;
    }

    if (!fs.existsSync('/etc/redhat-release')) {
      logger.warn('Host does not look RHEL-compatible (/etc/redhat-release missing); proceeding with dnf anyway');
    }

    if (!options.force) {
      const probe = shellExec('docker compose version', { silent: true, silentOnError: true });
      if (probe && probe.code === 0) {
        logger.info('Docker Compose already installed; skipping (use --force to reinstall)', {
          version: (probe.stdout || '').trim(),
        });
        return;
      }
    }

    shellExec(`sudo dnf -y install dnf-plugins-core`);
    shellExec(`sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo`);
    shellExec(`sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`);

    shellExec(`sudo systemctl enable --now docker`);

    const user = options.user || process.env.SUDO_USER || process.env.USER || '';
    if (user && user !== 'root') {
      shellExec(`sudo groupadd docker 2>/dev/null || true`);
      shellExec(`sudo usermod -aG docker ${user}`);
      logger.info(`Added '${user}' to the docker group — log out/in (or run 'newgrp docker') to use docker rootless`);
    }

    const verify = shellExec('docker compose version', { silent: true, silentOnError: true, stdout: true });
    logger.info('Docker Compose installation complete', { version: `${verify || ''}`.trim() });
  }

  /**
   * Comprehensive reset of the Docker Compose stack — the compose equivalent of
   * `cluster --reset` in src/cli/cluster.js. Tears down all stack containers,
   * the project network, and the named volumes (destroying persisted MongoDB /
   * Valkey / Prometheus / Grafana data), removes orphans, and prunes generated
   * artifacts so the next `--up` is a clean slate. The working env-file
   * (credentials) is preserved unless `--force` is passed.
   * @param {object} options - CLI options.
   * @param {boolean} [options.force] - Also remove the working env-file (docker/compose.env).
   * @returns {void}
   * @memberof UnderpostDockerCompose
   */
  static reset(options = {}) {
    logger.info('=== DOCKER COMPOSE RESET (destroys containers, network, and volume data) ===');

    // Phase 1: tear down containers, orphans, named volumes, and compose-built images.
    shellExec(`${UnderpostDockerCompose.baseCmd(options)} down --remove-orphans --volumes --rmi local`, {
      silentOnError: true,
    });

    // Custom workflow: the compose file, compose.env, and nginx.conf are
    // hand-authored source — never prune them. Only drop the one generated
    // artifact (the mongo entrypoint), regenerated on the next --up/--generate.
    const composeIdBase = UnderpostDockerCompose.composeIdBase(options);
    if (composeIdBase) {
      const mongoEntrypointPath = UnderpostDockerCompose.resolve(`${composeIdBase}/mongodb/entrypoint.sh`);
      if (fs.existsSync(mongoEntrypointPath)) {
        fs.removeSync(mongoEntrypointPath);
        logger.info('removed generated artifact', { path: mongoEntrypointPath });
      }
      logger.info('Docker Compose reset complete. Run `--up` to recreate the stack.');
      return;
    }

    // Phase 2: prune generated artifacts (regenerated on the next --generate/--up).
    const artifacts = options.force
      ? [...GENERATED_ARTIFACTS, options.envFile || 'docker/compose.env']
      : GENERATED_ARTIFACTS;
    for (const rel of artifacts) {
      const target = UnderpostDockerCompose.resolve(rel);
      if (fs.existsSync(target)) {
        fs.removeSync(target);
        logger.info('removed generated artifact', { path: target });
      }
    }

    logger.info('Docker Compose reset complete. Run `--up` to recreate the stack.');
  }

  static API = {
    /**
     * @method callback
     * @description Single CLI entrypoint for the docker-compose pipeline. The
     * action is selected by flag options; multiple lifecycle flags may be
     * combined (e.g. `--generate --up`). When no action flag is supplied it
     * defaults to `--up`.
     * @param {string} [target] - Optional service name (logs/shell/restart) or
     *   passthrough subcommand context.
     * @param {object} [options] - CLI options.
     * @param {boolean} [options.install] - Install Docker + Compose on RHEL/Rocky hosts.
     * @param {boolean} [options.reset] - Comprehensive teardown of the whole stack (containers, network, volumes) + prune generated artifacts.
     * @param {boolean} [options.force] - Force reinstall (--install), remove volumes (--down), or also drop the env-file (--reset).
     * @param {boolean} [options.generate] - Render nginx config + env-file.
     * @param {boolean} [options.up] - Start the full stack detached (implies generate).
     * @param {boolean} [options.down] - Stop and remove containers.
     * @param {boolean} [options.volumes] - With --down, also remove named volumes (destroys data).
     * @param {boolean} [options.restart] - Restart services (optionally a single `target`).
     * @param {boolean} [options.build] - With --up rebuild images; alone, `build --no-cache`.
     * @param {boolean} [options.pull] - Pull upstream images.
     * @param {boolean} [options.logs] - Follow logs (optionally a single `target`).
     * @param {boolean} [options.status] - Show a formatted status table.
     * @param {boolean} [options.shell] - Open an interactive shell in `target` (default: app).
     * @param {string} [options.exec] - General-purpose passthrough docker compose subcommand.
     * @param {string} [options.deployId] - Deployment to run as the app (default: dd-default). `dd-default` self-bootstraps a fresh engine; any other id runs the standard `underpost start` command.
     * @param {string} [options.dockerComposeId] - Custom-workflow selector. When set, use the canonical stack at `engine-private/conf/<deploy-id>/docker-compose/<docker-compose-id>/` (docker-compose.yml + compose.env + nginx.conf, used as-is), skipping nginx/env/app-override generation. Used by the Cyberia MMO ecosystem (`--deploy-id dd-cyberia --docker-compose-id cyberia`).
     * @param {string} [options.env] - Deployment environment for non-default deploy ids (default: development).
     * @param {string} [options.composeFile] - Override compose file path.
     * @param {string} [options.envFile] - Override env-file path.
     * @param {string} [options.nginxConf] - Override generated nginx config path.
     * @param {string} [options.appOverride] - Override generated app-command override path.
     * @returns {Promise<void>}
     * @memberof UnderpostDockerCompose
     */
    async callback(target = '', options = {}) {
      try {
        if (options.install) {
          UnderpostDockerCompose.install(options);
          const onlyInstall = !options.up && !options.down && !options.generate && !options.exec;
          if (onlyInstall) return;
        }

        if (options.reset) {
          UnderpostDockerCompose.reset(options);
          const onlyReset = !options.up && !options.generate;
          if (onlyReset) return;
        }

        // "Bring up" is the explicit --up or the no-action default.
        const isUp =
          options.up ||
          !(
            options.exec ||
            options.down ||
            options.restart ||
            options.build ||
            options.pull ||
            options.logs ||
            options.status ||
            options.shell ||
            options.generate
          );

        // Generate dynamic config BEFORE composing the invocation: baseCmd()
        // conditionally includes `-f compose.app.yml`, so the override must
        // exist first (notably after --reset, which prunes it).
        if (isUp || options.generate) UnderpostDockerCompose.generate(options);

        const base = UnderpostDockerCompose.baseCmd(options);

        if (options.exec) {
          shellExec(`${base} ${options.exec}`);
          return;
        }

        if (isUp) {
          shellExec(`${base} up -d${options.build ? ' --build' : ''}`);
          return;
        }

        if (options.down) {
          shellExec(`${base} down --remove-orphans${options.volumes ? ' --volumes' : ''}`);
          return;
        }

        if (options.restart) {
          shellExec(`${base} restart${target ? ` ${target}` : ''}`);
          return;
        }

        if (options.build) {
          shellExec(`${base} build --no-cache${target ? ` ${target}` : ''}`);
          return;
        }

        if (options.pull) {
          shellExec(`${base} pull`);
          return;
        }

        if (options.logs) {
          shellExec(`${base} logs -f --tail=200${target ? ` ${target}` : ''}`);
          return;
        }

        if (options.status) {
          shellExec(`${base} ps --format 'table {{.Name}}\\t{{.Service}}\\t{{.Status}}\\t{{.Ports}}'`);
          return;
        }

        if (options.shell) {
          const service = target || 'app';
          shellExec(`${base} exec ${service} ${service === 'app' ? '/bin/bash' : '/bin/sh'}`);
          return;
        }

        // Remaining case: --generate alone (config already written above).
      } catch (error) {
        logger.error(error);
        process.exit(1);
      }
    },
  };
}

export default UnderpostDockerCompose;
