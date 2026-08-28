/**
 * Client CLI module: the entry point for every `src/client-builder/*.js` build surface.
 * Owns environment resolution for a build, replica materialization, port synchronization,
 * and the bundle zip/unzip/merge operations.
 * @module src/cli/client.js
 * @namespace UnderpostClient
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';

import { buildClient, mergeClientBuildZip, unzipClientBuild } from '../client-builder/client-build.js';
import {
  Config,
  buildReplicaId,
  getDataDeploy,
  loadConf,
  loadConfServerJson,
  loadReplicas,
  readConfJson,
} from '../server/runtime/conf.js';
import { deployEnvFactory, writeEnv } from '../server/runtime/environment.js';
import { loggerFactory } from '../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostClient
 * @description CLI orchestration for client builds.
 * @memberof UnderpostClient
 */
class UnderpostClient {
  static API = {
    /**
     * Builds client assets, single replicas, and/or syncs environment ports.
     *
     * The build environment is resolved here and nowhere else: `--env` names it explicitly,
     * `--dev` is the development shorthand, and only an unflagged call inherits the ambient
     * `NODE_ENV`. Whatever it resolves to is written back to `process.env.NODE_ENV` before
     * {@link ServerConfBuilder.loadConf} runs, because loadConf picks `conf.*.json` and
     * `.env.<env>` from it — an unsynchronized environment is what made SSR builds silently
     * render as `development` on a production deploy.
     * @param {string} [deployId='dd-default'] - The deployment ID.
     * @param {string} [subConf=''] - The sub-configuration for the build.
     * @param {string} [host=''] - Comma-separated hosts to filter the build.
     * @param {string} [path=''] - Comma-separated paths to filter the build.
     * @param {object} [options] - Build options.
     * @param {string} [options.env=''] - Target environment; falls back to `--dev`, then ambient NODE_ENV.
     * @param {boolean} [options.dev=false] - Development context shorthand for `--env development`.
     * @param {boolean} [options.syncEnvPort=false] - If true, syncs environment port assignments across all deploy IDs.
     * @param {boolean} [options.singleReplica=false] - If true, builds single replica folders instead of full client.
     * @param {boolean} [options.buildZip=false] - If true, creates zip files of the builds.
     * @param {string|number} [options.split=''] - Optional ZIP part size in MB. When set with buildZip, writes split parts.
     * @param {string} [options.unzip=''] - Optional build ZIP prefix to extract from ./build.
     * @param {string} [options.mergeZip=''] - Optional build prefix to merge split ZIP parts into a single ZIP.
     * @param {boolean} [options.liteBuild=false] - If true, skips full build (default is full build).
     * @param {boolean} [options.iconsBuild=false] - If true, builds icons.
     * @param {boolean} [options.ssr=false] - If true, rebuilds only the SSR views declared in conf.ssr.json.
     * @returns {Promise<boolean>} A promise that resolves when the build is complete.
     * @memberof UnderpostClient
     */
    callback(
      deployId = 'dd-default',
      subConf = '',
      host = '',
      path = '',
      options = {
        env: '',
        dev: false,
        syncEnvPort: false,
        singleReplica: false,
        buildZip: false,
        split: '',
        unzip: '',
        mergeZip: '',
        liteBuild: false,
        iconsBuild: false,
        ssr: false,
      },
    ) {
      return new Promise(async (resolve, reject) => {
        try {
          const env = deployEnvFactory(options, process.env.NODE_ENV || 'development');
          process.env.NODE_ENV = env;
          if (options.mergeZip) {
            mergeClientBuildZip({
              buildPrefix: options.mergeZip,
              logger,
            });
            return resolve(true);
          }

          if (options.unzip) {
            unzipClientBuild({
              buildPrefix: options.unzip,
              logger,
            });
            return resolve(true);
          }

          // Handle singleReplica operation (must run before syncEnvPort to ensure replica dirs exist)
          if (options.singleReplica) {
            const replicaPath = path;
            if (!deployId || !host || !replicaPath) {
              logger.error('client --single-replica requires deploy-id, host, and path arguments');
              return reject(false);
            }
            const serverConf = loadReplicas(
              deployId,
              loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
            );

            if (serverConf[host][replicaPath].replicas) {
              {
                let replicaIndex = -1;
                for (const replica of serverConf[host][replicaPath].replicas) {
                  replicaIndex++;
                  const replicaDeployId = `${deployId}-${serverConf[host][replicaPath].replicas[replicaIndex].slice(1)}`;
                  await fs.copy(`./engine-private/conf/${deployId}`, `./engine-private/replica/${replicaDeployId}`);
                  fs.writeFileSync(
                    `./engine-private/replica/${replicaDeployId}/package.json`,
                    fs
                      .readFileSync(`./engine-private/replica/${replicaDeployId}/package.json`, 'utf8')
                      .replaceAll(`${deployId}`, `${replicaDeployId}`),
                    'utf8',
                  );
                  const replicaFolder = `./engine-private/replica/${replicaDeployId}`;
                  for (const envFile of ['.env.production', '.env.development', '.env.test']) {
                    const envFilePath = `${replicaFolder}/${envFile}`;
                    if (fs.existsSync(envFilePath)) {
                      fs.writeFileSync(
                        envFilePath,
                        fs
                          .readFileSync(envFilePath, 'utf8')
                          .replaceAll(`DEPLOY_ID=${deployId}`, `DEPLOY_ID=${replicaDeployId}`),
                        'utf8',
                      );
                    }
                  }
                }
              }
              {
                let replicaIndex = -1;
                for (const replica of serverConf[host][replicaPath].replicas) {
                  replicaIndex++;
                  const replicaDeployId = `${deployId}-${serverConf[host][replicaPath].replicas[replicaIndex].slice(1)}`;
                  let replicaServerConf = JSON.parse(
                    fs.readFileSync(`./engine-private/replica/${replicaDeployId}/conf.server.json`, 'utf8'),
                  );

                  const singleReplicaConf = replicaServerConf[host][replicaPath];
                  singleReplicaConf.replicas = undefined;
                  singleReplicaConf.singleReplica = undefined;

                  replicaServerConf = {};
                  replicaServerConf[host] = {};
                  replicaServerConf[host][replica] = singleReplicaConf;

                  fs.writeFileSync(
                    `./engine-private/replica/${replicaDeployId}/conf.server.json`,
                    JSON.stringify(replicaServerConf, null, 4),
                    'utf8',
                  );
                }
              }
            }
            if (!options.syncEnvPort) return resolve(true);
          }

          // Handle syncEnvPort operation
          if (options.syncEnvPort) {
            const dataDeploy = await getDataDeploy({ disableSyncEnvPort: true });
            const dataEnv = [
              { env: 'production', port: 3000 },
              { env: 'development', port: 4000 },
              { env: 'test', port: 5000 },
            ];
            let portOffset = 0;
            const singleReplicaPortOffsets = {};
            for (const deployIdObj of dataDeploy) {
              const { deployId } = deployIdObj;
              const baseConfPath = fs.existsSync(`./engine-private/replica/${deployId}`)
                ? `./engine-private/replica`
                : `./engine-private/conf`;

              const effectivePortOffset =
                singleReplicaPortOffsets[deployId] !== undefined ? singleReplicaPortOffsets[deployId] : portOffset;

              let skipDeploy = false;
              for (const envInstanceObj of dataEnv) {
                const envPath = `${baseConfPath}/${deployId}/.env.${envInstanceObj.env}`;
                if (!fs.existsSync(envPath)) {
                  logger.warn(`Skipping ${deployId}: ${envPath} not found`);
                  skipDeploy = true;
                  break;
                }
                const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
                envObj.PORT = `${envInstanceObj.port + effectivePortOffset}`;
                writeEnv(envPath, envObj);
              }

              if (skipDeploy) continue;
              if (singleReplicaPortOffsets[deployId] !== undefined) continue;

              const serverConf = loadReplicas(
                deployId,
                loadConfServerJson(`${baseConfPath}/${deployId}/conf.server.json`),
              );
              for (const host of Object.keys(serverConf)) {
                let deferredSingleReplicaSlots = [];
                for (const path of Object.keys(serverConf[host])) {
                  if (serverConf[host][path].singleReplica && serverConf[host][path].replicas) {
                    deferredSingleReplicaSlots.push({
                      replicas: serverConf[host][path].replicas,
                      peer: !!serverConf[host][path].peer,
                    });
                    continue;
                  }
                  portOffset++;
                  if (serverConf[host][path].peer) portOffset++;
                }
                for (const slot of deferredSingleReplicaSlots) {
                  for (const replica of slot.replicas) {
                    const replicaDeployId = buildReplicaId({ deployId, replica });
                    singleReplicaPortOffsets[replicaDeployId] = portOffset;
                    portOffset++;
                    if (slot.peer) portOffset++;
                  }
                }
              }
            }
            return resolve(true);
          }

          // Handle buildFullClient operation (default)
          {
            const { deployId: resolvedDeployId } = loadConf(deployId, subConf ?? '');

            const argHost = host ? host.split(',') : [];
            const argPath = path ? path.split(',') : [];
            const selectedInstances =
              argHost.length > 0 && argPath.length > 0
                ? argHost.flatMap((selectedHost) =>
                    argPath.map((selectedPath) => ({ host: selectedHost, path: selectedPath })),
                  )
                : [];
            let deployIdSingleReplicas = [];
            const isReplicaContext = resolvedDeployId
              ? fs.existsSync(`./engine-private/replica/${resolvedDeployId}`)
              : false;
            const serverConf = resolvedDeployId
              ? readConfJson(resolvedDeployId, 'server', { subConf: subConf ?? '', loadReplicas: true })
              : Config.default.server;
            for (const host of Object.keys(serverConf)) {
              for (const path of Object.keys(serverConf[host])) {
                if (
                  selectedInstances.length > 0 &&
                  !selectedInstances.some((instance) => instance.host === host && instance.path === path)
                )
                  continue;
                if (!isReplicaContext && serverConf[host][path].singleReplica && serverConf[host][path].replicas)
                  deployIdSingleReplicas = deployIdSingleReplicas.concat(
                    serverConf[host][path].replicas.map((replica) =>
                      buildReplicaId({ deployId: resolvedDeployId, replica }),
                    ),
                  );
              }
            }
            await buildClient({
              deployId: resolvedDeployId,
              subConf: subConf ?? '',
              instances: selectedInstances,
              buildZip: options.buildZip || false,
              split: options.split || '',
              fullBuild: options.liteBuild ? false : true,
              iconsBuild: options.iconsBuild || false,
              ssrOnly: options.ssr || false,
            });
            for (const replicaDeployId of deployIdSingleReplicas) {
              if (!fs.existsSync(`./engine-private/replica/${replicaDeployId}`)) {
                logger.warn('Skip replica client build: replica folder not found', { replicaDeployId });
                continue;
              }
              await UnderpostClient.API.callback(replicaDeployId, '', '', '', {
                env,
                buildZip: options.buildZip || false,
                split: options.split || '',
                liteBuild: options.liteBuild || false,
                iconsBuild: options.iconsBuild || false,
                ssr: options.ssr || false,
              });
            }

            return resolve(true);
          }
        } catch (error) {
          console.error(error);
          logger.error(error, error.stack);
          return reject(false);
        }
      });
    },
  };
}

export default UnderpostClient;
