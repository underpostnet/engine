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
  });
});
