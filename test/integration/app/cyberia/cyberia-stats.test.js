import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STAT_TYPES, STAT_DEFAULTS, STAT_MODIFIER_MIN, STAT_MODIFIER_MAX,
  STAT_EFFECTIVE_FLOORS, validateStats, generateRandomStats,
} from '../../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { resolveProgressionRules } from '../../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import { generateMultiFrame, registerSemantic } from '../../../../src/projects/cyberia/semantic-layer-generator.js';
import { ObjectLayerModel } from '../../../../src/api/object-layer/object-layer.model.js';
import { CyberiaMapModel } from '../../../../src/api/cyberia-map/cyberia-map.model.js';
import { CyberiaMapService } from '../../../../src/api/cyberia-map/cyberia-map.service.js';
import { DataBaseProviderService } from '../../../../src/db/DataBaseProvider.js';
import { CyberiaEntityModel } from '../../../../src/api/cyberia-entity/cyberia-entity.model.js';
import { CyberiaInstanceConfModel } from '../../../../src/api/cyberia-instance-conf/cyberia-instance-conf.model.js';
import { toObjectLayerMsg, toEntityMsg, toInstanceConfig } from '../../../../src/projects/cyberia/instance-data.js';
import { generateStatContract } from '../../../../src/projects/cyberia/stat-contract-generator.js';
import { registerStatCommands } from '../../../../src/projects/cyberia/stat-commands.js';

const block = (value) => Object.fromEntries(STAT_TYPES.map((key) => [key, value]));
const record = (stats) => ({ data: { stats, item: { id: 'signed', type: 'weapon' }, ledger: { type: 'OFF_CHAIN' } }, sha256: 'a'.repeat(64) });

describe('Cyberia signed stat contract', () => {
  it('defines ordered defaults and playable floors once', () => {
    expect(STAT_TYPES).toEqual(['effect', 'resistance', 'agility', 'range', 'intelligence', 'utility']);
    expect(validateStats({})).toEqual(STAT_DEFAULTS);
    expect(Object.isFrozen(STAT_DEFAULTS)).toBe(true);
    expect(STAT_EFFECTIVE_FLOORS.agility).toBeGreaterThan(-100);
    expect(STAT_MODIFIER_MIN).toBe(-100);
    expect(STAT_MODIFIER_MAX).toBe(100);
  });

  it.each([-100, 0, 100])('accepts %s in authoring, schema, and boot transport', async (value) => {
    const stats = block(value);
    expect(validateStats(stats)).toEqual(stats);
    await new ObjectLayerModel(record(stats)).validate();
    expect(toObjectLayerMsg(record(stats)).stats).toEqual(stats);
  });

  it.each([-101, 101, 0.5, Infinity, -Infinity, NaN, null, '2'])('rejects invalid values: %s', (value) => {
    expect(() => validateStats({ effect: value })).toThrow();
    expect(() => toObjectLayerMsg(record({ effect: value }))).toThrow();
  });

  it.each([-101, 101, 0.5, Infinity, NaN])('rejects %s in the database schema', async (value) => {
    await expect(new ObjectLayerModel(record({ ...STAT_DEFAULTS, effect: value })).validate()).rejects.toThrow();
  });

  it('rejects XP and level inside item stats', () => {
    expect(() => validateStats({ xp: 100 })).toThrow();
    expect(() => validateStats({ level: 2 })).toThrow();
  });

  it('generates both boundaries and rejects invalid generator bounds', () => {
    expect(generateRandomStats(undefined, undefined, () => 0)).toEqual(block(-100));
    expect(generateRandomStats(undefined, undefined, () => 0.999999)).toEqual(block(100));
    expect(generateRandomStats(0, 0)).toEqual(STAT_DEFAULTS);
    expect(() => generateRandomStats(-101, 1)).toThrow();
    expect(() => generateRandomStats(0, 101)).toThrow();
    expect(() => generateRandomStats(1, -1)).toThrow();
    expect(() => generateRandomStats(0, 10, () => 1)).toThrow();
  });

  it('keeps entity level separate from item ownership', async () => {
    const entity = new CyberiaEntityModel({ entityType: 'bot', level: 25, objectLayerItemIds: ['signed'] });
    await entity.validate();
    expect(toEntityMsg(entity.toObject()).level).toBe(25);
    await expect(new CyberiaEntityModel({ level: -1 }).validate()).rejects.toThrow();
    const config = toInstanceConfig({});
    expect(config.progressionRules.maxLevel).toBe(100);
    expect(config).not.toHaveProperty('sumStatsLimit');
    await expect(new CyberiaInstanceConfModel({ instanceCode: 'test', progressionRules: { maxLevel: -1 } }).validate()).rejects.toThrow();
  });

  it('resolves partial curves and rejects invalid progression configuration', () => {
    const rules = resolveProgressionRules({ baseStats: { effect: 20 }, defaultBotLevel: 7 });
    expect(rules.baseStats).toEqual({ ...resolveProgressionRules().baseStats, effect: 20 });
    expect(toInstanceConfig({ progressionRules: { defaultBotLevel: 7 } }).progressionRules.defaultBotLevel).toBe(7);
    for (const input of [
      { maxLevel: 5, defaultBotLevel: 6 }, { xpPerLevel: 0 }, { xpPerLevel: '100' },
      { baseStats: null }, { perLevelStats: [] }, { baseStats: { effect: -1 } },
      { perLevelStats: { level: 1 } }, { unknown: 1 }, { maxAwardsPerWindow: 0 },
    ]) expect(() => resolveProgressionRules(input)).toThrow();
    for (const level of [0, -1, 65536, 1.5, null, '2']) expect(() => toEntityMsg({ level })).toThrow();
  });

  it('uses signed deterministic stats in the procedural pipeline', () => {
    registerSemantic('stat-contract', { semanticTags: ['test'], paletteHints: [[0, 0, 0, 255]],
      preferredShapes: {}, layers: {}, itemType: 'weapon' });
    const options = { itemId: 'stat-contract-test', seed: 'signed-contract', frameCount: 1 };
    const generated = generateMultiFrame(options).objectLayerData.data.stats;
    expect(validateStats(generated)).toEqual(generated);
    expect(generateMultiFrame(options).objectLayerData.data.stats).toEqual(generated);
    expect(Object.values(generated).some((value) => value < 0)).toBe(true);
    const samples = Array.from({ length: 8 }, (_, index) =>
      Object.values(generateMultiFrame({ ...options, seed: 'signed-' + index }).objectLayerData.data.stats)).flat();
    expect(samples.some((value) => value > 10)).toBe(true);
  });

  it('rejects invalid map levels before file cleanup', async () => {
    const model = vi.spyOn(DataBaseProviderService, 'getModel').mockImplementation((name) => {
      expect(name).toBe('CyberiaMap');
      return CyberiaMapModel;
    });
    const lookup = vi.spyOn(CyberiaMapModel, 'findById').mockResolvedValue(new CyberiaMapModel({ code: 'level-test' }));
    try {
      await expect(CyberiaMapService.put({ params: { id: 'test' }, auth: { user: { role: 'admin' } },
        body: { entities: [{ entityType: 'bot', level: -1 }] } }, {}, {})).rejects.toThrow();
      expect(model).toHaveBeenCalledTimes(1);
    } finally {
      model.mockRestore();
      lookup.mockRestore();
    }
  });

  it('matches generated Go and C contracts', async () => {
    await generateStatContract({ check: true });
  });
});

describe('Cyberia stats CLI', () => {
  it('validates files and generates bounded random stats', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cyberia-stats-test-'));
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const run = async (...args) => {
      const command = new Command().exitOverride();
      registerStatCommands(command);
      await command.parseAsync(args, { from: 'user' });
    };
    try {
      const input = join(directory, 'input.json');
      const source = JSON.stringify([record(block(-100))]);
      await writeFile(input, source);
      await run('stats', 'validate', input);
      expect(JSON.parse(output.mock.calls.at(-1)[0])).toEqual({ valid: true, records: 1 });
      await writeFile(input, JSON.stringify([record(block(101))]));
      await expect(run('stats', 'validate', input)).rejects.toThrow();
      await run('stats', 'random', '--min=-100', '--max=-100');
      expect(JSON.parse(output.mock.calls.at(-1)[0])).toEqual(block(-100));
      await expect(run('stats', 'random', '--min=-101')).rejects.toThrow();
    } finally {
      output.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
