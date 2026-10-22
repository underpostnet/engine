/**
 * The market editor of the Cyberia Studio: the shared market profiles terminals open.
 *
 * A profile holds the contract of a market: its scope, the listing modes and durations it supports,
 * the auction rules, the fees and the limits. A terminal (an action) names a profile and says what a
 * seller lists there; the action editor edits that. A save names the revision it read, so a newer
 * save is never overwritten. The live markets a profile resolves to, with their listings and claims,
 * are read-only here: an edit never rewrites or removes a listing.
 *
 * @module src/client/components/cyberia/MarketEngineCyberia.js
 */
import { commonModeratorGuard } from '../core/CommonJs.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { ListPager } from '../core/ListPager.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getQueryParams, listenQueryParamsChange, setQueryParams, unlistenQueryParamsChange } from '../core/Router.js';
import { Tabs } from '../core/Tabs.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { CyberiaMarketService } from '../../services/cyberia-market/cyberia-market.service.js';
import { CONTENT_CODE_PATTERN } from './SharedDefaultsCyberia.js';
import { STUDIO_FORM_STYLE, choiceField, dirtyNotice, numberField, toggleField } from './StudioFormCyberia.js';
import { StudioCyberia } from './StudioCyberia.js';

/** The integer rule blocks a profile form edits, in the order it shows them. */
const BLOCKS = Object.freeze([
  {
    id: 'auction',
    title: 'Auction rules',
    note: 'A bid raises the highest bid by the percent, by the coins at least.',
  },
  { id: 'fees', title: 'Fees', note: 'A listing pays its fee once; a sale pays its fee from the proceeds.' },
  { id: 'limits', title: 'Limits', note: 'The price range of a listing and the open listings of one player.' },
]);

const MODE_LABELS = Object.freeze({ fixed: 'Fixed price', auction: 'Auction' });

const SCOPE_OPTIONS = Object.freeze([
  { value: 'universe', label: 'Universe', hint: 'The worlds of one universe share one market.' },
  { value: 'instance', label: 'World', hint: 'Each world keeps a market of its own.' },
]);

const STATUS_OPTIONS = Object.freeze([
  { value: 'active', label: 'Active', hint: 'Takes new listings.' },
  { value: 'retired', label: 'Retired', hint: 'No new listing; listed goods run to their end and settle.' },
]);

/** The hint of the chosen option. */
const hintOf = (options, value) => options.find((option) => option.value === value)?.hint ?? '';

const blankProfile = ({ defaults }) => ({
  code: '',
  name: '',
  description: '',
  status: 'active',
  scope: defaults.scope,
  currencyCode: defaults.currencyCode,
  modes: [...defaults.modes],
  hours: [...defaults.hours],
  auction: { ...defaults.auction },
  fees: { ...defaults.fees },
  limits: { ...defaults.limits },
});

const profileKey = ({ name, description, status, scope, currencyCode, modes, hours, auction, fees, limits }) =>
  JSON.stringify({ name, description, status, scope, currencyCode, modes, hours, auction, fees, limits });

/** What a profile breaks before it reaches the server: each one a sentence, or none. */
const problemsOf = (draft) => [
  ...(draft.modes.length === 0 ? ['Choose at least one listing mode.'] : []),
  ...(draft.hours.length === 0 ? ['Choose at least one duration.'] : []),
  ...(draft.limits.priceMin > draft.limits.priceMax ? ['The lowest price is above the highest price.'] : []),
  ...(draft.fees.sale > draft.limits.priceMin
    ? ['The sale fee is above the lowest price: a sale would leave the seller with less than nothing.']
    : []),
];

class MarketEngineCyberia {
  static async render({ appStore }) {
    const canMutate = commonModeratorGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest');
    const libraryId = 'market-engine-library';
    const disabled = canMutate ? '' : 'disabled';

    const state = { contract: null, id: null, revision: 1, draft: null, saved: '', view: null, crud: null, load: 0 };

    const checks = (block, values, options, labelOf) =>
      options
        .map((value) =>
          toggleField({
            block,
            value: String(value),
            label: labelOf(value),
            checked: values.includes(value),
            disabled,
          }),
        )
        .join('');

    const renderProfile = () => {
      const { contract, draft } = state;
      if (!contract || !draft) return;
      const problems = problemsOf(draft);
      const { listings = 0, claims = 0 } = state.view?.held ?? {};
      const locked =
        listings + claims > 0
          ? `Scope and currency stay while ${listings} open listings and ${claims} owed claims hold goods in this market.`
          : '';
      htmls(
        '.market-engine-profile',
        html`<div class="studio-form-card">
            <h4>Identity</h4>
            <div class="studio-form-grid">
              <label class="studio-form-field"
                ><span>Code</span>
                <input class="market-engine-code" value="${escapeHtml(draft.code)}" ${state.id ? 'disabled' : disabled}
              /></label>
              <label class="studio-form-field"
                ><span>Name</span> <input data-key="name" value="${escapeHtml(draft.name)}" ${disabled}
              /></label>
              ${choiceField({
                key: 'status',
                label: 'Status',
                value: draft.status,
                options: STATUS_OPTIONS,
                hint: hintOf(STATUS_OPTIONS, draft.status),
                disabled,
              })}
            </div>
            <label class="studio-form-field"
              ><span>Description</span>
              <input data-key="description" value="${escapeHtml(draft.description)}" ${disabled}
            /></label>
          </div>
          <div class="studio-form-card">
            <h4>Sharing</h4>
            <div class="studio-form-hint">
              Terminals that name this code share one market per world or per universe. A market of another universe, or
              of another deployment, never shares listings with it.
            </div>
            <div class="studio-form-grid">
              ${choiceField({
                key: 'scope',
                label: 'Scope',
                value: draft.scope,
                options: SCOPE_OPTIONS,
                hint: hintOf(SCOPE_OPTIONS, draft.scope),
                disabled: locked ? 'disabled' : disabled,
              })}
              ${choiceField({
                key: 'currencyCode',
                label: 'Currency',
                value: draft.currencyCode,
                options: contract.currencyCodes.map((code) => ({ value: code, label: code })),
                hint: 'The worlds of its terminals must pay in this currency.',
                disabled: locked ? 'disabled' : disabled,
              })}
            </div>
            ${locked ? html`<div class="studio-form-hint"><i class="fa-solid fa-lock" aria-hidden="true"></i> ${locked}</div>` : ''}
          </div>
          <div class="studio-form-card">
            <h4>Listing modes</h4>
            <div class="studio-form-hint">A terminal lists only in the modes its market supports.</div>
            <div class="studio-form-row">
              ${checks('modes', draft.modes, contract.modes, (mode) => MODE_LABELS[mode])}
            </div>
            <h4 style="margin-top: 8px;">Durations</h4>
            <div class="studio-form-hint">A seller picks one of them for each listing.</div>
            <div class="studio-form-row">${checks('hours', draft.hours, contract.hours, (hours) => `${hours} h`)}</div>
          </div>
          ${BLOCKS.map(
            ({ id, title, note }) =>
              html`<div class="studio-form-card">
                <h4>${title}</h4>
                <div class="studio-form-hint">${note}</div>
                <div class="studio-form-grid">
                  ${Object.entries(contract.limits[id])
                    .map(([key, bounds]) =>
                      numberField({
                        block: id,
                        key,
                        value: draft[id][key],
                        bounds,
                        fallback: contract.defaults[id][key],
                        disabled,
                      }),
                    )
                    .join('')}
                </div>
              </div>`,
          ).join('')}
          ${
            problems.length > 0
              ? html`<div class="studio-form-card" role="alert">
                  ${problems.map((problem) => html`<div class="studio-form-dirty">${escapeHtml(problem)}</div>`).join('')}
                </div>`
              : ''
          }`,
      );
      for (const input of document.querySelectorAll(
        '.market-engine-profile [data-key], .market-engine-profile [data-block]',
      ))
        input.addEventListener('change', () => {
          state.draft = readProfile();
          renderProfile();
          renderDirty();
        });
    };

    /** The profile the form holds now. */
    const readProfile = () => {
      const draft = structuredClone(state.draft);
      draft.code = s('.market-engine-code')?.value?.trim() ?? draft.code;
      for (const input of document.querySelectorAll('.market-engine-profile [data-key]')) {
        const { block, key } = input.dataset;
        const value = input.type === 'number' ? Number(input.value) : input.value;
        if (block) draft[block][key] = value;
        else draft[key] = value;
      }
      for (const block of ['modes', 'hours']) {
        const boxes = [...document.querySelectorAll(`.market-engine-profile input[data-block="${block}"]`)];
        if (boxes.length === 0) continue;
        draft[block] = boxes
          .filter((box) => box.checked)
          .map((box) => (block === 'hours' ? Number(box.value) : box.value));
      }
      return draft;
    };

    const dirty = () => !!state.draft && profileKey(readProfile()) !== state.saved;
    const renderDirty = () => htmls('.market-engine-dirty-slot', dirtyNotice(dirty()));

    const openAction = (actionCode) => StudioCyberia.open('cyberia-action-engine', { actionCode });

    const renderReferences = () => {
      const view = state.view;
      if (!view) {
        htmls(
          '.market-engine-references',
          html`<div class="studio-form-card">Save the profile to see the terminals that open it.</div>`,
        );
        return;
      }
      const terminals = view.terminals
        .map(
          (terminal) =>
            html`<div class="studio-form-row studio-form-card">
              <span class="studio-form-mono" style="flex: 1 1 10rem;">${escapeHtml(terminal.code)}</span>
              <span style="flex: 2 1 12rem;">
                ${escapeHtml(terminal.label)} · ${escapeHtml(terminal.worlds.join(', ') || 'no world')} ·
                ${
                  terminal.selection === 'policy'
                    ? 'lists what the economy allows'
                    : `lists ${escapeHtml(terminal.itemIds.join(', ') || 'no item')}`
                }
                · ${escapeHtml(terminal.listingModes.map((mode) => MODE_LABELS[mode]).join(', ') || 'no listing')}
              </span>
              <button type="button" class="market-engine-open-action" data-code="${escapeHtml(terminal.code)}">
                <i class="fa-solid fa-pen" aria-hidden="true"></i> Open in the action editor
              </button>
            </div>`,
        )
        .join('');
      const markets = view.markets
        .map(
          (market) =>
            html`<div class="studio-form-card">
              <div class="studio-form-mono">${escapeHtml(market.ref)}</div>
              <div class="studio-form-row" style="margin-top: 4px;">
                <span class="studio-form-chip">${market.open} open</span>
                <span class="studio-form-chip">${market.auctions} auctions</span>
                <span class="studio-form-chip ${market.unsettled ? 'studio-form-bad' : ''}"
                  >${market.unsettled} ended, settling</span
                >
                <span class="studio-form-chip">${market.pendingClaims} claims owed</span>
              </div>
              <div class="studio-form-hint">
                Worlds ${escapeHtml(market.worlds.join(', '))} · terminals ${escapeHtml(market.terminals.join(', '))}
              </div>
            </div>`,
        )
        .join('');
      htmls(
        '.market-engine-references',
        html`<div class="studio-form-card">
            <h4>Terminals that open it</h4>
            ${terminals || html`<div>No terminal opens this market. Name it in the market capability of an action.</div>`}
          </div>
          <div class="studio-form-card">
            <h4>Live markets</h4>
            <div class="studio-form-hint">
              What the market holds now, read only. An edit of the profile never changes a listing: each listing keeps
              the terms it was listed under.
            </div>
            ${markets || html`<div>No world opens this market yet.</div>`}
            ${
              canMutate && view.markets.length > 0
                ? html`<div class="studio-form-row" style="margin-top: 6px;">
                    <button type="button" class="market-engine-reload">
                      <i class="fa-solid fa-rotate" aria-hidden="true"></i> Reload running worlds
                    </button>
                    <span class="studio-form-hint">Running worlds take a new revision at their next reload.</span>
                  </div>`
                : ''
            }
          </div>
          ${
            view.defects.length > 0
              ? html`<div class="studio-form-card" role="alert">
                  <h4>Defects</h4>
                  ${view.defects.map((defect) => html`<div class="studio-form-dirty">${escapeHtml(defect)}</div>`).join('')}
                </div>`
              : ''
          }
          <div class="studio-form-card">
            Reference: <span class="studio-form-mono">${escapeHtml(view.market.code)}@${view.market.revision}</span>
          </div>`,
      );
      for (const button of document.querySelectorAll('.market-engine-open-action'))
        button.onclick = () => openAction(button.dataset.code);
      if (s('.market-engine-reload'))
        s('.market-engine-reload').onclick = async () => {
          const { status, data, message } = await CyberiaMarketService.reload({ code: state.id });
          const reloaded = (data?.endpoints ?? []).filter((endpoint) => !endpoint.error).length;
          NotificationManager.Push({
            html: status === 'success' ? `${reloaded} running worlds reloaded` : message,
            status: status === 'success' ? (reloaded > 0 ? 'success' : 'warning') : 'error',
          });
        };
    };

    const refreshView = async () => {
      if (!state.id) {
        state.view = null;
        return renderReferences();
      }
      const request = state.load;
      const { status, data } = await CyberiaMarketService.view({ code: state.id });
      if (request !== state.load) return;
      state.view = status === 'success' ? data : null;
      renderProfile();
      renderReferences();
    };

    const load = async (market) => {
      state.load++;
      state.id = market?.code ?? null;
      state.revision = market?.revision ?? 1;
      state.draft = market
        ? {
            code: market.code,
            name: market.name ?? '',
            description: market.description ?? '',
            status: market.status ?? 'active',
            scope: market.scope,
            currencyCode: market.currencyCode,
            modes: [...market.modes],
            hours: [...market.hours],
            auction: { ...state.contract.defaults.auction, ...market.auction },
            fees: { ...state.contract.defaults.fees, ...market.fees },
            limits: { ...state.contract.defaults.limits, ...market.limits },
          }
        : blankProfile(state.contract);
      state.saved = profileKey(state.draft);
      setQueryParams({ marketCode: market?.code ?? null }, { replace: true });
      state.crud?.refresh();
      renderProfile();
      renderDirty();
      await refreshView();
    };

    const loadByCode = async (code) => {
      if (!code || code === state.id) return;
      const request = ++state.load;
      const { status, data } = await CyberiaMarketService.get({ id: code });
      if (request !== state.load) return;
      if (status !== 'success' || !data?.code) {
        NotificationManager.Push({ html: `No market answers to the code "${escapeHtml(code)}"`, status: 'error' });
        return;
      }
      await load(data);
    };

    const save = async () => {
      const body = readProfile();
      if (!CONTENT_CODE_PATTERN.test(body.code)) {
        NotificationManager.Push({
          html: 'The code takes letters, digits, dots, dashes and underscores.',
          status: 'error',
        });
        return;
      }
      const problems = problemsOf(body);
      if (problems.length > 0) {
        NotificationManager.Push({ html: escapeHtml(problems[0]), status: 'error' });
        return;
      }
      if (state.id) body.revision = state.revision;
      const result = await EditorCrud.save(CyberiaMarketService, { id: state.id, body });
      if (result.status === 'success') {
        await load(result.data);
        await ListPager.load(libraryId);
      } else if (/reload it/.test(result.message ?? ''))
        NotificationManager.Push({
          html: 'Another editor saved this market first. Your changes stay here: Reset loads the newer one.',
          status: 'warning',
        });
    };

    /** Copies the loaded profile under the first free code. */
    const clone = async () => {
      for (let n = 1; n < 100; n++) {
        const code = `${state.id}-copy${n > 1 ? `-${n}` : ''}`;
        const taken = await CyberiaMarketService.get({ id: code });
        if (taken.status === 'success' && taken.data) continue;
        const result = await CyberiaMarketService.clone({
          code: state.id,
          body: { code, name: `${state.draft.name || state.id} copy` },
        });
        EditorCrud.notify(result, 'success-create-item');
        if (result.status === 'success') {
          await load(result.data);
          await ListPager.load(libraryId);
        }
        return;
      }
    };

    const onQuery = async (queryParams) => {
      if (!s('.market-engine-container') || !state.contract) return;
      if (queryParams.marketCode) await loadByCode(queryParams.marketCode);
    };
    listenQueryParamsChange({ id: 'cyberia-market-engine-query-listener', event: onQuery });

    setTimeout(async () => {
      const root = s('.market-engine-container');
      if (!root) return unlistenQueryParamsChange('cyberia-market-engine-query-listener', onQuery);
      const { status, data } = await CyberiaMarketService.contract();
      if (status !== 'success') {
        htmls('.market-engine-profile', html`<div class="studio-form-card">The market contract is unavailable.</div>`);
        return;
      }
      state.contract = data;
      EditorLayout.pin(root, 'market-engine');
      Tabs.bind(s('.market-engine-tabs'));
      state.crud = EditorCrud.bind(s('.market-engine-crud'), () => ({
        subject: 'market',
        id: state.id,
        name: state.draft?.code,
        new: () => load(null),
        reset: async () => {
          const { status, data, message } = await CyberiaMarketService.get({ id: state.id });
          if (status === 'success' && data) await load(data);
          else NotificationManager.Push({ html: message, status: 'error' });
        },
        ...(canMutate && {
          save,
          clone,
          delete: async () => {
            const result = await EditorCrud.remove(CyberiaMarketService, {
              id: state.id,
              subject: 'market',
              name: state.id,
            });
            if (result?.status === 'success') {
              await load(null);
              await ListPager.load(libraryId);
            }
          },
        }),
      }));
      await ListPager.load(libraryId);
      const code = getQueryParams().marketCode;
      await load(null);
      if (code) await loadByCode(code);
    });

    const libraryHtml = await ListPager.instance({
      id: libraryId,
      limit: 10,
      unit: 'markets',
      fetch: async ({ page, limit }) => {
        const result = await CyberiaMarketService.get({ page, limit, sort: 'code', order: 'asc' });
        return result?.status === 'success' ? result.data : null;
      },
      render: (rows) => {
        htmls(
          `.${libraryId}-rows`,
          rows.length === 0
            ? html`<div class="studio-form-card">No market yet.</div>`
            : rows
                .map(
                  (market) =>
                    html`<div class="studio-form-row studio-form-card">
                      <span class="studio-form-mono" style="flex: 1 1 8rem;">${escapeHtml(market.code)}</span>
                      <span style="flex: 2 1 8rem;">${escapeHtml(market.name || '')}</span>
                      <span class="studio-form-chip">${escapeHtml(market.scope)}</span>
                      <span class="studio-form-chip ${market.status === 'active' ? '' : 'studio-form-bad'}"
                        >${escapeHtml(market.status)}</span
                      >
                      <span class="studio-form-chip">revision ${market.revision}</span>
                      <button type="button" class="market-engine-library-open" data-code="${escapeHtml(market.code)}">
                        <i class="fa-solid fa-upload" aria-hidden="true"></i> Open
                      </button>
                    </div>`,
                )
                .join(''),
        );
        for (const button of document.querySelectorAll('.market-engine-library-open'))
          button.onclick = async () => {
            await loadByCode(button.dataset.code);
            Tabs.select(s('.market-engine-tabs'), 'profile');
          };
      },
    });

    return html`<style>
        ${STUDIO_FORM_STYLE}
      </style>
      <div class="in section-mp studio-editor studio-form market-engine-container">
        ${EditorCrud.render({ id: 'market-engine-crud', label: 'Market' })}
        <div class="market-engine-dirty-slot"></div>
        ${Tabs.render({
          id: 'market-engine-tabs',
          label: 'Market tools',
          selected: 'profile',
          tabs: [
            {
              id: 'profile',
              label: 'Profile',
              icon: 'fa-solid fa-store',
              content: html`<div class="market-engine-profile">Loading the market contract…</div>`,
            },
            {
              id: 'references',
              label: 'Terminals and live markets',
              icon: 'fa-solid fa-diagram-project',
              content: html`<div class="market-engine-references"></div>`,
            },
            {
              id: 'library',
              label: 'Library',
              icon: 'fa-solid fa-folder-open',
              content: html`<div class="${libraryId}-rows" style="display: grid; gap: 6px;"></div>
                ${libraryHtml}`,
            },
          ],
        })}
      </div>`;
  }
}

export { MarketEngineCyberia };
