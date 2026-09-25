'use strict';

import { expect } from 'chai';
import fs from 'node:fs';
import { TEST_DOMAINS, TEST_IMPACT, impactSelector, impactedDomains } from '../../../src/server/build/testing.js';

// What a change selects. The model is deterministic and reviewable rather than derived from a
// coverage graph, so its failure mode has to be an over-test: a path it does not know widens to
// every domain, and a silent green run is the one answer it must never give.
describe('test impact', () => {
  it('selects the domain that owns a source', () => {
    expect(impactedDomains(['src/projects/cyberia/instance-data.js'])).to.deep.equal(['cyberia']);
    expect(impactedDomains(['src/api/item-ledger/item-ledger.indexer.js'])).to.deep.equal(['item-ledger']);
    expect(impactedDomains(['src/client/components/wallet/EmbeddedWallet.js'])).to.deep.equal(['cryptokoyn']);
    expect(impactedDomains(['src/server/network/underpost-gateway.js'])).to.deep.equal(['underpost']);
  });

  it('selects every consumer of a shared protocol, not only its owner', () => {
    // Three domains read the canonical Object Layer, and the contract suites check it from outside.
    expect(impactedDomains(['src/api/object-layer/object-layer.identity.js'])).to.deep.equal([
      'object-layer',
      'item-ledger',
      'cyberia',
      'cryptokoyn',
      'ecosystem',
    ]);
  });

  it('selects the Object Layer render suites and their Cyberia consumer for the atlas API', () => {
    expect(impactedDomains(['src/api/atlas-sprite-sheet/atlas-sprite-sheet.service.js'])).to.deep.equal([
      'object-layer',
      'cyberia',
      'ecosystem',
    ]);
  });

  it('selects the ecosystem contracts when a domain boundary changes', () => {
    expect(impactedDomains(['src/server/domain/api-contract.js'])).to.include('ecosystem');
    expect(impactedDomains(['src/client/public/docs/cyberia/overview/index.md'])).to.deep.equal([
      'underpost',
      'ecosystem',
    ]);
  });

  it('leaves an unrelated domain out', () => {
    const cyberia = impactedDomains(['src/projects/cyberia/content-release.js']);
    expect(cyberia).to.not.include('underpost');
    expect(cyberia).to.not.include('cryptokoyn');
  });

  it('selects the domain a test belongs to', () => {
    expect(impactedDomains(['test/object-layer/unit/purge.test.js'])).to.deep.equal(['object-layer']);
  });

  it('widens to everything when the change decides what runs', () => {
    for (const path of ['vitest.config.js', 'package.json', 'src/server/build/testing.js', 'test/support/mongod.js'])
      expect(impactSelector([path]), path).to.equal('all');
  });

  it('widens to everything for a path the model does not know', () => {
    // An incomplete model must over-test: the alternative is a green run that
    // proves nothing about the change it was asked about.
    expect(impactSelector(['somewhere/new-surface.ts'])).to.equal('all');
  });

  it('reports nothing to run when nothing changed', () => {
    expect(impactSelector([])).to.equal('');
    expect(impactSelector([''])).to.equal('');
  });

  it('unions the domains of a mixed change, in declaration order', () => {
    expect(impactSelector(['src/projects/cyberia/stat-balance.js', 'src/cli/deploy.js'])).to.equal('underpost,cyberia');
  });

  it('names only domains it documents, and reaches every one of them', () => {
    const domains = Object.keys(TEST_DOMAINS);
    const named = new Set(TEST_IMPACT.flatMap(({ domains: impacted }) => impacted));
    for (const domain of named) expect(domains, domain).to.include(domain);
    for (const domain of domains) expect([...named], domain).to.include(domain);
  });

  it('matches every rule against something this tree ships', () => {
    // A prefix that matches nothing is a rule that silently stopped selecting.
    const stray = [];
    for (const { match } of TEST_IMPACT)
      for (const prefix of match) {
        if (prefix.startsWith('test/')) continue;
        const [base] = prefix.split('*');
        if (!fs.existsSync(base) && fs.globSync(`${base}*`).length === 0) stray.push(prefix);
      }
    expect(stray).to.deep.equal([]);
  });
});
