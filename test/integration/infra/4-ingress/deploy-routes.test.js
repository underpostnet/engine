'use strict';

import { expect } from 'chai';
import { DEPLOY_ROUTES_PATH, parseDeployRoutes } from '../../../../src/server/router.js';

describe('DEPLOY_ROUTES_PATH', () => {
  it('names the route table by what it holds — a list of routes', () => {
    expect(DEPLOY_ROUTES_PATH).to.equal('./engine-private/deploy/dd.routes');
  });
});

describe('parseDeployRoutes', () => {
  it('reads the comma separated table', () => {
    expect(parseDeployRoutes('dd-core,dd-cyberia,dd-test')).to.deep.equal(['dd-core', 'dd-cyberia', 'dd-test']);
  });

  it('tolerates the whitespace and trailing newline a hand-edited table carries', () => {
    expect(parseDeployRoutes(' dd-core , dd-cyberia ,\n')).to.deep.equal(['dd-core', 'dd-cyberia']);
  });

  it('drops empty entries rather than yielding a deploy id of ""', () => {
    // A trailing comma used to produce an empty id, which every `dd` fan-out
    // then resolved to `./engine-private/conf//conf.server.json`.
    expect(parseDeployRoutes('dd-core,,dd-test,')).to.deep.equal(['dd-core', 'dd-test']);
  });

  it('treats a missing or empty table as no routes at all', () => {
    expect(parseDeployRoutes('')).to.deep.equal([]);
    expect(parseDeployRoutes()).to.deep.equal([]);
    expect(parseDeployRoutes(null)).to.deep.equal([]);
  });

  it('preserves declaration order, which is the order deploys are rolled out in', () => {
    expect(parseDeployRoutes('dd-lampp,dd-cyberia,dd-core')).to.deep.equal(['dd-lampp', 'dd-cyberia', 'dd-core']);
  });
});
