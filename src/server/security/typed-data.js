/**
 * EIP-712 typed data for signed application actions.
 *
 * Authentication and authorization stay apart: a session comes from SIWE, and each action a
 * player authorizes carries its own typed-data signature. One definition per action lives
 * here, so Node, the client and any future relayer sign the same struct.
 *
 * @module src/server/security/typed-data.js
 * @namespace TypedData
 */
import { getAddress, verifyTypedData } from 'ethers';

/** The EIP-712 domain of one deployment. Bound to a chain and a contract. */
export const typedDataDomain = ({ chainId, verifyingContract, name = 'Cyberia', version = '1' }) => ({
  name,
  version,
  chainId: Number(chainId),
  verifyingContract: getAddress(verifyingContract),
});

/**
 * The actions a player may authorize. Each entry is the complete EIP-712 type set of one
 * action: a signature for one action can never be replayed as another.
 * @memberof TypedData
 */
export const TYPED_ACTIONS = Object.freeze({
  /** Move units of a registered Object Layer to another account. */
  ItemTransfer: Object.freeze({
    ItemTransfer: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }),
  /** Authorize one assembly of a recipe. */
  CraftIntent: Object.freeze({
    CraftIntent: [
      { name: 'account', type: 'address' },
      { name: 'actionCode', type: 'string' },
      { name: 'recipeIndex', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }),
  /** Offer units of a token type for a price. */
  MarketOrder: Object.freeze({
    MarketOrder: [
      { name: 'maker', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'priceTokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }),
});

/**
 * The payload a wallet signs for one action.
 * @param {Object} params
 * @param {string} params.action - A key of {@link TYPED_ACTIONS}.
 * @param {Object} params.domain - As {@link typedDataDomain} builds it.
 * @param {Object} params.message - The action fields.
 * @returns {{domain:Object,types:Object,primaryType:string,message:Object}}
 * @memberof TypedData
 */
export function buildTypedData({ action, domain, message }) {
  const types = TYPED_ACTIONS[action];
  if (!types) throw new Error(`Unknown signed action: ${action}`);
  return { domain, types, primaryType: action, message };
}

/**
 * The account that authorized an action.
 * @param {Object} params
 * @param {string} params.action - A key of {@link TYPED_ACTIONS}.
 * @param {Object} params.domain
 * @param {Object} params.message
 * @param {string} params.signature
 * @returns {string} Checksummed signer address.
 * @memberof TypedData
 */
export function recoverTypedSigner({ action, domain, message, signature }) {
  const types = TYPED_ACTIONS[action];
  if (!types) throw new Error(`Unknown signed action: ${action}`);
  return getAddress(verifyTypedData(domain, types, message, signature));
}

/**
 * Whether an account authorized an action, inside its deadline.
 *
 * EOA signatures are checked here. A contract account (ERC-1271) is verified by its own
 * contract; `isValidSignature` is the extension point, and the caller passes a verifier.
 *
 * @param {Object} params
 * @param {string} params.action
 * @param {Object} params.domain
 * @param {Object} params.message - Must carry `deadline` in seconds.
 * @param {string} params.signature
 * @param {string} params.account - The account that must have signed.
 * @param {number} [params.now] - Unix seconds, for tests.
 * @param {(params:{account:string,digestFields:Object,signature:string}) => Promise<boolean>} [params.contractVerifier]
 *   Verifier for a contract account; called when the EOA recovery does not match.
 * @returns {Promise<boolean>}
 * @memberof TypedData
 */
export async function verifyTypedAction({
  action,
  domain,
  message,
  signature,
  account,
  now = Math.floor(Date.now() / 1000),
  contractVerifier,
}) {
  if (Number(message.deadline) <= now) return false;
  const expected = getAddress(account);
  try {
    if (recoverTypedSigner({ action, domain, message, signature }) === expected) return true;
  } catch {
    // A contract signature does not recover to an address; the verifier decides.
  }
  if (!contractVerifier) return false;
  return await contractVerifier({ account: expected, digestFields: { action, domain, message }, signature });
}
