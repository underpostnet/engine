'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import shell from 'shelljs';
import { vi } from 'vitest';
import Underpost from '../../../../src/index.js';

const secret = () => Underpost.secret;
const STAGE_DIR = '/dev/shm/underpost-actions-secret';

// A gh double: the repositories it sees, the writes it refuses, and every command it received.
const ghFactory = ({ visible = [], refused = [], authenticated = true } = {}) => {
  const commands = [];
  vi.spyOn(shell, 'exec').mockImplementation((command) => {
    commands.push(command);
    const answer = (code, stdout = '') => ({ code, stdout, stderr: code ? 'refused' : '' });
    if (command.startsWith('gh auth status')) return answer(authenticated ? 0 : 1, authenticated ? 'Logged in' : '');
    const view = /^gh repo view "([^"]+)"/.exec(command);
    if (view) return answer(0, visible.includes(view[1]) ? '{"nameWithOwner":"x"}' : '');
    if (command.includes('gh secret set')) return answer(refused.some((repo) => command.includes(repo)) ? 1 : 0);
    return answer(0);
  });
  return commands;
};

const writes = (commands) => commands.filter((command) => command.includes('gh secret set'));

describe('Actions secret staging', () => {
  const tty = process.stdin.isTTY;
  let directory;
  const stage = (key, options, hostValues) =>
    secret().stageActionsSecret(path.join(directory, key), key, options, hostValues);
  const staged = (key) => fs.readFileSync(path.join(directory, key), 'utf8');
  const readFileSync = fs.readFileSync;
  const stdin = (content) => {
    vi.spyOn(fs, 'fstatSync').mockReturnValue({ isFIFO: () => content !== null, isFile: () => false });
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) =>
      file === 0 ? content : readFileSync(file, ...rest),
    );
  };

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actions-secret-stage-'));
    process.stdin.isTTY = false;
    stdin(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(directory);
    process.stdin.isTTY = tty;
    delete process.env.PROBE_SECRET;
  });

  it('stages an explicit value, then the environment, then the host configuration, at mode 600', () => {
    process.env.PROBE_SECRET = 'inherited';
    expect(stage('PROBE_SECRET', { value: ' explicit ' })).to.deep.equal({ value: 'explicit', source: '--args value' });
    expect(staged('PROBE_SECRET')).to.equal('explicit');
    expect(fs.statSync(path.join(directory, 'PROBE_SECRET')).mode & 0o777).to.equal(0o600);

    expect(stage('PROBE_SECRET', {}, { PROBE_SECRET: 'from-host' })).to.deep.equal({
      value: 'inherited',
      source: 'PROBE_SECRET environment',
    });
    delete process.env.PROBE_SECRET;
    expect(stage('PROBE_SECRET', {}, { PROBE_SECRET: 'from-host' })).to.deep.equal({
      value: 'from-host',
      source: 'host configuration',
    });
  });

  it('pins the host configuration with source=host and refuses a key it does not hold', () => {
    process.env.PROBE_SECRET = 'inherited';
    expect(stage('PROBE_SECRET', { source: 'host' }, { PROBE_SECRET: 'pinned' })).to.deep.equal({
      value: 'pinned',
      source: 'host configuration',
    });
    expect(() => stage('PROBE_SECRET', { source: 'host' }, {})).to.throw(
      /PROBE_SECRET is not in the host configuration/,
    );
  });

  it('takes a piped value without its final newline, and refuses an empty one', () => {
    stdin('piped\n');
    expect(stage('PROBE_SECRET', {})).to.deep.equal({ value: 'piped', source: 'piped stdin' });
    expect(staged('PROBE_SECRET')).to.equal('piped');
    stdin('\n');
    expect(() => stage('PROBE_SECRET', {})).to.throw(/the value for PROBE_SECRET is empty/);
  });

  it('asks for a source when nothing is piped and no terminal can prompt', () => {
    expect(() => stage('PROBE_SECRET', {})).to.throw(/rotate needs a value for PROBE_SECRET: pipe it in/);
  });

  it('refuses a GIT_AUTH_TOKEN with whitespace and accepts one of an unknown shape', () => {
    expect(() => stage('GIT_AUTH_TOKEN', { value: 'two words' })).to.throw(/contains whitespace/);
    expect(stage('GIT_AUTH_TOKEN', { value: 'opaque-token' }).value).to.equal('opaque-token');
  });
});

describe('Actions secret writes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes one organization secret for the organization repositories and a repository secret elsewhere', () => {
    const commands = ghFactory({ refused: ['other/broken'] });
    const outcome = secret().writeActionsSecret({
      key: 'PROBE_SECRET',
      stagePath: '/dev/shm/probe',
      target: { owner: 'acme', level: 'org' },
      repos: ['acme/one', 'acme/two', 'other/repo', 'other/broken'],
    });
    expect(outcome).to.deep.equal({ written: ['acme/one', 'acme/two', 'other/repo'], failed: ['other/broken'] });
    expect(writes(commands)).to.deep.equal([
      `bash -c 'set -o pipefail; gh secret set PROBE_SECRET --org "acme" --visibility selected --repos "one,two" < "/dev/shm/probe"'`,
      `bash -c 'set -o pipefail; gh secret set PROBE_SECRET --repo "other/repo" < "/dev/shm/probe"'`,
      `bash -c 'set -o pipefail; gh secret set PROBE_SECRET --repo "other/broken" < "/dev/shm/probe"'`,
    ]);
  });

  it('writes a repository secret per repository at the repository level', () => {
    const commands = ghFactory();
    const outcome = secret().writeActionsSecret({
      key: 'PROBE_SECRET',
      stagePath: '/dev/shm/probe',
      target: { owner: 'acme', level: 'repo' },
      repos: ['acme/one', 'acme/two'],
    });
    expect(outcome.written).to.deep.equal(['acme/one', 'acme/two']);
    expect(writes(commands)).to.have.length(2);
  });

  it('splits the targets into the ones the credential reaches and the rest', () => {
    ghFactory({ visible: ['acme/one'] });
    expect(secret().probeActionsSecretTargets(['acme/one', 'acme/gone'], {})).to.deep.equal({
      reachable: ['acme/one'],
      unreachable: ['acme/gone'],
    });
  });
});

describe('Actions secret rotation', () => {
  const rotate = (options) =>
    secret().rotateActionsSecrets({ target: 'user', owner: 'acme', value: 'rotated', ...options });

  beforeEach(() => {
    vi.spyOn(Underpost.host, 'read').mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(STAGE_DIR);
  });

  it('writes the staged value to every reachable target, reports the rest and shreds the stage', () => {
    vi.spyOn(secret(), 'hasBinary').mockReturnValue(true);
    const commands = ghFactory({ visible: ['acme/one', 'acme/two'] });
    const report = rotate({ keys: 'PROBE_SECRET', repos: 'acme/one|acme/two|acme/gone' });
    expect(report.written).to.deep.equal({ PROBE_SECRET: ['acme/one', 'acme/two'] });
    expect(report.failed).to.deep.equal({ PROBE_SECRET: [] });
    expect(report.unreachable).to.include('acme/gone');
    expect(report.sources).to.deep.equal({ PROBE_SECRET: '--args value' });
    expect(report.store).to.equal(false);
    expect(commands.some((command) => command.startsWith('shred -u'))).to.equal(true);
    expect(fs.existsSync(STAGE_DIR)).to.equal(false);
  });

  it('plans the reachable targets on a dry run and writes nothing', () => {
    vi.spyOn(secret(), 'hasBinary').mockReturnValue(true);
    const commands = ghFactory({ visible: ['acme/one'], authenticated: false });
    const report = rotate({ keys: 'PROBE_SECRET', repos: 'acme/one|acme/gone', dryRun: true });
    expect(report.written).to.deep.equal({});
    expect(report.unreachable).to.include('acme/gone');
    expect(writes(commands)).to.deep.equal([]);
  });

  it('mirrors a written GIT_AUTH_TOKEN into the store and applies it when asked', () => {
    vi.spyOn(secret(), 'hasBinary').mockReturnValue(true);
    const manifest = vi.spyOn(secret(), 'writeGitAuthTokenManifest').mockReturnValue('stored.enc.yaml');
    const apply = vi.spyOn(secret(), 'applyIfPresent').mockReturnValue(true);
    ghFactory({ visible: ['acme/one'] });
    const report = rotate({
      keys: 'GIT_AUTH_TOKEN',
      value: 'ghp_abcdefghijklmnopqrstuvwxyz',
      repos: 'acme/one',
      store: 'true',
      apply: 'true',
    });
    expect(report.manifest).to.equal('stored.enc.yaml');
    expect(manifest).toHaveBeenCalledWith('ghp_abcdefghijklmnopqrstuvwxyz', 'default');
    expect(apply).toHaveBeenCalledWith('git-auth-token', 'default');
  });

  it('leaves the store untouched for a GIT_AUTH_TOKEN it does not hold', () => {
    vi.spyOn(secret(), 'hasBinary').mockReturnValue(true);
    const manifest = vi.spyOn(secret(), 'writeGitAuthTokenManifest');
    ghFactory({ visible: ['acme/one'] });
    const report = rotate({ keys: 'GIT_AUTH_TOKEN', value: 'ghp_abcdefghijklmnopqrstuvwxyz', repos: 'acme/one' });
    expect(report.manifest).to.equal('');
    expect(manifest).not.toHaveBeenCalled();
  });

  it('refuses without gh, without a reachable target, and when no target took the value', () => {
    vi.spyOn(secret(), 'hasBinary').mockReturnValue(false);
    expect(() => rotate({ keys: 'PROBE_SECRET', repos: 'acme/one' })).to.throw(/gh not found in PATH/);

    vi.spyOn(secret(), 'hasBinary').mockReturnValue(true);
    ghFactory();
    expect(() => rotate({ keys: 'PROBE_SECRET', repos: 'acme/one' })).to.throw(
      /None of the \d+ target\(s\) is reachable/,
    );

    vi.restoreAllMocks();
    vi.spyOn(Underpost.host, 'read').mockReturnValue({});
    vi.spyOn(secret(), 'hasBinary').mockReturnValue(true);
    ghFactory({ visible: ['acme/one'], refused: ['acme/one'] });
    expect(() => rotate({ keys: 'PROBE_SECRET', repos: 'acme/one' })).to.throw(
      /PROBE_SECRET could not be written to any of the 1 reachable target/,
    );
  });

  it('refuses a rotation that left the fleet split across two values', () => {
    vi.spyOn(secret(), 'hasBinary').mockReturnValue(true);
    ghFactory({ visible: ['acme/one', 'acme/two'], refused: ['acme/two'] });
    expect(() => rotate({ keys: 'PROBE_SECRET', repos: 'acme/one|acme/two' })).to.throw(
      /PROBE_SECRET was rotated on acme\/one but failed on acme\/two/,
    );
  });
});
