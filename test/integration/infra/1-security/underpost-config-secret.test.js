'use strict';

import { expect } from 'chai';
import Underpost from '../../../../src/index.js';

const secret = () => Underpost.secret;

describe('underpost-config secret', () => {
  describe('env file sanitization', () => {
    it('keeps NODE_ENV so the pod resolves the deployed environment', () => {
      // Regression: NODE_ENV matched the `NODE_` reserved prefix and was stripped, so the
      // Secret carried no environment, `--create-from-env` never saw one, and loadConf fell
      // back to `development` on every deploy.
      const sanitized = secret().sanitizeSecretEnvFile('NODE_ENV=production\nDEPLOY_ID=dd-core\n');
      expect(sanitized).to.match(/^NODE_ENV=production$/m);
      expect(sanitized).to.match(/^DEPLOY_ID=dd-core$/m);
    });

    it('still strips shell- and Kubernetes-critical keys', () => {
      const sanitized = secret().sanitizeSecretEnvFile(
        ['PATH=/injected/bin', 'HOME=/injected', 'NODE_OPTIONS=--max-old-space-size=8192', 'KUBERNETES_PORT=443'].join(
          '\n',
        ),
      );
      for (const key of ['PATH', 'HOME', 'NODE_OPTIONS', 'KUBERNETES_PORT'])
        expect(sanitized, key).to.not.match(new RegExp(`^${key}=`, 'm'));
    });

    it('preserves blank lines and comments', () => {
      expect(secret().sanitizeSecretEnvFile('# header\n\nA=1\n')).to.equal('# header\n\nA=1\n');
    });
  });

  describe('published env file selection', () => {
    it('targets the cron deploy env file for the requested environment', () => {
      for (const env of ['production', 'development', 'test'])
        expect(secret().underpostConfigEnvPath(env)).to.match(
          new RegExp(`^\\./engine-private/conf/[a-zA-Z0-9._-]+/\\.env\\.${env}$`),
        );
    });

    it('resolves the same cron deploy for every environment', () => {
      const deployOf = (env) => secret().underpostConfigEnvPath(env).split('/')[3];
      expect(deployOf('production')).to.equal(deployOf('development'));
    });
  });

  it('is owned by the secret layer, with no parallel deploy-side implementation', () => {
    expect(secret().underpostConfig).to.be.a('function');
    expect(Underpost.deploy.configMap).to.equal(undefined);
  });
});
