/**
 * WalletAccount service: SIWE sign-in and the public account records a domain keeps.
 *
 * The flow is ERC-4361: the server issues a nonce, the wallet signs the message built from it,
 * the server verifies every field and consumes the nonce, and only then issues its own
 * session. A signature is never a session token.
 *
 * @module src/api/wallet-account/wallet-account.service.js
 * @namespace WalletAccountService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { ValkeyAPI, isValkeyEnable } from '../../db/valkey/Valkey.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { createSessionAndUserToken, hashJWT } from '../../server/security/auth.js';
import { SIWE_NONCE_TTL_MS, buildSiweMessage, createNonce, verifySiweMessage } from '../../server/security/siwe.js';
import { WalletAccountDto, caip10, normalizeAddress } from './wallet-account.model.js';

const logger = loggerFactory(import.meta);

/** Challenges of a deployment that runs without Valkey: one process, same lifetime. */
const memoryChallenges = new Map();

const challengeKey = (nonce) => `siwe:${nonce}`;

const storeChallenge = async (options, challenge) => {
  if (isValkeyEnable())
    return await ValkeyAPI.set(options, challengeKey(challenge.nonce), challenge, SIWE_NONCE_TTL_MS);
  memoryChallenges.set(challenge.nonce, challenge);
  setTimeout(() => memoryChallenges.delete(challenge.nonce), SIWE_NONCE_TTL_MS).unref?.();
};

/** Reads a challenge and consumes it: a nonce answers exactly one sign-in. */
const takeChallenge = async (options, nonce) => {
  if (isValkeyEnable()) {
    const challenge = await ValkeyAPI.get(options, challengeKey(nonce));
    if (challenge) await ValkeyAPI.del(options, challengeKey(nonce));
    return challenge;
  }
  const challenge = memoryChallenges.get(nonce) ?? null;
  memoryChallenges.delete(nonce);
  return challenge;
};

class WalletAccountService {
  /**
   * POST handler.
   *
   * - `/challenge` — issues a SIWE challenge for `{ address, chainId }`.
   * - `/sign-in` — verifies `{ message, signature, walletType, providerType?, derivationPath? }`
   *   and answers with a session token.
   *
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static post = async (req, res, options) => {
    if (req.path.startsWith('/challenge')) {
      const { address, chainId, statement } = req.body;
      const issuedAt = new Date();
      const challenge = {
        domain: options.host,
        uri: `https://${options.host}${options.path === '/' ? '' : options.path}`,
        chainId: Number(chainId),
        nonce: createNonce(),
        issuedAt: issuedAt.toISOString(),
        expirationTime: new Date(issuedAt.getTime() + SIWE_NONCE_TTL_MS).toISOString(),
      };
      await storeChallenge(options, challenge);
      return {
        ...challenge,
        message: buildSiweMessage({ ...challenge, address, statement: statement || `Sign in to ${options.host}.` }),
      };
    }

    if (req.path.startsWith('/sign-in')) {
      const { message, signature, walletType, providerType, derivationPath } = req.body;
      const nonce = /^Nonce: (.+)$/m.exec(String(message ?? ''))?.[1];
      const challenge = nonce ? await takeChallenge(options, nonce) : null;
      if (!challenge) throw new Error('The sign-in challenge is unknown, used or expired');

      const { address, chainId } = verifySiweMessage({ message, signature, challenge });

      const WalletAccount = DataBaseProviderService.getModel('WalletAccount', options);
      const User = DataBaseProviderService.getModel('User', options);
      const account = await WalletAccount.touch({ chainId, address, walletType, providerType, derivationPath });

      // The wallet proves the address; the session is this server's own, as for any login.
      const user = await User.findOne({ 'wallet.accountId': account.accountId }).select('+role');
      if (!user) {
        logger.info(`SIWE sign-in for an unbound account: ${account.accountId}`);
        return { account, session: null };
      }
      const { jwtid } = await createSessionAndUserToken(user, User, req, res, options);
      await WalletAccount.updateOne({ accountId: account.accountId }, { $set: { userId: user._id } });
      return {
        account,
        session: {
          token: hashJWT({ _id: user._id.toString(), jwtid }, options),
          user: { _id: user._id, role: user.role },
        },
      };
    }

    throw new Error('Unknown wallet-account operation');
  };

  /**
   * GET `/:accountId` (one account) or `/` (the accounts of the session user).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const WalletAccount = DataBaseProviderService.getModel('WalletAccount', options);
    const select = WalletAccountDto.select.get();
    if (req.params.id) {
      const account = await WalletAccount.findOne({
        $or: [{ accountId: req.params.id }, { address: normalizeAddress(req.params.id) }],
      }).select(select);
      if (!account) throw new Error('Wallet account not found');
      return account;
    }
    return { data: await WalletAccount.find({ userId: req.auth?.user?._id }).select(select) };
  };
}

export { WalletAccountService, caip10 };
