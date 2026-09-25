// Domain-neutral wallet abstraction. Every domain — objectlayer.org, itemledger.com,
// cryptokoyn.net, cyberiaonline.com — consumes the same interface: the wallet is user
// identity, not one domain's currency logic.
//
// A provider answers a capability set, so a caller asks what it may do instead of testing
// which vendor is behind it. External wallets speak EIP-1193 and are discovered with EIP-6963;
// an embedded wallet implements the same interface over a local key.

/** What a provider can do. A caller checks the capability, never the vendor. */
export const WALLET_CAPABILITIES = Object.freeze({
  signMessage: 'signMessage',
  signTypedData: 'signTypedData',
  sendTransaction: 'sendTransaction',
  export: 'export',
  lock: 'lock',
});

/** How a provider holds the key. */
export const WALLET_TYPES = Object.freeze({
  external: 'external',
  embedded: 'embedded',
  contract: 'contract',
});

/**
 * @typedef {Object} WalletProvider
 * @property {string} id - Stable provider id (EIP-6963 rdns, or `embedded`).
 * @property {string} name - Display name.
 * @property {string} type - One of {@link WALLET_TYPES}.
 * @property {string} [icon] - Data URI of the provider icon.
 * @property {ReadonlyArray<string>} capabilities - Subset of {@link WALLET_CAPABILITIES}.
 * @property {() => Promise<string>} getAddress - Checksummed address of the active account.
 * @property {() => Promise<number>} getChainId - EIP-155 chain id.
 * @property {(message: string) => Promise<string>} signMessage - EIP-191 personal signature.
 * @property {(typedData: Object) => Promise<string>} [signTypedData] - EIP-712 signature.
 * @property {(transaction: Object) => Promise<string>} [sendTransaction] - Transaction hash.
 */

/** A provider holds this capability. */
export const hasCapability = (provider, capability) => !!provider?.capabilities?.includes(capability);

/** CAIP-2 chain id of an EIP-155 chain. */
export const caip2 = (chainId) => `eip155:${Number(chainId)}`;

/** CAIP-10 account id: one address on one chain. */
export const caip10 = (chainId, address) => `${caip2(chainId)}:${String(address).toLowerCase()}`;

/**
 * Parses a CAIP-10 account id.
 * @param {string} accountId
 * @returns {{namespace:string,chainId:number,address:string}|null}
 */
export const parseCaip10 = (accountId) => {
  const match = /^(eip155):(\d+):(0x[0-9a-fA-F]{40})$/.exec(String(accountId ?? ''));
  return match ? { namespace: match[1], chainId: Number(match[2]), address: match[3].toLowerCase() } : null;
};

/**
 * Wraps an EIP-1193 provider as a {@link WalletProvider}. Cyberia never sees the key: every
 * signature is a request to the wallet.
 *
 * @param {Object} params
 * @param {Object} params.provider - EIP-1193 provider (`request({ method, params })`).
 * @param {Object} [params.info] - EIP-6963 provider info (`rdns`, `name`, `icon`).
 * @returns {WalletProvider}
 */
export function externalWalletProvider({ provider, info = {} }) {
  const request = (method, params = []) => provider.request({ method, params });
  const accounts = async () => {
    const found = await request('eth_requestAccounts');
    if (!found?.length) throw new Error('The wallet returned no account');
    return found;
  };
  return {
    id: info.rdns || 'eip1193',
    name: info.name || 'Browser wallet',
    type: WALLET_TYPES.external,
    icon: info.icon,
    capabilities: Object.freeze([
      WALLET_CAPABILITIES.signMessage,
      WALLET_CAPABILITIES.signTypedData,
      WALLET_CAPABILITIES.sendTransaction,
    ]),
    getAddress: async () => (await accounts())[0],
    getChainId: async () => Number(await request('eth_chainId')),
    signMessage: async (message) => await request('personal_sign', [message, (await accounts())[0]]),
    signTypedData: async (typedData) =>
      await request('eth_signTypedData_v4', [(await accounts())[0], JSON.stringify(typedData)]),
    sendTransaction: async (transaction) => await request('eth_sendTransaction', [transaction]),
  };
}

/**
 * Discovers injected wallets with EIP-6963, and falls back to a single `window.ethereum`
 * provider for a browser that announces none.
 *
 * @param {Object} [params]
 * @param {Object} [params.target=globalThis] - Event target, for tests.
 * @param {number} [params.timeoutMs=300] - How long announcements are collected.
 * @returns {Promise<WalletProvider[]>} One entry per announced provider.
 */
export function discoverExternalWallets({ target = globalThis, timeoutMs = 300 } = {}) {
  return new Promise((resolve) => {
    const found = new Map();
    const onAnnounce = (event) => {
      const { info, provider } = event.detail ?? {};
      if (info?.rdns && provider && !found.has(info.rdns))
        found.set(info.rdns, externalWalletProvider({ provider, info }));
    };
    target.addEventListener?.('eip6963:announceProvider', onAnnounce);
    target.dispatchEvent?.(new CustomEvent('eip6963:requestProvider'));
    setTimeout(() => {
      target.removeEventListener?.('eip6963:announceProvider', onAnnounce);
      if (found.size === 0 && target.ethereum) {
        found.set('injected', externalWalletProvider({ provider: target.ethereum, info: { rdns: 'injected' } }));
      }
      resolve([...found.values()]);
    }, timeoutMs);
  });
}
