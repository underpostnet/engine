'use strict';

import { expect } from 'chai';
import { deployEnvFactory } from '../../src/server/runtime/environment.js';

describe('deploy environment resolution', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('prefers an explicit --env over every other signal', () => {
    process.env.NODE_ENV = 'development';
    expect(deployEnvFactory({ env: 'production', dev: true }, 'test')).to.equal('production');
    expect(deployEnvFactory({ env: '  staging  ' })).to.equal('staging');
  });

  it('treats --dev as the development shorthand', () => {
    expect(deployEnvFactory({ dev: true })).to.equal('development');
    expect(deployEnvFactory({ dev: true }, 'test')).to.equal('development');
  });

  it('falls back to the caller-supplied default, never to ambient NODE_ENV', () => {
    process.env.NODE_ENV = 'development';
    expect(deployEnvFactory({})).to.equal('production');
    expect(deployEnvFactory()).to.equal('production');
    expect(deployEnvFactory({ env: '' }, 'test')).to.equal('test');
  });

  it('lets a caller opt into the ambient environment by passing it as the fallback', () => {
    process.env.NODE_ENV = 'production';
    expect(deployEnvFactory({}, process.env.NODE_ENV || 'development')).to.equal('production');
    delete process.env.NODE_ENV;
    expect(deployEnvFactory({}, process.env.NODE_ENV || 'development')).to.equal('development');
  });
});
