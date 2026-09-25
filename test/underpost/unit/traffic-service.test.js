import { describe, it, expect, vi, afterEach } from 'vitest';
import shell from 'shelljs';
import Underpost from '../../../src/index.js';

describe('traffic Service', () => {
  afterEach(() => vi.restoreAllMocks());

  it('applies server-side, so a TCP/UDP pair on one port merges by port and protocol', () => {
    const commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '', toString: () => '' };
    });
    Underpost.deploy.applyTrafficService({
      deployId: 'dd-x',
      env: 'production',
      traffic: 'green',
      fromPort: 3005,
      toPort: 3006,
    });
    expect(commands).to.have.length(1);
    expect(commands[0]).to.match(/^kubectl apply --server-side --force-conflicts -f - -n default <<'EOF'\n/);
    const ports = [...commands[0].matchAll(/protocol: (\w+)\n\s+port: (\d+)/g)].map(
      ([, protocol, port]) => `${port}/${protocol}`,
    );
    expect(ports).to.deep.equal(['3005/TCP', '3005/UDP', '3006/TCP', '3006/UDP']);
  });
});
