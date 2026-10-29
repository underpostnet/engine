import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import { Readable } from 'node:stream';
import fs from 'fs-extra';
import { objectStore } from '../../../src/server/storage/object-store.js';
import {
  BACKUP_PART_BYTES,
  backupIdFactory,
  backupKeyMaterial,
  fixedParts,
  listBackups,
  openPart,
  pruneBackups,
  publishBackupMetrics,
  readBackupManifest,
  readBackupStream,
  readVerifications,
  recordVerification,
  sealPart,
  verifyBackup,
  writeBackup,
} from '../../../src/server/storage/backup.js';

const keyMaterial = backupKeyMaterial(crypto.randomBytes(32).toString('hex'));
const bytesOf = (size, seed = 1) => Buffer.from(Array.from({ length: size }, (_, index) => (index * seed) % 251));
const source = (buffer, chunk = 1000) => {
  const chunks = [];
  for (let index = 0; index < buffer.length; index += chunk) chunks.push(buffer.subarray(index, index + chunk));
  return Readable.from(chunks);
};
const collect = async (iterable) => {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return Buffer.concat(chunks);
};

let root;
let store;
beforeEach(async () => {
  root = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'backup-engine-'));
  store = objectStore(`file:${root}`);
});
afterEach(async () => fs.remove(root));

const backup = (streams, extra = {}) =>
  writeBackup({ store, deployId: 'dd-test', profile: 'dr', keyMaterial, streams, ...extra });

describe('backup parts', () => {
  it('cuts a stream into parts of the part size, whatever its chunks', async () => {
    const data = bytesOf(2500);
    const parts = [];
    for await (const part of fixedParts(source(data, 333), 1000)) parts.push(part);
    expect(parts.map((part) => part.length)).toEqual([1000, 1000, 500]);
    expect(Buffer.concat(parts).equals(data)).toBe(true);
  });

  it('seals a part to its place and key', () => {
    const sealed = sealPart({ key: keyMaterial.key, aad: 'b/s/1', bytes: Buffer.from('plain') });
    expect(openPart({ key: keyMaterial.key, aad: 'b/s/1', sealed }).toString()).toBe('plain');
    expect(() => openPart({ key: keyMaterial.key, aad: 'b/s/2', sealed })).toThrow(/does not open/);
    const other = backupKeyMaterial(crypto.randomBytes(32).toString('base64'));
    expect(() => openPart({ key: other.key, aad: 'b/s/1', sealed })).toThrow(/does not open/);
    expect(other.keyId).not.toBe(keyMaterial.keyId);
  });

  it('refuses a missing or short key', () => {
    expect(() => backupKeyMaterial('')).toThrow(/UNDERPOST_BACKUP_KEY/);
    expect(() => backupKeyMaterial('abcd')).toThrow(/32 bytes/);
  });

  it('gives ids that sort by time', () => {
    const early = backupIdFactory(new Date('2026-01-02T03:04:05.678Z'));
    expect(early).toMatch(/^20260102T030405Z-[0-9a-f]{6}$/);
    expect(backupIdFactory(new Date('2026-01-02T03:04:06Z')) > early).toBe(true);
  });
});

describe('a backup in the object store', () => {
  it('stores sealed parts and a manifest last, and reads every stream back whole', async () => {
    const big = bytesOf(BACKUP_PART_BYTES * 2 + 17, 7);
    const manifest = await backup(
      [
        { name: 'db-a', kind: 'mongodb', describe: { database: 'a' }, open: async () => source(big, 65536) },
        { name: 'db-b', kind: 'mongodb', open: async () => source(Buffer.from('small')) },
        { name: 'db-empty', kind: 'mongodb', open: async () => source(Buffer.alloc(0)) },
      ],
      { source: { environment: 'test' }, meta: { consistency: { pointInTime: false } } },
    );
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      deployId: 'dd-test',
      profile: 'dr',
      status: 'available',
      encryption: { algorithm: 'aes-256-gcm', keyId: keyMaterial.keyId },
      totals: { streams: 3, parts: 4, plainBytes: big.length + 5 },
      meta: { consistency: { pointInTime: false } },
    });
    expect(manifest.streams[0]).toMatchObject({ name: 'db-a', database: 'a', plain: { bytes: big.length } });
    expect(manifest.streams[0].parts).toHaveLength(3);
    // Nothing the store holds is plaintext.
    const raw = fs.readFileSync(nodePath.join(root, manifest.streams[1].parts[0].key));
    expect(raw.includes(Buffer.from('small'))).toBe(false);

    const read = await readBackupManifest({ store, deployId: 'dd-test', profile: 'dr', backupId: manifest.backupId });
    expect((await collect(readBackupStream({ store, manifest: read, name: 'db-a', keyMaterial }))).equals(big)).toBe(
      true,
    );
    expect((await collect(readBackupStream({ store, manifest: read, name: 'db-empty', keyMaterial }))).length).toBe(0);
    expect(await listBackups({ store, deployId: 'dd-test', profile: 'dr' })).toMatchObject([
      { backupId: manifest.backupId, status: 'available', verified: false },
    ]);
  });

  it('records the inventory a tap reads from the plaintext', async () => {
    const tap = () => {
      let bytes = 0;
      return { write: (chunk) => (bytes += chunk.length), end: async () => ({ bytes }) };
    };
    const manifest = await backup([{ name: 's', kind: 'tree', open: async () => source(bytesOf(4000)), tap }]);
    expect(manifest.streams[0].inventory).toEqual({ bytes: 4000 });
  });

  it('never makes a failed backup available: it records the failure and removes its parts', async () => {
    const failing = async () => ({
      [Symbol.asyncIterator]: () => source(bytesOf(3000))[Symbol.asyncIterator](),
      done: async () => {
        throw new Error('mongodump exited with 1');
      },
    });
    await expect(
      backup([
        { name: 'ok', kind: 'mongodb', open: async () => source(Buffer.from('fine')) },
        { name: 'broken', kind: 'mongodb', open: failing },
      ]),
    ).rejects.toThrow(/exited with 1/);
    const [failed] = await listBackups({ store, deployId: 'dd-test', profile: 'dr' });
    expect(failed).toMatchObject({ status: 'failed', objects: 1 });
    await expect(
      readBackupManifest({ store, deployId: 'dd-test', profile: 'dr', backupId: failed.backupId }),
    ).rejects.toThrow(/failed at stream: mongodump exited with 1/);
  });

  it('refuses repeated stream names and names no object key could hold', async () => {
    const stream = { name: 'same', kind: 'mongodb', open: async () => source(Buffer.from('x')) };
    await expect(backup([stream, stream])).rejects.toThrow(/repeat/);
    await expect(backup([{ ...stream, name: 'a/b' }])).rejects.toThrow(/Invalid backup stream name/);
  });

  it('verifies lightly from the listing and deeply from every byte, and finds an altered or missing part', async () => {
    const manifest = await backup([
      { name: 'db', kind: 'mongodb', open: async () => source(bytesOf(BACKUP_PART_BYTES + 1)) },
    ]);
    expect((await verifyBackup({ store, manifest })).ok).toBe(true);
    const deep = await verifyBackup({ store, manifest, deep: true, keyMaterial });
    expect(deep).toMatchObject({ ok: true, deep: true });
    await recordVerification({ store, manifest, report: deep });
    expect(await readVerifications({ store, manifest })).toHaveLength(1);
    expect((await listBackups({ store, deployId: 'dd-test', profile: 'dr' }))[0].verified).toBe(true);

    const [first, second] = manifest.streams[0].parts;
    const file = nodePath.join(root, first.key);
    const altered = fs.readFileSync(file);
    altered[30] ^= 0xff;
    fs.writeFileSync(file, altered);
    expect((await verifyBackup({ store, manifest, deep: true, keyMaterial })).checks.at(-1).detail).toMatch(
      /is altered/,
    );

    fs.removeSync(nodePath.join(root, second.key));
    expect((await verifyBackup({ store, manifest })).checks[0]).toMatchObject({
      ok: false,
      detail: '1 of 2 part(s) missing or resized',
    });
  });

  it('refuses to read a backup with another key', async () => {
    const manifest = await backup([{ name: 'db', kind: 'mongodb', open: async () => source(Buffer.from('x')) }]);
    const other = backupKeyMaterial(crypto.randomBytes(32).toString('hex'));
    await expect(collect(readBackupStream({ store, manifest, name: 'db', keyMaterial: other }))).rejects.toThrow(
      /sealed with key/,
    );
  });
});

describe('retention', () => {
  const writeAt = async (iso, status = 'available') => {
    const backupId = backupIdFactory(new Date(iso));
    const prefix = `underpost/backups/dd-test/dr/${backupId}/`;
    await store.put(`${prefix}parts/db/000001`, Buffer.from('p'));
    if (status === 'available') await store.put(`${prefix}manifest.json`, Buffer.from('{}'));
    if (status === 'failed') await store.put(`${prefix}failure.json`, Buffer.from('{}'));
    return backupId;
  };

  it('keeps the newest backups and young unfinished ones, and removes the rest manifest first', async () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    const kept = [await writeAt('2026-10-29T10:00:00Z'), await writeAt('2026-10-28T10:00:00Z')];
    const old = await writeAt('2026-09-01T10:00:00Z');
    const recentButBeyondKeep = await writeAt('2026-10-27T10:00:00Z');
    const failed = await writeAt('2026-10-27T09:00:00Z', 'failed');
    const writing = await writeAt('2026-10-29T11:59:00Z', 'incomplete');
    const protectedOld = await writeAt('2026-08-01T10:00:00Z');

    const dryRun = await pruneBackups({
      store,
      deployId: 'dd-test',
      profile: 'dr',
      keep: 2,
      maxAgeDays: 30,
      graceHours: 24,
      protect: new Set([protectedOld]),
      dryRun: true,
      now,
    });
    expect(dryRun.removed.map(({ backupId }) => backupId).sort()).toEqual([failed, old].sort());
    expect((await listBackups({ store, deployId: 'dd-test', profile: 'dr' })).length).toBe(7);

    await pruneBackups({
      store,
      deployId: 'dd-test',
      profile: 'dr',
      keep: 2,
      maxAgeDays: 30,
      graceHours: 24,
      protect: new Set([protectedOld]),
      now,
    });
    expect(
      (await listBackups({ store, deployId: 'dd-test', profile: 'dr' })).map(({ backupId }) => backupId).sort(),
    ).toEqual([...kept, recentButBeyondKeep, writing, protectedOld].sort());
  });
});

describe('backup metrics', () => {
  it('writes one textfile per outcome', async () => {
    const manifest = { totals: { bytes: 10, plainBytes: 30, parts: 2 }, durationMs: 4000 };
    expect(
      publishBackupMetrics({ deployId: 'dd-test', profile: 'dr', kind: 'export', manifest, directory: root }),
    ).toBe(true);
    expect(
      publishBackupMetrics({
        deployId: 'dd-test',
        profile: 'dr',
        kind: 'verify',
        report: { ok: false, durationMs: 1000 },
        directory: root,
      }),
    ).toBe(true);
    const exported = fs.readFileSync(nodePath.join(root, 'underpost_backup_dd_test_dr_export.prom'), 'utf8');
    expect(exported).toMatch(/underpost_backup_last_success_timestamp_seconds\{deploy_id="dd-test",profile="dr"\} \d+/);
    expect(exported).toContain('underpost_backup_last_bytes{deploy_id="dd-test",profile="dr"} 10');
    expect(fs.readFileSync(nodePath.join(root, 'underpost_backup_dd_test_dr_verify.prom'), 'utf8')).toContain(
      'underpost_backup_last_verification_ok{deploy_id="dd-test",profile="dr"} 0',
    );
  });
});
