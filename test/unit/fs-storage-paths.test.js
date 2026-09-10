import { expect, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import JSZip from 'jszip';
import { v2 as cloudinary } from 'cloudinary';
import UnderpostFileStorage from '../../src/cli/fs.js';
import UnderpostRepository from '../../src/cli/repository.js';
import Downloader from '../../src/server/storage/downloader.js';
import { program } from '../../src/cli/index.js';
import { clearTerminalStringColor } from '../../src/client/components/core/CommonJs.js';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload: vi.fn() },
    api: { resource: vi.fn(), delete_resources: vi.fn() },
    utils: { download_archive_url: vi.fn() },
  },
}));
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, execFileSync: vi.fn(original.execFileSync) };
});
vi.mock('../../src/server/runtime/process.js', async (importOriginal) => ({
  ...(await importOriginal()),
  shellExec: vi.fn(() => {
    throw new Error('Storage must not run shell commands.');
  }),
}));

const api = UnderpostFileStorage.API;
const options = { deployId: 'test' };
const inventory = {
  'assets/z.png': { type: 'private', bytes: 3 },
  'other/b.png': {},
  'assets/deep/c.png': {},
  'assets/a.png': {},
  'assets/gone.png': {},
};
let fixture;
let previousCwd;
let download;

const writeInventory = (storage = inventory, extra = {}) =>
  fs.outputJsonSync(api.resolveManifest({ ...options, ...extra }), storage);
const readInventory = (extra = {}) => api.readManifest({ ...options, ...extra }).storage;
const select = (scope, extra = {}) => api.resolveSelection(scope, readInventory(), extra);
const run = (scope, extra = {}) => api.callback(scope, { ...options, ...extra });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const uploadPaths = () => cloudinary.uploader.upload.mock.calls.map(([key]) => key);

beforeEach(() => {
  previousCwd = process.cwd();
  fixture = fs.mkdtempSync('/tmp/engine-fs-storage-');
  process.chdir(fixture);
  for (const file of ['assets/z.png', 'assets/deep/c.png', 'assets/a.png', 'assets/untracked.png', 'other/b.png'])
    fs.outputFileSync(file, 'local');
  writeInventory();
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
  vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
  vi.stubEnv('CLOUDINARY_API_SECRET', 'test-secret');
  cloudinary.uploader.upload.mockImplementation(async (key) => ({ public_id: key, type: 'private', bytes: 6 }));
  cloudinary.api.delete_resources.mockImplementation(async ([key]) => ({ deleted: { [key]: 'deleted' } }));
  cloudinary.utils.download_archive_url.mockImplementation(({ type }) => `https://example.test/${type}`);
  download = vi.spyOn(Downloader, 'downloadFile').mockImplementation(async (_url, target) => {
    const zip = new JSZip();
    zip.file('remote-asset', 'remote');
    fs.writeFileSync(target, await zip.generateAsync({ type: 'nodebuffer' }));
  });
  for (const name of ['getChangedFiles', 'getDeleteFiles', 'initLocalRepo', 'isInsideWorkTree'])
    vi.spyOn(UnderpostRepository.API, name).mockImplementation(() => {
      throw new Error(`Unexpected Git call: ${name}`);
    });
  execFileSync.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  process.chdir(previousCwd);
  fs.removeSync(fixture);
});

describe('storage manifest resolution', () => {
  it('uses the default manifest unless a sub-id is explicit', async () => {
    expect(api.resolveManifest(options)).toBe('engine-private/conf/test/storage.json');
    expect(api.resolveManifest({ ...options, storageId: 'assets' })).toBe(
      'engine-private/conf/test/storage.assets.json',
    );
    writeInventory({ 'custom/file.png': {} }, { storageId: 'assets' });
    const pull = vi.spyOn(api, 'pull').mockResolvedValue('private');
    await run(undefined, { tracked: true, pull: true });
    expect(pull.mock.calls.map(([key]) => key)).toEqual(Object.keys(inventory));
    pull.mockClear();
    await run(undefined, { tracked: true, pull: true, storageId: 'assets' });
    expect(pull.mock.calls.map(([key]) => key)).toEqual(['custom/file.png']);
  });

  it.each(['', '../assets', '/tmp/a', 'storage.assets.json', 'assets.json', 'a/b', 'a\\b'])(
    'rejects invalid sub-id %j',
    (storageId) => {
      expect(() => api.resolveManifest({ ...options, storageId })).toThrow('--storage-id');
    },
  );

  it('requires a deploy id and rejects manifest path overrides', () => {
    expect(() => api.resolveManifest({})).toThrow('--deploy-id');
    expect(() => api.resolveManifest({ deployId: '../test' })).toThrow('--deploy-id');
    expect(() => api.resolveManifest({ ...options, storageFilePath: '/tmp/storage.json' })).toThrow('--storage-id');
  });

  it('does not create a missing manifest during selection', async () => {
    fs.removeSync('engine-private');
    expect(api.readManifest(options).storage).toEqual({});
    await run(undefined, { tracked: true });
    expect(fs.existsSync('engine-private')).toBe(false);
    expect(cloudinary.config).not.toHaveBeenCalled();
  });

  it.each([[[]], [null], [{ a: null }], [{ a: { bytes: -1 } }], [{ a: { type: 'unknown' } }], [{ a: {}, './a': {} }]])(
    'rejects an invalid manifest before remote access: %j',
    async (storage) => {
      writeInventory(storage);
      await expect(run('assets')).rejects.toThrow(/Manifest|manifest/);
      expect(cloudinary.config).not.toHaveBeenCalled();
    },
  );
});

describe('filesystem storage selection', () => {
  it('selects one file without reading its parent', async () => {
    const walk = vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error('Unexpected traversal');
    });
    await run('./assets/a.png');
    expect(uploadPaths()).toEqual(['assets/a.png']);
    expect(walk).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('selects all files below a directory without Git or --recursive', async () => {
    fs.outputFileSync('assets/.hidden', 'hidden');
    await run('assets');
    expect(uploadPaths().sort()).toEqual([
      'assets/.hidden',
      'assets/a.png',
      'assets/deep/c.png',
      'assets/untracked.png',
      'assets/z.png',
    ]);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(cloudinary.api.delete_resources).not.toHaveBeenCalled();
  });

  it('keeps selection unchanged with --force or --recursive', () => {
    expect(select('assets', { force: true })).toEqual(select('assets'));
    expect(select('assets', { recursive: true })).toEqual(select('assets'));
  });

  it('normalizes absolute paths and reuses existing manifest keys', () => {
    writeInventory({ './assets/a.png': {} });
    expect(select(path.resolve('assets/a.png'))).toEqual(['./assets/a.png']);
    expect(api.normalizeStoragePath('./assets/deep/../a.png')).toBe('assets/a.png');
  });

  it('does not follow directory link cycles', () => {
    fs.symlinkSync(path.resolve('assets'), 'assets/loop', 'dir');
    expect(select('assets')).toHaveLength(4);
  });

  it('requires --tracked to select missing files', async () => {
    await expect(run('assets/gone.png', { rm: true })).rejects.toThrow('ENOENT');
    expect(cloudinary.api.delete_resources).not.toHaveBeenCalled();
  });
});

describe('Git storage selection', () => {
  beforeEach(() => {
    git('init', '-q');
    fs.writeFileSync('.gitignore', 'assets/ignored.png\n');
    fs.outputFileSync('assets/ignored.png', 'ignored');
    fs.outputFileSync('assets/space and\nnewline.png', 'tracked');
    git(
      'add',
      '--',
      '.gitignore',
      'assets/a.png',
      'assets/z.png',
      'assets/deep/c.png',
      'assets/space and\nnewline.png',
    );
    git('-c', 'user.name=Storage Test', '-c', 'user.email=storage@example.test', 'commit', '-qm', 'fixture');
    fs.writeFileSync('assets/a.png', 'changed');
    fs.removeSync('assets/z.png');
    execFileSync.mockClear();
  });

  it('selects unchanged and changed tracked files, excluding ignored and untracked files', async () => {
    await run('assets', { git: true });
    expect(uploadPaths().sort()).toEqual(['assets/a.png', 'assets/deep/c.png', 'assets/space and\nnewline.png']);
    expect(cloudinary.api.delete_resources).not.toHaveBeenCalled();
    expect(readInventory()).toHaveProperty('assets/z.png');
  });

  it('restricts single files and subdirectories', () => {
    expect(select('assets/untracked.png', { git: true })).toEqual([]);
    expect(select('assets/ignored.png', { git: true })).toEqual([]);
    expect(select('assets/a.png', { git: true })).toEqual(['assets/a.png']);
    expect(select(path.resolve('assets/deep'), { git: true })).toEqual(['assets/deep/c.png']);
  });

  it.each([{}, { pull: true, force: true }, { rm: true }])(
    'never changes Git state during CRUD: %j',
    async (operation) => {
      const head = git('rev-parse', 'HEAD');
      const index = fs.readFileSync('.git/index');
      execFileSync.mockClear();
      await run('assets/a.png', { git: true, ...operation });
      expect(execFileSync.mock.calls.map(([command, args]) => [command, ...args])).toEqual([
        ['git', 'rev-parse', '--show-toplevel'],
        ['git', 'ls-files', '--cached', '--full-name', '-z', '--', '.'],
      ]);
      expect(fs.readFileSync('.git/index')).toEqual(index);
      expect(git('rev-parse', 'HEAD')).toBe(head);
    },
  );

  it('intersects Git paths with manifest ranges and regex filters', () => {
    expect(select('assets', { git: true, fromKey: 'other/b.png', toKey: 'assets/a.png', keyRegex: '\\.png$' })).toEqual(
      ['assets/a.png', 'assets/deep/c.png'],
    );
  });
});

describe('tracked storage selection and filters', () => {
  it('selects only ordered manifest entries without filesystem or Git access', async () => {
    vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('Unexpected stat');
    });
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error('Unexpected traversal');
    });
    const upload = vi.spyOn(api, 'upload').mockResolvedValue({});
    await run(undefined, { tracked: true });
    expect(upload.mock.calls.map(([key]) => key)).toEqual(Object.keys(inventory));
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('scopes missing files using only manifest paths', () => {
    expect(select('assets/gone.png', { tracked: true })).toEqual(['assets/gone.png']);
    expect(select('./assets/', { tracked: true })).toEqual(
      Object.keys(inventory).filter((key) => key.startsWith('assets/')),
    );
    expect(select('asset', { tracked: true })).toEqual([]);
    expect(select('.', { tracked: true })).toEqual(Object.keys(inventory));
  });

  it.each([
    [{ fromKey: 'assets/deep/c.png' }, ['assets/deep/c.png', 'assets/a.png', 'assets/gone.png']],
    [{ fromKey: 'other/b.png', toKey: 'assets/a.png' }, ['other/b.png', 'assets/deep/c.png', 'assets/a.png']],
    [{ fromKey: 'assets/a.png', toKey: 'assets/a.png' }, ['assets/a.png']],
    [{ toKey: 'other/b.png' }, ['assets/z.png', 'other/b.png']],
    [{ key: 'assets/a.png' }, ['assets/a.png']],
    [{ keyRegex: '^assets/' }, ['assets/z.png', 'assets/deep/c.png', 'assets/a.png', 'assets/gone.png']],
    [{ keyRegex: 'absent' }, []],
  ])('filters in manifest order: %j', (filters, expected) => {
    expect(select(undefined, { tracked: true, ...filters })).toEqual(expected);
  });

  it('composes scope, range, regex, and exact predicates', () => {
    const filters = { tracked: true, fromKey: 'other/b.png', toKey: 'assets/a.png', keyRegex: '^assets/' };
    expect(select('assets', filters)).toEqual(['assets/deep/c.png', 'assets/a.png']);
    expect(select('assets', { ...filters, key: 'assets/a.png' })).toEqual(['assets/a.png']);
    expect(select('assets/deep/c.png', filters)).toEqual(['assets/deep/c.png']);
  });

  it('applies manifest predicates to filesystem paths without adding missing files', () => {
    expect(select('assets', { fromKey: 'assets/deep/c.png', keyRegex: '^assets/' })).toEqual([
      'assets/a.png',
      'assets/deep/c.png',
    ]);
    expect(select('assets/a.png', { key: 'assets/a.png' })).toEqual(['assets/a.png']);
  });

  it.each([
    { fromKey: 'missing' },
    { toKey: 'missing' },
    { key: 'missing' },
    { keyRegex: '[' },
    { fromKey: 'assets/a.png', toKey: 'assets/z.png' },
    { key: 'assets/z.png', fromKey: 'assets/a.png' },
    { key: 'assets/a.png', keyRegex: '^other/' },
    { key: 'other/b.png' },
  ])('rejects invalid filters before CRUD: %j', async (filters) => {
    await expect(run('assets', { tracked: true, ...filters })).rejects.toThrow();
    expect(cloudinary.config).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, {}],
    ['assets', { tracked: true, git: true }],
    ['assets', { rm: true, pull: true }],
    ['assets', { omitUnzip: true }],
  ])('rejects conflicting or incomplete options: %j', async (scope, flags) => {
    await expect(run(scope, flags)).rejects.toThrow();
    expect(cloudinary.config).not.toHaveBeenCalled();
  });
});

describe('storage synchronization', () => {
  it('uploads private raw assets with token access and records remote metadata', async () => {
    await run('assets/a.png');
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith('assets/a.png', {
      public_id: 'assets/a.png',
      resource_type: 'raw',
      type: 'private',
      access_control: [{ access_type: 'token' }],
      overwrite: false,
    });
    expect(readInventory()['assets/a.png']).toEqual({ type: 'private', bytes: 6 });
    expect(fs.statSync('assets/a.png').size).toBe(5);
    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    });
  });

  it('returns the skip sentinel for a file already present, without reaching the network', async () => {
    const manifest = api.readManifest(options);
    expect(await api.pull('assets/a.png', options, manifest)).to.equal('skipped');
    expect(download).not.toHaveBeenCalled();
    expect(cloudinary.config).not.toHaveBeenCalled();
  });

  it.each([
    { mode: 'plain', colorEnv: { NO_COLOR: '1' } },
    { mode: 'forced color', colorEnv: { FORCE_COLOR: '1' } },
    { mode: 'CI color', colorEnv: { CI: 'true', GITHUB_ACTIONS: 'true' } },
  ])('reports one skipped-pull count with $mode output', ({ colorEnv }) => {
    fs.outputFileSync('assets/gone.png', 'local');
    const cli = path.resolve(previousCwd, 'bin/index.js');
    const childEnv = { ...process.env };
    delete childEnv.NO_COLOR;
    delete childEnv.FORCE_COLOR;
    Object.assign(childEnv, colorEnv);
    const output = clearTerminalStringColor(
      execFileSync(process.execPath, [cli, 'fs', 'assets', '--deploy-id', 'test', '--pull', '--tracked'], {
        cwd: fixture,
        env: childEnv,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );

    expect(output).to.not.include('Pull skipped; local file exists');
    const summaries = [...output.matchAll(/Pull skipped files that already exist: (\{[^}]*\})/g)];
    expect(summaries).to.have.lengthOf(1);
    expect(JSON.parse(summaries[0][1])).toEqual({ skipped: 4, selected: 4 });
  });

  it('uses --force only to set upload overwrite', async () => {
    await run('assets/a.png', { force: true });
    expect(cloudinary.uploader.upload.mock.calls[0][1].overwrite).toBe(true);
  });

  it('reads remote metadata when overwrite is refused', async () => {
    cloudinary.uploader.upload.mockResolvedValue({ existing: true });
    cloudinary.api.resource.mockResolvedValue({ public_id: 'assets/a.png', type: 'private', bytes: 100 });
    await run('assets/a.png');
    expect(readInventory()['assets/a.png'].bytes).toBe(100);
    expect(cloudinary.api.resource).toHaveBeenCalledWith('assets/a.png', { resource_type: 'raw', type: 'private' });
  });

  it('requires environment credentials before remote access', async () => {
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    await expect(run('assets/a.png')).rejects.toThrow('CLOUDINARY_API_SECRET');
    expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
  });

  it.each([
    { error: 'failed' },
    { public_id: 'wrong', type: 'private', bytes: 4 },
    { public_id: 'assets/a.png', type: 'private' },
  ])('preserves the manifest for an invalid upload response: %j', async (result) => {
    cloudinary.uploader.upload.mockResolvedValue(result);
    await expect(run('assets/a.png')).rejects.toThrow('Invalid Cloudinary');
    expect(readInventory()).toEqual(inventory);
  });

  it('does not create a manifest after a failed first upload', async () => {
    fs.removeSync('engine-private');
    cloudinary.uploader.upload.mockRejectedValue(new Error('upload failed'));
    await expect(run('assets/a.png')).rejects.toThrow('upload failed');
    expect(fs.existsSync('engine-private')).toBe(false);
  });

  it('persists each successful upload before a later failure', async () => {
    cloudinary.uploader.upload
      .mockReset()
      .mockResolvedValueOnce({ public_id: 'assets/z.png', type: 'private', bytes: 99 })
      .mockRejectedValueOnce(new Error('upload failed'));
    await expect(run(undefined, { tracked: true })).rejects.toThrow('upload failed');
    expect(readInventory()).toEqual({ ...inventory, 'assets/z.png': { type: 'private', bytes: 99 } });
  });

  it('reports missing tracked upload files without removing their entries', async () => {
    await expect(run('assets/gone.png', { tracked: true })).rejects.toThrow('ENOENT');
    expect(readInventory()).toEqual(inventory);
  });

  it('preserves the manifest when an atomic write fails', async () => {
    const before = fs.readFileSync(api.resolveManifest(options), 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed');
    });
    await expect(run('assets/a.png')).rejects.toThrow('rename failed');
    expect(fs.readFileSync(api.resolveManifest(options), 'utf8')).toBe(before);
    expect(fs.readdirSync('engine-private/conf/test')).toEqual(['storage.json']);
  });

  it('pulls missing assets and corrects metadata after delivery fallback', async () => {
    download.mockRejectedValueOnce(new Error('not found'));
    await run('assets/gone.png', { tracked: true, pull: true });
    expect(fs.readFileSync('assets/gone.png', 'utf8')).toBe('remote');
    expect(download.mock.calls.map(([url]) => url)).toEqual([
      'https://example.test/upload',
      'https://example.test/private',
    ]);
    expect(cloudinary.utils.download_archive_url.mock.calls[0][0]).toEqual({
      public_ids: ['assets/gone.png'],
      resource_type: 'raw',
      type: 'upload',
    });
    expect(readInventory()['assets/gone.png']).toEqual({ type: 'private', bytes: 6 });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('preserves existing local content unless --force is set', async () => {
    await run('assets/a.png', { tracked: true, pull: true });
    expect(download).not.toHaveBeenCalled();
    expect(fs.readFileSync('assets/a.png', 'utf8')).toBe('local');
    await run('assets/a.png', { tracked: true, pull: true, force: true });
    expect(fs.readFileSync('assets/a.png', 'utf8')).toBe('remote');
  });

  it('rejects a directory at a tracked file target', async () => {
    fs.ensureDirSync('assets/gone.png');
    await expect(run('assets/gone.png', { tracked: true, pull: true })).rejects.toThrow('regular file');
    expect(download).not.toHaveBeenCalled();
  });

  it('keeps delivery corrections across a multi-file pull', async () => {
    writeInventory({ 'assets/first.png': {}, 'assets/second.png': {} });
    download.mockRejectedValueOnce(new Error('not found'));
    await run(undefined, { tracked: true, pull: true });
    expect(readInventory()).toEqual({
      'assets/first.png': { type: 'private', bytes: 6 },
      'assets/second.png': { type: 'upload', bytes: 6 },
    });
  });

  it('keeps existing local content and inventory after failed downloads', async () => {
    download.mockRejectedValue(new Error('download failed'));
    await expect(run('assets/a.png', { pull: true, force: true })).rejects.toThrow('download failed');
    expect(fs.readFileSync('assets/a.png', 'utf8')).toBe('local');
    expect(readInventory()).toEqual(inventory);
    expect(fs.readdirSync('assets').some((name) => name.startsWith('.underpost-fs-'))).toBe(false);
  });

  it('does not record a pull or replace a file when the archive is invalid', async () => {
    download.mockImplementation(async (_url, target) => fs.writeFileSync(target, 'invalid zip'));
    await expect(run('assets/a.png', { pull: true, force: true })).rejects.toThrow();
    expect(fs.readFileSync('assets/a.png', 'utf8')).toBe('local');
    expect(readInventory()).toEqual(inventory);
  });

  it('keeps the wrapper archive with --omit-unzip and preserves zip asset names', async () => {
    writeInventory({ 'assets/bundle.zip': {} });
    await run(undefined, { tracked: true, pull: true, omitUnzip: true });
    expect(fs.existsSync('assets/bundle.zip.zip')).toBe(true);
    expect(fs.existsSync('assets/bundle.zip')).toBe(false);
    download.mockClear();
    await run(undefined, { tracked: true, pull: true, omitUnzip: true });
    expect(download).not.toHaveBeenCalled();
    await run(undefined, { tracked: true, pull: true });
    expect(fs.readFileSync('assets/bundle.zip', 'utf8')).toBe('remote');
  });

  it('requires a manifest entry for pull', async () => {
    await expect(run('assets/untracked.png', { pull: true })).rejects.toThrow('not in the selected manifest');
    expect(download).not.toHaveBeenCalled();
  });

  it('deletes missing local assets and removes entries after remote confirmation', async () => {
    await run('assets/gone.png', { tracked: true, rm: true });
    expect(readInventory()).not.toHaveProperty('assets/gone.png');
    expect(cloudinary.api.delete_resources.mock.calls).toEqual([
      [['assets/gone.png'], { type: 'upload', resource_type: 'raw' }],
      [['assets/gone.png'], { type: 'private', resource_type: 'raw' }],
    ]);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('preserves local files during remote deletion, including with --force', async () => {
    await run('assets/a.png', { rm: true, force: true });
    expect(fs.readFileSync('assets/a.png', 'utf8')).toBe('local');
    expect(readInventory()).not.toHaveProperty('assets/a.png');
  });

  it('accepts confirmed remote absence', async () => {
    cloudinary.api.delete_resources.mockImplementation(async ([key]) => ({ deleted: { [key]: 'not_found' } }));
    await run('assets/gone.png', { tracked: true, rm: true });
    expect(readInventory()).not.toHaveProperty('assets/gone.png');
  });

  it.each([{}, { deleted: { 'assets/a.png': 'error' } }])(
    'preserves inventory for an unconfirmed delete: %j',
    async (result) => {
      cloudinary.api.delete_resources.mockResolvedValue(result);
      await expect(run('assets/a.png', { rm: true })).rejects.toThrow('Cloudinary delete failed');
      expect(readInventory()).toEqual(inventory);
    },
  );

  it('preserves inventory after a partial remote delete and supports retry', async () => {
    cloudinary.api.delete_resources
      .mockResolvedValueOnce({ deleted: { 'assets/a.png': 'deleted' } })
      .mockRejectedValueOnce(new Error('delete failed'));
    await expect(run('assets/a.png', { rm: true })).rejects.toThrow('delete failed');
    expect(readInventory()).toEqual(inventory);
    await run('assets/a.png', { rm: true });
    expect(readInventory()).not.toHaveProperty('assets/a.png');
  });

  it('updates only the selected custom manifest', async () => {
    writeInventory({}, { storageId: 'assets' });
    await run('assets/a.png', { storageId: 'assets' });
    expect(readInventory()).toEqual(inventory);
    expect(readInventory({ storageId: 'assets' })).toEqual({ 'assets/a.png': { type: 'private', bytes: 6 } });
  });
});

describe('storage CLI options', () => {
  const command = () => {
    const registered = program.commands.find((entry) => entry.name() === 'fs');
    const cli = new Command('fs')
      .argument('[path]')
      .exitOverride()
      .configureOutput({ writeErr: () => {} });
    for (const option of registered.options) cli.addOption(option);
    return cli.action(api.callback);
  };

  it('parses the manifest selector and filters through the registered options', async () => {
    writeInventory({ 'assets/gone.png': {} }, { storageId: 'assets' });
    await command().parseAsync(
      ['--tracked', '--deploy-id', 'test', '--storage-id', 'assets', '--key', 'assets/gone.png', '--pull'],
      { from: 'user' },
    );
    expect(fs.readFileSync('assets/gone.png', 'utf8')).toBe('remote');
  });

  it('deletes an obsolete bundle part through its exact manifest key without local files', async () => {
    const current = 'build/underpost.net-.zip.part022';
    const obsolete = 'build/underpost.net-.zip.part023';
    const sibling = 'build/underpost.net-peer.zip.part023';
    const storage = { [current]: { type: 'private', bytes: 6 }, [obsolete]: {}, [sibling]: {} };
    writeInventory(storage, { storageId: 'bundle' });
    expect(fs.existsSync('build')).toBe(false);

    await command().parseAsync(
      ['--tracked', '--key', obsolete, '--deploy-id', 'test', '--storage-id', 'bundle', '--rm'],
      { from: 'user' },
    );

    expect(cloudinary.api.delete_resources.mock.calls.map(([keys]) => keys)).toEqual([[obsolete], [obsolete]]);
    expect(readInventory({ storageId: 'bundle' })).toEqual({ [current]: storage[current], [sibling]: {} });
    expect(readInventory()).toEqual(inventory);
    expect(fs.existsSync('build')).toBe(false);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('rejects the removed path override and a missing deploy id', async () => {
    await expect(
      command().parseAsync(['assets', '--deploy-id', 'test', '--storage-file-path', '/tmp/other.json'], {
        from: 'user',
      }),
    ).rejects.toThrow('unknown option');
    await expect(command().parseAsync(['assets'], { from: 'user' })).rejects.toThrow('required option');
    expect(cloudinary.config).not.toHaveBeenCalled();
  });
});
