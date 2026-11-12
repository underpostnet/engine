import { describe, it, expect, afterEach } from 'vitest';
import Underpost from '../../../src/index.js';
import { privilegedCommand, shellHarness } from '../../support/shell-harness.js';

describe('container cache prune', () => {
  let harness;
  afterEach(() => harness.restore());

  const prune = (options) => {
    harness = shellHarness();
    Underpost.cluster._pruneContainerCaches(options);
    const commands = harness.calls.map(privilegedCommand);
    return {
      docker: commands.find((command) => command.includes('docker container prune')),
      podman: commands.find((command) => command.includes('podman container prune')),
    };
  };

  it('removes every unused Docker image on an all prune', () => {
    const { docker } = prune({ all: true });
    expect(docker).toContain('docker image prune -a -f;');
    expect(docker).toContain('docker builder prune -a -f');
    expect(docker).not.toContain('docker rmi');
  });

  it('keeps the images of a kept repository, and removes every other unused one', () => {
    const { docker } = prune({ all: true, keepImages: ['kindest/node'] });
    expect(docker).toContain('docker image prune -f;');
    expect(docker).not.toContain('image prune -a');
    expect(docker).toContain(
      `docker images --format '{{.Repository}}:{{.Tag}}' | grep -vF -e '<none>' -e 'kindest/node:' | xargs -r docker rmi`,
    );
    expect(docker).toContain('docker builder prune -a -f');
  });

  it('prunes dangling images only when not all, whatever it keeps', () => {
    const { docker, podman } = prune({ all: false, keepImages: ['kindest/node'] });
    expect(docker).toContain('docker image prune -f;');
    expect(docker).not.toContain('docker rmi');
    expect(podman).toContain('podman image prune -f;');
  });

  // Podman reads the CNI configuration of a Kubernetes node as its networks: a network prune deletes it.
  it('never prunes networks, so the CNI configuration of a node survives', () => {
    const { docker, podman } = prune({ all: true });
    for (const command of [docker, podman]) {
      expect(command).not.toMatch(/system prune|network prune/);
      expect(command).toContain('volume prune -f');
    }
    expect(podman).toContain('podman image prune -a -f;');
  });
});
