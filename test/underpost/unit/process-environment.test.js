'use strict';

import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shellCd, shellExec } from '../../../src/server/runtime/process.js';

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

describe('shellCd', () => {
  // A literal path never reaches glob expansion, so a pattern-like name is a directory like any other.
  it('enters the literal directory and refuses a missing one', () => {
    const previous = process.cwd();
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-shell-cd-')));
    const literal = path.join(root, 'x{a,b}');
    fs.mkdirSync(literal);
    try {
      shellCd(literal, { disableLog: true });
      expect(process.cwd()).to.equal(literal);
      expect(() => shellCd(path.join(root, 'missing'), { disableLog: true })).to.throw('ENOENT');
      expect(process.cwd()).to.equal(literal);
    } finally {
      process.chdir(previous);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
