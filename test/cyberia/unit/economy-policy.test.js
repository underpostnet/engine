import { describe, it, expect } from 'vitest';
import {
  ECONOMY_RULES_DEFAULTS,
  ITEM_POLICY_DEFAULTS,
  effectiveItemPolicy,
  itemPolicyDefect,
  resolveEconomyProfile,
} from '../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import {
  assertItemPolicy,
  compileEconomySnapshot,
  confEconomyCode,
  defaultEconomySnapshot,
  universeWalletDefect,
} from '../../../src/projects/cyberia/economy/economy-policy.js';

const lean = (value) => ({ lean: async () => structuredClone(value) });

const matches = (doc, filter) =>
  Object.entries(filter).every(([key, value]) => (value?.$in ? value.$in.includes(doc[key]) : doc[key] === value));

/** A collection of plain documents with the reads and writes the economy modules make. */
const collection = (docs = []) => ({
  docs,
  findOne: (filter) => lean(docs.find((doc) => matches(doc, filter)) ?? null),
  find: (filter = {}) => {
    const rows = docs.filter((doc) => matches(doc, filter));
    return { ...lean(rows), sort: () => lean(rows) };
  },
  exists: async (filter) => docs.some((doc) => matches(doc, filter)),
});

const catalog = (bindings) => ({
  resolve: async (ids) => new Map(ids.filter((id) => bindings[id]).map((id) => [id, bindings[id]])),
});

describe('economy profile', () => {
  it('fills every block from the defaults and keeps an explicit zero', () => {
    const profile = resolveEconomyProfile({ fees: { craft: 0, portal: 3 }, itemDefaults: { trade: false } });
    expect(profile.rules).toEqual(ECONOMY_RULES_DEFAULTS);
    expect(profile.fees).toEqual({ portal: 3, craft: 0 });
    expect(profile.itemDefaults).toEqual({ ...ITEM_POLICY_DEFAULTS, trade: false });
    expect(profile.currency).toEqual({ code: 'coin', maxBalance: 0xffffffff });
  });

  it('refuses a fee, a policy or a currency out of the contract', () => {
    for (const input of [
      { fees: { portal: -1 } },
      { fees: { craft: 1.5 } },
      { fees: { tax: 1 } },
      { fees: { marketListing: 1 } },
      { itemDefaults: { trade: 'yes' } },
      { itemDefaults: { buybackPayout: 2000000 } },
      { currency: { code: 'gem' } },
      { currency: { maxBalance: 0 } },
    ])
      expect(() => resolveEconomyProfile(input), JSON.stringify(input)).toThrow();
  });
});

describe('item policy', () => {
  it('inherits every field it leaves out from the profile defaults', () => {
    const policy = effectiveItemPolicy({ itemId: 'log', buyback: true, buybackPayout: 3 }, ITEM_POLICY_DEFAULTS);
    expect(policy).toEqual({ ...ITEM_POLICY_DEFAULTS, buyback: true, buybackPayout: 3, salvage: [] });
    expect(effectiveItemPolicy(undefined, { ...ITEM_POLICY_DEFAULTS, worldDrop: false }).worldDrop).toBe(false);
  });

  it('bounds an optional field only when the row sets it', () => {
    expect(itemPolicyDefect({ itemId: 'gate', portalFee: 0 })).toBe('');
    expect(itemPolicyDefect({ itemId: 'gate', portalFee: null })).toBe('');
    expect(itemPolicyDefect({ itemId: 'gate', portalFee: -1 })).toMatch('portalFee');
    expect(itemPolicyDefect({ itemId: 'gate', portalFee: 1.5 })).toMatch('portalFee');
    expect(effectiveItemPolicy({ itemId: 'gate' }, ITEM_POLICY_DEFAULTS)).not.toHaveProperty('portalFee');
  });

  it('names its first defect', () => {
    expect(itemPolicyDefect({ itemId: 'axe', burn: true, salvage: [{ itemId: 'log', qty: 2 }] })).toBe('');
    expect(itemPolicyDefect({ itemId: 'axe', burn: false, salvage: [{ itemId: 'log', qty: 2 }] })).toMatch(
      'salvage without burn',
    );
    expect(itemPolicyDefect({ itemId: 'axe', salvage: [{ itemId: 'axe', qty: 1 }] })).toMatch('itself');
    expect(itemPolicyDefect({ itemId: 'axe', salvage: [{ itemId: 'coin', qty: 1 }] })).toMatch('coins');
    expect(itemPolicyDefect({ itemId: 'axe', salvage: [{ itemId: 'log', qty: 0 }] })).toMatch('quantity');
    expect(itemPolicyDefect({ itemId: 'axe', buybackPayout: -1 })).toMatch('buybackPayout');
    expect(itemPolicyDefect({ buyback: true })).toMatch('item id');
  });

  it('is written only for an economy that exists and labels the catalog binds', async () => {
    const models = {
      CyberiaEconomy: collection([{ code: 'standard' }]),
      CyberiaItemCatalog: catalog({ log: 'cid-log' }),
    };
    await expect(assertItemPolicy(models, { economyCode: 'standard', itemId: 'log', buyback: true })).resolves.toBe(
      undefined,
    );
    await expect(assertItemPolicy(models, { economyCode: 'gone', itemId: 'log' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      assertItemPolicy(models, {
        economyCode: 'standard',
        itemId: 'log',
        burn: true,
        salvage: [{ itemId: 'axe', qty: 1 }],
      }),
    ).rejects.toThrow('binds no axe');
  });
});

describe('economy snapshot', () => {
  const models = (status = 'active') => ({
    CyberiaEconomy: collection([{ code: 'standard', revision: 3, status, fees: { craft: 2 } }]),
    CyberiaEconomicItemPolicy: collection([
      { economyCode: 'standard', itemId: 'log', buyback: true, buybackPayout: 1 },
      { economyCode: 'standard', itemId: 'gone', trade: false },
      { economyCode: 'other', itemId: 'axe', burn: true },
    ]),
    CyberiaItemCatalog: catalog({ log: 'cid-log', axe: 'cid-axe' }),
  });

  it('compiles each row of the profile over its defaults, stamped with its binding', async () => {
    const snapshot = await compileEconomySnapshot(models(), 'standard');
    expect(snapshot).toMatchObject({
      code: 'standard',
      revision: 3,
      maxBalance: 0xffffffff,
      fees: { portal: 0, craft: 2 },
    });
    expect(snapshot.itemDefaults).toEqual({ itemId: '', olCid: '', ...ITEM_POLICY_DEFAULTS, salvage: [] });
    // A row of an unbound label names no definition a stack holds.
    expect(snapshot.itemPolicies).toEqual([
      { itemId: 'log', olCid: 'cid-log', ...ITEM_POLICY_DEFAULTS, buyback: true, buybackPayout: 1, salvage: [] },
    ]);
  });

  it('sends a portal fee only when a row sets one: an explicit 0 stays, unset adds nothing', async () => {
    const rows = models();
    rows.CyberiaEconomicItemPolicy.docs.push(
      { economyCode: 'standard', itemId: 'axe', portalFee: 0 },
      { economyCode: 'standard', itemId: 'rune', portalFee: 7, market: true },
    );
    rows.CyberiaItemCatalog = catalog({ log: 'cid-log', axe: 'cid-axe', rune: 'cid-rune' });
    const policies = Object.fromEntries(
      (await compileEconomySnapshot(rows, 'standard')).itemPolicies.map((row) => [row.itemId, row]),
    );
    expect(policies.axe.portalFee).toBe(0);
    expect(policies.rune).toMatchObject({ portalFee: 7, market: true });
    expect('portalFee' in policies.log).toBe(false);
    expect(policies.log.market).toBe(false);
  });

  it('names the authority that owns the profile; a world without content names none', async () => {
    const deploy = process.env.DEPLOY_ID;
    process.env.DEPLOY_ID = 'dd-test';
    try {
      expect((await compileEconomySnapshot(models(), 'standard')).authorityId).toBe('dd-test');
      expect(defaultEconomySnapshot().authorityId).toBe('');
    } finally {
      if (deploy === undefined) delete process.env.DEPLOY_ID;
      else process.env.DEPLOY_ID = deploy;
    }
  });

  it('refuses an unknown or a retired profile', async () => {
    await expect(compileEconomySnapshot(models(), 'frontier')).rejects.toMatchObject({ status: 404 });
    await expect(compileEconomySnapshot(models('retired'), 'standard')).rejects.toMatchObject({ status: 409 });
  });
});

describe('universe wallet', () => {
  const models = {
    CyberiaInstanceConf: collection([
      { instanceCode: 'a', economyCode: 'standard' },
      { instanceCode: 'b' },
      { instanceCode: 'c', economyCode: 'frontier' },
      { instanceCode: 'd', economyCode: 'vault' },
      { instanceCode: 'e', economyCode: 'gone' },
    ]),
    CyberiaEconomy: collection([
      { code: 'standard', fees: { portal: 0 } },
      { code: 'frontier', fees: { portal: 5 }, rules: { playerSpawnCoins: 0 } },
      { code: 'vault', currency: { maxBalance: 1000 } },
    ]),
  };

  it('holds for one profile, and a conf that names none runs the default', async () => {
    expect(await universeWalletDefect(models, ['a', 'b'])).toBe('');
  });

  it('holds for different profiles that keep one wallet: fees and rules stay local', async () => {
    expect(await universeWalletDefect(models, ['a', 'b', 'c'])).toBe('');
  });

  it('names the members whose wallets differ, a planned write included', async () => {
    expect(await universeWalletDefect(models, ['a', 'd'])).toBe(
      'worlds a (standard: coin up to 4294967295) and d (vault: coin up to 1000) hold different wallets',
    );
    expect(await universeWalletDefect(models, ['a', 'd'], { confs: { d: 'frontier' } })).toBe('');
    expect(await universeWalletDefect(models, ['a', 'c'], { economies: { frontier: { maxBalance: 10 } } })).toMatch(
      'hold different wallets',
    );
    expect(await universeWalletDefect(models, ['a', 'e'])).toBe('world e names economy gone, which is not stored');
  });

  it('runs the economy a conf names, else the default profile', () => {
    expect(confEconomyCode({ economyCode: 'frontier' })).toBe('frontier');
    expect(confEconomyCode({})).toBe('standard');
  });
});
