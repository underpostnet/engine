/**
 * Sign-In with Ethereum (ERC-4361).
 *
 * The wallet proves control of an address; the server then issues its own session. The
 * signature is never the session token: it authorizes one login, bound to a nonce this server
 * issued, to this domain, on one chain, inside a time window.
 *
 * @module src/server/security/siwe.js
 * @namespace Siwe
 */
import crypto from 'crypto';
import { getAddress, verifyMessage } from 'ethers';

/** How long a challenge may be answered. */
export const SIWE_NONCE_TTL_MS = Number(process.env.SIWE_NONCE_TTL_MS || 5 * 60 * 1000);
/** Version of the ERC-4361 message this server issues and accepts. */
export const SIWE_VERSION = '1';

/** A fresh nonce: ERC-4361 asks for at least 8 alphanumeric characters. */
export const createNonce = () => crypto.randomBytes(16).toString('hex');

/**
 * The exact ERC-4361 message text. The client signs this string, and the server rebuilds it
 * from its own fields: a client that changes one field fails verification.
 *
 * @param {Object} params
 * @param {string} params.domain - Authority the session is for (`cyberiaonline.com`).
 * @param {string} params.address - Checksummed address.
 * @param {string} params.uri - Origin the login happens on.
 * @param {number} params.chainId - EIP-155 chain id.
 * @param {string} params.nonce - Nonce the server issued.
 * @param {string} params.issuedAt - ISO-8601.
 * @param {string} [params.expirationTime] - ISO-8601.
 * @param {string} [params.statement] - One line shown in the wallet.
 * @returns {string}
 * @memberof Siwe
 */
export function buildSiweMessage({ domain, address, uri, chainId, nonce, issuedAt, expirationTime, statement }) {
  const lines = [`${domain} wants you to sign in with your Ethereum account:`, getAddress(address), ''];
  if (statement) lines.push(statement, '');
  lines.push(
    `URI: ${uri}`,
    `Version: ${SIWE_VERSION}`,
    `Chain ID: ${Number(chainId)}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  );
  if (expirationTime) lines.push(`Expiration Time: ${expirationTime}`);
  return lines.join('\n');
}

/**
 * Reads an ERC-4361 message back into its fields.
 * @param {string} message
 * @returns {Object|null} The fields, or null when the text is not an ERC-4361 message.
 * @memberof Siwe
 */
export function parseSiweMessage(message) {
  const text = String(message ?? '');
  const header =
    /^(?<domain>[^\n]+) wants you to sign in with your Ethereum account:\n(?<address>0x[0-9a-fA-F]{40})\n/.exec(text);
  if (!header) return null;
  const field = (name) => new RegExp(`^${name}: (.+)$`, 'm').exec(text)?.[1];
  const statement = /\n\n(?<statement>[^\n]+)\n\nURI: /.exec(text)?.groups?.statement;
  const chainId = field('Chain ID');
  return {
    domain: header.groups.domain,
    address: header.groups.address,
    statement,
    uri: field('URI'),
    version: field('Version'),
    chainId: chainId === undefined ? undefined : Number(chainId),
    nonce: field('Nonce'),
    issuedAt: field('Issued At'),
    expirationTime: field('Expiration Time'),
  };
}

/**
 * Verifies a signed ERC-4361 message against the challenge this server issued.
 *
 * Every field is checked, so a signature for another domain, chain, address or nonce is not a
 * login here. The caller consumes the nonce, which is what makes a replay fail.
 *
 * @param {Object} params
 * @param {string} params.message - The signed message text.
 * @param {string} params.signature - The wallet signature.
 * @param {Object} params.challenge - `{ domain, uri, chainId, nonce, issuedAt, expirationTime }` as issued.
 * @param {Date} [params.now=new Date()] - Clock, for tests.
 * @returns {{address:string,chainId:number}} The proven account.
 * @throws {Error} When any field or the signature does not match.
 * @memberof Siwe
 */
export function verifySiweMessage({ message, signature, challenge, now = new Date() }) {
  const fields = parseSiweMessage(message);
  if (!fields) throw new Error('The message is not an ERC-4361 sign-in message');
  if (fields.version !== SIWE_VERSION) throw new Error(`Unsupported SIWE version: ${fields.version}`);
  if (fields.domain !== challenge.domain)
    throw new Error(`The message signs in to "${fields.domain}", not "${challenge.domain}"`);
  if (fields.uri !== challenge.uri) throw new Error('The message URI does not match the challenge');
  if (Number(fields.chainId) !== Number(challenge.chainId))
    throw new Error('The message chain id does not match the challenge');
  if (fields.nonce !== challenge.nonce) throw new Error('The message nonce does not match the challenge');
  if (fields.issuedAt !== challenge.issuedAt) throw new Error('The message issue time does not match the challenge');

  const expiration = fields.expirationTime ?? challenge.expirationTime;
  if (expiration && new Date(expiration) <= now) throw new Error('The sign-in challenge expired');
  if (new Date(fields.issuedAt) > now) throw new Error('The sign-in challenge is issued in the future');

  const recovered = verifyMessage(message, signature);
  if (getAddress(recovered) !== getAddress(fields.address))
    throw new Error('The signature does not match the address in the message');

  return { address: getAddress(recovered), chainId: Number(fields.chainId) };
}
