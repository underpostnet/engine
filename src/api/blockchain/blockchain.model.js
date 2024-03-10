import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const TransactionSchema = new Schema({
  transaction: {
    sender: { type: String, required: true, immutable: true },
    recipient: { type: String, required: true, immutable: true },
    // TODO: reward algorithm
    value: { type: String, required: true, immutable: true },
    timestamp: { type: Number, required: true, immutable: true },
  },
  signature: { type: String, required: true, immutable: true },
});

const BlockSchema = new Schema({
  previousHash: { type: String, required: true, immutable: true },
  nonce: { type: String, required: true, immutable: true }, // random value to miner
  // TODO: difficulty algorithm
  target: { type: String, required: true, immutable: true }, // initial hash characters (start with) (difficulty)
  // There should only be one transaction with a
  // signature and sender whose value is hash of the blockchain.
  // Timestamp block is timestamp reward transaction.
  transactions: { type: [TransactionSchema], required: true, immutable: true },
});

const BlockChainSchema = new Schema({
  // TODO: if add closed block to chain, validate:
  //    - previousHash with hashing block algorithm defined
  //    - transaction key format
  //    - sort timestamp transactions and validate with last transaction timestamp of last block

  blocks: [BlockSchema],
  // valid sender and recipient transaction key format
  transactionKeyFormat: {
    format: { type: String, required: true, immutable: true },
    algorithm: {
      name: { type: String, required: true, immutable: true },
      namedCurve: { type: String, required: true, immutable: true },
      hash: { type: String, required: true, immutable: true },
    },
  },
  // blockchain creation timestamp,
  // validate first block transactions timestamp
  timestamp: { type: Number, required: true, immutable: true },
  // genesis previous hash
  // example: salt, plain text, protocol name, json, ...
  hash: { type: String, immutable: true },
  hashingBlockAlgorithm: {
    // js example: const hash = crypto.createHash('sha256').update('data').digest('hex');
    hash: { type: String, immutable: true },
    digest: { type: String, immutable: true }, // previousHash display format
  },
});

const BlockChainModel = model('BlockChain', BlockChainSchema);

export { BlockChainSchema, BlockChainModel };
