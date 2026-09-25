import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { objectLayerIdentity, sha256HexFromCid } from '../../../src/api/object-layer/object-layer.identity.js';
import {
  ItemLedgerModel,
  ItemLedgerSchema,
  normalizeTokenId,
  objectLayerCidOfTokenId,
  objectLayerTokenId,
  ownershipRecord,
} from '../../../src/api/item-ledger/item-ledger.model.js';
import { ItemLedgerBalanceSchema } from '../../../src/api/item-ledger-balance/item-ledger-balance.model.js';
import { ItemLedgerTransferSchema } from '../../../src/api/item-ledger-transfer/item-ledger-transfer.model.js';

const vectors = JSON.parse(readFileSync(new URL('../../support/object-layer-identity-vectors.json', import.meta.url)));
const profile = { id: 'cyberia', version: 2 };
const hatchetA = objectLayerIdentity({ profile, data: { item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 5 } } });
const hatchetB = objectLayerIdentity({ profile, data: { item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 8 } } });
const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

describe('tokenId derivation', () => {
  it('is the canonical digest as a uint256, reproduced from every identity vector', () => {
    for (const vector of [...vectors.definitions, ...vectors.anchors]) {
      expect(objectLayerTokenId(vector.cid)).toBe(vector.tokenId);
      expect(BigInt(vector.tokenId)).toBe(BigInt(`0x${vector.contentHash}`));
      expect(objectLayerCidOfTokenId(vector.tokenId)).toBe(vector.cid);
    }
  });

  it('depends on the digest, not on the text of the CID', () => {
    expect(objectLayerTokenId(hatchetA.cid)).toBe(BigInt(`0x${sha256HexFromCid(hatchetA.cid)}`).toString(10));
    expect(objectLayerTokenId(hatchetA.cid)).toBe(BigInt(`0x${hatchetA.contentHash}`).toString(10));
  });

  it('differs for different definitions that share an item id', () => {
    expect(hatchetA.cid).not.toBe(hatchetB.cid);
    expect(objectLayerTokenId(hatchetA.cid)).not.toBe(objectLayerTokenId(hatchetB.cid));
  });

  it('is not derived from the item id, and refuses anything that is not a canonical CID', () => {
    expect(() => objectLayerTokenId('hatchet')).toThrow(/Not an Object Layer CID/);
    expect(() => objectLayerTokenId(`sha256:${hatchetA.contentHash}`)).toThrow(/Not an Object Layer CID/);
  });

  it('refuses another textual form of the same content, so no encoding can fork the token id', () => {
    // Same digest, other multibase or case: not the canonical form, so not an input.
    const upper = hatchetA.cid.toUpperCase();
    const base16 = `f01551220${hatchetA.contentHash}`;
    for (const form of [upper, base16, ` ${hatchetA.cid}`, `${hatchetA.cid}\n`]) {
      expect(() => objectLayerTokenId(form), form).toThrow(/Not an Object Layer CID/);
    }
    // The digest behind those forms still gives the one token id.
    expect(BigInt(`0x${hatchetA.contentHash}`).toString(10)).toBe(objectLayerTokenId(hatchetA.cid));
  });

  it('is never the currency id', () => {
    expect(objectLayerTokenId(hatchetA.cid)).not.toBe('0');
    expect(objectLayerCidOfTokenId('0')).toMatch(/^bafkrei/);
  });

  it('normalizes decimal and hex token ids to decimal', () => {
    expect(normalizeTokenId('0x2a')).toBe('42');
    expect(normalizeTokenId(42n)).toBe('42');
    expect(() => normalizeTokenId('-1')).toThrow(RangeError);
  });
});

describe('ItemLedger binding', () => {
  it('names the full on-chain identity and the Object Layer it represents', async () => {
    const binding = new ItemLedgerModel({
      objectLayerCid: hatchetA.cid,
      itemId: 'hatchet',
      chainId: 777771,
      contractAddress: CONTRACT,
      tokenId: objectLayerTokenId(hatchetA.cid),
      blockNumber: 12,
    });
    await binding.validate();
    expect(binding.standard).toBe('ERC1155');
    expect(binding.contractAddress).toBe(CONTRACT.toLowerCase());
  });

  it('rejects a token id that is not the token id of its cid', async () => {
    const binding = new ItemLedgerModel({
      objectLayerCid: hatchetA.cid,
      chainId: 777771,
      contractAddress: CONTRACT,
      tokenId: objectLayerTokenId(hatchetB.cid),
    });
    await expect(binding.validate()).rejects.toThrow(/tokenId must be objectLayerTokenId/);
  });

  it('keeps one binding per token type and per definition on a contract, none per item id', () => {
    const unique = ItemLedgerSchema.indexes().filter(([, options]) => options?.unique);
    expect(unique.map(([fields]) => Object.keys(fields))).toEqual([
      ['chainId', 'contractAddress', 'tokenId'],
      ['chainId', 'contractAddress', 'objectLayerCid'],
    ]);
    expect(ItemLedgerSchema.path('itemId').options.unique).toBe(undefined);
  });

  it('registers two definitions that share an item id as two token types', async () => {
    const writes = [];
    const model = {
      findOneAndUpdate: async (filter, update) => (writes.push({ filter, update }), { ...filter, ...update.$set }),
    };
    const bind = (binding) => ItemLedgerSchema.statics.bind.call(model, binding);
    const a = await bind({ objectLayerCid: hatchetA.cid, itemId: 'hatchet', chainId: 777771, contractAddress: CONTRACT });
    const b = await bind({ objectLayerCid: hatchetB.cid, itemId: 'hatchet', chainId: 777771, contractAddress: CONTRACT });
    expect(a.itemId).toBe(b.itemId);
    expect(a.tokenId).not.toBe(b.tokenId);
    expect(writes[0].filter).toEqual({ chainId: 777771, contractAddress: CONTRACT.toLowerCase(), tokenId: objectLayerTokenId(hatchetA.cid) });
    await expect(bind({ objectLayerCid: hatchetA.cid, chainId: 777771, contractAddress: CONTRACT, tokenId: '42' })).rejects.toThrow(
      /not the token id/,
    );
  });
});

describe('ownership projection', () => {
  it('lets several owners hold balances of one token type, apart from the canonical content', () => {
    const tokenId = objectLayerTokenId(hatchetA.cid);
    const alice = ownershipRecord({ chainId: 777771, contractAddress: CONTRACT, tokenId, ownerAddress: '0xA11CE00000000000000000000000000000000000', balance: 3 });
    const bob = ownershipRecord({ chainId: 777771, contractAddress: CONTRACT, tokenId, ownerAddress: '0xB0B0000000000000000000000000000000000000', balance: '8' });
    expect(alice.tokenId).toBe(bob.tokenId);
    expect(alice.ownerAddress).not.toBe(bob.ownerAddress);
    expect([alice.balance, bob.balance]).toEqual(['3', '8']);
    // A transfer moves balances; the definition keeps its identity.
    expect(objectLayerIdentity({ profile, data: { item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 5 } } })).toEqual(hatchetA);
  });

  it('keys balances by qualified token and owner, and transfer legs by log position', () => {
    const balanceKeys = ItemLedgerBalanceSchema.indexes().filter(([, o]) => o?.unique).map(([f]) => Object.keys(f));
    expect(balanceKeys).toEqual([['chainId', 'contractAddress', 'tokenId', 'ownerAddress']]);
    const transferKeys = ItemLedgerTransferSchema.indexes().filter(([, o]) => o?.unique).map(([f]) => Object.keys(f));
    expect(transferKeys).toEqual([['chainId', 'contractAddress', 'txHash', 'logIndex', 'batchIndex']]);
  });

  it('adds signed amounts to a holder balance with uint256 arithmetic', async () => {
    const rows = new Map();
    const model = {
      findOne: (key) => ({ lean: async () => (rows.has(key.ownerAddress) ? { balance: rows.get(key.ownerAddress) } : null) }),
      updateOne: async (key, { $set }) => rows.set(key.ownerAddress, $set.balance),
    };
    const add = (owner, delta) => ItemLedgerBalanceSchema.statics.add.call(model, { ownerAddress: owner }, delta);
    expect(await add('0xa', 10n ** 24n)).toBe('1000000000000000000000000');
    expect(await add('0xa', -(10n ** 24n) + 7n)).toBe('7');
  });
});
