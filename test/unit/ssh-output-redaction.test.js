'use strict';

import { expect } from 'chai';
import { vi } from 'vitest';
import Underpost from '../../src/index.js';

describe('SSH command output redaction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('filters child output before writing it to the terminal', async () => {
    const token = 'opaque-remote-credential_123';
    const url = `https\\://x-access-token\\:${token}\\@github.com\\/owner\\/repo`;
    let written = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += `${chunk}`;
      return true;
    });

    const output = await Underpost.ssh.sshRemoteRunner(`printf '%s' '${url}'`, {
      remote: false,
      cd: '',
    });

    expect(output).to.include(token);
    expect(written).to.not.include(token);
    expect(written).to.include('***');
  });
});
