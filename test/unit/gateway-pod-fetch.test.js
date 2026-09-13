'use strict';

import { expect } from 'chai';
import shell from 'shelljs';
import { vi } from 'vitest';
import { gatewayPodFetch, parseRawHttpResponse } from '../../src/server/network/underpost-gateway.js';

describe('gateway pod fetch', () => {
  let commands;
  let answer;

  beforeEach(() => {
    commands = [];
    answer = (command) =>
      command.includes('| nc ') ? 'HTTP/1.1 502 Bad Gateway\r\nServer: nginx\r\n\r\n<h1>maintenance</h1>\n' : '';
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const stdout = answer(command);
      return { code: 0, stdout, stderr: '', toString: () => stdout };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reads the status and the body of an error response off the socket', () => {
    // Regression: busybox wget discards the body of any non-2xx answer, so the fallback
    // document — delivered with an upstream-failure status by definition — never
    // matched, and the probe polled every attempt against a correct edge.
    const result = gatewayPodFetch({ namespace: 'default', host: 'www.bymyelectrics.com', path: '/' });
    expect(result).to.deep.equal({ status: '502', body: '<h1>maintenance</h1>\n' });
    expect(commands.length).to.equal(1);
    expect(commands[0]).to.include(
      "printf 'GET / HTTP/1.0\\r\\nHost: www.bymyelectrics.com\\r\\n\\r\\n' | nc -w 10 127.0.0.1 80",
    );
  });

  it('falls back to the wget pair for the status where nc is absent', () => {
    answer = (command) => (command.includes('wget -S') ? 'HTTP/1.1 503 Service Unavailable\n' : '');
    const result = gatewayPodFetch({ namespace: 'default', host: 'healthcare.nexodev.org' });
    expect(result.status).to.equal('503');
    expect(commands.length).to.equal(3);
  });

  it('parses a raw response byte for byte after the first blank line', () => {
    expect(parseRawHttpResponse('')).to.deep.equal({ status: '', body: '' });
    expect(parseRawHttpResponse('HTTP/1.0 200 OK\r\nX: y\r\n\r\n')).to.deep.equal({ status: '200', body: '' });
    expect(parseRawHttpResponse('HTTP/1.1 504 Gateway Time-out\n\nline\n\nmore')).to.deep.equal({
      status: '504',
      body: 'line\n\nmore',
    });
  });
});

describe('gateway fetch', () => {
  afterEach(() => vi.restoreAllMocks());

  const mock = (answer) => {
    const commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const stdout = answer(command);
      return { code: 0, stdout, stderr: '', toString: () => stdout };
    });
    return commands;
  };

  it('asks the gateway Service from this host with curl, keeping the error body', async () => {
    const { gatewayFetch } = await import('../../src/server/network/underpost-gateway.js');
    const commands = mock((command) => {
      if (command.includes('kubectl get svc underpost-gateway-service')) return '10.96.151.82\n';
      if (command.startsWith('curl ')) return 'HTTP/1.1 502 Bad Gateway\r\nServer: nginx\r\n\r\n<h1>maintenance</h1>\n';
      return '';
    });
    const result = gatewayFetch({ namespace: 'default', host: 'healthcare.nexodev.org', path: '/' });
    expect(result).to.deep.equal({ status: '502', body: '<h1>maintenance</h1>\n', via: 'host' });
    expect(commands.find((command) => command.startsWith('curl '))).to.include(
      "-H 'Host: healthcare.nexodev.org' http://10.96.151.82:80/",
    );
    expect(commands.some((command) => command.includes('kubectl exec'))).to.equal(false);
  });

  it('falls back to the pod when the Service cannot be reached from here', async () => {
    const { gatewayFetch } = await import('../../src/server/network/underpost-gateway.js');
    mock((command) => {
      if (command.includes('kubectl get svc underpost-gateway-service')) return '10.96.151.82\n';
      if (command.includes('| nc ')) return 'HTTP/1.1 503 Service Unavailable\r\n\r\nbody';
      return '';
    });
    expect(gatewayFetch({ namespace: 'default', host: 'healthcare.nexodev.org' })).to.deep.equal({
      status: '503',
      body: 'body',
      via: 'pod',
    });
  });
});
