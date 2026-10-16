/**
 * The origins of the Cyberia processes of a deploy in one environment, from its canonical conf: the
 * portal (the host that serves the launch tickets and the content), the game client, the game
 * server, and the engine address the game server reads content at. Production uses the public
 * hosts; development the local ports the conf assigns them, and the stable traffic Service of the
 * deploy inside the cluster.
 *
 * @module src/projects/cyberia/runtime/game-origins.js
 * @namespace CyberiaGameOrigins
 */
import dotenv from 'dotenv';
import fs from 'fs-extra';
import Underpost from '../../../index.js';
import { deployEnvFilePath, readConfInstances, readConfJson } from '../../../server/runtime/conf.js';
import { hostPortsFactory, instanceOriginsFactory } from '../../../server/network/router.js';

/**
 * @param {string} deployId
 * @param {'development'|'production'} environment
 * @returns {{portal: string, client: string, server: string, engine: string}}
 * @throws {Error} When the conf serves the launch tickets on no host, or declares no game runtime.
 * @memberof CyberiaGameOrigins
 */
const gameOrigins = (deployId, environment) => {
  const development = environment === 'development';
  const confServer = readConfJson(deployId, 'server', { loadReplicas: true });
  const portal = Object.keys(confServer).find((host) => confServer[host]['/']?.apis?.includes('cyberia-game-ticket'));
  if (!portal) throw new Error(`gameOrigins: no host of ${deployId} serves cyberia-game-ticket`);
  const { 'cyberia-client': client, 'cyberia-server': server } = instanceOriginsFactory(
    readConfInstances(deployId),
    development,
  );
  if (!client || !server) throw new Error(`gameOrigins: ${deployId} declares no cyberia-client or cyberia-server`);
  if (!development) return { portal: `https://${portal}`, client, server, engine: `https://${portal}` };
  const { PORT } = dotenv.parse(fs.readFileSync(deployEnvFilePath(deployId, 'development'), 'utf8'));
  const port = hostPortsFactory(confServer, Number(PORT) + 1)[`${portal}/`];
  const service = Underpost.deploy.trafficServiceNameFactory({ deployId, env: environment });
  return { portal: `http://localhost:${port}`, client, server, engine: `http://${service}:${port}` };
};

/**
 * The origins a game instance links to, as its env: the client reads content from the portal and
 * plays on the server; the server reads content from the engine and accepts the browser origins of
 * the portal and the client.
 * @param {{deployId: string, instance: {runtime: string}, environment: string}} params
 * @returns {Object<string, string>}
 * @memberof CyberiaGameOrigins
 */
const gameOriginEnv = ({ deployId, instance, environment }) => {
  const { portal, client, server, engine } = gameOrigins(deployId, environment);
  if (instance.runtime === 'cyberia-client')
    return { CYBERIA_DATA_SERVER_URL: portal, CYBERIA_WS_ORIGIN: server.replace(/^http/, 'ws') };
  if (instance.runtime === 'cyberia-server')
    return { CYBERIA_DATA_SERVER_URL: engine, CYBERIA_CORS_ALLOWED_ORIGINS: `${portal},${client}` };
  return {};
};

export { gameOriginEnv, gameOrigins };
