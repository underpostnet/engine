import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import UnderpostDockerCompose from '../../../src/cli/docker-compose.js';
import { loadConfServerJson } from '../../../src/server/runtime/conf.js';
import { hostPortsFactory } from '../../../src/server/network/router.js';

// The dd-cyberia compose stack is rendered from conf.server.json, compose.env and the release
// instances. This pins the canonical files to that rendering and the images to the same ports.
const OPTIONS = { deployId: 'dd-cyberia', dockerComposeId: 'cyberia' };
const CANONICAL = './engine-private/conf/dd-cyberia/docker-compose/cyberia';
const MIRROR = './src/runtime/engine-cyberia';
const CONF_SERVER = './engine-private/conf/dd-cyberia/conf.server.json';

const present = fs.existsSync(CANONICAL) && fs.existsSync(CONF_SERVER);
const read = (base, name) => fs.readFileSync(`${base}/${name}`, 'utf8');
const composeEnv = () => dotenv.parse(read(CANONICAL, 'compose.env'));

describe.skipIf(!present)('the dd-cyberia compose stack', () => {
  it('holds the stack as its project renders it', async () => {
    const files = await UnderpostDockerCompose.renderStack(OPTIONS);
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const [path, content] of Object.entries(files))
      expect(fs.readFileSync(path, 'utf8'), `${path}: run node bin/cyberia run-workflow docker:generate`).toBe(content);
  });

  it('mirrors the canonical stack into the published runtime directory', async () => {
    const names = Object.keys(await UnderpostDockerCompose.renderStack(OPTIONS)).map((path) =>
      path.slice(path.indexOf('/docker-compose/cyberia/') + '/docker-compose/cyberia/'.length),
    );
    for (const name of [...names, 'compose.env']) expect(read(MIRROR, name), name).toBe(read(CANONICAL, name));
  });

  it('points the public engine URL at the host that owns the Cyberia APIs', () => {
    const conf = loadConfServerJson(CONF_SERVER);
    const env = composeEnv();
    const cyberiaHost = env.DEFAULT_DEPLOY_HOST;
    expect(conf[cyberiaHost]['/'].apis).toContain('cyberia-instance');
    const port = hostPortsFactory(conf, Number(env.PORT) + 1)[`${cyberiaHost}/`];
    expect(env.ENGINE_PUBLIC_URL).toBe(`http://localhost:${port}`);
  });

  it('declares the same port block in the image as the stack publishes', () => {
    const ports = Object.values(hostPortsFactory(loadConfServerJson(CONF_SERVER), Number(composeEnv().PORT) + 1));
    const span = Math.max(...ports) - Math.min(...ports);
    for (const name of ['Dockerfile', 'Dockerfile.dev']) {
      const [, first, last] = read(MIRROR, name).match(/^EXPOSE (\d+)-(\d+)$/m);
      expect(Number(last) - Number(first), name).toBe(span);
    }
  });

  it('sets every env value the engine conf reads', () => {
    const names = [...fs.readFileSync(CONF_SERVER, 'utf8').matchAll(/"env:([A-Z0-9_]+)"/g)].map(([, name]) => name);
    const env = composeEnv();
    for (const name of new Set(names)) expect(env[name], name).toBeTruthy();
    // A consumer host writes to the Object Layer authority with this key.
    expect(env.DOMAIN_API_SERVICE_KEY).toBeTruthy();
  });
});
