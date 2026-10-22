/**
 * Market profiles, terminals and listings against a real MongoDB replica set: the terms a listing
 * records, the refusals of a changed, closed or full market, universe sharing and isolation,
 * concurrent and repeated operations, the settlement rounds and the purge dates, the Studio API
 * with its revisions and references, and the terminal diagnostics of the supplied terminals. Guest
 * identities live in a memory stand-in of Valkey.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { MARKET_PAGE, minBid } from '../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import { CyberiaMarketService } from '../../../src/api/cyberia-market/cyberia-market.service.js';
import { CyberiaActionService } from '../../../src/api/cyberia-action/cyberia-action.service.js';
import { reportServer } from '../../../src/api/cyberia-server-registry/cyberia-server-registry.service.js';
import { commitStates } from '../../../src/projects/cyberia/player/player-state.js';
import { listMarket, settleEnded, settleListing } from '../../../src/projects/cyberia/player/market.js';
import { worldMarkets } from '../../../src/projects/cyberia/economy/market-profile.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { emptyState, playerSessions, stack } from '../../support/player-sessions.js';

vi.mock('../../../src/db/valkey/Valkey.js', async () =>
  (await import('../../support/valkey-memory.js')).memoryValkeyModule(),
);

const CONTEXT = { host: 'www.cyberia.test', path: '/' };
const APIS = [
  'user',
  'file',
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-universe',
  'cyberia-server-registry',
  'cyberia-player',
  'cyberia-game-session',
  'cyberia-game-ticket',
  'cyberia-social',
  'cyberia-social-profile',
  'cyberia-quest-progress',
  'cyberia-economy',
  'cyberia-economic-item-policy',
  'cyberia-economy-operation',
  'cyberia-world-drop',
  'cyberia-action',
  'cyberia-market',
  'cyberia-market-listing',
  'cyberia-market-claim',
  'object-layer',
  'cyberia-item-catalog',
];
const WORLDS = [
  { code: 'w1', cyberiaMapCodes: ['athel-ferrum-outpost'] },
  { code: 'w2', cyberiaMapCodes: ['test-a'] },
  { code: 'w3', cyberiaMapCodes: ['m3'] },
  { code: 'w5', cyberiaMapCodes: ['m5'] },
];
const model = (name) => DataBaseProviderService.getModel(name, CONTEXT);
const { account, play } = playerSessions(CONTEXT);
const cid = (tail) => `bafkrei${tail.padStart(52, 'a')}`;
const ok = { refusal: '', playerId: '', duplicate: false };
const gel = { itemId: 'gel', olCid: 'cid-gel', quantity: 2 };

/** A Studio request: the route parameter and the body. */
const request = (id, body) => ({ params: { id }, body });

const seqs = new Map();
/** One market operation of a session, at its next sequence, with the state the server computed. */
const marketOp = (session, kind, market, state = emptyState(), operationId = '') => {
  const seq = (seqs.get(session.playerId) ?? 0) + 1;
  seqs.set(session.playerId, seq);
  return commitStates(
    {
      operationId: operationId || `${kind}-${session.playerId}-${seq}`,
      kind,
      commits: [
        { playerId: session.playerId, epoch: session.epoch, seq, state, questsChanged: false, positionChanged: false },
      ],
      market: { marketCode: 'bazaar', ...market },
    },
    CONTEXT,
  );
};

/** A listing under the terms of `bazaar`: fixed, 50 coins, one hour, the sale fee 5. */
const list = (session, extra = {}) =>
  marketOp(session, 'market_list', {
    mode: 'fixed',
    ...gel,
    price: 50,
    hours: 1,
    listingFee: 0,
    saleFee: 5,
    sellerName: 'neo',
    ...extra,
  });

const view = (session, extra = {}) =>
  listMarket({ instanceCode: 'w1', marketCode: 'bazaar', playerId: session.playerId, ...extra }, CONTEXT);

const Listing = () => model('CyberiaMarketListing');
const Claim = () => model('CyberiaMarketClaim');
const end = (listingId) => Listing().updateOne({ listingId }, { $set: { endsAt: new Date(Date.now() - 1000) } });

describe.skipIf(!mongodBinary)('market', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET', 'CYBERIA_GAME_TICKET_TTL_SECONDS'])
      delete process.env[key];
    mongod = await startMongod('cyberia-market', { replSet: 'testset' });
    await DataBaseProviderService.load({
      apis: APIS,
      ...CONTEXT,
      db: { provider: 'mongoose', host: mongod.host, replicaSet: 'testset', name: 'cyberia-market' },
    });
    for (const name of [
      'CyberiaPlayer',
      'CyberiaGameTicket',
      'CyberiaUniverse',
      'CyberiaServerRegistry',
      'CyberiaEconomyOperation',
      'CyberiaEconomicItemPolicy',
      'CyberiaItemCatalog',
      'CyberiaMarket',
      'CyberiaMarketListing',
      'CyberiaMarketClaim',
      'User',
    ])
      await model(name).syncIndexes();
    await model('CyberiaInstance').create(WORLDS);
    // w3 belongs to no universe; w5 to another one.
    await model('CyberiaUniverse').create([
      {
        code: 'u1',
        instances: [
          { instanceCode: 'w1', x: 0, y: 0 },
          { instanceCode: 'w2', x: 1, y: 0 },
        ],
      },
      { code: 'u9', instances: [{ instanceCode: 'w5', x: 0, y: 0 }] },
    ]);
    await model('CyberiaEconomy').create({ code: 'standard' });
    await model('CyberiaMarket').create([
      { code: 'bazaar', scope: 'instance', hours: [1, 12], fees: { sale: 5 }, limits: { priceMin: 5 } },
      { code: 'exchange', scope: 'universe' },
      { code: 'stall', scope: 'instance', modes: ['fixed'] },
    ]);
  });

  beforeEach(async () => {
    let seq = 0;
    for (const { code } of WORLDS)
      await reportServer(
        {
          serverId: `server-${code}`,
          url: `http://localhost:8083/${code}`,
          instanceCode: code,
          state: 'ready',
          seq: ++seq,
        },
        CONTEXT,
      );
  });

  afterEach(() => vi.unstubAllEnvs());

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
  });

  describe('listings', () => {
    it('lists a stack under the terms of its market, sells it once and owes the seller the price less the fee', async () => {
      const [seller, buyer, late] = [
        await play(await account()),
        await play(await account()),
        await play(await account()),
      ];
      expect(await list(seller)).toEqual(ok);
      const [listing] = (await view(buyer)).listings.filter(({ mine }) => !mine);
      expect(listing).toMatchObject({ ...gel, mode: 'fixed', price: 50, revision: 0, minBid: 0 });
      expect(await Listing().findOne({ listingId: listing.listingId }).lean()).toMatchObject({
        scopeKey: 'w1',
        marketRevision: 1,
        listingFee: 0,
        saleFee: 5,
        raisePercent: 5,
        minRaise: 1,
        priceMax: 1000000000,
      });
      expect((await view(seller)).mine.map(({ listingId }) => listingId)).toContain(listing.listingId);

      const buy = { listingId: listing.listingId, revision: 0, ...gel, price: 50 };
      expect(await marketOp(seller, 'market_buy', buy)).toMatchObject({ refusal: 'listing_changed' });
      expect(await marketOp(buyer, 'market_buy', { ...buy, price: 40 })).toMatchObject({ refusal: 'listing_changed' });
      expect(await marketOp(buyer, 'market_buy', buy, { ...emptyState(), bag: [stack('gel', 0, 2)] })).toEqual(ok);
      expect((await model('CyberiaPlayer').findById(buyer.playerId).lean()).bag).toMatchObject([gel]);
      expect(await marketOp(late, 'market_buy', buy)).toMatchObject({
        refusal: 'listing_gone',
        playerId: late.playerId,
      });

      const [claim] = (await view(seller)).claims;
      expect(claim).toMatchObject({
        claimId: `${listing.listingId}:sale`,
        reason: 'sale',
        coins: 45,
        marketCode: 'bazaar',
      });
      expect(claim.stack ?? null).toBeNull();
    });

    it('takes bids that raise the highest one, owes the outbid bidder its coins and refuses a stale revision', async () => {
      const [seller, a, b] = [await play(await account()), await play(await account()), await play(await account())];
      expect(await list(seller, { mode: 'auction', price: 100 })).toEqual(ok);
      const listingId = (await view(seller)).mine.find(({ mode }) => mode === 'auction').listingId;
      const bid = (session, price, revision) => marketOp(session, 'market_bid', { listingId, revision, price });
      expect(await bid(a, 99, 0)).toMatchObject({ refusal: 'bid_low' });
      expect(await bid(a, 100, 0)).toEqual(ok);
      const after = await Listing().findOne({ listingId }).lean();
      expect(after).toMatchObject({ bid: 100, bids: 1, revision: 1 });
      expect(minBid(after)).toBe(105);
      expect(await bid(b, 104, 1)).toMatchObject({ refusal: 'bid_low' });
      expect(await bid(b, 105, 0)).toMatchObject({ refusal: 'listing_changed' });
      expect(await bid(b, 105, 1)).toEqual(ok);
      expect((await view(a, { mode: 'auction' })).claims).toEqual([
        expect.objectContaining({ claimId: `${listingId}:outbid:1`, reason: 'outbid', coins: 100 }),
      ]);
      expect(await marketOp(seller, 'market_cancel', { listingId, revision: 2, ...gel })).toMatchObject({
        refusal: 'listing_changed',
      });
    });

    it('settles an ended auction once: the stack to the winner, the bid less the fee to the seller', async () => {
      const [seller, bidder] = [await play(await account()), await play(await account())];
      expect(await list(seller, { mode: 'auction', price: 10 })).toEqual(ok);
      const listingId = (await view(seller)).mine.find(({ mode }) => mode === 'auction').listingId;
      expect(await marketOp(bidder, 'market_bid', { listingId, revision: 0, price: 10 })).toEqual(ok);
      await end(listingId);
      const ended = await Listing().findOne({ listingId }).lean();
      await Promise.all([settleListing(ended, CONTEXT), settleListing(ended, CONTEXT)]);
      const settled = await Listing().findOne({ listingId }).lean();
      expect(settled).toMatchObject({ status: 'sold', revision: 2 });
      expect(String(settled.buyer)).toBe(bidder.playerId);
      const claims = await Claim().find({ listingId }).lean();
      expect(claims.map(({ reason }) => reason).sort()).toEqual(['sale', 'won']);
      expect(claims.find(({ reason }) => reason === 'sale').coins).toBe(5);
      expect(claims.find(({ reason }) => reason === 'won')).toMatchObject({
        ...gel,
        scope: 'instance',
        scopeKey: 'w1',
      });
    });

    it('owes the seller its stack back when a listing ends unsold, and settles it on the next view', async () => {
      const seller = await play(await account());
      expect(await list(seller)).toEqual(ok);
      const { listingId } = (await view(seller)).mine[0];
      await end(listingId);
      const shown = await view(seller);
      expect(shown.mine).toEqual([]);
      expect(shown.claims).toEqual([
        expect.objectContaining({
          claimId: `${listingId}:unsold`,
          reason: 'unsold',
          stack: expect.objectContaining(gel),
        }),
      ]);
    });

    it('collects the pending claims of a player once, into its state', async () => {
      const seller = await play(await account());
      expect(await list(seller)).toEqual(ok);
      const { listingId } = (await view(seller)).mine[0];
      const held = { ...emptyState(), bag: [stack('gel', 0, 2)] };
      expect(await marketOp(seller, 'market_cancel', { listingId, revision: 0, ...gel }, held)).toEqual(ok);
      expect(await Listing().findOne({ listingId }).lean()).toMatchObject({ status: 'cancelled', revision: 1 });
      expect(await list(seller)).toEqual(ok);
      await end((await view(seller)).mine[0].listingId);
      const { claims } = await view(seller);
      const collect = { claimIds: claims.map(({ claimId }) => claimId), coins: 0, stacks: [gel] };
      expect(await marketOp(seller, 'market_collect', { ...collect, stacks: [] })).toMatchObject({
        refusal: 'claim_gone',
      });
      expect(await marketOp(seller, 'market_collect', collect, held)).toEqual(ok);
      expect((await view(seller)).claims).toEqual([]);
      expect(await marketOp(seller, 'market_collect', collect)).toMatchObject({ refusal: 'claim_gone' });
    });

    it('answers a repeated operation once and sells a contested listing to one buyer', async () => {
      const [seller, a, b] = [await play(await account()), await play(await account()), await play(await account())];
      const operationId = `retry-${seller.playerId}`;
      const listing = { mode: 'fixed', ...gel, price: 50, hours: 1, listingFee: 0, saleFee: 5, sellerName: 'neo' };
      const state = emptyState();
      const first = await commitStates(
        {
          operationId,
          kind: 'market_list',
          commits: [{ playerId: seller.playerId, epoch: seller.epoch, seq: 1, state }],
          market: { marketCode: 'bazaar', ...listing },
        },
        CONTEXT,
      );
      const again = await commitStates(
        {
          operationId,
          kind: 'market_list',
          commits: [{ playerId: seller.playerId, epoch: seller.epoch, seq: 1, state }],
          market: { marketCode: 'bazaar', ...listing },
        },
        CONTEXT,
      );
      expect([first, again]).toEqual([ok, { ...ok, duplicate: true }]);
      expect(await Listing().countDocuments({ seller: seller.playerId })).toBe(1);

      const buy = { listingId: operationId, revision: 0, ...gel, price: 50 };
      const held = { ...emptyState(), bag: [stack('gel', 0, 2)] };
      const results = await Promise.all([marketOp(a, 'market_buy', buy, held), marketOp(b, 'market_buy', buy, held)]);
      expect(results.filter(({ refusal }) => refusal === '')).toHaveLength(1);
      expect(results.map(({ refusal }) => refusal).sort()).toEqual(['', 'listing_gone']);
      expect(await Claim().countDocuments({ listingId: operationId })).toBe(1);
      const owners = await model('CyberiaPlayer')
        .find({ _id: { $in: [a.playerId, b.playerId] }, 'bag.itemId': 'gel' })
        .lean();
      expect(owners).toHaveLength(1);
    });
  });

  describe('terms', () => {
    it('refuses a listing the current profile does not allow, or one the seller saw under other fees', async () => {
      const seller = await play(await account());
      expect(await list(seller, { hours: 6 })).toMatchObject({ refusal: 'terms_refused' });
      expect(await list(seller, { price: 4 })).toMatchObject({ refusal: 'terms_refused' });
      expect(await list(seller, { marketCode: 'stall', mode: 'auction', saleFee: 0 })).toMatchObject({
        refusal: 'terms_refused',
      });
      expect(await list(seller, { saleFee: 0 })).toMatchObject({ refusal: 'market_changed' });
      expect(await list(seller, { listingFee: 1 })).toMatchObject({ refusal: 'market_changed' });
      expect(await list(seller, { marketCode: 'nowhere' })).toMatchObject({ refusal: 'market_closed' });
      expect(await Listing().countDocuments({ seller: seller.playerId })).toBe(0);
      for (const extra of [{ hours: 2 }, { price: 0 }, { mode: 'barter' }, { quantity: 0 }, { listingFee: -1 }])
        expect(await list(seller, extra)).toMatchObject({ refusal: 'invalid' });
    });

    it('keeps the terms a listing recorded when its profile changes', async () => {
      const shifting = {
        code: 'shifting',
        scope: 'instance',
        fees: { sale: 2 },
        auction: { raisePercent: 10, minRaise: 3 },
        limits: { priceMin: 10 },
      };
      await CyberiaMarketService.post({ body: shifting }, null, CONTEXT);
      const [seller, buyer, bidder] = [
        await play(await account()),
        await play(await account()),
        await play(await account()),
      ];
      const terms = { marketCode: 'shifting', price: 20, saleFee: 2 };
      expect(await list(seller, terms)).toEqual(ok);
      expect(await list(seller, { ...terms, mode: 'auction' })).toEqual(ok);
      const shifted = await CyberiaMarketService.put(
        request('shifting', { revision: 1, fees: { listing: 0, sale: 7 }, auction: { raisePercent: 50, minRaise: 1 } }),
        null,
        CONTEXT,
      );
      expect(shifted).toMatchObject({ revision: 2, fees: { sale: 7 } });
      expect(await list(seller, terms)).toMatchObject({ refusal: 'market_changed' });

      const { mine } = await listMarket(
        { instanceCode: 'w1', marketCode: 'shifting', playerId: seller.playerId },
        CONTEXT,
      );
      const fixed = mine.find(({ mode }) => mode === 'fixed');
      const auction = mine.find(({ mode }) => mode === 'auction');
      expect(
        await marketOp(buyer, 'market_buy', {
          marketCode: 'shifting',
          listingId: fixed.listingId,
          revision: 0,
          ...gel,
          price: 20,
        }),
      ).toEqual(ok);
      expect((await Claim().findOne({ listingId: fixed.listingId }).lean()).coins).toBe(18);
      const bid = (price, revision) =>
        marketOp(bidder, 'market_bid', { marketCode: 'shifting', listingId: auction.listingId, revision, price });
      expect(await bid(20, 0)).toEqual(ok);
      expect(await bid(22, 1)).toMatchObject({ refusal: 'bid_low' });
      expect(await bid(23, 1)).toEqual(ok);
      expect(await list(seller, { ...terms, saleFee: 7 })).toEqual(ok);
      expect(await Listing().findOne({ marketCode: 'shifting', saleFee: 7 }).lean()).toMatchObject({
        marketRevision: 2,
      });
    });

    it('takes no new listing in a retired market, and still sells, settles and pays what it holds', async () => {
      await CyberiaMarketService.post({ body: { code: 'closing', scope: 'instance' } }, null, CONTEXT);
      const [seller, buyer] = [await play(await account()), await play(await account())];
      const terms = { marketCode: 'closing', saleFee: 0 };
      expect(await list(seller, terms)).toEqual(ok);
      expect(await list(seller, terms)).toEqual(ok);
      await CyberiaMarketService.put(request('closing', { revision: 1, status: 'retired' }), null, CONTEXT);
      expect(await list(seller, terms)).toMatchObject({ refusal: 'market_closed' });
      const shown = await listMarket({ instanceCode: 'w1', marketCode: 'closing', playerId: buyer.playerId }, CONTEXT);
      expect(shown).toMatchObject({ scopeKey: 'w1', revision: 2 });
      const [sold, unsold] = shown.listings;
      expect(
        await marketOp(buyer, 'market_buy', {
          marketCode: 'closing',
          listingId: sold.listingId,
          revision: 0,
          ...gel,
          price: 50,
        }),
      ).toEqual(ok);
      await end(unsold.listingId);
      const { claims } = await listMarket(
        { instanceCode: 'w1', marketCode: 'closing', playerId: seller.playerId },
        CONTEXT,
      );
      expect(claims.map(({ reason }) => reason).sort()).toEqual(['sale', 'unsold']);
      const collect = {
        marketCode: 'closing',
        claimIds: claims.map(({ claimId }) => claimId),
        coins: 50,
        stacks: [gel],
      };
      expect(
        await marketOp(seller, 'market_collect', collect, { ...emptyState(), coins: 50, bag: [stack('gel', 0, 2)] }),
      ).toEqual(ok);
    });

    it('bounds the open listings of a player in each market', async () => {
      await CyberiaMarketService.post(
        { body: { code: 'tight', scope: 'instance', limits: { listingsPerPlayer: 2 } } },
        null,
        CONTEXT,
      );
      const seller = await play(await account());
      const terms = { marketCode: 'tight', saleFee: 0 };
      expect(await list(seller, terms)).toEqual(ok);
      expect(await list(seller, terms)).toEqual(ok);
      expect(await list(seller, terms)).toMatchObject({ refusal: 'market_full' });
      expect(await list(seller)).toEqual(ok);
    });
  });

  describe('scope', () => {
    it('shares a universe market across its worlds and keeps another universe and an instance market apart', async () => {
      const [here, there] = [await play(await account()), await play(await account(), 'w5')];
      const terms = { marketCode: 'exchange', saleFee: 0 };
      expect(await list(here, terms)).toEqual(ok);
      expect(await list(there, terms)).toEqual(ok);
      expect(await list(here)).toEqual(ok);
      const at = (instanceCode, marketCode, who = here) =>
        listMarket({ instanceCode, marketCode, playerId: who.playerId }, CONTEXT);
      expect(await at('w2', 'exchange')).toMatchObject({ scopeKey: 'u1', mine: [expect.objectContaining(gel)] });
      expect((await at('w5', 'exchange')).mine).toEqual([]);
      expect((await at('w5', 'exchange', there)).listings.map(({ mine }) => mine)).toEqual([true]);
      expect(await at('w3', 'exchange')).toMatchObject({ scopeKey: '', listings: [], mine: [] });
      expect((await at('w2', 'bazaar')).mine).toEqual([]);
      expect(await Listing().findOne({ seller: here.playerId, marketCode: 'exchange' }).lean()).toMatchObject({
        scope: 'universe',
        scopeKey: 'u1',
        instanceCode: 'w1',
      });
    });

    it('carries each market the terminals of a world open, with its scope key, reference and defect', async () => {
      vi.stubEnv('DEPLOY_ID', 'dd-test');
      const terminals = [{ market: { marketCode: 'exchange' } }, { market: { marketCode: 'gone' } }, { market: {} }];
      const [exchange, gone] = await worldMarkets('w2', terminals, CONTEXT);
      expect(exchange).toMatchObject({
        code: 'exchange',
        scopeKey: 'u1',
        ref: 'dd-test/universe:u1/exchange',
        modes: ['fixed', 'auction'],
        defect: '',
      });
      expect(gone).toEqual({ code: 'gone', defect: 'no market profile has this code' });
      expect((await worldMarkets('w3', terminals, CONTEXT))[0].defect).toBe('the world belongs to no universe');
    });
  });

  describe('settlement', () => {
    it('settles every ended listing in rounds without a view, once across concurrent rounds', async () => {
      const seller = await play(await account());
      await Listing().insertMany(
        Array.from({ length: MARKET_PAGE + 5 }, (_, i) => ({
          listingId: `due-${seller.playerId}-${i}`,
          marketCode: 'exchange',
          scope: 'universe',
          scopeKey: 'u1',
          instanceCode: 'w1',
          seller: seller.playerId,
          ...gel,
          mode: 'fixed',
          price: 1,
          marketRevision: 1,
          listingFee: 0,
          saleFee: 0,
          raisePercent: 5,
          minRaise: 1,
          priceMax: 100,
          endsAt: new Date(Date.now() - 1000 - i),
        })),
      );
      const [a, b] = await Promise.all([settleEnded(CONTEXT), settleEnded(CONTEXT)]);
      expect(a + b).toBeGreaterThanOrEqual(MARKET_PAGE + 5);
      expect(await Listing().countDocuments({ seller: seller.playerId, status: 'expired' })).toBe(MARKET_PAGE + 5);
      expect(await Claim().countDocuments({ player: seller.playerId, reason: 'unsold' })).toBe(MARKET_PAGE + 5);
      expect(await settleEnded(CONTEXT)).toBe(0);
    });

    it('dates the purge of a final listing and a collected claim only', async () => {
      const seller = await play(await account());
      expect(await list(seller)).toEqual(ok);
      expect(await list(seller)).toEqual(ok);
      const [open, ended] = (await view(seller)).mine;
      await end(ended.listingId);
      await settleEnded(CONTEXT);
      expect((await Listing().findOne({ listingId: open.listingId }).lean()).purgeAt ?? null).toBeNull();
      expect((await Listing().findOne({ listingId: ended.listingId }).lean()).purgeAt).toBeInstanceOf(Date);
      const claim = await Claim().findOne({ listingId: ended.listingId }).lean();
      expect(claim).toMatchObject({ status: 'pending' });
      expect(claim.purgeAt ?? null).toBeNull();
      const collect = { claimIds: [claim.claimId], coins: 0, stacks: [gel] };
      expect(await marketOp(seller, 'market_collect', collect, { ...emptyState(), bag: [stack('gel', 0, 2)] })).toEqual(
        ok,
      );
      expect((await Claim().findById(claim._id).lean()).purgeAt).toBeInstanceOf(Date);
    });
  });

  describe('profiles', () => {
    it('creates, clones and updates a profile under the revision it read', async () => {
      const created = await CyberiaMarketService.post(
        { body: { code: 'kiosk', name: 'Kiosk', scope: 'instance', modes: ['fixed'] } },
        null,
        CONTEXT,
      );
      expect(created.toObject()).toMatchObject({ code: 'kiosk', revision: 1, hours: [1, 12, 48] });
      await expect(CyberiaMarketService.post({ body: { code: 'kiosk' } }, null, CONTEXT)).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        CyberiaMarketService.post({ body: { code: 'odd', fees: { sale: 9 }, limits: { priceMin: 5 } } }, null, CONTEXT),
      ).rejects.toMatchObject({ status: 400 });
      const updated = await CyberiaMarketService.put(request('kiosk', { revision: 1, hours: [24] }), null, CONTEXT);
      expect(updated).toMatchObject({ revision: 2, hours: [24], name: 'Kiosk', modes: ['fixed'] });
      await expect(
        CyberiaMarketService.put(request('kiosk', { revision: 1, hours: [1] }), null, CONTEXT),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        CyberiaMarketService.put(request('kiosk', { revision: 2, code: 'other' }), null, CONTEXT),
      ).rejects.toMatchObject({ status: 400 });
      const clone = await CyberiaMarketService.clone(request('kiosk', { code: 'kiosk-two' }), null, CONTEXT);
      expect(clone).toMatchObject({ code: 'kiosk-two', revision: 1, hours: [24], modes: ['fixed'] });
    });

    it('keeps the scope of a market that holds goods, and deletes only a profile nothing names', async () => {
      await CyberiaMarketService.post({ body: { code: 'booth', scope: 'instance' } }, null, CONTEXT);
      const seller = await play(await account());
      expect(await list(seller, { marketCode: 'booth', saleFee: 0 })).toEqual(ok);
      await expect(
        CyberiaMarketService.put(request('booth', { revision: 1, scope: 'universe' }), null, CONTEXT),
      ).rejects.toMatchObject({ status: 409 });
      await expect(CyberiaMarketService.delete(request('booth'), null, CONTEXT)).rejects.toMatchObject({ status: 409 });
      const terminal = await CyberiaActionService.post(
        { body: { code: 'booth-terminal', sourceMapCode: 'm3', market: { marketCode: 'kiosk-two' } } },
        null,
        CONTEXT,
      );
      await expect(CyberiaMarketService.delete(request('kiosk-two'), null, CONTEXT)).rejects.toMatchObject({
        status: 409,
      });
      await model('CyberiaAction').deleteOne({ _id: terminal._id });
      expect(await CyberiaMarketService.delete(request('kiosk-two'), null, CONTEXT)).toMatchObject({
        code: 'kiosk-two',
      });
    });

    it('names the terminals of a profile, the markets they open and the worlds that open none', async () => {
      vi.stubEnv('DEPLOY_ID', 'dd-test');
      await CyberiaActionService.post(
        { body: { code: 'exchange-w1', sourceMapCode: 'athel-ferrum-outpost', market: { marketCode: 'exchange' } } },
        null,
        CONTEXT,
      );
      await CyberiaActionService.post(
        {
          body: {
            code: 'exchange-w3',
            sourceMapCode: 'm3',
            market: { marketCode: 'exchange', listingModes: ['fixed'] },
          },
        },
        null,
        CONTEXT,
      );
      const { market, held, terminals, markets, defects } = await CyberiaMarketService.view(
        request('exchange'),
        null,
        CONTEXT,
      );
      expect(market.code).toBe('exchange');
      expect(terminals).toEqual([
        expect.objectContaining({ code: 'exchange-w1', worlds: ['w1'], listingModes: ['fixed', 'auction'] }),
        expect.objectContaining({ code: 'exchange-w3', worlds: ['w3'], listingModes: ['fixed'] }),
      ]);
      expect(markets).toEqual([
        expect.objectContaining({ ref: 'dd-test/universe:u1/exchange', worlds: ['w1'], terminals: ['exchange-w1'] }),
      ]);
      expect(markets[0].open).toBeGreaterThan(0);
      // The goods of every scope key count, also of a universe no terminal of the view opens.
      expect(held.listings).toBeGreaterThan(markets[0].open);
      expect(held.claims).toBeGreaterThan(0);
      expect(defects).toEqual(['terminal exchange-w3 in w3: the world belongs to no universe']);
      await model('CyberiaAction').deleteMany({ code: { $in: ['exchange-w1', 'exchange-w3'] } });
    });
  });

  describe('terminals', () => {
    it('stores a terminal that names a profile, and refuses a malformed one or a stale write', async () => {
      const post = (market) =>
        CyberiaActionService.post({ body: { code: 'stand', sourceMapCode: 'm3', market } }, null, CONTEXT);
      for (const market of [
        { marketCode: 'nowhere' },
        { marketCode: 'exchange', itemIds: ['gel'] },
        { marketCode: 'exchange', selection: 'items', itemIds: ['gel', 'gel'] },
        { marketCode: 'exchange', listingModes: ['fixed', 'fixed'] },
        { marketCode: 'exchange', scope: 'universe' },
      ])
        await expect(post(market), JSON.stringify(market)).rejects.toMatchObject({ status: 400 });
      const stand = await post({ marketCode: 'exchange', selection: 'items', itemIds: ['gel'], listingModes: [] });
      expect(stand.toObject()).toMatchObject({ revision: 1, market: { listingModes: [], itemIds: ['gel'] } });
      const put = (body) => CyberiaActionService.put(request(String(stand._id), body), null, CONTEXT);
      const updated = await put({ revision: 1, market: { marketCode: 'exchange', listingModes: ['fixed'] } });
      expect(updated).toMatchObject({
        revision: 2,
        market: { selection: 'policy', itemIds: [], listingModes: ['fixed'] },
      });
      await expect(put({ revision: 1, label: 'Stand' })).rejects.toMatchObject({ status: 409 });
      await expect(put({ revision: 2, market: { marketCode: 'gone' } })).rejects.toMatchObject({ status: 400 });
      expect(await put({ revision: 2, label: 'Stand' })).toMatchObject({ revision: 3, label: 'Stand' });
      await model('CyberiaAction').deleteOne({ _id: stand._id });
    });
  });

  describe('the supplied terminals', () => {
    const TERMINAL_A = 'interact-thon-zheng';
    const TERMINAL_B = 'test';
    const WOODS = ['wood-drop-1', 'wood-drop-2'];
    const diagnose = async (code) => {
      const { _id } = await model('CyberiaAction').findOne({ code }).lean();
      return await CyberiaActionService.diagnostics(request(String(_id)), null, CONTEXT);
    };

    beforeAll(async () => {
      await model('CyberiaMarket').create({ code: 'wods', scope: 'universe', modes: ['fixed', 'auction'] });
      await model('CyberiaAction').create([
        {
          code: TERMINAL_A,
          sourceMapCode: 'athel-ferrum-outpost',
          buybackItems: WOODS,
          burnItems: WOODS,
          market: { marketCode: 'wods', selection: 'policy', itemIds: [], listingModes: ['fixed', 'auction'] },
        },
        {
          code: TERMINAL_B,
          sourceMapCode: 'test-a',
          market: { marketCode: 'wods', selection: 'items', itemIds: WOODS, listingModes: ['fixed'] },
        },
      ]);
      await model('CyberiaItemCatalog').create([
        { itemId: 'wood-drop-1', objectLayerCid: cid('b') },
        { itemId: 'wood-drop-2', objectLayerCid: cid('c') },
      ]);
    });

    it('names the effective policy that blocks each supplied item while the economy has no row for it', async () => {
      const a = await diagnose(TERMINAL_A);
      const [w1] = a.worlds;
      expect(w1).toMatchObject({ instanceCode: 'w1', economy: { code: 'standard', defect: '' } });
      expect(w1.market).toMatchObject({ code: 'wods', scopeKey: 'u1', listingModes: ['fixed', 'auction'], defect: '' });
      expect(w1.capabilities.buyback.items).toEqual(
        WOODS.map((itemId) =>
          expect.objectContaining({
            itemId,
            allowed: false,
            usable: false,
            reason: 'the economy refuses buyback of this item',
          }),
        ),
      );
      expect(w1.capabilities.buyback.warning).toBe('Buyback names 2 items and none is usable here');
      expect(w1.capabilities.burn.warning).toBe('Burn names 2 items and none is usable here');
      expect(w1.capabilities.market).toMatchObject({
        selection: 'policy',
        defaultsAllow: false,
        items: [],
        warning: 'No item may be listed here: the selection names none the economy allows',
      });
      const [w2] = (await diagnose(TERMINAL_B)).worlds;
      expect(w2.market.listingModes).toEqual(['fixed']);
      expect(w2.capabilities.market.items.map(({ reason }) => reason)).toEqual([
        'the economy refuses market listing of this item',
        'the economy refuses market listing of this item',
      ]);
      expect(w2.capabilities.market.warning).toBe('The market selection names 2 items and none is usable here');
    });

    it('opens buyback, burn and the market once the economy allows the items, and shares the listing', async () => {
      await model('CyberiaEconomicItemPolicy').create([
        { economyCode: 'standard', itemId: 'wood-drop-1', buyback: true, buybackPayout: 3, burn: true, market: true },
        { economyCode: 'standard', itemId: 'wood-drop-2', buyback: true, buybackPayout: 0, burn: true, market: false },
      ]);
      const [w1] = (await diagnose(TERMINAL_A)).worlds;
      expect(w1.capabilities.buyback.items.map(({ usable, reason }) => [usable, reason])).toEqual([
        [true, ''],
        [false, 'the buyback amount is 0'],
      ]);
      expect(w1.capabilities.burn.items.every(({ usable }) => usable)).toBe(true);
      expect(w1.capabilities.market.items).toEqual([
        expect.objectContaining({ itemId: 'wood-drop-1', olCid: cid('b'), usable: true }),
      ]);
      const [w2] = (await diagnose(TERMINAL_B)).worlds;
      expect(w2.capabilities.market.items.map(({ itemId, usable }) => [itemId, usable])).toEqual([
        ['wood-drop-1', true],
        ['wood-drop-2', false],
      ]);

      const [seller, buyer] = [await play(await account(), 'w2'), await play(await account())];
      const wood = { marketCode: 'wods', itemId: 'wood-drop-1', olCid: cid('b'), quantity: 1 };
      expect(await list(seller, { ...wood, price: 5, saleFee: 0 })).toEqual(ok);
      const shown = await listMarket({ instanceCode: 'w1', marketCode: 'wods', playerId: buyer.playerId }, CONTEXT);
      expect(shown).toMatchObject({ scopeKey: 'u1', revision: 1 });
      const [listing] = shown.listings;
      expect(listing).toMatchObject({ itemId: 'wood-drop-1', price: 5, mode: 'fixed' });
      const bag = { ...emptyState(), bag: [stack('wood-drop-1', 0, 1, cid('b'))] };
      expect(
        await marketOp(buyer, 'market_buy', { ...wood, listingId: listing.listingId, revision: 0, price: 5 }, bag),
      ).toEqual(ok);
    });
  });
});
