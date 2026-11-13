'use strict';

import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import UnderpostRun from '../../../src/cli/run.js';
import { shellHarness } from '../../support/shell-harness.js';

describe('the shared-dir runners', () => {
  let root;
  let harness;
  const user = os.userInfo().username;
  const group = execFileSync('id', ['-gn'], { encoding: 'utf8' }).trim();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-shared-dir-'));
    harness = shellHarness();
  });

  afterEach(() => {
    harness.restore();
    fs.removeSync(root);
  });

  it.each(['shared-dir', 'shared-dir-add-user'])('%s acts on the absolute path of a relative one', (runner) => {
    UnderpostRun.RUNNERS[runner](path.relative(process.cwd(), root), { user, group });

    const acl = harness.calls.filter((command) => command.includes('setfacl'));
    expect(acl).to.not.be.empty;
    for (const command of acl) expect(command).to.include(` ${root}`);
  });
});
