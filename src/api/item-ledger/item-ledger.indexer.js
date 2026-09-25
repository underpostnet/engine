/**
 * ItemLedger indexer: projects `ObjectLayerToken` events into the registration, transfer and
 * balance collections. The chain is the source of truth; the projection is rebuilt from it.
 *
 * Every event leg is recorded once (unique key), applied to the balances once (`applied`
 * flag), and the checkpoint advances after a block range is fully projected. A run that
 * stops anywhere resumes from the checkpoint and re-applies what it recorded but did not apply.
 *
 * @module src/api/item-ledger/item-ledger.indexer.js
 * @namespace ItemLedgerIndexer
 */
import { Contract, Interface, getAddress } from 'ethers';
import { ZERO_ADDRESS } from '../item-ledger-transfer/item-ledger-transfer.model.js';
import { normalizeAddress, objectLayerCidOfTokenId } from './item-ledger.model.js';

/** The contract surface the projection reads. */
export const OBJECT_LAYER_TOKEN_ABI = [
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
  'event ObjectLayerRegistered(uint256 indexed tokenId, bytes32 contentHash, string objectLayerCid, uint256 initialSupply)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
];

const iface = new Interface(OBJECT_LAYER_TOKEN_ABI);
const TOPICS = ['TransferSingle', 'TransferBatch', 'ObjectLayerRegistered'].map((name) => iface.getEvent(name).topicHash);

/**
 * @typedef {Object} IndexerModels
 * @property {import('mongoose').Model} ItemLedger
 * @property {import('mongoose').Model} ItemLedgerTransfer
 * @property {import('mongoose').Model} ItemLedgerBalance
 * @property {import('mongoose').Model} ItemLedgerCheckpoint
 * @memberof ItemLedgerIndexer
 */

/**
 * Transfer legs and registrations carried by one log.
 * @param {{topics:string[],data:string,blockNumber:number,transactionHash:string,index:number}} log
 * @returns {{transfers:Object[],registrations:Object[]}}
 * @memberof ItemLedgerIndexer
 */
export function decodeLog(log) {
  const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
  const base = { blockNumber: Number(log.blockNumber), txHash: log.transactionHash.toLowerCase(), logIndex: Number(log.index) };
  if (!parsed) return { transfers: [], registrations: [] };
  if (parsed.name === 'ObjectLayerRegistered') {
    return {
      transfers: [],
      registrations: [{ ...base, tokenId: parsed.args.tokenId.toString(10), objectLayerCid: parsed.args.objectLayerCid }],
    };
  }
  const from = normalizeAddress(parsed.args.from);
  const to = normalizeAddress(parsed.args.to);
  // `values` is read by name: on an ethers Result the property is the array iterator.
  const legs =
    parsed.name === 'TransferSingle'
      ? [{ tokenId: parsed.args.id, value: parsed.args.value }]
      : parsed.args.ids.map((id, index) => ({ tokenId: id, value: parsed.args.getValue('values')[index] }));
  return {
    registrations: [],
    transfers: legs.map((leg, batchIndex) => ({
      ...base,
      batchIndex,
      from,
      to,
      tokenId: leg.tokenId.toString(10),
      value: leg.value.toString(10),
    })),
  };
}

class ItemLedgerIndexer {
  /**
   * @param {Object} params
   * @param {import('ethers').Provider} params.provider - JSON-RPC provider of the chain.
   * @param {number} params.chainId
   * @param {string} params.contractAddress
   * @param {IndexerModels} params.models
   * @param {number} [params.confirmations=0] - Blocks behind the head the projection stays. Besu IBFT2/QBFT finalize every block: 0.
   * @param {number} [params.batchSize=2000] - Blocks per `getLogs` call.
   * @param {number} [params.startBlock=0] - First block of the contract, for a projection with no checkpoint.
   */
  constructor({ provider, chainId, contractAddress, models, confirmations = 0, batchSize = 2000, startBlock = 0 }) {
    this.provider = provider;
    this.chainId = Number(chainId);
    this.contractAddress = normalizeAddress(contractAddress);
    this.models = models;
    this.confirmations = confirmations;
    this.batchSize = batchSize;
    this.startBlock = startBlock;
    this.key = { chainId: this.chainId, contractAddress: this.contractAddress };
  }

  /**
   * Projects every block from the checkpoint to the confirmed head.
   * @returns {Promise<{fromBlock:number,toBlock:number,transfers:number,registrations:number}>}
   * @memberof ItemLedgerIndexer
   */
  async sync() {
    const { ItemLedgerCheckpoint } = this.models;
    await this.applyPending();

    const checkpoint = await ItemLedgerCheckpoint.findOne(this.key, { lastBlock: 1 }).lean();
    const fromBlock = checkpoint ? checkpoint.lastBlock + 1 : this.startBlock;
    const head = (await this.provider.getBlockNumber()) - this.confirmations;
    const summary = { fromBlock, toBlock: head, transfers: 0, registrations: 0 };
    if (head < fromBlock) return summary;

    for (let start = fromBlock; start <= head; start += this.batchSize) {
      const end = Math.min(start + this.batchSize - 1, head);
      const logs = await this.provider.getLogs({
        address: getAddress(this.contractAddress),
        fromBlock: start,
        toBlock: end,
        topics: [TOPICS],
      });
      for (const log of logs) {
        const { transfers, registrations } = decodeLog(log);
        for (const registration of registrations) summary.registrations += await this.recordRegistration(registration);
        for (const transfer of transfers) summary.transfers += await this.recordTransfer(transfer);
      }
      await ItemLedgerCheckpoint.updateOne(this.key, { $set: { lastBlock: end }, $setOnInsert: this.key }, { upsert: true });
    }
    return summary;
  }

  /**
   * Applies transfers recorded but not yet taken into the balances.
   * @returns {Promise<number>} Legs applied.
   * @memberof ItemLedgerIndexer
   */
  async applyPending() {
    const { ItemLedgerTransfer } = this.models;
    const pending = await ItemLedgerTransfer.find({ ...this.key, applied: false })
      .sort({ blockNumber: 1, logIndex: 1, batchIndex: 1 })
      .lean();
    for (const transfer of pending) await this.applyTransfer(transfer);
    return pending.length;
  }

  /**
   * Rereads every projected balance from the contract and corrects the rows that drifted.
   * @returns {Promise<{checked:number,corrected:Array<{tokenId:string,ownerAddress:string,projected:string,chain:string}>}>}
   * @memberof ItemLedgerIndexer
   */
  async reconcile() {
    const { ItemLedgerBalance } = this.models;
    const contract = new Contract(getAddress(this.contractAddress), OBJECT_LAYER_TOKEN_ABI, this.provider);
    const rows = await ItemLedgerBalance.find(this.key).lean();
    const result = { checked: rows.length, corrected: [] };
    for (const row of rows) {
      const chain = (await contract.balanceOf(getAddress(row.ownerAddress), BigInt(row.tokenId))).toString(10);
      if (chain === row.balance) continue;
      await ItemLedgerBalance.updateOne({ _id: row._id }, { $set: { balance: chain } });
      result.corrected.push({ tokenId: row.tokenId, ownerAddress: row.ownerAddress, projected: row.balance, chain });
    }
    return result;
  }

  async recordRegistration({ tokenId, objectLayerCid, txHash, blockNumber }) {
    const cid = objectLayerCidOfTokenId(tokenId);
    if (cid !== objectLayerCid) throw new Error(`Registration of token ${tokenId} names ${objectLayerCid}, its content is ${cid}`);
    await this.models.ItemLedger.bind({ ...this.key, objectLayerCid, tokenId, txHash, blockNumber });
    return 1;
  }

  async recordTransfer(transfer) {
    const { ItemLedgerTransfer } = this.models;
    const key = { ...this.key, txHash: transfer.txHash, logIndex: transfer.logIndex, batchIndex: transfer.batchIndex };
    const result = await ItemLedgerTransfer.updateOne(key, { $setOnInsert: { ...key, ...transfer, applied: false } }, { upsert: true });
    if (!result.upsertedCount) return 0;
    await this.applyTransfer({ ...key, ...transfer });
    return 1;
  }

  // The balance moves and the `applied` flag land together: in one transaction on a replica
  // set, in order otherwise.
  async applyTransfer(transfer) {
    const { ItemLedgerTransfer, ItemLedgerBalance } = this.models;
    const value = BigInt(transfer.value);
    const balanceKey = (ownerAddress) => ({ ...this.key, tokenId: transfer.tokenId, ownerAddress });
    const apply = async (session) => {
      if (transfer.from !== ZERO_ADDRESS) await ItemLedgerBalance.add(balanceKey(transfer.from), -value, session);
      if (transfer.to !== ZERO_ADDRESS) await ItemLedgerBalance.add(balanceKey(transfer.to), value, session);
      await ItemLedgerTransfer.updateOne(
        { ...this.key, txHash: transfer.txHash, logIndex: transfer.logIndex, batchIndex: transfer.batchIndex },
        { $set: { applied: true } },
        { session },
      );
    };
    const session = (await ItemLedgerTransfer.startSession?.()) ?? null;
    if (!session) return await apply(null);
    try {
      await session.withTransaction(() => apply(session));
    } finally {
      await session.endSession();
    }
  }
}

export { ItemLedgerIndexer };
