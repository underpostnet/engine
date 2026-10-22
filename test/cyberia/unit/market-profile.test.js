import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MARKET_PROFILE_DEFAULTS,
  minBid,
  resolveMarketProfile,
} from '../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import { marketDefect, marketRef, terminalListingModes } from '../../../src/projects/cyberia/economy/market-profile.js';

afterEach(() => vi.unstubAllEnvs());

describe('market profile', () => {
  it('fills every rule from the defaults and keeps the options in their contract order', () => {
    const profile = resolveMarketProfile({ modes: ['auction', 'fixed'], hours: [48, 1], fees: { listing: 2 } });
    expect(profile).toEqual({
      ...MARKET_PROFILE_DEFAULTS,
      modes: ['fixed', 'auction'],
      hours: [1, 48],
      fees: { listing: 2, sale: 0 },
    });
  });

  it('refuses a profile no market could run', () => {
    for (const input of [
      { modes: [] },
      { modes: ['fixed', 'fixed'] },
      { modes: ['barter'] },
      { hours: [2] },
      { scope: 'galaxy' },
      { currencyCode: 'gem' },
      { auction: { raisePercent: 0 } },
      { fees: { listing: 1.5 } },
      { fees: { tax: 1 } },
      { limits: { priceMin: 50, priceMax: 20 } },
      { fees: { sale: 10 }, limits: { priceMin: 5 } },
    ])
      expect(() => resolveMarketProfile(input), JSON.stringify(input)).toThrow();
  });
});

describe('listing terms', () => {
  it('raises the highest bid by the percent a listing recorded, by its least raise at least', () => {
    const terms = { raisePercent: 5, minRaise: 1 };
    expect(minBid({ ...terms, price: 10, bid: 0 })).toBe(10);
    expect(minBid({ ...terms, price: 10, bid: 10 })).toBe(11);
    expect(minBid({ ...terms, price: 10, bid: 200 })).toBe(210);
    expect(minBid({ raisePercent: 5, minRaise: 25, price: 10, bid: 200 })).toBe(225);
  });

  it('lists at a terminal in the modes its market supports that it offers', () => {
    expect(terminalListingModes({ listingModes: ['fixed', 'auction'] }, { modes: ['fixed'] })).toEqual(['fixed']);
    expect(terminalListingModes({ listingModes: ['fixed'] }, { modes: ['fixed', 'auction'] })).toEqual(['fixed']);
    expect(terminalListingModes({ listingModes: [] }, { modes: ['fixed', 'auction'] })).toEqual([]);
  });
});

describe('market identity', () => {
  it('names a market by its authority, scope, scope key and code', () => {
    vi.stubEnv('DEPLOY_ID', 'dd-cyberia');
    expect(marketRef({ scope: 'universe', scopeKey: 'cyberia', code: 'wods' })).toBe(
      'dd-cyberia/universe:cyberia/wods',
    );
    vi.stubEnv('DEPLOY_ID', '');
    expect(marketRef({ scope: 'instance', scopeKey: 'test', code: 'wods' })).toBe('instance:test/wods');
  });

  it('says why a world opens no market; a retired market still opens', () => {
    const profile = { status: 'active', currencyCode: 'coin' };
    const world = { scopeKey: 'cyberia', walletCurrency: 'coin' };
    expect(marketDefect(profile, world)).toBe('');
    expect(marketDefect({ ...profile, status: 'retired' }, world)).toBe('');
    expect(marketDefect(null, world)).toBe('no market profile has this code');
    expect(marketDefect(profile, { ...world, scopeKey: '' })).toBe('the world belongs to no universe');
    expect(marketDefect(profile, { ...world, walletCurrency: 'gem' })).toBe(
      'the world pays in gem, the market trades in coin',
    );
  });
});
