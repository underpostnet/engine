import { describe, it, expect } from 'vitest';
import cyberiaCatalog from '../../../src/projects/cyberia/catalog-cyberia.js';
import { RELEASE_PROFILES } from '../../../src/server/release/source-release.js';

describe('the Cyberia release repositories', () => {
  it('give each product repository one known release profile', () => {
    const profiles = Object.fromEntries(cyberiaCatalog.releaseRepositories.map(({ name, profile }) => [name, profile]));
    expect(profiles).toEqual({
      'cyberia-content': 'data-release',
      'cyberia-audio': 'source-sync',
      'cyberia-deployment': 'source-sync',
      'cyberia-server': 'container-release',
      'cyberia-client': 'container-release',
    });
    for (const { name, repository, profile } of cyberiaCatalog.releaseRepositories) {
      expect(repository).toBe(`underpostnet/${name}`);
      expect(RELEASE_PROFILES[profile], name).toBeTruthy();
    }
  });

  it('declare no build commands: each repository keeps its own', () => {
    for (const entry of cyberiaCatalog.releaseRepositories)
      expect(Object.keys(entry).sort()).toEqual(['name', 'profile', 'repository']);
  });
});
