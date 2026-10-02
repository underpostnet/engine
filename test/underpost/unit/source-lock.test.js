import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  SOURCE_LOCK_FILE,
  SOURCE_LOCK_VERSION,
  lockedSource,
  readSourceLock,
  readSourceLockFile,
  verifyLockedSource,
  writeSourceLockFile,
} from '../../../src/server/release/source-lock.js';

const revision = (digit) => digit.repeat(40);
const sources = {
  widget: { repository: 'acme/widget', revision: revision('b') },
  content: {
    repository: 'acme/content',
    revision: revision('a'),
    artifact: { version: '1.2.3', digest: `sha256:${'c'.repeat(64)}` },
  },
};
const lock = readSourceLock({ lockVersion: SOURCE_LOCK_VERSION, sources });

describe('the source lock', () => {
  it('pins each source by exact revision, an artifact by version and digest, in name order', () => {
    expect(SOURCE_LOCK_FILE).toBe('underpost.lock.json');
    expect(Object.keys(lock.sources)).toEqual(['content', 'widget']);
    expect(lockedSource(lock, 'content')).toEqual(sources.content);
    expect(() => lockedSource(lock, 'audio')).toThrow('underpost.lock.json pins no audio');
  });

  it('writes the canonical document and reads it back', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'source-lock-')), SOURCE_LOCK_FILE);
    try {
      expect(writeSourceLockFile(file, { widget: sources.widget, content: sources.content })).toEqual(lock);
      expect(fs.readFileSync(file, 'utf8')).toBe(`${JSON.stringify(lock, null, 2)}\n`);
      expect(readSourceLockFile(file)).toEqual(lock);
    } finally {
      fs.removeSync(path.dirname(file));
    }
    expect(() => readSourceLockFile(file)).toThrow(`No underpost.lock.json at ${file}`);
  });

  it.each([
    [null, 'is not an object'],
    [{ lockVersion: 2, sources }, 'lockVersion 2 is not 1'],
    [{ lockVersion: 1, sources, deployId: 'dd-x' }, 'unknown field deployId'],
    [{ lockVersion: 1, sources: {} }, 'pins no source'],
    [{ lockVersion: 1, sources: { Widget: sources.widget } }, '"Widget" is not a repository name'],
    [
      { lockVersion: 1, sources: { widget: { ...sources.widget, repository: 'acme/widget-private' } } },
      'public owner/name',
    ],
    [{ lockVersion: 1, sources: { widget: { ...sources.widget, revision: 'main' } } }, 'exact 40-character'],
    [{ lockVersion: 1, sources: { widget: { ...sources.widget, branch: 'main' } } }, 'unknown field branch'],
    [{ lockVersion: 1, sources: { content: { ...sources.content, artifact: { version: 'v1' } } } }, 'not a version'],
    [
      { lockVersion: 1, sources: { content: { ...sources.content, artifact: { version: '1.0.0', digest: 'x' } } } },
      'not a sha256 digest',
    ],
  ])('refuses a document that names no exact input: %j', (document, message) => {
    expect(() => readSourceLock(document)).toThrow(message);
  });

  it('accepts the source it pins, and names every field another source changes', () => {
    expect(() => verifyLockedSource(lock, 'widget', sources.widget)).not.toThrow();
    expect(() =>
      verifyLockedSource(lock, 'content', { ...sources.content, revision: revision('d'), artifact: undefined }),
    ).toThrow(
      `content is not the locked one: revision ${revision('d')} (lock: ${revision('a')}), ` +
        `artifact version undefined (lock: 1.2.3), artifact digest undefined (lock: sha256:${'c'.repeat(64)})`,
    );
  });
});
