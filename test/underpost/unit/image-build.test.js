import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import nodePath from 'path';
import shell from 'shelljs';
import Underpost from '../../../src/index.js';
import UnderpostImage from '../../../src/cli/image.js';
import { STAGED_CLI_PACKAGE } from '../../../src/server/build/package.js';

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

describe('image build base images', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Builds a context holding `dockerfile`; podman holds the images in `held`. */
  const build = (dockerfile, held = []) => {
    const path = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'image-base-'));
    fs.writeFileSync(nodePath.join(path, 'Dockerfile'), dockerfile);
    const commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const missing = command.includes('image exists') && !held.some((image) => command.includes(`'${image}'`));
      return { code: missing ? 1 : 0, stdout: '', stderr: '', toString: () => '' };
    });
    try {
      UnderpostImage.API.build({ path, imageName: 'engine:v1' });
    } finally {
      fs.removeSync(path);
    }
    return commands.filter((command) => command.includes(' pull ')).map((command) => command.split(' pull ')[1]);
  };

  it('pulls the qualified base of every stage that is not held, before the build', () => {
    const pulls = build(
      [
        'ARG BUILD_MODE=RELEASE',
        'FROM golang:1.25 AS builder',
        'FROM --platform=linux/amd64 emscripten/emsdk:5.0.6 AS tools',
        'FROM quay.io/org/base:1 AS runtime',
        'FROM builder AS final',
        'FROM scratch',
        'FROM source-${SOURCE} AS other',
      ].join('\n'),
    );
    expect(pulls).toEqual([
      `'docker.io/library/golang:1.25'`,
      `'docker.io/emscripten/emsdk:5.0.6'`,
      `'quay.io/org/base:1'`,
    ]);
  });

  it('skips a base that podman holds', () => {
    expect(build('FROM golang:1.25\nFROM rockylinux/rockylinux:9', ['docker.io/library/golang:1.25'])).toEqual([
      `'docker.io/rockylinux/rockylinux:9'`,
    ]);
  });
});

describe('container release', () => {
  let checkout;

  afterEach(() => {
    vi.restoreAllMocks();
    if (checkout) fs.removeSync(checkout);
  });

  const REVISION = 'c'.repeat(40);
  const PEER_USER = 'git_super_admin';
  const BUILT = `localhost/cyberia-server:${REVISION}`;
  /** A private-channel checkout: a build context without the staged CLI package. */
  const checkoutFactory = () => (checkout = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'image-release-')));
  /**
   * Runs `release` against this host's runtime answering `runtime` and holding `digests`. `peers` maps a
   * workload node to its SSH peer (`host`) or its kind container, and to what its own runtime answers.
   * `npm pack` writes one archive; `stagedAtBuild` records whether the build context held it.
   */
  const release = ({ runtime, digests, peers = {}, buildCode = 0, ...options }) => {
    const commands = [];
    const stagedAtBuild = [];
    vi.spyOn(Underpost.event, 'kubernetesNodeTarget').mockImplementation((node) =>
      peers[node]
        ? {
            via: `${PEER_USER}@${peers[node].host}:22`,
            host: peers[node].host,
            port: 22,
            user: PEER_USER,
            keyPath: '/peer',
          }
        : { via: 'local' },
    );
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const destination = command.match(/--pack-destination '([^']+)'/)?.[1];
      if (destination) fs.outputFileSync(nodePath.join(destination, 'underpost-4.0.0.tgz'), 'cli');
      const building = command.includes('podman build');
      if (building) stagedAtBuild.push(fs.existsSync(nodePath.join(options.path, STAGED_CLI_PACKAGE)));
      const [, peer] =
        Object.entries(peers).find(([node, { host }]) =>
          command.includes(host ? `@${host} ` : `docker exec -i '${node}'`),
        ) ?? [];
      const answer = peer ?? { runtime, digests };
      const stdout = command.includes('test -S')
        ? answer.runtime
        : command.includes('inspecti')
          ? JSON.stringify({ status: { repoDigests: answer.digests } })
          : '';
      const code = building ? buildCode : 0;
      return { code, stdout, stderr: '', toString: () => stdout };
    });
    const run = () =>
      UnderpostImage.API.release({ imageName: 'underpost/cyberia-server:v3.4.5', revision: REVISION, ...options });
    return { run, commands, stagedAtBuild };
  };

  it('pulls the latest image CI pushed and names it by digest', () => {
    const { run, commands } = release({ runtime: 'crio', digests: ['docker.io/underpost/cyberia-server@sha256:abc'] });
    expect(run()).toBe('docker.io/underpost/cyberia-server@sha256:abc');
    expect(commands.find((command) => command.includes(' pull '))).toContain(`'underpost/cyberia-server:latest'`);
    expect(commands.some((command) => command.includes('podman build'))).toBe(false);
  });

  it('builds the checkout on the host for the private channel, where CRI-O reads it without an import', () => {
    const { run, commands, stagedAtBuild } = release({
      runtime: 'crio',
      digests: ['localhost/cyberia-server@sha256:def'],
      path: checkoutFactory(),
    });
    expect(run()).toBe('localhost/cyberia-server@sha256:def');
    expect(commands.find((command) => command.includes('podman build'))).toContain(`-t 'cyberia-server:${REVISION}'`);
    expect(commands.some((command) => / ctr | podman save /.test(command))).toBe(false);
    expect(stagedAtBuild).toEqual([true]);
    expect(fs.existsSync(nodePath.join(checkout, STAGED_CLI_PACKAGE))).toBe(false);
  });

  it('removes the staged CLI package when the checkout build fails', () => {
    const { run } = release({ runtime: 'crio', digests: [], path: checkoutFactory(), buildCode: 125 });
    expect(run).toThrow(/podman build/);
    expect(fs.existsSync(nodePath.join(checkout, STAGED_CLI_PACKAGE))).toBe(false);
  });

  it('imports the host build into containerd with its digests', () => {
    const { run, commands } = release({
      runtime: 'containerd',
      digests: ['localhost/cyberia-server@sha256:def'],
      path: checkoutFactory(),
    });
    run();
    expect(commands.find((command) => command.includes(' ctr '))).toContain('images import --digests');
  });

  describe('on workload nodes other than this host', () => {
    beforeEach(() => vi.spyOn(process, 'getuid').mockReturnValue(0));

    it('streams the build into a remote node over SSH and pins the digest that node resolves', () => {
      const { run, commands } = release({
        runtime: 'crio',
        digests: [],
        path: checkoutFactory(),
        nodes: ['worker'],
        sshKeyPath: '/deploy/key',
        peers: { worker: { host: '192.168.1.191', runtime: 'crio', digests: ['localhost/cyberia-server@sha256:arc'] } },
      });
      expect(run()).toBe('localhost/cyberia-server@sha256:arc');
      const ship = commands.find((command) => command.startsWith(`podman save '${BUILT}' | ssh `));
      expect(ship).toContain(`-i /deploy/key `);
      expect(ship).toContain(`${PEER_USER}@192.168.1.191 `);
      expect(ship).toMatch(/sudo -n sh -c .*podman load/);
      expect(commands.some((command) => / ctr |podman save -o /.test(command))).toBe(false);
    });

    it('pins the digest every node resolves, loading the archive on this host too', () => {
      const { run, commands } = release({
        runtime: 'crio',
        digests: ['localhost/cyberia-server@sha256:build', 'localhost/cyberia-server@sha256:arc'],
        path: checkoutFactory(),
        nodes: ['control', 'worker'],
        peers: { worker: { host: '192.168.1.191', runtime: 'crio', digests: ['localhost/cyberia-server@sha256:arc'] } },
      });
      expect(run()).toBe('localhost/cyberia-server@sha256:arc');
      expect(commands).toContain(`podman save '${BUILT}' | podman load`);
    });

    it('refuses a release whose nodes share no digest', () => {
      const { run, commands } = release({
        runtime: 'crio',
        digests: [],
        path: checkoutFactory(),
        nodes: ['a', 'b'],
        peers: {
          a: { host: '10.0.0.1', runtime: 'crio', digests: ['localhost/cyberia-server@sha256:one'] },
          b: { host: '10.0.0.2', runtime: 'containerd', digests: ['localhost/cyberia-server@sha256:two'] },
        },
      });
      expect(run).toThrow(`No digest of ${BUILT} resolves on every node: a, b`);
      expect(commands.find((command) => command.includes('@10.0.0.2 ') && command.includes('podman save'))).toMatch(
        /ctr -n k8s\.io images import --digests -/,
      );
    });

    it('streams the build into each kind node container', () => {
      const { run, commands } = release({
        runtime: 'crio',
        digests: [],
        path: checkoutFactory(),
        nodes: ['kind-worker'],
        kind: true,
        peers: { 'kind-worker': { digests: ['localhost/cyberia-server@sha256:kind'] } },
      });
      expect(run()).toBe('localhost/cyberia-server@sha256:kind');
      expect(commands).toContain(
        `podman save '${BUILT}' | docker exec -i 'kind-worker' sh -c 'ctr -n k8s.io images import --digests -'`,
      );
      expect(commands.some((command) => command.includes('kind load'))).toBe(false);
    });

    it('pulls the CI image inside a kind node for the public channel', () => {
      const { run, commands } = release({
        runtime: 'crio',
        digests: [],
        nodes: ['kind-worker'],
        kind: true,
        peers: { 'kind-worker': { digests: ['docker.io/underpost/cyberia-server@sha256:pub'] } },
      });
      expect(run()).toBe('docker.io/underpost/cyberia-server@sha256:pub');
      expect(commands.find((command) => command.includes(' pull '))).toMatch(/^docker exec -i 'kind-worker' sh -c /);
    });
  });

  it('resolves a tag to the digest the registry holds now', () => {
    const { commands } = release({ runtime: 'crio', digests: ['docker.io/underpost/engine-cyberia@sha256:fed'] });
    expect(UnderpostImage.API.digest({ reference: 'underpost/engine-cyberia:v3.5.0' })).toBe(
      'docker.io/underpost/engine-cyberia@sha256:fed',
    );
    expect(commands.find((command) => command.includes(' pull '))).toContain(`'underpost/engine-cyberia:v3.5.0'`);
    expect(UnderpostImage.API.digest({ reference: 'underpost/engine-cyberia@sha256:fed' })).toBe(
      'docker.io/underpost/engine-cyberia@sha256:fed',
    );
    expect(() => UnderpostImage.API.digest({ reference: '' })).toThrow(/needs an image reference/);
  });

  it('refuses a moving reference, and an image the runtime holds no digest for', () => {
    expect(() => release({ runtime: 'crio', digests: [] }).run()).toThrow(
      /No digest of underpost\/cyberia-server:latest resolves on every node/,
    );
    expect(() => UnderpostImage.API.release({ imageName: 'underpost/cyberia-server', revision: 'main' })).toThrow(
      /exact 40-character/,
    );
  });
});

describe('image node selection', () => {
  const PEER = { via: 'git_super_admin@192.168.1.191:22', host: '192.168.1.191', port: 22, user: 'git_super_admin' };
  const IMAGES = 'IMAGE  TAG  IMAGE ID  SIZE\ndocker.io/library/mongo  latest  b56d78aee1b13  1.12GB\n';
  let commands;

  afterEach(() => vi.restoreAllMocks());

  /**
   * `worker` is a peer whose CRI-O holds `remote`; this host runs containerd and holds `local`. `inspecti`
   * fails for an image a runtime does not hold, as crictl does.
   */
  const fleet = ({ remote = [], local = [] } = {}) => {
    commands = [];
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    vi.spyOn(Underpost.event, 'kubernetesNodeTarget').mockImplementation((node) =>
      node === 'worker' ? { ...PEER, keyPath: '/peer' } : { via: 'local' },
    );
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const onPeer = command.includes(`@${PEER.host} `);
      const held = (onPeer ? remote : local).some((image) => command.includes(image));
      const missing = command.includes('inspecti') && !held;
      const stdout = command.includes('test -S')
        ? onPeer
          ? 'crio'
          : 'containerd'
        : command.includes(' images')
          ? IMAGES
          : command.includes('inspecti') && held
            ? JSON.stringify({ status: { repoDigests: [] } })
            : '';
      return { code: missing ? 1 : 0, stdout, stderr: '', toString: () => stdout };
    });
  };
  const ranOnPeer = (fragment) =>
    commands.filter((command) => command.includes(`@${PEER.host} `) && command.includes(fragment));

  it('lists the images of each named node, reaching a peer through its node identity', () => {
    fleet();
    const row = { IMAGE: 'docker.io/library/mongo', TAG: 'latest', ID: 'b56d78aee1b13', SIZE: '1.12GB' };
    expect(UnderpostImage.API.list({ nodes: 'worker,control' })).toEqual([
      { NODE: 'worker', ...row },
      { NODE: 'control', ...row },
    ]);
    expect(ranOnPeer(' images')[0]).toContain('crio.sock');
  });

  it('acts on this host when no node is named, and on kind-worker with --kind', () => {
    fleet();
    UnderpostImage.API.list({});
    UnderpostImage.API.list({ kind: true });
    expect(commands.filter((command) => command.includes(' images'))).toEqual([
      expect.stringMatching(/^env PATH=.* crictl --runtime-endpoint 'unix:\/\/\/run\/containerd\/containerd\.sock'/),
      expect.stringMatching(/^docker exec -i 'kind-worker' sh -c /),
    ]);
  });

  it('removes an image from each named node', () => {
    fleet();
    UnderpostImage.API.rm({ imageName: 'mongo:latest', nodes: 'worker' });
    expect(ranOnPeer('rmi')[0]).toContain('mongo:latest');
  });

  it('pulls a Docker Hub image only into the nodes that do not hold it', () => {
    fleet({ remote: ['mongo:latest'] });
    UnderpostImage.API.pullDockerHubImage({ dockerhubImage: 'mongo', nodes: 'worker,control' });
    const pulls = commands.filter((command) => command.includes(' pull '));
    expect(pulls).toHaveLength(1);
    expect(pulls[0]).not.toContain(PEER.host);
  });

  it('streams an image archive into the runtime of each named node', () => {
    fleet();
    const archive = nodePath.join(fs.mkdtempSync(nodePath.join(os.tmpdir(), 'image-import-')), 'app.tar');
    fs.writeFileSync(archive, 'tar');
    try {
      UnderpostImage.API.importTar({ importTar: archive, nodes: 'worker' });
      UnderpostImage.API.importTar({ importTar: archive, kubeadm: true });
      UnderpostImage.API.importTar({ importTar: archive });
    } finally {
      fs.removeSync(nodePath.dirname(archive));
    }
    const loads = commands.filter((command) => command.startsWith(`cat '${archive}' | `));
    expect(loads).toHaveLength(2);
    expect(loads[0]).toMatch(new RegExp(`@${PEER.host} .*podman load`));
    expect(loads[1]).toBe(`cat '${archive}' | ctr -n k8s.io images import --digests -`);
  });
});
