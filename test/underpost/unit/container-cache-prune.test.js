import { describe, it, expect, afterEach } from 'vitest';
import Underpost from '../../../src/index.js';
import { shellHarness } from '../../support/shell-harness.js';

describe('container cache prune', () => {
  let harness;
  afterEach(() => harness.restore());

  const dockerPrune = (options) => {
    harness = shellHarness();
    Underpost.cluster._pruneContainerCaches(options);
    return harness.calls.find((command) => command.includes('docker system prune'));
  };

  it('removes every unused Docker image on an all prune', () => {
    const command = dockerPrune({ all: true });
    expect(command).toContain('sudo docker system prune -a --volumes -f;');
    expect(command).toContain('sudo docker builder prune -a -f');
    expect(command).not.toContain('docker rmi');
  });

  it('keeps the images of a kept repository, and removes every other unused one', () => {
    const command = dockerPrune({ all: true, keepImages: ['kindest/node'] });
    expect(command).toContain('sudo docker system prune --volumes -f;');
    expect(command).not.toContain('system prune -a');
    expect(command).toContain(
      `sudo docker images --format '{{.Repository}}:{{.Tag}}' | grep -vF -e '<none>' -e 'kindest/node:' | xargs -r sudo docker rmi`,
    );
    expect(command).toContain('sudo docker builder prune -a -f');
  });

  it('prunes dangling images only when not all, whatever it keeps', () => {
    const command = dockerPrune({ all: false, keepImages: ['kindest/node'] });
    expect(command).toContain('sudo docker system prune --volumes -f;');
    expect(command).not.toContain('docker rmi');
  });
});
