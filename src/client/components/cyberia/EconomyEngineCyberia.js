/**
 * The economy editor of the Cyberia Studio: the economy profiles worlds run, and the policy of each
 * item in a profile.
 *
 * A profile holds the wallet currency, the coin rules, the operation fees and the item defaults; an
 * item row overrides the defaults for one item. A save names the revision it read, so a newer save
 * is never overwritten. The worlds that name a profile and the wallet of each of their universes are
 * read-only here: the server refuses a wallet change that would split a shared wallet.
 *
 * @module src/client/components/cyberia/EconomyEngineCyberia.js
 */
import { commonModeratorGuard } from '../core/CommonJs.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { ListPager } from '../core/ListPager.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getQueryParams, listenQueryParamsChange, setQueryParams, unlistenQueryParamsChange } from '../core/Router.js';
import { Tabs } from '../core/Tabs.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { CyberiaEconomyService } from '../../services/cyberia-economy/cyberia-economy.service.js';
import { CyberiaEconomicItemPolicyService } from '../../services/cyberia-economic-item-policy/cyberia-economic-item-policy.service.js';
import { CyberiaItemCatalogService } from '../../services/cyberia-item-catalog/cyberia-item-catalog.service.js';
import { InstanceEngineCyberia } from './InstanceEngineCyberia.js';
import { CONTENT_CODE_PATTERN } from './SharedDefaultsCyberia.js';
import { STUDIO_FORM_STYLE, dirtyNotice, flagField, labelOf, numberField } from './StudioFormCyberia.js';

/** The profile blocks a form edits, in the order it shows them. */
const BLOCKS = Object.freeze([
  { id: 'fees', title: 'Operation fees', note: 'Coins an operation that succeeds charges once.' },
  { id: 'rules', title: 'Coin rules', note: 'Coins worlds grant, drop and charge.' },
  { id: 'itemDefaults', title: 'Item defaults', note: 'What an item without a row may do.' },
]);

const blankProfile = (contract) => ({
  code: '',
  name: '',
  description: '',
  status: 'active',
  currency: { code: contract.currencyCodes[0], maxBalance: contract.maxBalance },
  fees: { ...contract.fees.defaults },
  rules: { ...contract.rules.defaults },
  itemDefaults: { ...contract.itemPolicy.defaults },
});

const profileKey = ({ name, description, status, currency, fees, rules, itemDefaults }) =>
  JSON.stringify({ name, description, status, currency, fees, rules, itemDefaults });

/** The policy a row runs: its fields over the defaults of its profile. */
const effectiveOf = (row, contract, defaults) => ({
  ...defaults,
  ...Object.fromEntries(
    [...Object.keys(contract.itemPolicy.defaults), ...Object.keys(contract.itemPolicy.optional)]
      .filter((key) => row[key] !== undefined && row[key] !== null && row[key] !== '')
      .map((key) => [key, row[key]]),
  ),
});

/** One line of what a policy lets an item do. */
const policyLine = (policy) =>
  [
    policy.trade ? 'trade' : 'no trade',
    policy.worldDrop ? 'drop' : 'no drop',
    policy.buyback ? `buyback ${policy.buybackPayout}` : '',
    policy.burn ? `burn ${policy.burnCoinFee}` : '',
    policy.market ? 'market' : '',
    policy.craftSurcharge ? `craft +${policy.craftSurcharge}` : '',
    policy.portalFee !== undefined && policy.portalFee !== null ? `portal ${policy.portalFee}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

class EconomyEngineCyberia {
  static async render({ appStore }) {
    const canMutate = commonModeratorGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest');
    const libraryId = 'economy-engine-library';
    const rowsId = 'economy-engine-rows';
    const disabled = canMutate ? '' : 'disabled';

    const state = {
      contract: null,
      id: null,
      revision: 1,
      draft: null,
      saved: '',
      view: null,
      row: null,
      filter: '',
      crud: null,
      load: 0,
    };

    const renderProfile = () => {
      const { contract, draft } = state;
      if (!contract || !draft) return;
      const limitsOf = (block) =>
        block === 'itemDefaults' ? contract.itemPolicy.limits : contract[block === 'rules' ? 'rules' : 'fees'].limits;
      const defaultsOf = (block) =>
        block === 'itemDefaults' ? contract.itemPolicy.defaults : contract[block].defaults;
      htmls(
        '.economy-engine-profile',
        html`<div class="studio-form-card">
            <h4>Identity</h4>
            <div class="studio-form-grid">
              <label class="studio-form-field"
                ><span>Code</span>
                <input
                  class="economy-engine-code"
                  value="${escapeHtml(draft.code)}"
                  ${state.id ? 'disabled' : disabled}
              /></label>
              <label class="studio-form-field"
                ><span>Name</span> <input data-key="name" value="${escapeHtml(draft.name)}" ${disabled}
              /></label>
              <label class="studio-form-field"
                ><span>Status</span>
                <select data-key="status" ${disabled}>
                  <option value="active" ${draft.status === 'active' ? 'selected' : ''}>Active</option>
                  <option value="retired" ${draft.status === 'retired' ? 'selected' : ''}>
                    Retired: no world may name it
                  </option>
                </select></label
              >
            </div>
            <label class="studio-form-field"
              ><span>Description</span>
              <input data-key="description" value="${escapeHtml(draft.description)}" ${disabled}
            /></label>
          </div>
          <div class="studio-form-card">
            <h4>Wallet</h4>
            <div class="studio-form-hint">
              Worlds of one universe share one wallet: the same currency and the same maximum.
            </div>
            <div class="studio-form-grid">
              <label class="studio-form-field"
                ><span>Currency</span>
                <select data-block="currency" data-key="code" ${disabled}>
                  ${contract.currencyCodes
                    .map(
                      (code) =>
                        html`<option value="${escapeHtml(code)}" ${draft.currency.code === code ? 'selected' : ''}>
                          ${escapeHtml(code)}
                        </option>`,
                    )
                    .join('')}
                </select></label
              >
              ${numberField({
                block: 'currency',
                key: 'maxBalance',
                value: draft.currency.maxBalance,
                bounds: [1, contract.maxBalance],
                fallback: contract.maxBalance,
                disabled,
              })}
            </div>
          </div>
          ${BLOCKS.map(
            ({ id, title, note }) =>
              html`<div class="studio-form-card">
                <h4>${title}</h4>
                <div class="studio-form-hint">${note}</div>
                <div class="studio-form-grid">
                  ${Object.entries(defaultsOf(id))
                    .map(([key, fallback]) =>
                      typeof fallback === 'boolean'
                        ? flagField({ block: id, key, value: draft[id][key], fallback, disabled })
                        : numberField({
                            block: id,
                            key,
                            value: draft[id][key],
                            bounds: limitsOf(id)[key],
                            fallback,
                            step: Number.isInteger(fallback) ? 1 : 'any',
                            disabled,
                          }),
                    )
                    .join('')}
                </div>
              </div>`,
          ).join('')}`,
      );
      for (const input of document.querySelectorAll('.economy-engine-profile [data-key]'))
        input.addEventListener('change', () => {
          state.draft = readProfile();
          renderProfile();
          renderDirty();
        });
    };

    /** The profile the form holds now. */
    const readProfile = () => {
      const draft = structuredClone(state.draft);
      draft.code = s('.economy-engine-code')?.value?.trim() ?? draft.code;
      for (const input of document.querySelectorAll('.economy-engine-profile [data-key]')) {
        const { block, key, flag } = input.dataset;
        const value = flag ? input.value === 'true' : input.type === 'number' ? Number(input.value) : input.value;
        if (block) draft[block][key] = value;
        else draft[key] = value;
      }
      return draft;
    };

    const dirty = () => !!state.draft && profileKey(readProfile()) !== state.saved;
    const renderDirty = () => htmls('.economy-engine-dirty-slot', dirtyNotice(dirty()));

    const renderReferences = () => {
      const view = state.view;
      if (!view) {
        htmls(
          '.economy-engine-references',
          html`<div class="studio-form-card">Save the profile to see the worlds that run it.</div>`,
        );
        return;
      }
      htmls(
        '.economy-engine-references',
        html`<div class="studio-form-card">
            <h4>Worlds that run it</h4>
            ${
              view.worlds.length === 0
                ? html`<div>
                    No world names this economy. A world without a conf runs ${escapeHtml(state.contract.defaultCode)}.
                  </div>`
                : view.worlds
                    .map(
                      (code) =>
                        html`<div class="studio-form-row">
                          <span class="studio-form-mono" style="flex: 1 1 8rem;">${escapeHtml(code)}</span>
                          <button type="button" class="economy-engine-open-world" data-code="${escapeHtml(code)}">
                            <i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Open in the instance editor
                          </button>
                        </div>`,
                    )
                    .join('')
            }
          </div>
          <div class="studio-form-card">
            <h4>Shared wallets</h4>
            ${
              view.universes.length === 0
                ? html`<div>No universe holds a world that runs it.</div>`
                : view.universes
                    .map(
                      ({ code, worlds, defect }) =>
                        html`<div class="studio-form-row">
                          <span class="studio-form-mono">${escapeHtml(code)}</span>
                          <span class="studio-form-chip ${defect ? 'studio-form-bad' : ''}"
                            >${defect ? 'Incompatible' : 'One wallet'}</span
                          >
                          <span>${worlds.map(escapeHtml).join(', ')}</span>
                          ${defect ? html`<div style="flex-basis: 100%;">${escapeHtml(defect)}</div>` : ''}
                        </div>`,
                    )
                    .join('')
            }
          </div>
          <div class="studio-form-card">
            ${view.itemCount} item rows. Reference:
            <span class="studio-form-mono">${escapeHtml(view.economy.code)}@${view.economy.revision}</span>
          </div>`,
      );
      for (const button of document.querySelectorAll('.economy-engine-open-world'))
        button.onclick = () => InstanceEngineCyberia.open({ instanceCode: button.dataset.code });
    };

    /** The row editor: a field the row leaves empty inherits the defaults of the profile. */
    const renderRow = () => {
      const { contract, row } = state;
      if (!contract) return;
      if (!row) {
        htmls(
          '.economy-engine-row-editor',
          html`<div class="studio-form-card">Select an item row, or add one by its item id.</div>`,
        );
        return;
      }
      const defaults = state.draft.itemDefaults;
      const effective = effectiveOf(row, contract, defaults);
      const flags = Object.entries(contract.itemPolicy.defaults).filter(([, v]) => typeof v === 'boolean');
      const numbers = [...Object.entries(contract.itemPolicy.limits), ...Object.entries(contract.itemPolicy.optional)];
      htmls(
        '.economy-engine-row-editor',
        html`<div class="studio-form-card">
          <h4 class="studio-form-mono">${escapeHtml(row.itemId)}</h4>
          <div class="studio-form-row">
            ${
              row.objectLayerCid
                ? html`<span class="studio-form-chip">Bound</span>
                    <span class="studio-form-mono">${escapeHtml(row.objectLayerCid)}</span>`
                : html`<span class="studio-form-chip studio-form-bad">Not bound</span>
                    <span>The catalog binds no definition to this item: the row cannot save.</span>`
            }
          </div>
          <div class="studio-form-grid" style="margin-top: 6px;">
            ${flags
              .map(
                ([key]) =>
                  html`<label class="studio-form-field ${row[key] !== undefined ? 'studio-form-changed' : ''}">
                    <span>${escapeHtml(labelOf(key))}</span>
                    <select data-row-key="${key}" ${disabled}>
                      <option value="" ${row[key] === undefined ? 'selected' : ''}>
                        Inherit (${defaults[key] ? 'allowed' : 'refused'})
                      </option>
                      <option value="true" ${row[key] === true ? 'selected' : ''}>Allowed</option>
                      <option value="false" ${row[key] === false ? 'selected' : ''}>Refused</option>
                    </select>
                  </label>`,
              )
              .join('')}
            ${numbers
              .map(
                ([key, [min, max]]) =>
                  html`<label class="studio-form-field ${row[key] !== undefined ? 'studio-form-changed' : ''}">
                    <span>${escapeHtml(labelOf(key))}</span>
                    <input
                      type="number"
                      data-row-key="${key}"
                      min="${min}"
                      max="${max}"
                      step="1"
                      value="${row[key] ?? ''}"
                      placeholder="${key in defaults ? `inherits ${defaults[key]}` : 'unset'}"
                      ${disabled}
                    />
                  </label>`,
              )
              .join('')}
          </div>
          <div class="studio-form-hint">
            An empty portal fee adds nothing: the economy fee applies. 0 makes a portal with this item free.
          </div>
          <h4 style="margin-top: 8px;">Salvage of one burned unit</h4>
          ${(row.salvage ?? [])
            .map(
              (line, i) =>
                html`<div class="studio-form-row">
                  <input
                    value="${escapeHtml(line.itemId)}"
                    data-salvage="${i}"
                    data-field="itemId"
                    placeholder="item id"
                    ${disabled}
                  />
                  <input
                    type="number"
                    min="1"
                    max="${contract.salvage.quantity}"
                    value="${line.qty}"
                    data-salvage="${i}"
                    data-field="qty"
                    ${disabled}
                  />
                  ${canMutate ? html`<button type="button" class="economy-engine-salvage-remove" data-index="${i}">Remove</button>` : ''}
                </div>`,
            )
            .join('')}
          ${
            canMutate && (row.salvage ?? []).length < contract.salvage.lines
              ? html`<button type="button" class="economy-engine-salvage-add">
                  <i class="fa-solid fa-plus" aria-hidden="true"></i> Salvage line
                </button>`
              : ''
          }
          <div class="studio-form-card" style="margin-top: 8px;"><b>Runs</b>: ${escapeHtml(policyLine(effective))}</div>
          ${
            canMutate
              ? html`<div class="studio-form-row">
                  <button type="button" class="economy-engine-row-save">
                    <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save row
                  </button>
                  ${
                    row._id
                      ? html`<button type="button" class="economy-engine-row-delete">
                          <i class="fa-solid fa-trash" aria-hidden="true"></i> Delete row
                        </button>`
                      : ''
                  }
                </div>`
              : ''
          }
        </div>`,
      );
      for (const input of document.querySelectorAll('.economy-engine-row-editor [data-row-key]'))
        input.onchange = () => {
          const key = input.dataset.rowKey;
          if (input.value === '') delete state.row[key];
          else state.row[key] = input.type === 'number' ? Number(input.value) : input.value === 'true';
          renderRow();
        };
      for (const input of document.querySelectorAll('.economy-engine-row-editor [data-salvage]'))
        input.onchange = () => {
          const line = state.row.salvage[Number(input.dataset.salvage)];
          line[input.dataset.field] = input.dataset.field === 'qty' ? Number(input.value) : input.value.trim();
        };
      for (const button of document.querySelectorAll('.economy-engine-salvage-remove'))
        button.onclick = () => {
          state.row.salvage.splice(Number(button.dataset.index), 1);
          renderRow();
        };
      if (s('.economy-engine-salvage-add'))
        s('.economy-engine-salvage-add').onclick = () => {
          state.row.salvage = [...(state.row.salvage ?? []), { itemId: '', qty: 1 }];
          renderRow();
        };
      if (s('.economy-engine-row-save')) s('.economy-engine-row-save').onclick = saveRow;
      if (s('.economy-engine-row-delete')) s('.economy-engine-row-delete').onclick = deleteRow;
    };

    const rowFields = (row) =>
      Object.fromEntries(
        [
          ...Object.keys(state.contract.itemPolicy.defaults),
          ...Object.keys(state.contract.itemPolicy.optional),
          'salvage',
        ]
          .filter((key) => row[key] !== undefined)
          .map((key) => [key, key === 'salvage' ? row.salvage.filter(({ itemId }) => itemId) : row[key]]),
      );

    const saveRow = async () => {
      const result = await CyberiaEconomicItemPolicyService.post({
        body: { economyCode: state.draft.code, itemId: state.row.itemId, ...rowFields(state.row) },
      });
      EditorCrud.notify(result, 'success-update-item');
      if (result.status !== 'success') return;
      state.row = { ...result.data, objectLayerCid: state.row.objectLayerCid };
      await afterRowChange();
    };

    const deleteRow = async () => {
      const result = await EditorCrud.remove(CyberiaEconomicItemPolicyService, {
        id: state.row._id,
        subject: 'item row',
        name: state.row.itemId,
      });
      if (result?.status !== 'success') return;
      state.row = null;
      await afterRowChange();
    };

    /** A row write raised the revision of the profile: the form takes it, keeping its changes. */
    const afterRowChange = async () => {
      const { status, data } = await CyberiaEconomyService.get({ id: state.draft.code });
      if (status === 'success' && data) state.revision = data.revision;
      renderRow();
      await ListPager.load(rowsId);
      await refreshView();
    };

    const openRow = async (itemId, stored = null) => {
      const row = stored ? structuredClone(stored) : { itemId };
      if (!stored) {
        const binding = await CyberiaItemCatalogService.get({ id: itemId }).catch(() => null);
        row.objectLayerCid = binding?.status === 'success' ? binding.data.objectLayerCid : '';
      }
      delete row.effective;
      state.row = row;
      renderRow();
    };

    const refreshView = async () => {
      if (!state.id) {
        state.view = null;
        return renderReferences();
      }
      const request = state.load;
      const { status, data } = await CyberiaEconomyService.view({ code: state.draft.code });
      if (request !== state.load) return;
      state.view = status === 'success' ? data : null;
      renderReferences();
    };

    const load = async (economy) => {
      state.load++;
      state.id = economy?.code ?? null;
      state.revision = economy?.revision ?? 1;
      state.draft = economy
        ? {
            code: economy.code,
            name: economy.name ?? '',
            description: economy.description ?? '',
            status: economy.status ?? 'active',
            currency: { ...economy.currency },
            fees: { ...state.contract.fees.defaults, ...economy.fees },
            rules: { ...state.contract.rules.defaults, ...economy.rules },
            itemDefaults: { ...state.contract.itemPolicy.defaults, ...economy.itemDefaults },
          }
        : blankProfile(state.contract);
      state.saved = profileKey(state.draft);
      state.row = null;
      setQueryParams({ economyCode: economy?.code ?? null }, { replace: true });
      state.crud?.refresh();
      renderProfile();
      renderDirty();
      renderRow();
      await ListPager.load(rowsId, 1);
      await refreshView();
    };

    const loadByCode = async (code) => {
      if (!code || code === state.id) return;
      const request = ++state.load;
      const { status, data } = await CyberiaEconomyService.get({ id: code });
      if (request !== state.load) return;
      if (status !== 'success' || !data?.code) {
        NotificationManager.Push({ html: `No economy answers to the code "${escapeHtml(code)}"`, status: 'error' });
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
      if (state.id) body.revision = state.revision;
      const result = await EditorCrud.save(CyberiaEconomyService, { id: state.id, body });
      if (result.status === 'success') {
        await load(result.data);
        await ListPager.load(libraryId);
      } else if (/reload it/.test(result.message ?? ''))
        NotificationManager.Push({
          html: 'Another editor saved this economy first. Your changes stay here: Reset loads the newer one.',
          status: 'warning',
        });
    };

    /** Copies the loaded profile with its item rows under the first free code. */
    const clone = async () => {
      for (let n = 1; n < 100; n++) {
        const code = `${state.id}-copy${n > 1 ? `-${n}` : ''}`;
        const taken = await CyberiaEconomyService.get({ id: code });
        if (taken.status === 'success' && taken.data) continue;
        const result = await CyberiaEconomyService.clone({
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
      if (!s('.economy-engine-container') || !state.contract) return;
      if (queryParams.economyCode) await loadByCode(queryParams.economyCode);
    };
    listenQueryParamsChange({ id: 'cyberia-economy-engine-query-listener', event: onQuery });

    setTimeout(async () => {
      const root = s('.economy-engine-container');
      if (!root) return unlistenQueryParamsChange('cyberia-economy-engine-query-listener', onQuery);
      const { status, data } = await CyberiaEconomyService.contract();
      if (status !== 'success') {
        htmls(
          '.economy-engine-profile',
          html`<div class="studio-form-card">The economy contract is unavailable.</div>`,
        );
        return;
      }
      state.contract = data;
      EditorLayout.pin(root, 'economy-engine');
      Tabs.bind(s('.economy-engine-tabs'));
      state.crud = EditorCrud.bind(s('.economy-engine-crud'), () => ({
        subject: 'economy',
        id: state.id,
        name: state.draft?.code,
        new: () => load(null),
        reset: async () => {
          const { status, data, message } = await CyberiaEconomyService.get({ id: state.id });
          if (status === 'success' && data) await load(data);
          else NotificationManager.Push({ html: message, status: 'error' });
        },
        ...(canMutate && {
          save,
          clone,
          delete: async () => {
            const result = await EditorCrud.remove(CyberiaEconomyService, {
              id: state.id,
              subject: 'economy',
              name: state.id,
            });
            if (result?.status === 'success') {
              await load(null);
              await ListPager.load(libraryId);
            }
          },
        }),
      }));
      const filter = s('.economy-engine-filter');
      if (filter)
        filter.addEventListener('input', () => {
          state.filter = filter.value.trim();
          ListPager.load(rowsId, 1);
        });
      if (s('.economy-engine-add-row'))
        s('.economy-engine-add-row').onclick = () => {
          const itemId = s('.economy-engine-add-item')?.value?.trim();
          if (!state.id) return NotificationManager.Push({ html: 'Save the profile first.', status: 'warning' });
          if (itemId) openRow(itemId);
        };
      await ListPager.load(libraryId);
      const code = getQueryParams().economyCode;
      await load(null);
      if (code) await loadByCode(code);
    });

    const libraryHtml = await ListPager.instance({
      id: libraryId,
      limit: 10,
      unit: 'economies',
      fetch: async ({ page, limit }) => {
        const result = await CyberiaEconomyService.get({ page, limit, sort: 'code', order: 'asc' });
        return result?.status === 'success' ? result.data : null;
      },
      render: (rows) => {
        htmls(
          `.${libraryId}-rows`,
          rows.length === 0
            ? html`<div class="studio-form-card">No economy yet.</div>`
            : rows
                .map(
                  (economy) =>
                    html`<div class="studio-form-row studio-form-card">
                      <span class="studio-form-mono" style="flex: 1 1 8rem;">${escapeHtml(economy.code)}</span>
                      <span style="flex: 2 1 8rem;">${escapeHtml(economy.name || '')}</span>
                      <span class="studio-form-chip">${escapeHtml(economy.status || 'active')}</span>
                      <span class="studio-form-chip">revision ${economy.revision}</span>
                      <button type="button" class="economy-engine-library-open" data-code="${escapeHtml(economy.code)}">
                        <i class="fa-solid fa-upload" aria-hidden="true"></i> Open
                      </button>
                    </div>`,
                )
                .join(''),
        );
        for (const button of document.querySelectorAll('.economy-engine-library-open'))
          button.onclick = async () => {
            await loadByCode(button.dataset.code);
            Tabs.select(s('.economy-engine-tabs'), 'profile');
          };
      },
    });

    const rowsHtml = await ListPager.instance({
      id: rowsId,
      limit: 10,
      unit: 'item rows',
      fetch: async ({ page, limit }) => {
        if (!state.id) return { data: [], total: 0, page: 1, totalPages: 0 };
        const result = await CyberiaEconomicItemPolicyService.view({
          economyCode: state.id,
          page,
          limit,
          sort: 'itemId',
          asc: 1,
          filterModel: state.filter
            ? { itemId: { filterType: 'text', type: 'contains', filter: state.filter } }
            : undefined,
        });
        return result?.status === 'success' ? result.data : null;
      },
      render: (rows) => {
        htmls(
          `.${rowsId}-rows`,
          rows.length === 0
            ? html`<div class="studio-form-card">
                ${state.id ? 'No item row: every item takes the defaults.' : 'Open a profile.'}
              </div>`
            : rows
                .map(
                  (row, i) =>
                    html`<div class="studio-form-row studio-form-card">
                      <span class="studio-form-mono" style="flex: 1 1 8rem;">${escapeHtml(row.itemId)}</span>
                      <span class="studio-form-chip ${row.objectLayerCid ? '' : 'studio-form-bad'}"
                        >${row.objectLayerCid ? 'Bound' : 'Not bound'}</span
                      >
                      <span style="flex: 2 1 12rem;">${escapeHtml(policyLine(row.effective))}</span>
                      <button type="button" class="economy-engine-row-open" data-index="${i}">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i> ${canMutate ? 'Edit' : 'View'}
                      </button>
                    </div>`,
                )
                .join(''),
        );
        for (const button of document.querySelectorAll('.economy-engine-row-open'))
          button.onclick = () => openRow(rows[Number(button.dataset.index)].itemId, rows[Number(button.dataset.index)]);
      },
    });

    return html`<style>
        ${STUDIO_FORM_STYLE}
      </style>
      <div class="in section-mp studio-editor studio-form economy-engine-container">
        ${EditorCrud.render({ id: 'economy-engine-crud', label: 'Economy' })}
        <div class="economy-engine-dirty-slot"></div>
        ${Tabs.render({
          id: 'economy-engine-tabs',
          label: 'Economy tools',
          selected: 'profile',
          tabs: [
            {
              id: 'profile',
              label: 'Profile',
              icon: 'fa-solid fa-coins',
              content: html`<div class="economy-engine-profile">Loading the economy contract…</div>`,
            },
            {
              id: 'items',
              label: 'Item policies',
              icon: 'fa-solid fa-list-check',
              content: html`<div class="studio-form-split">
                <div>
                  <div class="studio-form-row" style="margin-bottom: 6px;">
                    <input
                      class="economy-engine-filter"
                      placeholder="Filter by item id"
                      aria-label="Filter by item id"
                    />
                  </div>
                  ${
                    canMutate
                      ? html`<div class="studio-form-row" style="margin-bottom: 6px;">
                          <input
                            class="economy-engine-add-item"
                            placeholder="item id"
                            aria-label="Item id of a new row"
                            autocomplete="off"
                          />
                          <button type="button" class="economy-engine-add-row">
                            <i class="fa-solid fa-plus" aria-hidden="true"></i> Add row
                          </button>
                        </div>`
                      : ''
                  }
                  <div class="${rowsId}-rows" style="display: grid; gap: 6px;"></div>
                  ${rowsHtml}
                </div>
                <div class="economy-engine-row-editor" aria-live="polite"></div>
              </div>`,
            },
            {
              id: 'references',
              label: 'References',
              icon: 'fa-solid fa-diagram-project',
              content: html`<div class="economy-engine-references"></div>`,
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

export { EconomyEngineCyberia };
