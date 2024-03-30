import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const TransactionSchema = new Schema({
  transaction: {
    // The sender public key of the transaction.
    // In a reward transaction the sender is null.
    sender: { type: String, required: true, immutable: true },
    // The recipient public key  of the transaction.
    recipient: { type: String, required: true, immutable: true },
    // The value of the transaction, which can be an amount of currencies or array ipfs cid.
    // TODO: reward algorithm
    value: { type: String, required: true, immutable: true },
    // The timestamp of the transaction.
    timestamp: { type: Number, required: true, immutable: true },
  },
  // The signature of the transaction, which validates the sender and the value.
  // In a reward transaction the signature is null.
  signature: { type: String, required: true, immutable: true },
});

const BlockSchema = new Schema({
  // The hash of the previous block in the blockchain.
  // If it is the first block previousHash is null
  previousHash: { type: String, required: true, immutable: true },
  // A random value used in the mining process.
  nonce: { type: String, required: true, immutable: true },
  // The target hash for the block, which determines the difficulty of mining.
  // TODO: difficulty algorithm
  target: { type: String, required: true, immutable: true },
  // A list of transactions included in the block.
  transactions: { type: [TransactionSchema], required: true, immutable: true },
  // The timestamp of the block
  timestamp: { type: Number, required: true, immutable: true },
});

const BlockChainSchema = new Schema({
  // TODO: if add closed block to chain, validate:
  //    - previousHash with hashing block algorithm defined
  //    - transaction key format
  //    - sort timestamp transactions and validate with last transaction timestamp of last block
  //    - block timestamp with last block

  // A list of blocks in the blockchain.
  blocks: [BlockSchema],
  // The format of the transaction public keys, such as JWK.
  transactionKeyFormat: {
    format: { type: String, required: true, immutable: true },
    algorithm: {
      name: { type: String, required: true, immutable: true },
      namedCurve: { type: String, required: true, immutable: true },
      hash: { type: String, required: true, immutable: true },
    },
  },
  hashingBlockAlgorithm: {
    // The hash function used, such as SHA-256.
    hash: { type: String, immutable: true },
    // The format of the hash output, such as hex.
    digest: { type: String, required: true, immutable: true },
  },
});

const BlockChainModel = model('BlockChain', BlockChainSchema);

export { BlockChainSchema, BlockChainModel };
