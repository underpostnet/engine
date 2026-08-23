'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { buildCoverage } from '../../src/client-builder/client-build-docs.js';

describe('client coverage build', () => {
  let fixturePath;

  afterEach(() => {
    if (fixturePath) fs.removeSync(fixturePath);
  });

  it('publishes the Vitest lcov HTML report at the coverage route root', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    const reportPath = `${fixturePath}/coverage/lcov-report`;
    const docsDestination = `${fixturePath}/public/docs/`;
    fs.outputFileSync(`${reportPath}/index.html`, '<!doctype html><title>Coverage</title>');
    fs.outputFileSync(`${reportPath}/base.css`, 'body {}');

    await buildCoverage({ docs: { coveragePath: fixturePath }, docsDestination });

    expect(fs.existsSync(`${docsDestination}coverage/index.html`)).to.equal(true);
    expect(fs.existsSync(`${docsDestination}coverage/base.css`)).to.equal(true);
    expect(fs.existsSync(`${docsDestination}coverage/lcov-report`)).to.equal(false);
  });
});
