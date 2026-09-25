import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPOSITORY_DEFAULTS, repositoryIdentityFactory } from '../../../src/server/storage/repository.js';
import { deployPackageReleaseUrl, organizationUrl } from '../../../src/client/components/core/Repository.js';
import Underpost from '../../../src/index.js';

afterEach(() => {
  vi.unstubAllEnvs();
  delete globalThis.window;
});

describe('repository identity', () => {
  it('names the organization the package repositories mirror into', () => {
    expect(REPOSITORY_DEFAULTS.organization).toBe('underpost');
    vi.stubEnv('GITHUB_ORG_NAME', 'fork-org');
    expect(repositoryIdentityFactory().organization).toBe('fork-org');
  });

  it('carries the package repository of the deploy the build names', () => {
    const identity = repositoryIdentityFactory({ deployPackage: Underpost.repo.ghpkgRepoFactory('dd-cyberia') });
    expect(identity.deployPackage).toBe('engine-ghpkg-cyberia');
  });

  it('links the release of the deploy package under the organization, whoever owns the source', () => {
    globalThis.window = {
      renderPayload: {
        version: '3.4.0',
        repository: { ...REPOSITORY_DEFAULTS, owner: 'someone-else', deployPackage: 'engine-ghpkg-cyberia' },
      },
    };
    expect(deployPackageReleaseUrl()).toBe('https://github.com/underpost/engine-ghpkg-cyberia/releases/tag/v3.4.0');
    expect(organizationUrl()).toBe('https://github.com/underpost/');
  });
});
