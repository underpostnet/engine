'use strict';

import { expect } from 'chai';
import {
  fillInstanceConfDefaults,
  CYBERIA_INSTANCE_CONF_DEFAULTS,
} from '../src/api/cyberia-server-defaults/cyberia-server-defaults.js';

// The CyberiaInstanceConfSchema fields that must always be present after a
// backfill. Mirrors cyberia-instance-conf.model.js (minus instanceCode, which
// is the lookup key and is only present when the source doc carries it).
const SCHEMA_FIELDS = [
  'tickRate',
  'snapshotRate',
  'aoiRadius',
  'portalHoldTimeMs',
  'portalSpawnRadius',
  'entityBaseSpeed',
  'entityBaseMaxLife',
  'entityBaseActionCooldownMs',
  'entityBaseMinActionCooldownMs',
  'botAggroRange',
  'defaultPlayerWidth',
  'defaultPlayerHeight',
  'playerBaseLifeRegenMin',
  'playerBaseLifeRegenMax',
  'sumStatsLimit',
  'maxActiveLayers',
  'initialLifeFraction',
  'respawnDurationMs',
  'collisionLifeLoss',
  'economyRules',
  'lifeRegenChance',
  'maxChance',
  'entityDefaults',
  'statusIcons',
  'skillConfig',
  'skillRules',
  'equipmentRules',
];

describe('fillInstanceConfDefaults', () => {
  it('fills every schema field from canonical defaults for an empty doc', () => {
    const out = fillInstanceConfDefaults({});
    for (const field of SCHEMA_FIELDS) {
      expect(out, `missing field: ${field}`).to.have.property(field);
      expect(out[field], `null/undefined field: ${field}`).to.not.equal(undefined);
      expect(out[field], `null field: ${field}`).to.not.equal(null);
    }
    expect(out.tickRate).to.equal(CYBERIA_INSTANCE_CONF_DEFAULTS.tickRate);
    expect(out.economyRules).to.deep.equal(CYBERIA_INSTANCE_CONF_DEFAULTS.economyRules);
    expect(out.skillRules).to.deep.equal(CYBERIA_INSTANCE_CONF_DEFAULTS.skillRules);
    expect(out.equipmentRules).to.deep.equal(CYBERIA_INSTANCE_CONF_DEFAULTS.equipmentRules);
  });

  it('handles undefined / non-object input as an empty doc', () => {
    for (const bad of [undefined, null, 42, 'x']) {
      const out = fillInstanceConfDefaults(bad);
      for (const field of SCHEMA_FIELDS) expect(out).to.have.property(field);
    }
  });

  it('preserves author-set scalar values, including falsy 0 / false / empty string', () => {
    const out = fillInstanceConfDefaults({
      tickRate: 30,
      collisionLifeLoss: 0,
      portalFee: 0,
    });
    expect(out.tickRate).to.equal(30);
    expect(out.collisionLifeLoss).to.equal(0);
    // Fields not overridden still come from defaults.
    expect(out.snapshotRate).to.equal(CYBERIA_INSTANCE_CONF_DEFAULTS.snapshotRate);
  });

  it('backfills a missing nested sub-document (economyRules)', () => {
    const out = fillInstanceConfDefaults({ tickRate: 60 });
    expect(out.economyRules).to.deep.equal(CYBERIA_INSTANCE_CONF_DEFAULTS.economyRules);
  });

  it('fills only the missing keys of a partial nested sub-document', () => {
    const out = fillInstanceConfDefaults({
      economyRules: { botSpawnCoins: 999 },
    });
    expect(out.economyRules.botSpawnCoins).to.equal(999);
    expect(out.economyRules.playerSpawnCoins).to.equal(
      CYBERIA_INSTANCE_CONF_DEFAULTS.economyRules.playerSpawnCoins,
    );
    expect(out.economyRules.portalFee).to.equal(CYBERIA_INSTANCE_CONF_DEFAULTS.economyRules.portalFee);
  });

  it('keeps a present non-empty array and does not merge defaults into it', () => {
    const custom = [{ entityType: 'player', liveItemIds: ['anon'], deadItemIds: [], dropItemIds: [] }];
    const out = fillInstanceConfDefaults({ entityDefaults: custom });
    expect(out.entityDefaults).to.deep.equal(custom);
  });

  it('populates an empty skillConfig from defaults, normalised to schema shape (no `skills`)', () => {
    for (const input of [{}, { skillConfig: [] }, { skillConfig: null }]) {
      const out = fillInstanceConfDefaults(input);
      expect(out.skillConfig.length, JSON.stringify(input)).to.be.greaterThan(0);
      for (const entry of out.skillConfig) {
        expect(entry).to.have.property('triggerItemId');
        expect(entry).to.have.property('logicEventIds');
        expect(entry).to.not.have.property('skills');
      }
    }
  });

  it('keeps an author-set non-empty skillConfig verbatim', () => {
    const custom = [{ triggerItemId: 'custom-weapon', logicEventIds: ['projectile'] }];
    const out = fillInstanceConfDefaults({ skillConfig: custom });
    expect(out.skillConfig).to.deep.equal(custom);
  });

  it('fills an empty config array (entityDefaults) from defaults', () => {
    const out = fillInstanceConfDefaults({ entityDefaults: [] });
    expect(out.entityDefaults.length).to.be.greaterThan(0);
    expect(out.entityDefaults).to.deep.equal(CYBERIA_INSTANCE_CONF_DEFAULTS.entityDefaults);
  });

  it('preserves DB metadata (_id, instanceCode, timestamps)', () => {
    const now = new Date().toISOString();
    const out = fillInstanceConfDefaults({
      _id: 'abc123',
      instanceCode: 'amethyst-strata-expansion',
      createdAt: now,
      updatedAt: now,
    });
    expect(out._id).to.equal('abc123');
    expect(out.instanceCode).to.equal('amethyst-strata-expansion');
    expect(out.createdAt).to.equal(now);
  });

  it('does not mutate the input document', () => {
    const input = { economyRules: { botSpawnCoins: 5 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    fillInstanceConfDefaults(input);
    expect(input).to.deep.equal(snapshot);
  });
});
