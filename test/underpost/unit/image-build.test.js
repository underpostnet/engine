import { describe, it, expect, vi, afterEach } from 'vitest';
import shell from 'shelljs';
import UnderpostImage from '../../../src/cli/image.js';

describe('image build', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes the context, tag and build args to podman as literal arguments', () => {
    const commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '', toString: () => '' };
    });
    UnderpostImage.API.build({ path: 'ctx dir', imageName: 'engine:v1', buildArgs: { CODES: 'a,$(id)' } });
    const build = commands.find((command) => command.includes('podman build'));
    expect(build).to.include(`cd 'ctx dir' && sudo podman build -f './Dockerfile' -t 'engine:v1'`);
    expect(build).to.include(`--build-arg 'CODES=a,$(id)'`);
    expect(build).not.to.include('--target');
  });

  it('stops at the build stage it names', () => {
    const commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '', toString: () => '' };
    });
    UnderpostImage.API.build({ path: 'ctx', imageName: 'engine-builder:v1', target: 'builder' });
    expect(commands.find((command) => command.includes('podman build'))).to.include(
      `-t 'engine-builder:v1' --target 'builder' --pull=never`,
    );
  });
});

describe('container release', () => {
  afterEach(() => vi.restoreAllMocks());

  const REVISION = 'c'.repeat(40);
  /** Runs `release` against a node runtime answering `runtime` and holding `digests`. */
  const release = ({ runtime, digests, ...options }) => {
    const commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const stdout = command.includes('test -S')
        ? runtime
        : command.includes('inspecti')
          ? JSON.stringify({ status: { repoDigests: digests } })
          : '';
      return { code: 0, stdout, stderr: '', toString: () => stdout };
    });
    const run = () =>
      UnderpostImage.API.release({ imageName: 'underpost/cyberia-server:v3.4.5', revision: REVISION, ...options });
    return { run, commands };
  };

  it('pulls the image CI built for the exact revision and names it by digest', () => {
    const { run, commands } = release({ runtime: 'crio', digests: ['docker.io/underpost/cyberia-server@sha256:abc'] });
    expect(run()).toBe('docker.io/underpost/cyberia-server@sha256:abc');
    expect(commands.find((command) => command.includes(' pull '))).toContain(
      `'underpost/cyberia-server:sha-${REVISION}'`,
    );
    expect(commands.some((command) => command.includes('podman build'))).toBe(false);
  });

  it('builds the checkout on the host for the private channel, where CRI-O reads it without an import', () => {
    const { run, commands } = release({
      runtime: 'crio',
      digests: ['localhost/cyberia-server@sha256:def'],
      path: './cyberia-server',
    });
    expect(run()).toBe('localhost/cyberia-server@sha256:def');
    expect(commands.find((command) => command.includes('podman build'))).toContain(`-t 'cyberia-server:${REVISION}'`);
    expect(commands.some((command) => / ctr | podman save /.test(command))).toBe(false);
  });

  it('imports the host build into containerd with its digests', () => {
    const { run, commands } = release({
      runtime: 'containerd',
      digests: ['localhost/cyberia-server@sha256:def'],
      path: './cyberia-server',
    });
    run();
    expect(commands.find((command) => command.includes(' ctr '))).toContain('images import --digests');
  });

  it('refuses a moving reference, and an image the runtime holds no digest for', () => {
    expect(() => release({ runtime: 'crio', digests: [] }).run()).toThrow(/reports no digest/);
    expect(() => UnderpostImage.API.release({ imageName: 'underpost/cyberia-server', revision: 'main' })).toThrow(
      /exact 40-character/,
    );
  });
});
