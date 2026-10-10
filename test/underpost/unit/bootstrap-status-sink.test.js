'use strict';

import { expect } from 'chai';
import os from 'os';
import nodePath from 'path';
import fs from 'fs-extra';
import Underpost from '../../../src/index.js';
import UnderpostBaremetal from '../../../src/cli/baremetal.js';

// The handler takes plain request and response objects; its files land under a scratch root.
describe('bootstrap status sink', () => {
  let scratch;
  let root;
  let handler;

  beforeEach(async () => {
    scratch = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'bootstrap-status-'));
    root = nodePath.join(scratch, 'srv');
    handler = Underpost.baremetal.bootstrapStatusHandlerFactory({ bootstrapHttpServerPath: root });
    UnderpostBaremetal.bootstrapStatusEvents.clear();
  });

  afterEach(async () => {
    UnderpostBaremetal.bootstrapStatusEvents.clear();
    await fs.remove(scratch);
  });

  const post = (hostname, body) => {
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    handler({ params: { hostname }, body, headers: {}, socket: { remoteAddress: '192.168.1.20' } }, res);
    return res;
  };

  it('records a stage in memory and under the host status directory', async () => {
    const res = post('node-1', { stage: 'ssh-ready' });
    expect(res.statusCode).to.equal(200);
    expect(res.body).to.deep.equal({ ok: true, stage: 'ssh-ready' });
    expect(UnderpostBaremetal.bootstrapStatusEvents.get('node-1').map(({ stage }) => stage)).to.deep.equal([
      'ssh-ready',
    ]);
    expect(await fs.readJson(nodePath.join(root, 'node-1', 'status', 'ssh-ready.json'))).to.include({
      stage: 'ssh-ready',
      remoteIp: '192.168.1.20',
    });
  });

  it('refuses a hostname or stage that is not one path segment, before any state changes', async () => {
    for (const [hostname, stage] of [
      ['..', 'ssh-ready'],
      ['../escape', 'ssh-ready'],
      ['node-1', '../../../escape'],
      ['node-1', '..'],
      ['node-1', 'a/b'],
      ['node-1', { nested: true }],
    ])
      expect(post(hostname, { stage }).statusCode, `${hostname} ${JSON.stringify(stage)}`).to.equal(400);
    expect(UnderpostBaremetal.bootstrapStatusEvents.size).to.equal(0);
    expect(await fs.readdir(scratch)).to.deep.equal([]);
  });
});
