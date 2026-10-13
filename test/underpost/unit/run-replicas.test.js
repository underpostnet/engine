'use strict';

import { expect } from 'chai';
import Underpost from '../../../src/index.js';
import UnderpostRun from '../../../src/cli/run.js';

describe('a runner reads --replicas as a positive pod count', () => {
  const sync = UnderpostRun.RUNNERS.sync;
  let received;

  beforeEach(() => {
    UnderpostRun.RUNNERS.sync = async (path, options) => {
      received = options.replicas;
    };
  });

  afterEach(() => {
    UnderpostRun.RUNNERS.sync = sync;
  });

  it.each([
    ['3', 3],
    [undefined, 1],
    ['', 1],
    ['0', 1],
    ['-2', 1],
    ['two', 1],
  ])('--replicas %j reaches the runner as %d', async (replicas, expected) => {
    await Underpost.run.callback('sync', '', { dev: true, replicas });
    expect(received).to.equal(expected);
  });
});
