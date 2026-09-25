import { describe, it, expect } from 'vitest';
import { Interface, getAddress } from 'ethers';
import { ItemLedgerIndexer, OBJECT_LAYER_TOKEN_ABI, decodeLog } from '../../../src/api/item-ledger/item-ledger.indexer.js';
import { objectLayerIdentity } from '../../../src/api/object-layer/object-layer.identity.js';
import { objectLayerTokenId } from '../../../src/api/item-ledger/item-ledger.model.js';
import { ZERO_ADDRESS } from '../../../src/api/item-ledger-transfer/item-ledger-transfer.model.js';

const iface = new Interface(OBJECT_LAYER_TOKEN_ABI);
const CONTRACT = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
const OWNER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const ALICE = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const BOB = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
const profile = { id: 'cyberia', version: 2 };
const hatchet = objectLayerIdentity({ profile, data: { item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 5 } } });
const TOKEN = BigInt(objectLayerTokenId(hatchet.cid));

let logIndex = 0;
const log = (blockNumber, txHash, name, args) => {
  const { topics, data } = iface.encodeEventLog(iface.getEvent(name), args);
  return { address: getAddress(CONTRACT), blockNumber, transactionHash: txHash, index: logIndex++, topics, data };
};
const mint = (block, tx, to, amount) => log(block, tx, 'TransferSingle', [getAddress(OWNER), ZERO_ADDRESS, getAddress(to), TOKEN, amount]);
const move = (block, tx, from, to, amount) => log(block, tx, 'TransferSingle', [getAddress(OWNER), getAddress(from), getAddress(to), TOKEN, amount]);
const burn = (block, tx, from, amount) => log(block, tx, 'TransferSingle', [getAddress(OWNER), getAddress(from), ZERO_ADDRESS, TOKEN, amount]);
const registered = (block, tx) =>
  log(block, tx, 'ObjectLayerRegistered', [TOKEN, `0x${hatchet.contentHash}`, hatchet.cid, 3n]);

// In-memory stand-ins for the four projection collections.
const stubModels = () => {
  const state = { bindings: [], transfers: [], balances: new Map(), checkpoint: null };
  const balanceKey = (key) => `${key.tokenId}/${key.ownerAddress}`;
  const sameLeg = (a, b) => a.txHash === b.txHash && a.logIndex === b.logIndex && a.batchIndex === b.batchIndex;
  const models = {
    ItemLedger: { bind: async (binding) => state.bindings.push(binding) },
    ItemLedgerTransfer: {
      find: (filter) => ({
        sort: () => ({ lean: async () => state.transfers.filter((t) => t.applied === filter.applied) }),
      }),
      updateOne: async (key, update, options = {}) => {
        const row = state.transfers.find((t) => sameLeg(t, key));
        if (row) {
          if (update.$set) Object.assign(row, update.$set);
          return { upsertedCount: 0 };
        }
        if (!options.upsert) return { upsertedCount: 0 };
        state.transfers.push({ ...update.$setOnInsert });
        return { upsertedCount: 1 };
      },
    },
    ItemLedgerBalance: {
      add: async (key, delta) => {
        const balance = (BigInt(state.balances.get(balanceKey(key)) ?? 0) + delta).toString(10);
        state.balances.set(balanceKey(key), balance);
        return balance;
      },
      find: () => ({ lean: async () => [...state.balances].map(([k, balance]) => ({ _id: k, tokenId: k.split('/')[0], ownerAddress: k.split('/')[1], balance })) }),
      updateOne: async ({ _id }, { $set }) => state.balances.set(_id, $set.balance),
    },
    ItemLedgerCheckpoint: {
      findOne: () => ({ lean: async () => state.checkpoint }),
      updateOne: async (key, { $set }) => (state.checkpoint = { ...key, ...$set }),
    },
  };
  return { models, state };
};

const provider = (logs, head) => ({
  getBlockNumber: async () => head,
  getLogs: async ({ fromBlock, toBlock }) => logs.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock),
});

const indexer = (models, prov, extra = {}) =>
  new ItemLedgerIndexer({ provider: prov, chainId: 31337, contractAddress: CONTRACT, models, ...extra });

describe('ItemLedger indexer', () => {
  it('decodes a batch transfer into one leg per id', () => {
    const batch = log(1, '0xb', 'TransferBatch', [getAddress(OWNER), getAddress(OWNER), getAddress(ALICE), [TOKEN, 7n], [2n, 5n]]);
    const { transfers } = decodeLog(batch);
    expect(transfers.map((t) => [t.tokenId, t.value, t.batchIndex])).toEqual([[TOKEN.toString(), '2', 0], ['7', '5', 1]]);
    expect(transfers[0]).toMatchObject({ from: OWNER, to: ALICE, blockNumber: 1, txHash: '0xb' });
  });

  it('projects registrations, mints, transfers and burns into bindings and balances', async () => {
    const { models, state } = stubModels();
    const logs = [registered(2, '0x1'), mint(2, '0x1', OWNER, 3n), move(3, '0x2', OWNER, ALICE, 2n), move(4, '0x3', ALICE, BOB, 1n), burn(5, '0x4', BOB, 1n)];
    const summary = await indexer(models, provider(logs, 6)).sync();
    expect(summary).toEqual({ fromBlock: 0, toBlock: 6, transfers: 4, registrations: 1 });
    expect(state.bindings[0]).toMatchObject({ objectLayerCid: hatchet.cid, tokenId: TOKEN.toString(), txHash: '0x1', blockNumber: 2 });
    expect(Object.fromEntries(state.balances)).toEqual({
      [`${TOKEN}/${OWNER}`]: '1',
      [`${TOKEN}/${ALICE}`]: '1',
      [`${TOKEN}/${BOB}`]: '0',
    });
    expect(state.checkpoint.lastBlock).toBe(6);
    expect(state.transfers.every((t) => t.applied)).toBe(true);
  });

  it('is idempotent: a second run over the same logs changes nothing', async () => {
    const { models, state } = stubModels();
    const logs = [mint(1, '0x1', ALICE, 5n)];
    await indexer(models, provider(logs, 1)).sync();
    state.checkpoint = null;
    const summary = await indexer(models, provider(logs, 1)).sync();
    expect(summary.transfers).toBe(0);
    expect(state.balances.get(`${TOKEN}/${ALICE}`)).toBe('5');
  });

  it('resumes after the checkpoint and stays behind the head by the confirmations asked', async () => {
    const { models, state } = stubModels();
    const logs = [mint(1, '0x1', ALICE, 5n), move(8, '0x2', ALICE, BOB, 2n), move(10, '0x3', ALICE, BOB, 1n)];
    await indexer(models, provider(logs, 9), { confirmations: 1, batchSize: 3 }).sync();
    expect(state.checkpoint.lastBlock).toBe(8);
    expect(state.balances.get(`${TOKEN}/${BOB}`)).toBe('2');
    const second = await indexer(models, provider(logs, 11), { confirmations: 1, batchSize: 3 }).sync();
    expect(second).toMatchObject({ fromBlock: 9, toBlock: 10, transfers: 1 });
    expect(state.balances.get(`${TOKEN}/${BOB}`)).toBe('3');
  });

  it('applies a leg recorded before a crash but never taken into the balances', async () => {
    const { models, state } = stubModels();
    state.transfers.push({
      chainId: 31337, contractAddress: CONTRACT, txHash: '0x9', logIndex: 0, batchIndex: 0,
      tokenId: TOKEN.toString(), from: ZERO_ADDRESS, to: ALICE, value: '4', blockNumber: 1, applied: false,
    });
    state.checkpoint = { lastBlock: 1 };
    await indexer(models, provider([], 1)).sync();
    expect(state.balances.get(`${TOKEN}/${ALICE}`)).toBe('4');
    expect(state.transfers[0].applied).toBe(true);
  });

  it('applies a leg once when two runs project the same block concurrently', async () => {
    const { models, state } = stubModels();
    const logs = [mint(1, '0x1', ALICE, 5n)];
    await Promise.all([indexer(models, provider(logs, 1)).sync(), indexer(models, provider(logs, 1)).sync()]);
    expect(state.transfers).toHaveLength(1);
    expect(state.balances.get(`${TOKEN}/${ALICE}`)).toBe('5');
  });

  it('records a zero-value leg without moving a balance', async () => {
    const { models, state } = stubModels();
    await indexer(models, provider([move(1, '0x1', ALICE, BOB, 0n)], 1)).sync();
    expect(state.transfers).toHaveLength(1);
    expect(state.balances.get(`${TOKEN}/${BOB}`)).toBe('0');
  });

  it('projects a registration that arrives after the transfers of its token', async () => {
    const { models, state } = stubModels();
    await indexer(models, provider([mint(1, '0x1', ALICE, 2n)], 1)).sync();
    expect(state.bindings).toHaveLength(0);
    await indexer(models, provider([mint(1, '0x1', ALICE, 2n), registered(2, '0x2')], 2)).sync();
    expect(state.bindings).toHaveLength(1);
    expect(state.balances.get(`${TOKEN}/${ALICE}`)).toBe('2');
  });

  it('corrects a projected balance that drifted from the chain', async () => {
    const { models, state } = stubModels();
    await indexer(models, provider([mint(1, '0x1', ALICE, 5n)], 1)).sync();
    state.balances.set(`${TOKEN}/${ALICE}`, '99');

    // `reconcile` reads `balanceOf` through the provider: the chain is the authority.
    const reads = [];
    const chain = {
      ...provider([], 1),
      call: async ({ data }) => (reads.push(data), iface.encodeFunctionResult('balanceOf', [5n])),
      getNetwork: async () => ({ chainId: 31337n, name: 'stub' }),
    };
    const result = await indexer(models, chain).reconcile();

    expect(reads).toHaveLength(1);
    expect(result.corrected).toEqual([{ tokenId: TOKEN.toString(), ownerAddress: ALICE, projected: '99', chain: '5' }]);
    expect(state.balances.get(`${TOKEN}/${ALICE}`)).toBe('5');
  });

  it('refuses a registration whose CID is not the content of its token id', async () => {
    const { models } = stubModels();
    const wrong = log(1, '0x1', 'ObjectLayerRegistered', [TOKEN, `0x${hatchet.contentHash}`, 'bafkreiwrong', 1n]);
    await expect(indexer(models, provider([wrong], 1)).sync()).rejects.toThrow(/its content is/);
  });
});
