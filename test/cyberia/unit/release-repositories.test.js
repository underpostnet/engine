import { describe, it, expect } from 'vitest';
import cyberiaCatalog from '../../../src/projects/cyberia/catalog-cyberia.js';
import { RELEASE_PROFILES } from '../../../src/server/release/source-release.js';
import { EMPTY_CATALOG } from '../../../src/server/build/catalog.js';
import { graphifyEnabled, releaseGraphs } from '../../../src/server/release/graphify.js';

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
      expect(['graph', 'name', 'profile', 'repository']).toEqual(expect.arrayContaining(Object.keys(entry)));
  });

  it('build and check the code graph of each code repository by default, in docs/graphify-out', () => {
    expect(EMPTY_CATALOG.graphify).toBe(false);
    expect(cyberiaCatalog.graphify).toBe(true);
    expect(
      releaseGraphs(cyberiaCatalog.releaseRepositories, graphifyEnabled(undefined, cyberiaCatalog.graphify)),
    ).toEqual({
      'cyberia-content': 'docs/graphify-out',
      'cyberia-audio': 'docs/graphify-out',
      'cyberia-server': 'docs/graphify-out',
      'cyberia-client': 'docs/graphify-out',
    });
    expect(releaseGraphs(cyberiaCatalog.releaseRepositories, graphifyEnabled(false, cyberiaCatalog.graphify))).toEqual(
      {},
    );
  });
});
