import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { HDNodeWallet, Wallet as EthersWallet, getAddress, verifyMessage } from 'ethers';
import {
  WALLET_CAPABILITIES,
  WALLET_TYPES,
  caip10,
  caip2,
  discoverExternalWallets,
  externalWalletProvider,
  hasCapability,
  parseCaip10,
} from '../../../src/client/components/wallet/WalletProvider.js';
import {
  EmbeddedWallet,
  accountPath,
  ETHEREUM_BASE_PATH,
} from '../../../src/client/components/wallet/EmbeddedWallet.js';
import {
  SIWE_VERSION,
  buildSiweMessage,
  createNonce,
  parseSiweMessage,
  verifySiweMessage,
} from '../../../src/server/security/siwe.js';
import {
  TYPED_ACTIONS,
  buildTypedData,
  recoverTypedSigner,
  typedDataDomain,
  verifyTypedAction,
} from '../../../src/server/security/typed-data.js';
import {
  FORBIDDEN_FIELDS,
  WalletAccountDto,
  WalletAccountModel,
  caip10 as accountCaip10,
  normalizeAddress,
} from '../../../src/api/wallet-account/wallet-account.model.js';
import { WalletAccountService } from '../../../src/api/wallet-account/wallet-account.service.js';
import { objectLayerIdentity } from '../../../src/api/object-layer/object-layer.identity.js';

const CHAIN_ID = 777771;
const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
// BIP-39 test vector. The address of m/44'/60'/0'/0/0 is fixed by the standard.
const PHRASE = 'test test test test test test test test test test test junk';
const PHRASE_ACCOUNT_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PHRASE_ACCOUNT_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** An EIP-1193 wallet backed by a key, as a browser extension exposes one. */
const fakeInjectedProvider = (signer, chainId = CHAIN_ID) => ({
  request: async ({ method, params }) => {
    if (method === 'eth_requestAccounts') return [signer.address];
    if (method === 'eth_chainId') return `0x${chainId.toString(16)}`;
    if (method === 'personal_sign') return await signer.signMessage(params[0]);
    if (method === 'eth_signTypedData_v4') {
      const { domain, types, message } = JSON.parse(params[1]);
      const { EIP712Domain, ...signedTypes } = types;
      return await signer.signTypedData(domain, signedTypes, message);
    }
    if (method === 'eth_sendTransaction') return '0x' + '11'.repeat(32);
    throw new Error(`Unsupported method: ${method}`);
  },
});

/** An announcing page, as EIP-6963 defines one. */
const announcingTarget = (providers) => {
  const target = new EventTarget();
  target.addEventListener('eip6963:requestProvider', () => {
    for (const [rdns, provider] of Object.entries(providers)) {
      target.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns, name: rdns }, provider } }),
      );
    }
  });
  return target;
};

/** The vault, in memory. The browser stores the same record in IndexedDB. */
const memoryVault = () => {
  let record = null;
  return {
    async read() {
      return record;
    },
    async write(next) {
      record = next;
    },
    async clear() {
      record = null;
    },
    peek: () => record,
  };
};

describe('wallet provider discovery', () => {
  it('returns one provider per EIP-6963 announcement', async () => {
    const a = EthersWallet.createRandom();
    const b = EthersWallet.createRandom();
    const target = announcingTarget({ 'io.metamask': fakeInjectedProvider(a), 'com.rainbow': fakeInjectedProvider(b) });

    const found = await discoverExternalWallets({ target, timeoutMs: 20 });

    expect(found.map((provider) => provider.id).sort()).toEqual(['com.rainbow', 'io.metamask']);
    expect(await found.find((provider) => provider.id === 'io.metamask').getAddress()).toBe(a.address);
  });

  it('announces the same provider once', async () => {
    const provider = fakeInjectedProvider(EthersWallet.createRandom());
    const target = announcingTarget({ 'io.metamask': provider });
    target.addEventListener('eip6963:requestProvider', () => {
      target.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'io.metamask' }, provider } }),
      );
    });

    expect(await discoverExternalWallets({ target, timeoutMs: 20 })).toHaveLength(1);
  });

  it('falls back to a single injected provider when nothing announces', async () => {
    const signer = EthersWallet.createRandom();
    const target = new EventTarget();
    target.ethereum = fakeInjectedProvider(signer);

    const [found] = await discoverExternalWallets({ target, timeoutMs: 20 });

    expect(found.id).toBe('injected');
    expect(await found.getAddress()).toBe(signer.address);
  });

  it('finds nothing in a browser with no wallet', async () => {
    expect(await discoverExternalWallets({ target: new EventTarget(), timeoutMs: 20 })).toEqual([]);
  });
});

describe('account abstraction', () => {
  beforeEach(() => {
    EmbeddedWallet.storage = memoryVault();
    EmbeddedWallet.lock();
  });

  it('answers the same interface for an external and an embedded account', async () => {
    const signer = EthersWallet.createRandom();
    const external = externalWalletProvider({ provider: fakeInjectedProvider(signer), info: { rdns: 'io.metamask' } });
    EmbeddedWallet.signer = HDNodeWallet.fromPhrase(PHRASE, undefined, accountPath(0));
    const embedded = EmbeddedWallet.provider({ chainId: CHAIN_ID });

    for (const provider of [external, embedded]) {
      expect(typeof provider.getAddress).toBe('function');
      expect(typeof provider.getChainId).toBe('function');
      expect(hasCapability(provider, WALLET_CAPABILITIES.signMessage)).toBe(true);
      expect(hasCapability(provider, WALLET_CAPABILITIES.signTypedData)).toBe(true);
      expect(getAddress(await provider.getAddress())).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
    expect(external.type).toBe(WALLET_TYPES.external);
    expect(embedded.type).toBe(WALLET_TYPES.embedded);
    expect(await embedded.getChainId()).toBe(CHAIN_ID);
    expect(await external.getChainId()).toBe(CHAIN_ID);
  });

  it('names an account with CAIP-10, whatever holds the key', () => {
    const accountId = caip10(CHAIN_ID, PHRASE_ACCOUNT_0);
    expect(caip2(CHAIN_ID)).toBe('eip155:777771');
    expect(accountId).toBe(`eip155:777771:${PHRASE_ACCOUNT_0.toLowerCase()}`);
    expect(parseCaip10(accountId)).toEqual({
      namespace: 'eip155',
      chainId: CHAIN_ID,
      address: PHRASE_ACCOUNT_0.toLowerCase(),
    });
    expect(parseCaip10('eip155:777771:not-an-address')).toBeNull();
    expect(accountCaip10(CHAIN_ID, PHRASE_ACCOUNT_0)).toBe(accountId);
  });

  it('signs a message the server can recover, through either wallet', async () => {
    const signer = HDNodeWallet.fromPhrase(PHRASE, undefined, accountPath(0));
    const external = externalWalletProvider({ provider: fakeInjectedProvider(signer) });
    EmbeddedWallet.signer = signer;
    const embedded = EmbeddedWallet.provider({ chainId: CHAIN_ID });

    for (const provider of [external, embedded]) {
      const signature = await provider.signMessage('cyberia sign-in');
      expect(getAddress(verifyMessage('cyberia sign-in', signature))).toBe(PHRASE_ACCOUNT_0);
    }
  });

  it('signs EIP-712 typed data the server can recover, through either wallet', async () => {
    const signer = HDNodeWallet.fromPhrase(PHRASE, undefined, accountPath(0));
    const external = externalWalletProvider({ provider: fakeInjectedProvider(signer) });
    EmbeddedWallet.signer = signer;
    const embedded = EmbeddedWallet.provider({ chainId: CHAIN_ID });
    const domain = typedDataDomain({ chainId: CHAIN_ID, verifyingContract: CONTRACT });
    const message = {
      account: PHRASE_ACCOUNT_0,
      actionCode: 'craft-hatchet',
      recipeIndex: 0,
      quantity: 1,
      nonce: 1,
      deadline: Math.floor(Date.now() / 1000) + 600,
    };
    const typedData = buildTypedData({ action: 'CraftIntent', domain, message });

    for (const provider of [external, embedded]) {
      const signature = await provider.signTypedData({ ...typedData, types: { ...typedData.types, EIP712Domain: [] } });
      expect(recoverTypedSigner({ action: 'CraftIntent', domain, message, signature })).toBe(PHRASE_ACCOUNT_0);
    }
  });
});

describe('embedded wallet derivation', () => {
  beforeEach(() => {
    EmbeddedWallet.storage = memoryVault();
    EmbeddedWallet.lock();
  });

  it('derives BIP-44 Ethereum accounts on the standard path', () => {
    expect(ETHEREUM_BASE_PATH).toBe("m/44'/60'/0'/0");
    expect(accountPath(0)).toBe("m/44'/60'/0'/0/0");
    expect(accountPath(3)).toBe("m/44'/60'/0'/0/3");
    expect(EmbeddedWallet.restore({ mnemonic: PHRASE })).toEqual({ address: PHRASE_ACCOUNT_0, path: accountPath(0) });
    expect(EmbeddedWallet.restore({ mnemonic: PHRASE, accountIndex: 1 })).toEqual({
      address: PHRASE_ACCOUNT_1,
      path: accountPath(1),
    });
  });

  it('recovers the same address from the same phrase, every time', () => {
    const { mnemonic, address } = EmbeddedWallet.create();
    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(EmbeddedWallet.restore({ mnemonic }).address).toBe(address);
    expect(EmbeddedWallet.restore({ mnemonic }).address).toBe(address);
  });

  it('creates a different account every time', () => {
    expect(EmbeddedWallet.create().mnemonic).not.toBe(EmbeddedWallet.create().mnemonic);
  });

  it('refuses a phrase that is not BIP-39', () => {
    expect(() => EmbeddedWallet.restore({ mnemonic: 'not a real recovery phrase at all' })).toThrow(/BIP-39/);
    expect(() => EmbeddedWallet.restore({ mnemonic: PHRASE.replace('junk', 'test') })).toThrow(/BIP-39/);
  });
});

describe('embedded wallet vault', () => {
  let vault;

  beforeEach(() => {
    vault = memoryVault();
    EmbeddedWallet.storage = vault;
    EmbeddedWallet.lock();
  });

  it('stores the account encrypted, and never in the clear', { timeout: 60000 }, async () => {
    const { address } = await EmbeddedWallet.save({ mnemonic: PHRASE, passphrase: 'correct horse battery' });

    expect(address).toBe(PHRASE_ACCOUNT_0);
    const stored = JSON.stringify(vault.peek());
    for (const secret of [PHRASE, 'correct horse battery', 'junk']) expect(stored).not.toContain(secret);
    const keystore = JSON.parse(vault.peek().keystore);
    expect((keystore.crypto ?? keystore.Crypto).ciphertext).toMatch(/^[0-9a-f]+$/);
    expect(await EmbeddedWallet.account()).toMatchObject({ address, path: accountPath(0) });
  });

  it('unlocks with the passphrase and refuses any other', { timeout: 60000 }, async () => {
    await EmbeddedWallet.save({ mnemonic: PHRASE, passphrase: 'correct horse battery' });

    expect(await EmbeddedWallet.unlock({ passphrase: 'correct horse battery' })).toBe(PHRASE_ACCOUNT_0);
    await expect(EmbeddedWallet.unlock({ passphrase: 'wrong passphrase' })).rejects.toThrow();
  });

  it('keeps the key in memory only while unlocked', { timeout: 60000 }, async () => {
    await EmbeddedWallet.save({ mnemonic: PHRASE, passphrase: 'correct horse battery' });
    const provider = EmbeddedWallet.provider({ chainId: CHAIN_ID });

    await expect(provider.signMessage('before unlock')).rejects.toThrow(/locked/);
    await EmbeddedWallet.unlock({ passphrase: 'correct horse battery' });
    expect(getAddress(verifyMessage('unlocked', await provider.signMessage('unlocked')))).toBe(PHRASE_ACCOUNT_0);

    EmbeddedWallet.lock();
    expect(EmbeddedWallet.signer).toBeNull();
    await expect(provider.signMessage('after lock')).rejects.toThrow(/locked/);
  });

  it('exports an interoperable keystore and recovers the account from it', { timeout: 90000 }, async () => {
    await EmbeddedWallet.save({ mnemonic: PHRASE, passphrase: 'correct horse battery' });
    const keystore = await EmbeddedWallet.exportKeystore();

    await EmbeddedWallet.forget();
    expect(await EmbeddedWallet.account()).toBeNull();
    expect(EmbeddedWallet.signer).toBeNull();

    const recovered = await EmbeddedWallet.importKeystore({ keystore, passphrase: 'correct horse battery' });
    expect(recovered.address).toBe(PHRASE_ACCOUNT_0);
    expect(JSON.parse(keystore).version).toBe(3);
  });

  it('recovers from the phrase after the vault is gone', { timeout: 60000 }, async () => {
    await EmbeddedWallet.save({ mnemonic: PHRASE, passphrase: 'first' });
    await EmbeddedWallet.forget();

    const { address } = await EmbeddedWallet.save({ mnemonic: PHRASE, passphrase: 'second' });
    expect(address).toBe(PHRASE_ACCOUNT_0);
  });

  it('reports a missing vault instead of answering with an empty account', async () => {
    await expect(EmbeddedWallet.unlock({ passphrase: 'any' })).rejects.toThrow(/No embedded wallet/);
    await expect(EmbeddedWallet.exportKeystore()).rejects.toThrow(/No embedded wallet/);
  });
});

describe('SIWE sign-in', () => {
  const signer = HDNodeWallet.fromPhrase(PHRASE, undefined, accountPath(0));
  const challengeOf = (overrides = {}) => ({
    domain: 'cyberiaonline.com',
    uri: 'https://cyberiaonline.com',
    chainId: CHAIN_ID,
    nonce: createNonce(),
    issuedAt: new Date('2026-09-20T10:00:00.000Z').toISOString(),
    expirationTime: new Date('2026-09-20T10:05:00.000Z').toISOString(),
    ...overrides,
  });
  const now = new Date('2026-09-20T10:01:00.000Z');
  const signed = async (challenge) => {
    const message = buildSiweMessage({
      ...challenge,
      address: signer.address,
      statement: 'Sign in to cyberiaonline.com.',
    });
    return { message, signature: await signer.signMessage(message) };
  };

  it('issues a different nonce every time', () => {
    const nonces = new Set(Array.from({ length: 500 }, () => createNonce()));
    expect(nonces.size).toBe(500);
    for (const nonce of nonces) expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('builds an ERC-4361 message that parses back to its fields', async () => {
    const challenge = challengeOf();
    const { message } = await signed(challenge);

    expect(message.startsWith('cyberiaonline.com wants you to sign in with your Ethereum account:')).toBe(true);
    expect(parseSiweMessage(message)).toEqual({
      domain: challenge.domain,
      address: signer.address,
      statement: 'Sign in to cyberiaonline.com.',
      uri: challenge.uri,
      version: SIWE_VERSION,
      chainId: CHAIN_ID,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      expirationTime: challenge.expirationTime,
    });
  });

  it('proves the address that signed the challenge', async () => {
    const challenge = challengeOf();
    expect(verifySiweMessage({ ...(await signed(challenge)), challenge, now })).toEqual({
      address: PHRASE_ACCOUNT_0,
      chainId: CHAIN_ID,
    });
  });

  it('refuses a message signed for another domain, uri, chain or nonce', async () => {
    const challenge = challengeOf();
    const signature = (await signed(challenge)).signature;
    const message = (await signed(challenge)).message;

    for (const [field, value, error] of [
      ['domain', 'itemledger.com', /not "itemledger.com"/],
      ['uri', 'https://itemledger.com', /URI does not match/],
      ['chainId', 1, /chain id does not match/],
      ['nonce', createNonce(), /nonce does not match/],
      ['issuedAt', new Date('2026-09-20T09:00:00.000Z').toISOString(), /issue time does not match/],
    ]) {
      expect(() => verifySiweMessage({ message, signature, challenge: { ...challenge, [field]: value }, now })).toThrow(
        error,
      );
    }
  });

  it('refuses an expired challenge and one issued in the future', async () => {
    const challenge = challengeOf();
    const late = new Date('2026-09-20T10:06:00.000Z');
    const expired = await signed(challenge);
    expect(() => verifySiweMessage({ ...expired, challenge, now: late })).toThrow(/expired/);

    const early = challengeOf({
      issuedAt: new Date('2026-09-20T11:00:00.000Z').toISOString(),
      expirationTime: undefined,
    });
    const ahead = await signed(early);
    expect(() => verifySiweMessage({ ...ahead, challenge: early, now })).toThrow(/issued in the future/);
  });

  it('refuses a signature from another account', async () => {
    const challenge = challengeOf();
    const { message } = await signed(challenge);
    const other = HDNodeWallet.fromPhrase(PHRASE, undefined, accountPath(1));

    expect(() => verifySiweMessage({ message, signature: other.signMessageSync(message), challenge, now })).toThrow(
      /does not match the address/,
    );
  });

  it('refuses text that is not an ERC-4361 message', async () => {
    const challenge = challengeOf();
    expect(() => verifySiweMessage({ message: 'sign this', signature: '0x00', challenge, now })).toThrow(
      /not an ERC-4361/,
    );
  });
});

describe('SIWE challenge lifecycle', () => {
  const options = { host: 'cyberiaonline.com', path: '/' };
  const signer = HDNodeWallet.fromPhrase(PHRASE, undefined, accountPath(0));

  it('issues a challenge bound to this host and chain', async () => {
    const challenge = await WalletAccountService.post(
      { path: '/challenge', body: { address: signer.address, chainId: CHAIN_ID } },
      {},
      options,
    );

    expect(challenge.domain).toBe('cyberiaonline.com');
    expect(challenge.uri).toBe('https://cyberiaonline.com');
    expect(challenge.chainId).toBe(CHAIN_ID);
    expect(new Date(challenge.expirationTime).getTime()).toBeGreaterThan(new Date(challenge.issuedAt).getTime());
    expect(
      verifySiweMessage({
        message: challenge.message,
        signature: signer.signMessageSync(challenge.message),
        challenge,
      }),
    ).toEqual({ address: PHRASE_ACCOUNT_0, chainId: CHAIN_ID });
  });

  it('answers one nonce once: a replayed message is refused', async () => {
    const challenge = await WalletAccountService.post(
      { path: '/challenge', body: { address: signer.address, chainId: CHAIN_ID } },
      {},
      options,
    );
    const body = {
      message: challenge.message,
      signature: signer.signMessageSync(challenge.message),
      walletType: 'embedded',
    };

    // The first answer consumes the nonce; it then needs the models this tier does not provide.
    const first = await WalletAccountService.post({ path: '/sign-in', body }, {}, options).catch((error) => error);
    expect(String(first.message)).not.toMatch(/unknown, used or expired/);

    await expect(WalletAccountService.post({ path: '/sign-in', body }, {}, options)).rejects.toThrow(
      /unknown, used or expired/,
    );
  });

  it('refuses a sign-in that carries no challenge', async () => {
    await expect(
      WalletAccountService.post(
        { path: '/sign-in', body: { message: 'no nonce here', signature: '0x00' } },
        {},
        options,
      ),
    ).rejects.toThrow(/unknown, used or expired/);
  });
});

describe('EIP-712 action authorization', () => {
  const signer = HDNodeWallet.fromPhrase(PHRASE, undefined, accountPath(0));
  const domain = typedDataDomain({ chainId: CHAIN_ID, verifyingContract: CONTRACT });
  const transfer = {
    from: PHRASE_ACCOUNT_0,
    to: PHRASE_ACCOUNT_1,
    tokenId: '42',
    amount: 1,
    nonce: 7,
    deadline: 2000000000,
  };
  const sign = async (action, message) => {
    const { types } = buildTypedData({ action, domain, message });
    return await signer.signTypedData(domain, types, message);
  };

  it('accepts an action the account signed, inside its deadline', async () => {
    const signature = await sign('ItemTransfer', transfer);
    expect(
      await verifyTypedAction({
        action: 'ItemTransfer',
        domain,
        message: transfer,
        signature,
        account: PHRASE_ACCOUNT_0,
        now: 1999999000,
      }),
    ).toBe(true);
  });

  it('refuses an action past its deadline', async () => {
    const signature = await sign('ItemTransfer', transfer);
    expect(
      await verifyTypedAction({
        action: 'ItemTransfer',
        domain,
        message: transfer,
        signature,
        account: PHRASE_ACCOUNT_0,
        now: 2000000001,
      }),
    ).toBe(false);
  });

  it('refuses a signature made for another account, chain or contract', async () => {
    const signature = await sign('ItemTransfer', transfer);
    const verify = (overrides) =>
      verifyTypedAction({
        action: 'ItemTransfer',
        domain,
        message: transfer,
        signature,
        account: PHRASE_ACCOUNT_0,
        now: 1999999000,
        ...overrides,
      });

    expect(await verify({ account: PHRASE_ACCOUNT_1 })).toBe(false);
    expect(await verify({ domain: typedDataDomain({ chainId: 1, verifyingContract: CONTRACT }) })).toBe(false);
    expect(await verify({ domain: typedDataDomain({ chainId: CHAIN_ID, verifyingContract: PHRASE_ACCOUNT_1 }) })).toBe(
      false,
    );
  });

  it('never lets the signature of one action authorize another', async () => {
    const signature = await sign('ItemTransfer', transfer);
    const craft = {
      account: PHRASE_ACCOUNT_0,
      actionCode: 'craft-hatchet',
      recipeIndex: 0,
      quantity: 1,
      nonce: 7,
      deadline: 2000000000,
    };

    expect(
      await verifyTypedAction({
        action: 'CraftIntent',
        domain,
        message: craft,
        signature,
        account: PHRASE_ACCOUNT_0,
        now: 1999999000,
      }),
    ).toBe(false);
  });

  it('every action carries a nonce and a deadline', () => {
    for (const [action, types] of Object.entries(TYPED_ACTIONS)) {
      const fields = types[action].map((field) => field.name);
      expect(fields).toContain('nonce');
      expect(fields).toContain('deadline');
    }
    expect(() => buildTypedData({ action: 'NotAnAction', domain, message: {} })).toThrow(/Unknown signed action/);
  });

  it('leaves contract accounts to an ERC-1271 verifier', async () => {
    const calls = [];
    const accepted = await verifyTypedAction({
      action: 'ItemTransfer',
      domain,
      message: transfer,
      signature: '0x' + '00'.repeat(65),
      account: PHRASE_ACCOUNT_1,
      now: 1999999000,
      contractVerifier: async (params) => {
        calls.push(params.account);
        return true;
      },
    });

    expect(accepted).toBe(true);
    expect(calls).toEqual([PHRASE_ACCOUNT_1]);
  });
});

describe('key safety', () => {
  it('keeps every secret field out of the account record', () => {
    for (const field of FORBIDDEN_FIELDS) {
      expect(
        () =>
          new WalletAccountModel({
            accountId: accountCaip10(CHAIN_ID, PHRASE_ACCOUNT_0),
            address: normalizeAddress(PHRASE_ACCOUNT_0),
            chainId: CHAIN_ID,
            walletType: 'embedded',
            [field]: 'leaked',
          }),
      ).toThrow();
    }
  });

  it('stores public metadata only, and serves only that', () => {
    const account = new WalletAccountModel({
      accountId: accountCaip10(CHAIN_ID, PHRASE_ACCOUNT_0),
      address: normalizeAddress(PHRASE_ACCOUNT_0),
      chainId: CHAIN_ID,
      walletType: 'embedded',
      providerType: 'embedded',
      derivationPath: accountPath(0),
    });

    expect(account.validateSync()).toBeUndefined();
    const paths = Object.keys(WalletAccountModel.schema.paths);
    const served = Object.keys(WalletAccountDto.select.get());
    for (const field of FORBIDDEN_FIELDS) {
      expect(paths).not.toContain(field);
      expect(served).not.toContain(field);
    }
    expect(paths).toContain('derivationPath');
  });

  it('sends no key material to the server on sign-in', async () => {
    const signer = HDNodeWallet.fromPhrase(PHRASE, undefined, accountPath(0));
    const options = { host: 'cyberiaonline.com', path: '/' };
    const challenge = await WalletAccountService.post(
      { path: '/challenge', body: { address: signer.address, chainId: CHAIN_ID } },
      {},
      options,
    );
    // Exactly the body `WalletView.signIn` sends.
    const body = {
      message: challenge.message,
      signature: signer.signMessageSync(challenge.message),
      walletType: 'embedded',
      providerType: 'embedded',
      derivationPath: accountPath(0),
    };

    const sent = JSON.stringify(body);
    for (const secret of [PHRASE, signer.privateKey, 'passphrase']) expect(sent).not.toContain(secret);
    expect(Object.keys(body).sort()).toEqual(['derivationPath', 'message', 'providerType', 'signature', 'walletType']);
  });

  it('names no secret field anywhere on the sign-in path', () => {
    const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
    const secretField = /\b(mnemonic|privateKey|passphrase|seed|recoveryPhrase)\b\s*[:=]/;

    for (const path of [
      'src/client/services/wallet-account/wallet-account.service.js',
      'src/api/wallet-account/wallet-account.service.js',
      'src/api/wallet-account/wallet-account.model.js',
      'src/server/security/siwe.js',
      'src/server/security/typed-data.js',
    ]) {
      expect(source(path)).not.toMatch(secretField);
    }

    // The UI reads a passphrase and a phrase, and hands both to the vault only.
    const ui = source('src/client/components/wallet/WalletView.js');
    expect(/WalletAccountService\.signIn\(\{[\s\S]*?\n {4}\}\);/.exec(ui)[0]).not.toMatch(secretField);
    // CSS selectors such as `.wallet-mnemonic:empty` name a class, not a field.
    for (const line of ui.split('\n').filter((text) => !/^\s*\.[\w-]/.test(text))) {
      if (secretField.test(line)) expect(line).toMatch(/EmbeddedWallet\.|s\(`\.wallet-|const |htmls\(/);
    }
  });
});

describe('identity independence', () => {
  const vectors = JSON.parse(
    readFileSync(new URL('../../support/object-layer-identity-vectors.json', import.meta.url)),
  );

  it('derives content identity without any account', () => {
    const definition = {
      profile: { id: 'cyberia', version: 2 },
      data: { item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 5 } },
    };
    const owned = { ...definition, data: { ...definition.data, owner: PHRASE_ACCOUNT_0, ledger: { tokenId: '42' } } };

    expect(objectLayerIdentity(owned).cid).toBe(objectLayerIdentity(definition).cid);
  });

  it('keeps an account id and a content id apart', () => {
    const accountId = accountCaip10(CHAIN_ID, PHRASE_ACCOUNT_0);
    for (const vector of vectors.definitions) {
      expect(vector.cid).not.toBe(accountId);
      expect(parseCaip10(vector.cid)).toBeNull();
      expect(vector.cid.startsWith('bafkrei')).toBe(true);
    }
    expect(parseCaip10(accountId)).not.toBeNull();
  });
});
