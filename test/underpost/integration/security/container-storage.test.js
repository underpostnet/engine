'use strict';

import { expect } from 'chai';
import ContainerStorageService, {
  absoluteStoragePaths,
  assertSafeStoragePaths,
  isSafeStoragePath,
  containerStorageCommandsFactory,
  containerStorageRootsFactory,
  containerStorageSubtreeCommandsFactory,
  coveringRootFactory,
  ensureContainerStorage,
  ensureContainerStorageSubtree,
  localPathConfigCommandFactory,
  localPathRootsFactory,
  normalizeStorageRoots,
  storageDirectoryCommandFactory,
} from '../../../../src/server/security/container-storage.js';
import { MongoBootstrap } from '../../../../src/db/mongo/MongoBootstrap.js';

const collect = (paths, options = {}) => {
  const executed = [];
  ensureContainerStorage(paths, { execute: (command) => executed.push(command), ...options });
  return executed;
};

const mappedRoots = (commands) =>
  commands
    .filter((command) => command.includes('semanage fcontext -a'))
    .map((command) => /semanage fcontext -a -t \S+ '([^']+)\(\/\.\*\)\?'/.exec(command)[1]);

const restoredPaths = (commands) => {
  const restore = commands.find((command) => command.includes('restorecon'));
  return restore ? [...restore.matchAll(/restorecon -RF '([^']+)'/g)].map((match) => match[1]) : [];
};

const createdPaths = (commands) =>
  commands.filter((command) => command.startsWith('[ -d ')).map((command) => /^\[ -d '([^']+)'/.exec(command)[1]);

describe('Container storage SELinux preparation', () => {
  it('exposes one canonical class API with named factory aliases', () => {
    expect(ContainerStorageService.containerStorageCommandsFactory).to.equal(containerStorageCommandsFactory);
    expect(ContainerStorageService.SHARED_CONTAINER_TYPE).to.equal('container_file_t');
  });

  describe('path normalization', () => {
    it('keeps only absolute paths, deduplicated and ordered parents first', () => {
      expect(absoluteStoragePaths(['/data/mongodb', '/data', 'relative/path', '', '/data/', null])).to.deep.equal([
        '/data',
        '/data/mongodb',
      ]);
    });

    it('collapses descendants into the covering root', () => {
      expect(normalizeStorageRoots(['/data/mongodb/v0', '/data', '/opt/local-path-provisioner'])).to.deep.equal([
        '/data',
        '/opt/local-path-provisioner',
      ]);
    });

    it('never collapses a sibling that merely shares a prefix', () => {
      expect(normalizeStorageRoots(['/data', '/database'])).to.deep.equal(['/data', '/database']);
    });

    it('refuses to treat / as a storage root', () => {
      expect(normalizeStorageRoots(['/'])).to.deep.equal([]);
      expect(() => containerStorageCommandsFactory(['/'])).to.throw(TypeError);
      expect(() => containerStorageCommandsFactory([])).to.throw(TypeError);
    });

    it('resolves the longest declared root covering a path', () => {
      expect(coveringRootFactory('/data/mongodb/v0')).to.equal('/data');
      expect(coveringRootFactory('/data/mongodb/v0', ['/data', '/data/mongodb'])).to.equal('/data/mongodb');
      expect(coveringRootFactory('/srv/unmapped')).to.equal('/srv/unmapped');
    });
  });

  describe('system path protection', () => {
    it('refuses a directory that is a system location in its own right', () => {
      for (const path of ['/', '/opt', '/usr', '/var', '/home', '/etc', '/var/lib'])
        expect(isSafeStoragePath(path), path).to.equal(false);
    });

    it('refuses the CNI plugin directory, which a pod mounts but which holds executables', () => {
      expect(isSafeStoragePath('/opt/cni/bin')).to.equal(false);
      expect(isSafeStoragePath('/opt/cni')).to.equal(false);
    });

    it('refuses anything inside a tree that can never hold container storage', () => {
      for (const path of ['/usr/bin', '/etc/passwd', '/lib64/x', '/proc/1', '/sys/fs', '/boot/grub'])
        expect(isSafeStoragePath(path), path).to.equal(false);
    });

    it('allows a storage tree living under a system location', () => {
      for (const path of ['/opt/local-path-provisioner', '/data', '/data/mongodb', '/home/dd/engine/volume/pv-x'])
        expect(isSafeStoragePath(path), path).to.equal(true);
    });

    it('allows only the hardcoded kubeadm control-plane mounts to break the prefix rule', () => {
      for (const path of ContainerStorageService.CONTROL_PLANE_MOUNT_PATHS)
        expect(isSafeStoragePath(path), path).to.equal(true);
      expect(isSafeStoragePath('/etc/kubernetes-other')).to.equal(false);
    });

    it('throws at the command boundary rather than emitting a relabel for a system path', () => {
      expect(() => containerStorageCommandsFactory(['/data', '/opt/cni/bin'])).to.throw(RangeError, '/opt/cni/bin');
      expect(() => containerStorageSubtreeCommandsFactory('/usr/bin')).to.throw(RangeError, '/usr/bin');
      expect(() => assertSafeStoragePaths(['/opt'])).to.throw(RangeError);
    });

    it('refuses a safe subtree whose covering root is not itself safe', () => {
      expect(() => containerStorageSubtreeCommandsFactory('/opt/cni/bin/plugins', { roots: ['/opt/cni'] })).to.throw(
        RangeError,
      );
    });

    it('keeps every declared platform root safe', () => {
      for (const root of ContainerStorageService.PLATFORM_STORAGE_ROOTS)
        expect(isSafeStoragePath(root), root).to.equal(true);
      expect(isSafeStoragePath(ContainerStorageService.LOCAL_PATH_DEFAULT_ROOT)).to.equal(true);
    });
  });

  describe('local-path provisioner discovery', () => {
    it('reads the node roots out of a live provisioner config', () => {
      const config = JSON.stringify({
        nodePathMap: [
          { node: 'DEFAULT_PATH_FOR_NON_LISTED_NODES', paths: ['/opt/local-path-provisioner'] },
          { node: 'worker-1', paths: ['/srv/local-path', '/opt/local-path-provisioner'] },
        ],
      });
      expect(localPathRootsFactory(config)).to.deep.equal(['/opt/local-path-provisioner', '/srv/local-path']);
    });

    it('reads a shared filesystem root', () => {
      expect(localPathRootsFactory('{"sharedFileSystemPath":"/srv/shared"}')).to.deep.equal(['/srv/shared']);
    });

    it('degrades to an empty result rather than throwing on absent or malformed config', () => {
      expect(localPathRootsFactory('')).to.deep.equal([]);
      expect(localPathRootsFactory('not json')).to.deep.equal([]);
      expect(localPathRootsFactory('{"nodePathMap":"unexpected"}')).to.deep.equal([]);
    });

    it('falls back to the upstream default root when discovery found nothing', () => {
      expect(containerStorageRootsFactory()).to.include(ContainerStorageService.LOCAL_PATH_DEFAULT_ROOT);
      expect(containerStorageRootsFactory({ localPathRoots: ['/srv/local-path'] })).to.include('/srv/local-path');
      expect(containerStorageRootsFactory({ localPathRoots: ['/srv/local-path'] })).to.not.include(
        ContainerStorageService.LOCAL_PATH_DEFAULT_ROOT,
      );
    });

    it('includes the control-plane mount paths only when asked', () => {
      expect(containerStorageRootsFactory()).to.not.include('/var/lib/etcd');
      expect(containerStorageRootsFactory({ controlPlane: true })).to.include('/var/lib/etcd');
    });

    it('builds a namespace-scoped provisioner config lookup', () => {
      expect(localPathConfigCommandFactory({ namespace: 'local-path-storage' })).to.include(
        'kubectl get configmap local-path-config -n local-path-storage',
      );
      expect(() => localPathConfigCommandFactory({})).to.throw(TypeError);
    });
  });

  describe('directory creation', () => {
    it('creates a missing directory and leaves an existing one untouched', () => {
      const command = storageDirectoryCommandFactory('/data/mysql');
      expect(command).to.equal(`[ -d '/data/mysql' ] || sudo install -d -m 0755 '/data/mysql'`);
    });

    it('applies an explicit mode and owner only at creation time', () => {
      expect(storageDirectoryCommandFactory('/data/x', { mode: '0700', owner: '999:999' })).to.equal(
        `[ -d '/data/x' ] || sudo install -d -m 0700 -o '999' -g '999' '/data/x'`,
      );
    });

    it('quotes paths containing shell metacharacters', () => {
      expect(storageDirectoryCommandFactory("/data/o'hara")).to.include(`'/data/o'"'"'hara'`);
    });

    it('requires a path', () => {
      expect(() => storageDirectoryCommandFactory('')).to.throw(TypeError);
    });
  });

  describe('fresh deployment', () => {
    const commands = collect(['/data', '/data/mongodb', '/data/mongodb/v0', '/opt/local-path-provisioner']);

    it('creates every requested directory, including the nested volume directories', () => {
      expect(createdPaths(commands)).to.deep.equal([
        '/data',
        '/data/mongodb',
        '/data/mongodb/v0',
        '/opt/local-path-provisioner',
      ]);
    });

    it('registers one persistent mapping per covering root, not per volume', () => {
      expect(mappedRoots(commands)).to.deep.equal(['/data', '/opt/local-path-provisioner']);
    });

    it('creates directories before labeling them, so nothing is relabeled out from under itself', () => {
      const firstMapping = commands.findIndex((command) => command.includes('semanage fcontext'));
      const lastCreate = commands.map((command) => command.startsWith('[ -d ')).lastIndexOf(true);
      expect(lastCreate).to.be.lessThan(firstMapping);
    });

    it('restores the covering roots last, so the mapping is already in the store', () => {
      expect(restoredPaths(commands)).to.deep.equal(['/data', '/opt/local-path-provisioner']);
      expect(commands[commands.length - 1]).to.include('restorecon');
    });

    it('uses semanage rather than chcon, so the label survives a policy relabel', () => {
      expect(commands.join('\n')).to.include('semanage fcontext');
      expect(commands.join('\n')).to.not.include('chcon');
    });

    it('reports actionable remediation instead of silently skipping when semanage is absent', () => {
      expect(commands.find((command) => command.includes('semanage fcontext'))).to.include(
        'semanage is required for persistent file contexts',
      );
    });

    it('no-ops entirely on a host without SELinux', () => {
      for (const command of commands.filter((entry) => entry.includes('semanage')))
        expect(command).to.include('selinuxenabled');
      for (const command of commands.filter((entry) => entry.includes('restorecon')))
        expect(command).to.include('command -v restorecon');
    });
  });

  describe('redeployment', () => {
    it('emits an identical command list on a repeat run', () => {
      const first = collect(['/data', '/opt/local-path-provisioner']);
      const second = collect(['/data', '/opt/local-path-provisioner']);
      expect(second).to.deep.equal(first);
    });

    it('is order-independent, so a caller cannot change the applied state by reordering', () => {
      expect(collect(['/opt/local-path-provisioner', '/data'])).to.deep.equal(
        collect(['/data', '/opt/local-path-provisioner']),
      );
    });

    it('adds the mapping when absent and amends it when present, never failing on either', () => {
      const mapping = collect(['/data']).find((command) => command.includes('semanage fcontext'));
      expect(mapping).to.include('semanage fcontext -a -t container_file_t');
      expect(mapping).to.include('semanage fcontext -m -t container_file_t');
    });
  });

  describe('existing persistent data', () => {
    it('never re-modes, re-owns or removes a directory that already exists', () => {
      const commands = collect(['/data/mongodb/v0']);
      expect(commands.filter((command) => /(^|[^-])\bchmod\b/.test(command))).to.deep.equal([]);
      expect(commands.filter((command) => /\bchown\b/.test(command))).to.deep.equal([]);
      expect(commands.filter((command) => /\brm\b/.test(command))).to.deep.equal([]);
      expect(commands.filter((command) => command.startsWith('[ -d '))).to.have.length(1);
    });

    it('relabels a data subtree without registering a mapping for it', () => {
      const commands = containerStorageSubtreeCommandsFactory('/home/dd/engine/volume/pv-app-production-blue');
      expect(mappedRoots(commands)).to.deep.equal(['/home/dd/engine/volume']);
      expect(restoredPaths(commands)).to.deep.equal(['/home/dd/engine/volume/pv-app-production-blue']);
      expect(createdPaths(commands)).to.deep.equal([]);
    });

    it('maps an uncovered subtree at its own path rather than leaving it unmapped', () => {
      expect(mappedRoots(containerStorageSubtreeCommandsFactory('/srv/external-volume'))).to.deep.equal([
        '/srv/external-volume',
      ]);
    });

    it('collapses many volumes of one root into a single mapping and a single restore', () => {
      const commands = containerStorageSubtreeCommandsFactory([
        '/home/dd/engine/volume/pv-a',
        '/home/dd/engine/volume/pv-b',
        '/home/dd/engine/volume',
      ]);
      expect(mappedRoots(commands)).to.deep.equal(['/home/dd/engine/volume']);
      expect(restoredPaths(commands)).to.deep.equal(['/home/dd/engine/volume']);
    });

    it('skips a restore whose target does not exist instead of failing the deploy', () => {
      expect(restoredPaths(containerStorageSubtreeCommandsFactory('/data/absent'))).to.deep.equal(['/data/absent']);
      const restore = containerStorageSubtreeCommandsFactory('/data/absent').find((command) =>
        command.includes('restorecon'),
      );
      expect(restore).to.include(`[ ! -e '/data/absent' ] ||`);
    });
  });

  describe('failure and recovery paths', () => {
    it('requires an executor rather than silently doing nothing', () => {
      expect(() => ensureContainerStorage('/data', {})).to.throw(TypeError);
      expect(() => ensureContainerStorageSubtree('/data', {})).to.throw(TypeError);
    });

    it('rejects an empty or relative target', () => {
      expect(() => containerStorageSubtreeCommandsFactory([])).to.throw(TypeError);
      expect(() => containerStorageSubtreeCommandsFactory(['relative'])).to.throw(TypeError);
    });

    it('drops sudo when already running as root on the node', () => {
      const commands = containerStorageCommandsFactory(['/data'], { sudo: false });
      expect(commands.join('\n')).to.not.include('sudo ');
    });

    it('propagates an executor failure instead of reporting success', () => {
      expect(() =>
        ensureContainerStorage('/data', {
          execute: () => {
            throw new Error('semanage failed');
          },
        }),
      ).to.throw('semanage failed');
    });
  });

  describe('MongoDB replica data root', () => {
    it('prepares the root and one directory per member', () => {
      expect(MongoBootstrap.prepareReplicaDataRoot(3, { execute: () => {} })).to.deep.equal([
        '/data/mongodb',
        '/data/mongodb/v0',
        '/data/mongodb/v1',
        '/data/mongodb/v2',
      ]);
    });

    it('creates every member directory but maps only /data', () => {
      const executed = [];
      MongoBootstrap.prepareReplicaDataRoot(3, { execute: (command) => executed.push(command) });
      expect(createdPaths(executed)).to.deep.equal([
        '/data/mongodb',
        '/data/mongodb/v0',
        '/data/mongodb/v1',
        '/data/mongodb/v2',
      ]);
      expect(mappedRoots(executed)).to.deep.equal(['/data']);
      expect(restoredPaths(executed)).to.deep.equal(['/data/mongodb']);
    });

    it('leaves ownership and mode of an existing member directory to the init container', () => {
      const executed = [];
      MongoBootstrap.prepareReplicaDataRoot(1, { execute: (command) => executed.push(command) });
      expect(executed.join('\n')).to.not.include('chown');
      expect(executed.join('\n')).to.not.match(/(^|\s)chmod\s/);
    });

    it('tolerates a zero or unparsable replica count without emitting a bad path', () => {
      expect(MongoBootstrap.prepareReplicaDataRoot(0, { execute: () => {} })).to.deep.equal(['/data/mongodb']);
      expect(MongoBootstrap.prepareReplicaDataRoot(undefined, { execute: () => {} })).to.deep.equal(['/data/mongodb']);
    });
  });
});
