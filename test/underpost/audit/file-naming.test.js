// File names follow one rule per tree: PascalCase in the client, kebab-case in every other tree.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../..');

const CLIENT = 'src/client/';

/** The isolated Web3 workspace keeps its own names. */
const EXEMPT = 'hardhat/';

/** A PascalCase name, then optional lowercase role suffixes: `CyberiaActionService.js`, `Default.index.js`. */
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*(\.[a-z]+)*\.js$/;

/** Lowercase words joined by `-`, then optional role suffixes: `mongoose-db.js`, `user.service.js`. */
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.js$/;

const modules = execFileSync('git', ['ls-files', '-z', '--', '*.js'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && !file.startsWith(EXEMPT));

const offenders = (files, pattern) => files.filter((file) => !pattern.test(nodePath.basename(file)));

describe('file naming', () => {
  it('names every client module in PascalCase', () => {
    expect(
      offenders(
        modules.filter((file) => file.startsWith(CLIENT)),
        PASCAL_CASE,
      ),
    ).to.deep.equal([]);
  });

  it('names every other module in kebab-case', () => {
    expect(
      offenders(
        modules.filter((file) => !file.startsWith(CLIENT)),
        KEBAB_CASE,
      ),
    ).to.deep.equal([]);
  });
});
