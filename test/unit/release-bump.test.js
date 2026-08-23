'use strict';

import path from 'node:path';

import { expect } from 'chai';
import fs from 'fs-extra';

import { bumpAuxiliaryFiles } from '../../src/cli/release.js';

const DOC_ROOT = 'src/client/public';
const VERSION_HEADER = /\*\*(?:Current )?[Vv]ersion:\*\* (\d+\.\d+\.\d+)/;

const markdownFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
};

describe('release version bump targets', () => {
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

  it('bumps every shipped doc that stamps the current version in its header', () => {
    // A doc tree the target table does not name is bumped by nothing, and the stale
    // header only surfaces after the release is out.
    const stamped = markdownFiles(DOC_ROOT).filter(
      (file) => fs.readFileSync(file, 'utf8').match(VERSION_HEADER)?.[1] === version,
    );
    const bumped = new Set(bumpAuxiliaryFiles(version, '0.0.0', { dryRun: true }).map(({ file }) => file));

    for (const file of stamped) expect(bumped.has(file), file).to.equal(true);
  });
});
