import { EmbeddedWallet } from './EmbeddedWallet.js';
import { WALLET_CAPABILITIES, caip10, discoverExternalWallets, hasCapability } from './WalletProvider.js';
import { WalletAccountService } from '../../services/wallet-account/wallet-account.service.js';
import { Auth } from '../core/Auth.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId } from '../core/CommonJs.js';
import { dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { copyData, htmls, s } from '../core/VanillaJs.js';

// The wallet view: pick a browser wallet or the embedded one, sign in with SIWE, and manage
// the local vault. The key never leaves the browser; the server sees an address and a
// signature.
class WalletView {
  static Data = {};
  /** The provider the user selected. */
  static provider = null;

  /** Signs in with SIWE and opens a normal session. */
  static async signIn(provider) {
    const address = await provider.getAddress();
    const chainId = await provider.getChainId();
    const { status, data } = await WalletAccountService.challenge({ body: { address, chainId } });
    if (status !== 'success') throw new Error('The server issued no sign-in challenge');

    const signature = await provider.signMessage(data.message);
    const result = await WalletAccountService.signIn({
      body: {
        message: data.message,
        signature,
        walletType: provider.type,
        providerType: provider.id,
        derivationPath: provider.type === 'embedded' ? (await EmbeddedWallet.account())?.path : '',
      },
    });
    if (result.status !== 'success') throw new Error(result.message || 'Sign-in failed');
    if (result.data.session) Auth.setToken(result.data.session.token);
    return { account: result.data.account, session: result.data.session, accountId: caip10(chainId, address) };
  }

  static async instance(options) {
    const id = getId(WalletView.Data, 'wallet-');
    const stored = await EmbeddedWallet.account().catch(() => null);
    const external = await discoverExternalWallets().catch(() => []);

    setTimeout(async () => {
      const report = (html, status) => NotificationManager.Push({ html, status });
      const use = async (provider) => {
        WalletView.provider = provider;
        htmls(`.wallet-${id}-address`, await provider.getAddress());
      };

      for (const provider of external) {
        EventsUI.onClick(`.btn-wallet-${id}-${provider.id.replace(/\W/g, '-')}`, async () => {
          try {
            await use(provider);
            const { accountId } = await WalletView.signIn(provider);
            report(`Signed in as ${accountId}`, 'success');
          } catch (error) {
            report(error.message, 'error');
          }
        });
      }

      EventsUI.onClick(`.btn-wallet-${id}-create`, async () => {
        const passphrase = s(`.wallet-${id}-passphrase`)?.value;
        if (!passphrase) return report('A passphrase is required to encrypt the wallet', 'warning');
        const created = EmbeddedWallet.create();
        await EmbeddedWallet.save({ mnemonic: created.mnemonic, passphrase });
        htmls(`.wallet-${id}-mnemonic`, created.mnemonic);
        htmls(`.wallet-${id}-address`, created.address);
        report('Write down the recovery phrase: it is the only way back', 'warning');
      });

      EventsUI.onClick(`.btn-wallet-${id}-restore`, async () => {
        const mnemonic = s(`.wallet-${id}-mnemonic-input`)?.value?.trim();
        const passphrase = s(`.wallet-${id}-passphrase`)?.value;
        try {
          const { address } = await EmbeddedWallet.save({ mnemonic, passphrase });
          htmls(`.wallet-${id}-address`, address);
          report('Wallet restored in this browser', 'success');
        } catch (error) {
          report(error.message, 'error');
        }
      });

      EventsUI.onClick(`.btn-wallet-${id}-unlock`, async () => {
        try {
          const address = await EmbeddedWallet.unlock({ passphrase: s(`.wallet-${id}-passphrase`)?.value });
          await use(EmbeddedWallet.provider({ chainId: Number(s(`.wallet-${id}-chain`)?.value || 0) }));
          htmls(`.wallet-${id}-address`, address);
          report('Wallet unlocked', 'success');
        } catch (error) {
          report(error.message, 'error');
        }
      });

      EventsUI.onClick(`.btn-wallet-${id}-lock`, async () => {
        EmbeddedWallet.lock();
        report('Wallet locked', 'success');
      });

      EventsUI.onClick(`.btn-wallet-${id}-sign-in`, async () => {
        if (!WalletView.provider) return report('Select or unlock a wallet first', 'warning');
        try {
          const { accountId, session } = await WalletView.signIn(WalletView.provider);
          report(
            session ? `Signed in as ${accountId}` : `Address proven: ${accountId}. No account is bound to it yet.`,
            'success',
          );
        } catch (error) {
          report(error.message, 'error');
        }
      });

      EventsUI.onClick(`.btn-wallet-${id}-export`, async () => {
        if (!hasCapability(WalletView.provider, WALLET_CAPABILITIES.export))
          return report('This wallet exports nothing', 'warning');
        await copyData(await EmbeddedWallet.exportKeystore());
        report('Encrypted keystore copied', 'success');
      });
    });

    return html`
      <style>
        /* An address or a recovery phrase never fits a column: it wraps, it does not overflow. */
        .wallet-view .wallet-address,
        .wallet-view .wallet-mnemonic {
          white-space: pre-wrap;
          word-break: break-all;
          user-select: all;
        }
        .wallet-view .wallet-mnemonic:empty {
          display: none;
        }
      </style>
      ${dynamicCol({ containerSelector: options.idModal, id: `wallet-${id}` })}
      <div class="fl wallet-view">
        <div class="in fll wallet-${id}-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fas fa-wallet"></i> ${Translate.instance('wallet')}</div>
            <div class="in section-mp m">
              Your wallet is your identity across the platform. Sign-in follows
              <a href="https://eips.ethereum.org/EIPS/eip-4361">ERC-4361</a>; browser wallets are discovered with
              <a href="https://eips.ethereum.org/EIPS/eip-6963">EIP-6963</a>. Signing keys never reach the server.
            </div>
            ${
              external.length === 0
                ? html`<div class="in section-mp m">No browser wallet announced itself.</div>`
                : (
                    await Promise.all(
                      external.map((provider) =>
                        BtnIcon.instance({
                          class: `inl section-mp btn-custom btn-wallet-${id}-${provider.id.replace(/\W/g, '-')}`,
                          label: html`<i class="fa-solid fa-plug"></i> ${provider.name}`,
                        }),
                      ),
                    )
                  ).join('')
            }
          </div>
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fas fa-key"></i> ${Translate.instance('embedded-wallet')}</div>
            <div class="in section-mp m">
              Generated here and stored encrypted in this browser. It protects the key at rest, not against a
              compromised page or extension: for high value, use a hardware wallet.
              ${stored ? html`<br />Stored account: <b>${stored.address}</b> (${stored.path})` : ''}
            </div>
            ${await Input.instance({
              id: `wallet-${id}-passphrase`,
              label: html`Passphrase`,
              containerClass: 'inl',
              type: 'password',
              placeholder: true,
            })}
            ${await Input.instance({
              id: `wallet-${id}-mnemonic-input`,
              label: html`Recovery phrase`,
              containerClass: 'inl',
              type: 'text',
              placeholder: true,
            })}
            ${await Input.instance({
              id: `wallet-${id}-chain`,
              label: html`Chain ID`,
              containerClass: 'inl',
              type: 'number',
              placeholder: true,
            })}
            <div class="in">
              ${await BtnIcon.instance({
                class: `inl section-mp btn-custom btn-wallet-${id}-create`,
                label: html`<i class="fa-solid fa-plus"></i> ${Translate.instance('create')}`,
              })}
              ${await BtnIcon.instance({
                class: `inl section-mp btn-custom btn-wallet-${id}-restore`,
                label: html`<i class="fa-solid fa-arrow-rotate-left"></i> ${Translate.instance('restore')}`,
              })}
              ${await BtnIcon.instance({
                class: `inl section-mp btn-custom btn-wallet-${id}-unlock`,
                label: html`<i class="fa-solid fa-lock-open"></i> ${Translate.instance('unlock')}`,
              })}
              ${await BtnIcon.instance({
                class: `inl section-mp btn-custom btn-wallet-${id}-lock`,
                label: html`<i class="fa-solid fa-lock"></i> ${Translate.instance('lock')}`,
              })}
              ${await BtnIcon.instance({
                class: `inl section-mp btn-custom btn-wallet-${id}-export`,
                label: html`<i class="fas fa-copy"></i> ${Translate.instance('export')}`,
              })}
            </div>
          </div>
        </div>
        <div class="in fll wallet-${id}-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-id-card"></i> ${Translate.instance('account')}</div>
            <div class="in section-mp m">Address: <span class="wallet-address wallet-${id}-address">—</span></div>
            <pre class="in section-mp m wallet-mnemonic wallet-${id}-mnemonic"></pre>
            ${await BtnIcon.instance({
              class: `inl section-mp btn-custom btn-wallet-${id}-sign-in`,
              label: html`<i class="fa-solid fa-right-to-bracket"></i> ${Translate.instance('sign-in')}`,
            })}
          </div>
        </div>
      </div>
    `;
  }
}
export { WalletView };
