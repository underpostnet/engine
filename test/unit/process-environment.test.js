'use strict';

import { expect } from 'chai';
import { shellExec } from '../../src/server/runtime/process.js';

describe('shell command child environment', () => {
  it('passes an isolated environment value without adding it to command text', () => {
    const secret = 'child-only-secret';
    const output = shellExec('printf %s "$UNDERPOST_CHILD_ENV_FIXTURE"', {
      stdout: true,
      silent: true,
      disableLog: true,
      env: { ...process.env, UNDERPOST_CHILD_ENV_FIXTURE: secret },
    });

    expect(output).to.equal(secret);
  });
});
