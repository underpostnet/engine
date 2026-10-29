import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import fs from 'fs-extra';
import JSZip from 'jszip';
import { v2 as cloudinary } from 'cloudinary';
import Downloader from '../../../src/server/storage/downloader.js';
import { assertObjectKey, objectStore } from '../../../src/server/storage/object-store.js';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload_stream: vi.fn() },
    api: { resource: vi.fn(), resources: vi.fn(), delete_resources: vi.fn() },
    utils: { download_archive_url: vi.fn() },
  },
}));

const md5 = (bytes) => crypto.createHash('md5').update(bytes).digest('hex');

describe('object keys', () => {
  it('takes segments of safe characters and refuses relative or empty ones', () => {
    expect(assertObjectKey('underpost/backups/dd-a/dr/x_1.json')).toBe('underpost/backups/dd-a/dr/x_1.json');
    for (const key of ['', '/a', 'a/', 'a//b', 'a/../b', 'a/./b', 'a b', '../a', 'a\\b'])
      expect(() => assertObjectKey(key)).toThrow();
  });
});

describe('the file object store', () => {
  let root;
  let store;
  beforeEach(async () => {
    root = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'object-store-'));
    store = objectStore(`file:${root}`);
  });
  afterEach(async () => fs.remove(root));

  it('writes, reads, lists and removes objects, and answers a missing one with null', async () => {
    expect(await store.put('a/one', Buffer.from('1'))).toMatchObject({ key: 'a/one', bytes: 1, md5: md5('1') });
    await store.put('a/two', Buffer.from('22'));
    await store.put('b/three', Buffer.from('333'));
    expect((await store.get('a/two')).toString()).toBe('22');
    expect(await store.get('a/none')).toBeNull();
    expect((await store.list('a/')).map(({ key, bytes }) => [key, bytes])).toEqual([
      ['a/one', 1],
      ['a/two', 2],
    ]);
    expect(await store.head('b/three')).toMatchObject({ bytes: 3, md5: md5('333') });
    expect(await store.remove(['a/one', 'a/none'])).toEqual({ removed: 1 });
    expect((await store.list('a/')).map(({ key }) => key)).toEqual(['a/two']);
  });

  it('keeps the same bytes idempotent and refuses other bytes unless asked to overwrite', async () => {
    await store.put('k', Buffer.from('same'));
    await expect(store.put('k', Buffer.from('same'))).resolves.toMatchObject({ bytes: 4 });
    await expect(store.put('k', Buffer.from('other'))).rejects.toMatchObject({ status: 409 });
    await store.put('k', Buffer.from('other'), { overwrite: true });
    expect((await store.get('k')).toString()).toBe('other');
  });

  it('refuses an object over the read limit and a relative root', async () => {
    await store.put('big', Buffer.alloc(10));
    await expect(store.get('big', { maxBytes: 5 })).rejects.toThrow(/over 5/);
    expect(() => objectStore('file:relative/dir')).toThrow(/absolute/);
    expect(() => objectStore('s3://bucket')).toThrow(/Unknown object store/);
  });
});

describe('the Cloudinary object store', () => {
  const uploads = new Map();
  beforeEach(() => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'cloud');
    vi.stubEnv('CLOUDINARY_API_KEY', 'key');
    vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
    vi.stubEnv('UNDERPOST_OBJECT_STORE', '');
    uploads.clear();
    cloudinary.uploader.upload_stream.mockImplementation((options, callback) => ({
      on: () => {},
      end: (bytes) => {
        if (uploads.has(options.public_id) && !options.overwrite)
          return callback(null, { public_id: options.public_id, existing: true });
        uploads.set(options.public_id, Buffer.from(bytes));
        callback(null, { public_id: options.public_id, bytes: bytes.length, etag: md5(bytes), type: options.type });
      },
    }));
    cloudinary.api.resource.mockImplementation(async (key) => {
      if (!uploads.has(key)) throw { message: 'not found', http_code: 404 };
      return { bytes: uploads.get(key).length, etag: md5(uploads.get(key)), created_at: '2026-10-29T00:00:00Z' };
    });
    cloudinary.utils.download_archive_url.mockImplementation(
      ({ public_ids }) => `https://example.test/${public_ids[0]}`,
    );
    vi.spyOn(Downloader, 'downloadFile').mockImplementation(async (url, target) => {
      const key = url.replace('https://example.test/', '');
      if (!uploads.has(key)) throw Object.assign(new Error('404'), { response: { status: 404 } });
      const zip = new JSZip();
      zip.file(nodePath.basename(key), uploads.get(key));
      fs.writeFileSync(target, await zip.generateAsync({ type: 'nodebuffer' }));
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uploads private raw objects with token access and checks the stored bytes', async () => {
    const store = objectStore();
    expect(store.driver).toBe('cloudinary');
    await store.put('p/a', Buffer.from('abc'));
    expect(cloudinary.uploader.upload_stream.mock.calls[0][0]).toEqual({
      public_id: 'p/a',
      resource_type: 'raw',
      type: 'private',
      access_control: [{ access_type: 'token' }],
      overwrite: false,
    });
    expect((await store.get('p/a')).toString()).toBe('abc');
    expect(await store.get('p/none')).toBeNull();
    expect(await store.head('p/none')).toBeNull();
  });

  it('accepts an existing object with the same bytes and refuses one with other bytes', async () => {
    const store = objectStore();
    await store.put('p/a', Buffer.from('abc'));
    await expect(store.put('p/a', Buffer.from('abc'))).resolves.toMatchObject({ bytes: 3 });
    await expect(store.put('p/a', Buffer.from('xyz'))).rejects.toMatchObject({ status: 409 });
  });

  it('refuses an upload whose answer names other bytes', async () => {
    cloudinary.uploader.upload_stream.mockImplementation((options, callback) => ({
      on: () => {},
      end: () => callback(null, { public_id: options.public_id, bytes: 3, etag: 'not-the-md5' }),
    }));
    await expect(objectStore().put('p/b', Buffer.from('abc'))).rejects.toThrow(/other bytes/);
  });

  it('lists every page and deletes in batches', async () => {
    cloudinary.api.resources
      .mockResolvedValueOnce({ resources: [{ public_id: 'p/2', bytes: 2 }], next_cursor: 'next' })
      .mockResolvedValueOnce({ resources: [{ public_id: 'p/1', bytes: 1 }] });
    expect((await objectStore().list('p/')).map(({ key }) => key)).toEqual(['p/1', 'p/2']);
    expect(cloudinary.api.resources.mock.calls[1][0]).toMatchObject({ prefix: 'p/', next_cursor: 'next' });

    const keys = Array.from({ length: 150 }, (_, index) => `p/${index}`);
    cloudinary.api.delete_resources.mockImplementation(async (batch) => ({
      deleted: Object.fromEntries(batch.map((key, index) => [key, index % 2 ? 'not_found' : 'deleted'])),
    }));
    expect(await objectStore().remove(keys)).toEqual({ removed: 75 });
    expect(cloudinary.api.delete_resources).toHaveBeenCalledTimes(2);
    cloudinary.api.delete_resources.mockResolvedValueOnce({ deleted: { 'p/x': 'failed' } });
    await expect(objectStore().remove(['p/x'])).rejects.toThrow(/did not delete/);
  });

  it('names the missing credentials before any request', () => {
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    expect(() => objectStore()).toThrow(/CLOUDINARY_API_SECRET/);
  });
});
