'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LOCAL_SSL_ROOT, SSL_BASE, TLS } from '../../../../src/server/network/tls.js';
import { shellHarness } from '../../../support/shell-harness.js';

const opensslPresent = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
})();

// Real certificates from openssl, so validity and host coverage are read the way the runtime reads them.
const issue = (dir, { host, days }) => {
  fs.mkdirpSync(dir);
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-keyout',
      path.join(dir, 'key.pem'),
      '-out',
      path.join(dir, 'cert.pem'),
      '-days',
      `${days}`,
      '-subj',
      `/CN=${host}`,
      '-addext',
      `subjectAltName=DNS:${host},DNS:localhost`,
    ],
    { stdio: 'ignore' },
  );
};

describe.skipIf(!opensslPresent)('local TLS certificates', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-tls-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('accepts a certificate that names the host and stays valid beyond the renewal window', () => {
    issue(SSL_BASE('app.test', root), { host: 'app.test', days: 30 });
    expect(TLS.certificateValidFor('app.test', root)).to.equal(true);
  });

  it('refuses a certificate for another host, one about to expire, and a missing one', () => {
    issue(SSL_BASE('app.test', root), { host: 'app.test', days: 30 });
    issue(SSL_BASE('soon.test', root), { host: 'soon.test', days: 3 });
    fs.copySync(SSL_BASE('app.test', root), SSL_BASE('other.test', root));
    expect(TLS.certificateValidFor('other.test', root)).to.equal(false);
    expect(TLS.certificateValidFor('soon.test', root)).to.equal(false);
    expect(TLS.certificateValidFor('missing.test', root)).to.equal(false);
  });

  describe('ensureLocalCertificate', () => {
    const host = `fixture-${process.pid}.test`;
    let harness;

    beforeEach(() => {
      harness = shellHarness();
    });

    afterEach(() => {
      harness.restore();
      fs.removeSync(SSL_BASE(host, LOCAL_SSL_ROOT));
    });

    it('keeps a valid local certificate and issues nothing', () => {
      issue(SSL_BASE(host, LOCAL_SSL_ROOT), { host, days: 30 });
      expect(TLS.ensureLocalCertificate(host)).to.equal(false);
      expect(harness.calls).to.deep.equal([]);
    });

    // Its copies (key.key, crt.crt, ca_bundle.crt) would otherwise be served after the renewal.
    it('replaces a stale local certificate whole, and only in the local root', () => {
      issue(SSL_BASE(host, LOCAL_SSL_ROOT), { host, days: 3 });
      fs.writeFileSync(path.join(SSL_BASE(host, LOCAL_SSL_ROOT), 'crt.crt'), 'stale');
      expect(TLS.ensureLocalCertificate(host)).to.equal(true);
      expect(fs.existsSync(SSL_BASE(host, LOCAL_SSL_ROOT))).to.equal(false);
      expect(harness.calls).to.deep.equal([
        `bash '${path.resolve('scripts/ssl.sh')}' '${SSL_BASE(host, LOCAL_SSL_ROOT)}' 'localhost 127.0.0.1 ::1 ${host}'`,
      ]);
      expect(SSL_BASE(host)).to.not.equal(SSL_BASE(host, LOCAL_SSL_ROOT));
    });
  });
});
