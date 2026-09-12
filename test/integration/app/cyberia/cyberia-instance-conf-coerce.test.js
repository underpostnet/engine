import { describe, it, expect } from 'vitest';
import { CyberiaInstanceConfModel } from '../../../../src/api/cyberia-instance-conf/cyberia-instance-conf.model.js';
import { CyberiaInstanceConfService } from '../../../../src/api/cyberia-instance-conf/cyberia-instance-conf.service.js';
import { CYBERIA_INSTANCE_CONF_DEFAULTS } from '../../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';

const coerce = (conf) => CyberiaInstanceConfService.coerceToSchema(conf, CyberiaInstanceConfModel);

// A backup written before the chance fields became fractions of one, as the exports on disk are.
const legacy = { instanceCode: 'LEGACY', lifeRegenChance: 300, maxChance: 10000 };

describe('instance conf import coercion', () => {
  it('resets a value the schema rejects to its default and says so', async () => {
    const { conf, resets } = await coerce(legacy);
    expect(conf.lifeRegenChance).toBe(CYBERIA_INSTANCE_CONF_DEFAULTS.lifeRegenChance);
    expect(conf.maxChance).toBe(CYBERIA_INSTANCE_CONF_DEFAULTS.maxChance);
    expect(resets.map(({ path, from }) => [path, from])).toEqual([
      ['lifeRegenChance', 300],
      ['maxChance', 10000],
    ]);
  });

  it('leaves every valid field exactly as it was', async () => {
    const { conf, resets } = await coerce({ ...legacy, tickRate: 12, aoiRadius: 7 });
    expect(conf.tickRate).toBe(12);
    expect(conf.aoiRadius).toBe(7);
    expect(conf.instanceCode).toBe('LEGACY');
    expect(resets).toHaveLength(2);
  });

  it('is a no-op on a conf that already passes', async () => {
    const { conf, resets } = await coerce({ instanceCode: 'CLEAN', lifeRegenChance: 0.2 });
    expect(resets).toEqual([]);
    expect(conf.lifeRegenChance).toBe(0.2);
  });

  it('resets a nested field through its dotted path', async () => {
    const { conf, resets } = await coerce({ instanceCode: 'NESTED', skillRules: { projectileSpawnChance: 42 } });
    expect(conf.skillRules.projectileSpawnChance).toBe(CYBERIA_INSTANCE_CONF_DEFAULTS.skillRules.projectileSpawnChance);
    expect(resets[0].path).toBe('skillRules.projectileSpawnChance');
  });

  it('produces a document the model accepts, so import can never half-fail', async () => {
    const { conf } = await coerce(legacy);
    await expect(new CyberiaInstanceConfModel(conf).validate()).resolves.toBeUndefined();
  });

  it('converges: coercing its own output changes nothing', async () => {
    const { conf } = await coerce(legacy);
    const { conf: again, resets } = await coerce(conf);
    expect(resets).toEqual([]);
    expect(again).toEqual(conf);
  });
});
