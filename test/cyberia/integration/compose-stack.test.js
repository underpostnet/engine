import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import { load as yamlLoad } from 'js-yaml';
import { loadConfServerJson } from '../../../src/server/runtime/conf.js';
import { hostPortsFactory } from '../../../src/server/network/router.js';

// The dd-cyberia compose stack serves the same domains, on the same ports, as the engine it
// runs. conf.server.json is where that map comes from; this pins the stack to it.
const CANONICAL = './engine-private/conf/dd-cyberia/docker-compose/cyberia';
const MIRROR = './src/runtime/engine-cyberia';
const CONF_SERVER = './engine-private/conf/dd-cyberia/conf.server.json';

const present = fs.existsSync(CANONICAL) && fs.existsSync(CONF_SERVER);
const read = (base, name) => fs.readFileSync(`${base}/${name}`, 'utf8');

const composeEnv = () => dotenv.parse(read(CANONICAL, 'compose.env'));
const enginePorts = () => {
  const conf = loadConfServerJson(CONF_SERVER);
  return hostPortsFactory(conf, Number(composeEnv().PORT) + 1);
};
/** `host` → port, for the hosts a browser reaches; peer servers carry no client. */
const domainPorts = () =>
  Object.fromEntries(
    Object.entries(enginePorts())
      .filter(([key]) => !key.endsWith('/peer'))
      .map(([key, port]) => [key.replace(/\/$/, ''), port]),
  );

describe.skipIf(!present)('the dd-cyberia compose stack', () => {
  it('publishes one block covering every port the engine listens on', () => {
    const ports = Object.values(enginePorts());
    const range = `${Math.min(...ports)}-${Math.max(...ports)}`;
    expect(composeEnv().ENGINE_CYBERIA_PORT_RANGE).toBe(range);
    expect(read(CANONICAL, 'docker-compose.yml')).toContain(
      `- '${'${ENGINE_CYBERIA_PORT_RANGE:-' + range + '}'}:${'${ENGINE_CYBERIA_PORT_RANGE:-' + range + '}'}'`,
    );
  });

  it('routes every domain to the port that domain listens on', () => {
    const conf = read(CANONICAL, 'nginx.conf');
    const map = conf.slice(conf.indexOf('map $host $engine_upstream {'));
    const routed = Object.fromEntries(
      [...map.slice(0, map.indexOf('}')).matchAll(/^\s+(\S+)\s+engine-cyberia-runtime:(\d+);$/gm)].map(
        ([, host, port]) => [host, Number(port)],
      ),
    );
    const { default: fallback, ...domains } = routed;
    expect(domains).toEqual(domainPorts());
    // An unknown Host reaches the Cyberia host, the one that owns the Cyberia APIs.
    expect(fallback).toBe(domainPorts()['www.cyberiaonline.com']);
  });

  it('names every domain in the server block that answers them', () => {
    const conf = read(CANONICAL, 'nginx.conf');
    const block = conf.slice(conf.indexOf('server_name underpost.net'));
    const names = block.slice(0, block.indexOf(';'));
    for (const domain of Object.keys(domainPorts())) expect(names, domain).toContain(domain);
  });

  it('resolves every domain to the proxy inside the network', () => {
    const compose = read(CANONICAL, 'docker-compose.yml');
    const aliases = compose.slice(compose.indexOf('aliases:'), compose.indexOf('ports:', compose.indexOf('aliases:')));
    for (const domain of Object.keys(domainPorts())) expect(aliases, domain).toContain(`- ${domain}`);
  });

  it('points the Cyberia data plane at the host that owns the Cyberia APIs', () => {
    const conf = loadConfServerJson(CONF_SERVER);
    const cyberiaHost = composeEnv().DEFAULT_DEPLOY_HOST;
    expect(conf[cyberiaHost]['/'].apis).toContain('cyberia-instance');

    const port = domainPorts()[cyberiaHost];
    expect(Number(composeEnv().ENGINE_CYBERIA_REST_PORT)).toBe(port);
    expect(composeEnv().ENGINE_PUBLIC_URL).toBe(`http://localhost:${port}`);

    // What the WASM client and the game server reach: the client gateway's API and asset
    // routes, and the engine-cyberia alias every container dials.
    const nginx = read(CANONICAL, 'nginx.conf');
    const blockOf = (marker) => nginx.slice(nginx.indexOf(marker), nginx.indexOf('}', nginx.indexOf(marker)));
    for (const marker of ['location /api/ {', 'location /assets/ {', 'server_name engine-cyberia'])
      expect(blockOf(marker), marker).toContain(`engine-cyberia-runtime:${port};`);
  });

  it('declares the same port block in the image as the stack publishes', () => {
    const ports = Object.values(enginePorts());
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

  it('builds the content release against the live engine before any game server starts', () => {
    const { services } = yamlLoad(read(CANONICAL, 'docker-compose.yml'));
    const content = services['engine-cyberia-content'];
    expect(services['engine-cyberia-runtime'].command).toBeUndefined();
    expect(content.image).toBe(services['engine-cyberia-runtime'].image);
    expect(content.network_mode).toBe('service:engine-cyberia-runtime');
    expect(content.depends_on['engine-cyberia-runtime'].condition).toBe('service_healthy');
    expect(content.command.join(' ')).toMatch(/content-release build .*--bootstrap.*content-release promote/s);
    for (const [name, service] of Object.entries(services).filter(([name]) => name.startsWith('cyberia-server')))
      expect(service.depends_on['engine-cyberia-content']?.condition, name).toBe('service_completed_successfully');
  });

  it('mirrors the canonical stack into the published runtime directory', () => {
    for (const name of ['docker-compose.yml', 'compose.env', 'nginx.conf'])
      expect(read(MIRROR, name), name).toBe(read(CANONICAL, name));
  });
});
