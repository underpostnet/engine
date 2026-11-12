// A platform invariant read from the source: each call of an Underpost domain method names a method the
// domain defines, so a renamed or removed method fails here, not at run time on a node.

import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import Underpost from '../../../src/index.js';

const ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../..');

const sources = (directory) =>
  fs
    .readdirSync(nodePath.join(ROOT, directory), { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .map((file) => nodePath.join(directory, file));

const CODE = [...sources('src'), ...sources('bin')].filter((file) => !file.includes('/public/'));
const CALL = /\bUnderpost\.([A-Za-z]+)\.([A-Za-z]+)\s*\(/g;

describe('the Underpost API references of the source', () => {
  it('call only the methods their domain defines', () => {
    const dangling = CODE.flatMap((file) =>
      [...fs.readFileSync(nodePath.join(ROOT, file), 'utf8').matchAll(CALL)]
        .filter(([, domain, method]) => typeof Underpost[domain]?.[method] !== 'function')
        .map(([call]) => `${file}: ${call}`),
    );
    expect(dangling).toEqual([]);
  });
});
