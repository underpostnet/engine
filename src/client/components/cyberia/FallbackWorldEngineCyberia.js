/**
 * Fallback World Engine — editor for the procedural fallback world's default items.
 *
 * The fallback world (src/api/cyberia-instance/cyberia-fallback-world.js) is
 * generated in memory and never persisted, so it has no CyberiaInstance document
 * to edit. This view is the trimmed-down counterpart of InstanceEngineCyberia:
 * only the default-items section plus a reload trigger.
 *
 * The composed item set is staged on the engine process and shipped with the
 * reload trigger — it is deliberately volatile (see cyberia-fallback-default-items.js),
 * so an engine restart returns the world to pure code defaults.
 */

import { BtnIcon } from '../core/BtnIcon.js';
import { Input } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { DropDown } from '../core/DropDown.js';
import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { DefaultCyberiaItems } from './SharedDefaultsCyberia.js';

const dropdownValueKey = (value = '') => String(value).trim().replaceAll(' ', '-');
const createDropdownOption = (value, onClick = () => {}, display = value, data = value) => ({
  value,
  display,
  data,
  onClick,
});

class FallbackWorldEngineCyberia {
  static itemIdsDropdownId = 'fallback-world-engine-item-ids-dropdown';
  static itemInventoryListId = 'fallback-world-engine-item-inventory-list';
  // itemId → defaultPlayerInventory flag for the currently selected item ids.
  static itemInventoryFlags = {};
  // Ids the code defaults already ship in an entity's defaultObjectLayers.
  // Selecting one and leaving it unchecked REMOVES it from those defaults, so
  // the list flags them instead of letting a player lose their starting kit.
  static entityDefaultItemIds = [];

  // Current selection, read from the dropdown's `oncheckvalues` (always live —
  // it is updated before `_renderSelectedBadges` runs, unlike `.value` which
  // lags by one in the option-click path).
  static getSelectedItemIds() {
    const token = DropDown.Tokens[FallbackWorldEngineCyberia.itemIdsDropdownId];
    if (!token) return [];
    const fromChecks = Object.values(token.oncheckvalues || {})
      .map((v) => v.data)
      .filter(Boolean);
    if (fromChecks.length > 0) return fromChecks;
    return Array.isArray(token.value) ? token.value.filter(Boolean) : [];
  }

  /** Payload shape shared with CyberiaInstance.itemIds. */
  static getItemIdsPayload() {
    return FallbackWorldEngineCyberia.getSelectedItemIds().map((id) => ({
      id,
      defaultPlayerInventory: !!FallbackWorldEngineCyberia.itemInventoryFlags[id],
    }));
  }

  // Render the per-item "Default Player Inventory" toggles for every selected
  // item id. Kept in sync with the dropdown via a MutationObserver on its badge
  // container (see render()).
  static renderItemInventoryList(containerId = FallbackWorldEngineCyberia.itemInventoryListId) {
    const container = s(`.${containerId}`);
    if (!container) return;

    const selected = FallbackWorldEngineCyberia.getSelectedItemIds();

    // Drop flags for items no longer selected so the payload never carries them.
    for (const key of Object.keys(FallbackWorldEngineCyberia.itemInventoryFlags)) {
      if (!selected.includes(key)) delete FallbackWorldEngineCyberia.itemInventoryFlags[key];
    }

    if (selected.length === 0) {
      htmls(
        `.${containerId}`,
        html`<div style="color:#888;font-size:12px;">
          No item IDs selected — the fallback world runs on pure code defaults.
        </div>`,
      );
      return;
    }

    let listHtml = '';
    for (const itemId of selected) {
      const isChecked = !!FallbackWorldEngineCyberia.itemInventoryFlags[itemId];
      const checked = isChecked ? 'checked' : '';
      const strips = !isChecked && FallbackWorldEngineCyberia.entityDefaultItemIds.includes(itemId);
      listHtml += html`<div class="fl" style="border-bottom:1px solid #444;padding:4px 0;align-items:center;">
        <div class="in fll" style="flex:1;font-size:12px;font-family:monospace;">
          ${itemId}
          ${strips
            ? html`<span
                style="color:#d90;font-size:11px;font-family:initial;margin-left:6px;"
                title="This id is part of the code entity defaults. Left unchecked, it is removed from them."
                ><i class="fa-solid fa-triangle-exclamation"></i> removes from entity defaults</span
              >`
            : ''}
        </div>
        <div class="in fll" style="display:flex;align-items:center;justify-content:flex-end;">
          <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:5px;">
            <input
              type="checkbox"
              class="fallback-world-engine-item-inv-checkbox"
              data-item-id="${itemId}"
              ${checked}
              style="cursor:pointer;"
            />
            Default Player Inventory
          </label>
        </div>
      </div>`;
    }
    htmls(`.${containerId}`, listHtml);

    container.querySelectorAll('.fallback-world-engine-item-inv-checkbox').forEach((cb) => {
      cb.onchange = () => {
        FallbackWorldEngineCyberia.itemInventoryFlags[cb.dataset.itemId] = cb.checked;
      };
    });
  }

  static syncItemIdsDropdownSelection(itemIds = []) {
    const dropdownId = FallbackWorldEngineCyberia.itemIdsDropdownId;
    if (!DropDown.Tokens[dropdownId]) return;

    // Accept both the `[{ id, defaultPlayerInventory }]` shape and a plain
    // string[], matching what the fallback-world endpoint may return.
    const normalized = (itemIds || [])
      .map((entry) => (typeof entry === 'string' ? { id: entry, defaultPlayerInventory: false } : entry))
      .filter((entry) => entry && entry.id);

    DropDown.Tokens[dropdownId].value = [];
    if (s(`.${dropdownId}`)) s(`.${dropdownId}`).value = [];
    DropDown.Tokens[dropdownId].oncheckvalues = {};
    htmls(`.dropdown-current-${dropdownId}`, '');
    htmls(`.${dropdownId}-render-container`, '');

    FallbackWorldEngineCyberia.itemInventoryFlags = {};
    const ids = [];
    for (const entry of normalized) {
      const key = dropdownValueKey(entry.id);
      DropDown.Tokens[dropdownId].oncheckvalues[key] = {
        data: entry.id,
        display: entry.id,
        value: entry.id,
      };
      FallbackWorldEngineCyberia.itemInventoryFlags[entry.id] = !!entry.defaultPlayerInventory;
      ids.push(entry.id);
    }
    DropDown.Tokens[dropdownId].value = [...ids];
    if (s(`.${dropdownId}`)) s(`.${dropdownId}`).value = [...ids];
    DropDown.Tokens[dropdownId]._renderSelectedBadges?.();
    FallbackWorldEngineCyberia.renderItemInventoryList();
  }

  static async buildItemIdsDropdown() {
    return await DropDown.instance({
      id: FallbackWorldEngineCyberia.itemIdsDropdownId,
      label: html`Object Layer Item IDs`,
      data: [],
      type: 'checkbox',
      containerClass: 'inl',
      excludeSelected: true,
      serviceProvider: async (q) => {
        const result = await ObjectLayerService.searchItemIds({ q });
        if (result.status === 'success' && result.data?.itemIds) {
          return result.data.itemIds.map((itemId) => createDropdownOption(itemId));
        }
        return [];
      },
    });
  }

  static async render(options = {}) {
    const { appStore } = options;
    const role = appStore?.Data?.user?.main?.model?.user?.role || 'guest';
    const canMutate = commonModeratorGuard(role);
    const idHotReloadUrl = 'fallback-world-engine-input-hot-reload-url';
    const idItemIdsDropdown = FallbackWorldEngineCyberia.itemIdsDropdownId;
    const idItemInventoryList = FallbackWorldEngineCyberia.itemInventoryListId;

    setTimeout(async () => {
      // Keep the per-item "Default Player Inventory" toggles in sync with the
      // item-ids dropdown. Every add/remove/clear re-renders the dropdown badge
      // container, so observing it is a reliable change hook (the dropdown
      // exposes no onChange callback).
      const itemBadgeContainer = s(`.dropdown-current-${idItemIdsDropdown}`);
      if (itemBadgeContainer) {
        const itemInventoryObserver = new MutationObserver(() => {
          FallbackWorldEngineCyberia.renderItemInventoryList();
        });
        itemInventoryObserver.observe(itemBadgeContainer, { childList: true, subtree: true });
      }

      // Load whatever this engine process currently serves, so reopening the
      // view shows the live set rather than an empty form.
      try {
        const result = await CyberiaInstanceService.getFallbackDefaultItems();
        if (result?.status === 'success') {
          FallbackWorldEngineCyberia.entityDefaultItemIds = result.data?.entityDefaultItemIds || [];
          FallbackWorldEngineCyberia.syncItemIdsDropdownSelection(result.data?.itemIds || []);
        }
      } catch (error) {
        NotificationManager.Push({ html: error.message, status: 'error' });
      }
      FallbackWorldEngineCyberia.renderItemInventoryList();

      if (s(`.btn-fallback-world-engine-load-defaults`))
        s(`.btn-fallback-world-engine-load-defaults`).onclick = () => {
          // Seed from the canonical registry so an operator starts from the
          // same list `import-default-items` creates ObjectLayers for. Ids the
          // entity defaults already ship start checked: selecting them
          // unchecked would strip them from those defaults, which is never what
          // "load the defaults" is asking for.
          const flags = Object.fromEntries(
            FallbackWorldEngineCyberia.getItemIdsPayload().map((e) => [e.id, e.defaultPlayerInventory]),
          );
          FallbackWorldEngineCyberia.syncItemIdsDropdownSelection(
            DefaultCyberiaItems.map((entry) => ({
              id: entry.item.id,
              defaultPlayerInventory:
                flags[entry.item.id] ?? FallbackWorldEngineCyberia.entityDefaultItemIds.includes(entry.item.id),
            })),
          );
        };

      if (s(`.btn-fallback-world-engine-clear`))
        s(`.btn-fallback-world-engine-clear`).onclick = () => {
          FallbackWorldEngineCyberia.syncItemIdsDropdownSelection([]);
        };

      if (s(`.btn-fallback-world-engine-toggle-hot-reload`))
        s(`.btn-fallback-world-engine-toggle-hot-reload`).onclick = () => {
          const body = s(`.fallback-world-engine-hot-reload-body`);
          const caret = s(`.fallback-world-engine-hot-reload-caret`);
          if (body) body.classList.toggle('hide');
          if (caret) {
            caret.classList.toggle('fa-caret-right');
            caret.classList.toggle('fa-caret-down');
          }
        };

      const triggerHotReload = async (mode) => {
        const buttons = [
          s(`.btn-fallback-world-engine-hot-reload`),
          s(`.btn-fallback-world-engine-hot-reload-incremental`),
        ];
        const statusSelector = `.fallback-world-engine-hot-reload-status`;
        const serverUrl = s(`.${idHotReloadUrl}`)?.value?.trim();
        if (!serverUrl) {
          NotificationManager.Push({ html: 'Set the cyberia-server URL first.', status: 'warning' });
          return;
        }

        for (const btn of buttons) if (btn) btn.disabled = true;
        if (s(statusSelector))
          htmls(statusSelector, html`<span style="color:#888;">Triggering ${mode} hot reload…</span>`);
        try {
          const result = await CyberiaInstanceService.fallbackHotReload({
            body: { serverUrl, mode, itemIds: FallbackWorldEngineCyberia.getItemIdsPayload() },
          });
          if (result.status === 'error') {
            NotificationManager.Push({ html: result.message, status: 'error' });
            if (s(statusSelector)) htmls(statusSelector, html`<span style="color:#d66;">${result.message}</span>`);
            return;
          }
          const { transport, durationMs, message, grpcError, itemIds } = result.data || {};
          NotificationManager.Push({ html: `Hot reload via ${transport}: ${message}`, status: 'success' });
          if (s(statusSelector))
            htmls(
              statusSelector,
              html`<span style="color:#6b6;">
                  via <b>${transport}</b> · ${durationMs}ms · ${(itemIds || []).length} default item(s) staged ·
                  ${message} </span
                >${grpcError ? html`<div style="color:#a80;">gRPC unavailable: ${grpcError}</div>` : ''}`,
            );
        } catch (error) {
          NotificationManager.Push({ html: error.message, status: 'error' });
          if (s(statusSelector)) htmls(statusSelector, html`<span style="color:#d66;">${error.message}</span>`);
        } finally {
          for (const btn of buttons) if (btn) btn.disabled = false;
        }
      };

      if (s(`.btn-fallback-world-engine-hot-reload`))
        s(`.btn-fallback-world-engine-hot-reload`).onclick = () => triggerHotReload('full');
      if (s(`.btn-fallback-world-engine-hot-reload-incremental`))
        s(`.btn-fallback-world-engine-hot-reload-incremental`).onclick = () => triggerHotReload('incremental');
    });

    return html`
      <div class="in fallback-world-engine-container">
        <div class="in section-mp" style="color:#888;font-size:12px;">
          The fallback world is generated in memory and never persisted, so it has no instance document to edit. Items
          selected here are staged on this engine process and applied when a cyberia-server reloads. They are volatile:
          an engine restart returns the world to its code defaults.
        </div>

        <div class="in section-mp" style="margin-top: 10px;">
          <div class="in input-label" style="font-size:14px;margin-bottom:5px;">Default Items</div>
          ${await FallbackWorldEngineCyberia.buildItemIdsDropdown()}
        </div>
        <div class="in section-mp" style="margin-top: 5px;">
          <div class="in input-label" style="font-size:13px;margin-bottom:5px;">Default Player Inventory</div>
          <div class="in" style="color:#888;font-size:12px;margin-bottom:6px;">
            Every selected id is resolved to an atlas at boot. Ids checked here are seeded into each new player's
            inventory (inactive, never auto-equipped); unchecked ids are explicitly removed from the player's default
            layers.
          </div>
          <div class="in ${idItemInventoryList}" style="max-height:200px;overflow-y:auto;"></div>
          ${canMutate
            ? html`<div class="in" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:10px;">
                ${await BtnIcon.instance({
                  class: 'wfa btn-fallback-world-engine-load-defaults',
                  label: html`<i class="fa-solid fa-list-check"></i> Load Canonical Defaults`,
                })}
                ${await BtnIcon.instance({
                  class: 'wfa btn-fallback-world-engine-clear',
                  label: html`<i class="fa-solid fa-eraser"></i> Clear Selection`,
                })}
              </div>`
            : ''}
        </div>

        ${canMutate
          ? html`<div class="in section-mp" style="margin-top: 10px;">
              ${await BtnIcon.instance({
                class: 'wfa btn-fallback-world-engine-toggle-hot-reload',
                label: html`<i class="fa-solid fa-caret-right fallback-world-engine-hot-reload-caret"></i> Hot Reload`,
              })}
              <div class="in fallback-world-engine-hot-reload-body hide">
                <div class="in" style="color:#888;font-size:12px;margin:5px 0;">
                  Stages the items above on this engine, then rebuilds the world of a running cyberia-server so it
                  re-fetches them. Tries the gRPC control service first and falls back to the REST endpoint. For a
                  multi-instance deployment, append the variant sub-path so the trigger reaches the right world (e.g.
                  <code>https://server.cyberiaonline.com/TEST</code>); the default world uses the bare origin.
                </div>
                ${await Input.instance({
                  id: idHotReloadUrl,
                  label: html`<i class="fa-solid fa-server"></i> Cyberia Server URL`,
                  containerClass: 'in',
                  placeholder: 'https://server.cyberiaonline.com/TEST',
                  type: 'text',
                })}
                <div class="in" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-fallback-world-engine-hot-reload',
                    label: html`<i class="fa-solid fa-rotate"></i> Trigger Hot Reload`,
                  })}
                  ${await BtnIcon.instance({
                    class: 'wfa btn-fallback-world-engine-hot-reload-incremental',
                    label: html`<i class="fa-solid fa-layer-group"></i> Incremental (assets only)`,
                  })}
                </div>
                <div class="in fallback-world-engine-hot-reload-status" style="margin-top:5px;font-size:12px;"></div>
              </div>
            </div>`
          : ''}
      </div>
    `;
  }
}

export { FallbackWorldEngineCyberia };
