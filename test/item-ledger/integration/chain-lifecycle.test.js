import { describe, it, expect, beforeAll } from 'vitest';
import { JsonRpcProvider, Wallet, ContractFactory, Contract, getAddress } from 'ethers';
import { readFileSync } from 'node:fs';
import { ItemLedgerIndexer } from '../../../src/api/item-ledger/item-ledger.indexer.js';
import { objectLayerTokenId } from '../../../src/api/item-ledger/item-ledger.model.js';
import { ZERO_ADDRESS } from '../../../src/api/item-ledger-transfer/item-ledger-transfer.model.js';

// The live chain tier. It runs against any JSON-RPC endpoint the deployment uses — a Besu
// validator (`cyberia chain deploy`) or a Hardhat node — named by CHAIN_RPC_URL, with a funded
// key in CHAIN_PRIVATE_KEY. Without them the tier is skipped: the gate is an external node.
const RPC_URL = process.env.CHAIN_RPC_URL || '';
const PRIVATE_KEY = process.env.CHAIN_PRIVATE_KEY || '';
const vectors = JSON.parse(readFileSync(new URL('../../support/object-layer-identity-vectors.json', import.meta.url)));
const artifact = JSON.parse(readFileSync(new URL('../../../hardhat/artifacts/contracts/ObjectLayerToken.sol/ObjectLayerToken.json', import.meta.url)));

const [HATCHET_A, HATCHET_B, GOLD_ORE] = vectors.definitions;
const hash = (vector) => `0x${vector.contentHash}`;
const tokenIdOf = (vector) => BigInt(vector.tokenId);

// The projection collections, in memory: this tier proves the chain contract, not MongoDB.
const projection = () => {
  const state = { bindings: [], transfers: [], balances: new Map(), checkpoint: null };
  const balanceKey = (key) => `${key.tokenId}/${key.ownerAddress}`;
  const sameLeg = (a, b) => a.txHash === b.txHash && a.logIndex === b.logIndex && a.batchIndex === b.batchIndex;
  const models = {
    ItemLedger: { bind: async (binding) => state.bindings.push(binding) },
    ItemLedgerTransfer: {
      find: (filter) => ({ sort: () => ({ lean: async () => state.transfers.filter((t) => t.applied === filter.applied) }) }),
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
      find: () => ({
        lean: async () =>
          [...state.balances].map(([k, balance]) => ({ _id: k, tokenId: k.split('/')[0], ownerAddress: k.split('/')[1], balance })),
      }),
      updateOne: async ({ _id }, { $set }) => state.balances.set(_id, $set.balance),
    },
    ItemLedgerCheckpoint: {
      findOne: () => ({ lean: async () => state.checkpoint }),
      updateOne: async (key, { $set }) => (state.checkpoint = { ...key, ...$set }),
    },
  };
  return { models, state };
};

describe.skipIf(!RPC_URL || !PRIVATE_KEY)('ItemLedger on a live chain', () => {
  let provider;
  let wallet;
  let token;
  let chainId;
  let deployBlock;
  let alice;
  let bob;

  beforeAll(async () => {
    // `cacheTimeout: -1`: an instantly-finalizing chain answers a fresh nonce per send.
    provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
    chainId = Number((await provider.getNetwork()).chainId);
    wallet = new Wallet(PRIVATE_KEY, provider);
    alice = Wallet.createRandom().address;
    bob = Wallet.createRandom().address;

    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    token = await factory.deploy(wallet.address, 'ipfs://');
    const receipt = await token.deploymentTransaction().wait();
    deployBlock = receipt.blockNumber;
  }, 180000);

  const indexer = (models) =>
    new ItemLedgerIndexer({
      provider,
      chainId,
      contractAddress: token.target,
      models,
      startBlock: deployBlock,
      batchSize: 500,
    });

  it('projects the full lifecycle and reconciles against the chain', async () => {
    const address = getAddress(token.target);
    const { models, state } = projection();

    // 1. register + mint, 2. transfer, 3. batch transfer, 4. burn
    await (await token.registerObjectLayer(wallet.address, hash(HATCHET_A), 3n, '0x')).wait();
    await (await token.registerObjectLayer(wallet.address, hash(GOLD_ORE), 100n, '0x')).wait();
    await (await token.safeTransferFrom(wallet.address, alice, tokenIdOf(HATCHET_A), 2n, '0x')).wait();
    await (
      await token.safeBatchTransferFrom(
        wallet.address,
        bob,
        [tokenIdOf(HATCHET_A), tokenIdOf(GOLD_ORE)],
        [1n, 40n],
        '0x',
      )
    ).wait();
    await (await token.burn(wallet.address, tokenIdOf(GOLD_ORE), 10n)).wait();

    const first = await indexer(models).sync();
    expect(first.registrations).toBe(2);
    expect(state.bindings.map((b) => b.objectLayerCid).sort()).toEqual([GOLD_ORE.cid, HATCHET_A.cid].sort());

    // 5. restart: a second run over the same blocks changes nothing
    const checkpoint = state.checkpoint.lastBlock;
    state.checkpoint = null;
    const replay = await indexer(models).sync();
    expect(replay.transfers).toBe(0);
    expect(state.checkpoint.lastBlock).toBe(checkpoint);

    // 6. the projection equals the chain, for every holder of every token type
    const onChain = new Contract(address, artifact.abi, provider);
    for (const [key, balance] of state.balances) {
      const [tokenId, ownerAddress] = key.split('/');
      if (ownerAddress === ZERO_ADDRESS) continue;
      expect(await onChain.balanceOf(getAddress(ownerAddress), BigInt(tokenId))).toBe(BigInt(balance));
    }

    // 7. a drifted row is corrected from the chain
    const drifted = `${tokenIdOf(HATCHET_A)}/${alice.toLowerCase()}`;
    state.balances.set(drifted, '999');
    const reconciled = await indexer(models).reconcile();
    expect(reconciled.corrected.map((row) => row.ownerAddress)).toContain(alice.toLowerCase());
    expect(state.balances.get(drifted)).toBe('2');

    // 8. a definition registered twice is refused by the contract
    await expect(token.registerObjectLayer(wallet.address, hash(HATCHET_A), 1n, '0x')).rejects.toThrow();
    // 9. the CID a token id resolves to is the canonical one
    expect(await onChain.getObjectLayerCid(tokenIdOf(HATCHET_A))).toBe(HATCHET_A.cid);
    expect(HATCHET_B.cid).not.toBe(HATCHET_A.cid);
  }, 300000);
});
