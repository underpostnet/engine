'use strict';

import { expect } from 'chai';
import express from 'express';
import Underpost from '../../../../src/index.js';
import { Config } from '../../../../src/server/runtime/conf.js';
import { ProxyService } from '../../../../src/server/network/proxy.js';

// The proxy builds one listener per configured port. Listening and certificates are stubbed, so what
// is asserted is the port each listener binds, its server, and the certificate root it reads.
const CONF = { 'app.test': { '/': { client: 'App', proxy: [80, 443] } } };
const ENV_KEYS = ['NODE_ENV', 'PORT', 'DEV_PROXY_PORT_OFFSET'];

describe('proxy listeners', () => {
  const saved = {};
  let listens;
  let ssl;
  let issued;

  const build = async ({ env, offset = '0', argv = [] }) => {
    process.env.NODE_ENV = env;
    process.env.PORT = '4000';
    process.env.DEV_PROXY_PORT_OFFSET = offset;
    process.argv = ['node', 'src/proxy', ...argv];
    await ProxyService.build();
  };

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    saved.argv = process.argv;
    saved.server = Config.default.server;
    Config.default.server = structuredClone(CONF);
    listens = [];
    ssl = [];
    issued = [];
    vi.spyOn(express.application, 'listen').mockReturnValue({});
    vi.spyOn(Underpost.start, 'listenPortController').mockImplementation(async (server, port) =>
      listens.push({ server, port }),
    );
    vi.spyOn(Underpost.tls, 'createSslServer').mockImplementation(async (app, hosts, options) => {
      const server = { tls: Object.keys(hosts) };
      ssl.push({ hosts: Object.keys(hosts), root: options?.root, server });
      return { ServerSSL: server };
    });
    vi.spyOn(Underpost.tls, 'ensureLocalCertificate').mockImplementation((host) => issued.push(host));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS)
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    process.argv = saved.argv;
    Config.default.server = saved.server;
  });

  it('serves the local certificates on the HTTPS port moved by the dev offset', async () => {
    await build({ env: 'test', offset: '200', argv: ['proxy', 'dd-fixture', 'local', 'app.test', '/', 'tls'] });
    expect(issued).to.deep.equal(['app.test']);
    expect(ssl).to.have.length(1);
    expect(ssl[0]).to.include({ root: Underpost.tls.LOCAL_SSL_ROOT });
    expect(ssl[0].hosts).to.deep.equal(['app.test']);
    expect(listens).to.deep.equal([{ server: ssl[0].server, port: 643 }]);
  });

  it('serves plain HTTP on the moved port when the dev proxy runs without TLS', async () => {
    await build({ env: 'test', offset: '200', argv: ['proxy', 'dd-fixture', 'local', 'app.test', '/'] });
    expect(ssl).to.deep.equal([]);
    expect(listens.map(({ port }) => port)).to.deep.equal([280]);
    expect(listens[0].server).to.be.a('function');
  });

  it('serves the stored certificates in production and issues none', async () => {
    await build({ env: 'production', offset: '200' });
    expect(issued).to.deep.equal([]);
    expect(ssl.map(({ root }) => root)).to.deep.equal([undefined]);
    expect(listens.map(({ port }) => port)).to.deep.equal([80, 443]);
    expect(listens[1].server).to.equal(ssl[0].server);
  });
});
