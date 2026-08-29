'use strict';

import { expect } from 'chai';
import { redeployPlanFactory } from '../../src/server/runtime/conf.js';

describe('a redeploy does not require the inactive colour to exist', () => {
  it('restarts the target colour when it is already deployed', () => {
    expect(redeployPlanFactory({ liveTraffic: 'blue', hasDeployment: (colour) => colour === 'green' })).to.deep.equal({
      targetTraffic: 'green',
      create: false,
    });
  });

  it('creates the target colour when it was cleaned up by the previous cycle', () => {
    expect(redeployPlanFactory({ liveTraffic: 'green', hasDeployment: (colour) => colour === 'green' })).to.deep.equal({
      targetTraffic: 'blue',
      create: true,
    });
  });

  it('starts on blue and creates it when nothing is routed yet', () => {
    expect(redeployPlanFactory({})).to.deep.equal({ targetTraffic: 'blue', create: true });
  });
});
