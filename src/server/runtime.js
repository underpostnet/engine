/**
 * The main runtime orchestrator responsible for reading configuration,
 * initializing services (Prometheus, Ports, DB, Mailer), and building the
 * specific server runtime for each host/path (e.g., nodejs, lampp).
 * @module src/server/runtime.js
 * @namespace Runtime
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';
import * as promClient from 'prom-client';

import { loggerFactory } from './logger.js';
import { newInstance } from '../client/components/core/CommonJs.js';
import { Lampp } from '../runtime/lampp/Lampp.js';
import { getInstanceContext } from './conf.js';

import ExpressService from '../runtime/express/Express.js';

import Underpost from '../index.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Reads server configurations, sets up Prometheus metrics, and iterates through
 * all defined hosts and paths to build and start the corresponding runtime instances.
 *
 * @memberof Runtime
 * @returns {Promise<void>}
 * @function buildRuntime
 */
const buildRuntime = async () => {
  const deployId = process.env.DEPLOY_ID;

  // Initialize Prometheus Metrics
  const collectDefaultMetrics = promClient.collectDefaultMetrics;
  collectDefaultMetrics();

  const promCounterOption = {
    name: `${deployId.replaceAll('-', '_')}_http_requests_total`,
    help: 'Total number of HTTP requests',
    labelNames: ['instance', 'method', 'status_code'],
  };

  const requestCounter = new promClient.Counter(promCounterOption);
  const initPort = parseInt(process.env.PORT) + 1;
  let currentPort = initPort;

  // Load Configuration
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const confSSR = JSON.parse(fs.readFileSync(`./conf/conf.ssr.json`, 'utf8'));

  // Iterate through hosts and paths
  for (const host of Object.keys(confServer)) {
    let singleReplicaOffsetPortCount = 0;
    const rootHostPath = `/public/${host}`;
    for (const path of Object.keys(confServer[host])) {
      confServer[host][path].port = newInstance(currentPort);
      const {
        runtime,
        port,
        client,
        apis,
        origins,
        directory,
        ws,
        mailer,
        db,
        redirect,
        peer,
        singleReplica,
        replicas,
        valkey,
        apiBaseHost,
        useLocalSsl,
      } = confServer[host][path];

      // Calculate context data
      const { redirectTarget, singleReplicaOffsetPortSum } = await getInstanceContext({
        deployId,
        redirect,
        singleReplica,
        replicas,
      });

      if (singleReplicaOffsetPortSum > 0) {
        singleReplicaOffsetPortCount += singleReplicaOffsetPortSum;
        continue;
      }

      const runningData = {
        host,
        path,
        runtime,
        client,
        meta: import.meta,
        apis,
      };

      switch (runtime) {
        case 'nodejs':
          logger.info('Build nodejs server runtime', `${host}${path}:${port}`);

          const { portsUsed } = await ExpressService.createApp({
            host,
            path,
            port,
            client,
            apis,
            origins,
            directory,
            useLocalSsl,
            ws,
            mailer,
            db,
            redirect,
            peer,
            valkey,
            apiBaseHost,
            redirectTarget,
            rootHostPath,
            confSSR,
            promRequestCounter: requestCounter,
            promRegister: promClient.register,
          });

          // Increment currentPort by any additional ports used by the service (e.g., PeerServer port)
          currentPort += portsUsed;
          break;

        case 'lampp':
          {
            const { disabled } = await Lampp.createApp({
              port,
              host,
              path,
              directory,
              rootHostPath,
              redirect,
              redirectTarget,
              resetRouter: currentPort === initPort,
            });
            if (disabled) continue;
            await Underpost.start.listenPortController(Underpost.start.listenServerFactory(), port, runningData);
          }
          break;
        default:
          break;
      }
      currentPort++;
    }
    currentPort += singleReplicaOffsetPortCount;
  }

  if (Lampp.enabled() && Lampp.router) Lampp.initService();

  Underpost.start.logRuntimeRouter();
};

export { buildRuntime };
