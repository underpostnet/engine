import {
  getProxyPath,
  getQueryParams,
  isCurrentRoute,
  listenQueryParamsChange,
  setQueryParams,
} from '../core/Router.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { darkTheme } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { AgGrid } from '../core/AgGrid.js';
import { firstPage, pageQuery } from '../core/Pagination.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { Modal } from '../core/Modal.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaEntityTypeDefaultService } from '../../services/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { CyberiaInstanceConfService } from '../../services/cyberia-instance-conf/cyberia-instance-conf.service.js';
import { CyberiaItemCatalogService } from '../../services/cyberia-item-catalog/cyberia-item-catalog.service.js';
import { CyberiaProceduralPopulationService as Population } from '../../services/cyberia-procedural-population/cyberia-procedural-population.service.js';
import { ProceduralEngineCyberia } from './ProceduralEngineCyberia.js';
import { StudioCyberia } from './StudioCyberia.js';
import { ENTITY_TYPES, SELECTABLE_ENTITY_BEHAVIORS, isAssignableEntityBehavior } from './SharedDefaultsCyberia.js';

// DropDown invokes optionData.onClick on selection, so every option must carry one.
const dropdownOption = (value) => ({ value, display: value, data: value, onClick: () => {} });

// The drop chance a rule states; an absent one always drops.
const statedDropChance = (rule) => (Number.isFinite(rule.dropChance) ? { dropChance: rule.dropChance } : {});

// EntityEngineCyberia — CRUD surface for the cyberia-entity-type-default
// collection (instance wiring over the foundation baseline). An ag-grid lists
// the defaults a page at a time, from the `page` and `limit` query parameters;
// clicking a row loads it into the form. The form binds an
// entityType to its lifecycle item-id sets (live / dead / drop) plus the
// inventory-only extras, with server-backed item-id autocomplete pickers so the
// high-frequency itemId fields stay fast and typo-free. The runtime linking
// rule (entity matches entityType AND carries an active itemId from liveItemIds)
// is content-authority only; this engine never mutates entities or the
// simulation — it owns the default content the seed/instance pipelines consume.
class EntityEngineCyberia {
  static listCache = [];
  // The runtime binding of each item id shown, read from the catalog: itemId → its row, or null
  // when unbound. Read only: the Cyberia Item Catalog changes a binding.
  static bindings = new Map();
  static currentId = null;
  static crud = null;
  // The Procedural Engine population the form edits a default for: { id, view, variant }; null otherwise.
  // `view` is the default as the working graph holds it (see `Population.getDefault`); `variant` is
  // { instanceCode, key, from, revision } of a variant an instance draft proposes.
  static population = null;
  // Whether the moderator chose that every world runs a row no instance runs.
  static global = false;
  // The `updatedAt` of the loaded default: a save names it, so it never overwrites a newer version.
  static currentUpdatedAt = null;

  // Editable working copies of the array fields for the loaded document.
  static liveItemIds = [];
  static deadItemIds = [];
  static dropItemIds = [];
  static inventoryItemsIds = [];
  // Per-id overrides of what the lists derive: { itemId, active, quantity }.
  static overrideItemsIdsState = [];
  // Instance codes whose conf references the loaded default.
  static instanceCodes = [];
  // itemId → item type. A sprite lives under its type, so an item id alone cannot be previewed.
  // Types never change, so this is a cache that only ever grows: ids reach it from the list and
  // from every id added in the form, which is what makes a just-picked item preview immediately.

  static gridId = 'entity-engine-grid';
  static route = 'cyberia-entity-engine';
  // The page the grid shows, as `{ page, limit }`; null until the first read.
  static loadedPage = null;

  static ids = {
    entityType: 'entity-engine-entity-type',
    behavior: 'entity-engine-behavior',
    liveItemPicker: 'entity-engine-live-item-picker',
    deadItemPicker: 'entity-engine-dead-item-picker',
    dropItemPicker: 'entity-engine-drop-item-picker',
    inventoryItemPicker: 'entity-engine-inventory-item-picker',
    instancePicker: 'entity-engine-instance-picker',
    overrideItemPicker: 'entity-engine-override-item-picker',
  };

  // Behavior options: a leading "auto" (empty → a bot derives armed→hostile, else passive; a
  // foreground and an obstacle stay ordinary) plus the author-assignable canonical behaviors.
  static behaviorOptions() {
    return [
      { value: '', display: '— auto (derive) —', data: '', onClick: () => {} },
      ...SELECTABLE_ENTITY_BEHAVIORS.map((b) => ({
        value: b.id,
        display: `${b.label} (${b.entityType})`,
        data: b.id,
        onClick: () => {},
      })),
    ];
  }

  // ── Searchable dropdown helpers (mirror ActionEngineCyberia) ──────────────
  static getSingleDropdownValue(id) {
    const value = DropDown.Tokens[id]?.value;
    return typeof value === 'string' ? value.trim() : '';
  }

  static setSingleDropdownValue(id, value) {
    if (!DropDown.Tokens[id]) return;
    const v = value || '';
    DropDown.Tokens[id].value = v;
    if (s(`.${id}`)) s(`.${id}`).value = v;
    htmls(`.dropdown-current-${id}`, v || '');
  }

  // itemId references the object-layer collection, so each picker is a fast
  // server-backed autocomplete instead of a free-text input.
  static async buildItemIdDropdown(id, label) {
    return await DropDown.instance({
      id,
      label,
      data: [],
      containerClass: 'inl',
      serviceProvider: async (q) => {
        const result = await ObjectLayerService.searchItemIds({ q });
        if (result.status === 'success' && result.data?.items) {
          return result.data.items.map(({ id }) => dropdownOption(id));
        }
        return [];
      },
    });
  }

  static async buildInstanceDropdown(id) {
    return await DropDown.instance({
      id,
      label: html`Search instance code`,
      data: [],
      containerClass: 'inl',
      serviceProvider: async (q) => {
        const graph = EntityEngineCyberia.population?.view?.instances;
        if (graph) return graph.filter((code) => code.includes(q)).map((code) => dropdownOption(code));
        const { status, data } = await CyberiaInstanceConfService.get({
          filterModel: { instanceCode: { filterType: 'text', type: 'contains', filter: q } },
        });
        return status === 'success' ? data.data.map(({ instanceCode }) => dropdownOption(instanceCode)) : [];
      },
    });
  }

  // ── Item-id list editors ─────────────────────────────────────────────────
  // The lifecycle discriminators plus the inventory-only extras. All four are plain id lists:
  // what an entity carries is their union, and what is active follows from the list, never from
  // a flag stored per row. Form field → stored key, so nothing that holds item ids can be left
  // out of the type resolution or the grid.
  static ITEM_FIELD_KEYS = Object.freeze({
    live: 'liveItemIds',
    dead: 'deadItemIds',
    drop: 'dropItemIds',
    inventory: 'inventoryItemsIds',
  });

  static ITEM_FIELDS = Object.keys(EntityEngineCyberia.ITEM_FIELD_KEYS);

  static listFieldOf(field) {
    return {
      live: EntityEngineCyberia.liveItemIds,
      dead: EntityEngineCyberia.deadItemIds,
      drop: EntityEngineCyberia.dropItemIds,
      inventory: EntityEngineCyberia.inventoryItemsIds,
    }[field];
  }

  static async renderItemList(field) {
    const container = s(`.entity-engine-${field}-list`);
    if (!container) return;
    const items = EntityEngineCyberia.listFieldOf(field);
    let out = '';
    for (let i = 0; i < items.length; i++) {
      out += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;display:flex;align-items:center;gap:6px;">
          ${EntityEngineCyberia.itemPreview(items[i])}${items[i]} ${EntityEngineCyberia.bindingMark(items[i])}
        </div>
        ${await BtnIcon.instance({
          class: `btn-entity-engine-rm-${field}-${i}`,
          label: html`<i class="fa-solid fa-xmark"></i>`,
          style: 'min-width:30px;padding:2px 8px;',
        })}
      </div>`;
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No item ids.</div>';
    htmls(`.entity-engine-${field}-list`, out);
    for (let i = 0; i < items.length; i++) {
      if (s(`.btn-entity-engine-rm-${field}-${i}`))
        s(`.btn-entity-engine-rm-${field}-${i}`).onclick = () => {
          EntityEngineCyberia.listFieldOf(field).splice(i, 1);
          EntityEngineCyberia.renderItemList(field);
        };
    }
    EntityEngineCyberia.loadBindings(items);
  }

  /** Reads from the catalog the binding of each item id not read yet, then draws what shows them again. */
  static async loadBindings(itemIds) {
    const missing = [...new Set(itemIds)].filter((itemId) => itemId && !EntityEngineCyberia.bindings.has(itemId));
    if (missing.length === 0) return;
    const { status, data } = await CyberiaItemCatalogService.get({
      limit: missing.length,
      filterModel: { itemId: { filterType: 'set', values: missing } },
    });
    if (status !== 'success') return;
    const rows = new Map(data.data.map((row) => [row.itemId, row]));
    for (const itemId of missing) EntityEngineCyberia.bindings.set(itemId, rows.get(itemId) ?? null);
    AgGrid.grids[EntityEngineCyberia.gridId]?.refreshCells({
      columns: Object.values(EntityEngineCyberia.ITEM_FIELD_KEYS),
      force: true,
      suppressFlash: true,
    });
    for (const field of EntityEngineCyberia.ITEM_FIELDS) EntityEngineCyberia.renderItemList(field);
  }

  /** The runtime binding of an item id as a mark: the cid it runs, or why it runs none. */
  static bindingMark(itemId) {
    if (!EntityEngineCyberia.bindings.has(itemId)) return '';
    const row = EntityEngineCyberia.bindings.get(itemId);
    if (row?.bindingStatus === 'bound')
      return html`<span style="color:#2e7d32;" title="Runtime binding CID: ${row.objectLayerCid}"
        >✓ ${row.objectLayerCid.slice(0, 9)}…</span
      >`;
    const problem = !row
      ? 'Runtime render not bound'
      : row.bindingStatus === 'unrendered'
        ? 'Runtime binding without a render'
        : `Runtime binding ${row.bindingStatus}`;
    return html`<span style="color:#c62828;" title="${problem}">⚠ ${problem}</span>`;
  }

  static async addItem(field, pickerId) {
    const itemId = EntityEngineCyberia.getSingleDropdownValue(pickerId);
    if (!itemId) {
      NotificationManager.Push({ html: 'Select an itemId first.', status: 'error' });
      return;
    }
    const list = EntityEngineCyberia.listFieldOf(field);
    if (list.includes(itemId)) {
      NotificationManager.Push({ html: `"${itemId}" already in ${field} item ids.`, status: 'warning' });
      return;
    }
    list.push(itemId);
    EntityEngineCyberia.setSingleDropdownValue(pickerId, '');
    await EntityEngineCyberia.renderItemList(field);
  }

  // ── Override rules ({ itemId, active, quantity }) ─────────────────────────
  // Every id the four lists carry, which is exactly what an override may adjust.
  static carriedItemIds() {
    return [
      ...new Set(
        EntityEngineCyberia.ITEM_FIELDS.flatMap((field) => EntityEngineCyberia.listFieldOf(field)).filter(Boolean),
      ),
    ];
  }

  static async renderOverrideList() {
    const container = s('.entity-engine-override-list');
    if (!container) return;
    const carried = new Set(EntityEngineCyberia.carriedItemIds());
    let out = '';
    for (let i = 0; i < EntityEngineCyberia.overrideItemsIdsState.length; i++) {
      const rule = EntityEngineCyberia.overrideItemsIdsState[i];
      // An override for an id no list carries is inert — the union decides membership.
      const orphan = !carried.has(rule.itemId);
      // Drop chance only reaches the simulation for an id the drop list carries, so the input is
      // offered where it can do something.
      const isDrop = EntityEngineCyberia.listFieldOf('drop').includes(rule.itemId);
      out += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
          ${EntityEngineCyberia.itemPreview(rule.itemId)}
          <span style="${orphan ? 'color:#c90;' : ''}">${rule.itemId}</span>
          <label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
            <input class="entity-engine-override-active-${i}" type="checkbox" ${rule.active ? 'checked' : ''} />
            active
          </label>
          <span>×</span>
          <input
            class="entity-engine-override-qty-${i}"
            type="number"
            min="1"
            value="${rule.quantity}"
            style="width:60px;"
          />
          ${
            isDrop
              ? html`<label
                  style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;"
                  title="Probability this id scatters on death. 1 always drops, 0 never does."
                >
                  drop
                  <input
                    class="entity-engine-override-drop-chance-${i}"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value="${Number.isFinite(rule.dropChance) ? rule.dropChance : 1}"
                    style="width:60px;"
                  />
                </label>`
              : ''
          }
          ${orphan ? html`<span style="color:#c90;font-size:11px;">no list carries this id</span>` : ''}
        </div>
        ${await BtnIcon.instance({
          class: `btn-entity-engine-rm-override-${i}`,
          label: html`<i class="fa-solid fa-xmark"></i>`,
          style: 'min-width:30px;padding:2px 8px;',
        })}
      </div>`;
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No overrides — every id starts as its list derives.</div>';
    htmls('.entity-engine-override-list', out);
    for (let i = 0; i < EntityEngineCyberia.overrideItemsIdsState.length; i++) {
      const active = s(`.entity-engine-override-active-${i}`);
      if (active) active.onchange = () => (EntityEngineCyberia.overrideItemsIdsState[i].active = active.checked);
      const qty = s(`.entity-engine-override-qty-${i}`);
      if (qty)
        qty.onchange = () =>
          (EntityEngineCyberia.overrideItemsIdsState[i].quantity = Math.max(1, parseInt(qty.value) || 1));
      const dropChance = s(`.entity-engine-override-drop-chance-${i}`);
      if (dropChance)
        dropChance.onchange = () => {
          const rule = EntityEngineCyberia.overrideItemsIdsState[i];
          const parsed = parseFloat(dropChance.value);
          // An empty or unreadable box states nothing, so the id always drops.
          if (!Number.isFinite(parsed)) delete rule.dropChance;
          else rule.dropChance = Math.min(1, Math.max(0, parsed));
          dropChance.value = Number.isFinite(rule.dropChance) ? rule.dropChance : 1;
        };
      if (s(`.btn-entity-engine-rm-override-${i}`))
        s(`.btn-entity-engine-rm-override-${i}`).onclick = () => {
          EntityEngineCyberia.overrideItemsIdsState.splice(i, 1);
          EntityEngineCyberia.renderOverrideList();
        };
    }
  }

  static async addOverride() {
    const itemId = EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.overrideItemPicker);
    if (!itemId) {
      NotificationManager.Push({ html: 'Select an itemId to override.', status: 'error' });
      return;
    }
    if (EntityEngineCyberia.overrideItemsIdsState.some((rule) => rule.itemId === itemId)) {
      NotificationManager.Push({ html: `"${itemId}" already has an override.`, status: 'warning' });
      return;
    }
    EntityEngineCyberia.overrideItemsIdsState.push({
      itemId,
      active: EntityEngineCyberia.listFieldOf('live').includes(itemId),
      quantity: 1,
    });
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.overrideItemPicker, '');
    await EntityEngineCyberia.renderOverrideList();
  }

  // ── Instance links (CyberiaInstanceConf.entityDefaults) ───────────────────
  static async renderInstanceList() {
    const container = s('.entity-engine-instance-list');
    if (!container) return;
    const { population, instanceCodes } = EntityEngineCyberia;
    const stored = population?.view?.storedInstanceCodes ?? instanceCodes;
    const editable = !population?.variant;
    let out = '';
    for (let i = 0; i < instanceCodes.length; i++) {
      out += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">
          ${escapeHtml(instanceCodes[i])}${stored.includes(instanceCodes[i]) ? '' : ' · pending association'}
        </div>
        ${
          editable
            ? await BtnIcon.instance({
                class: `btn-entity-engine-rm-instance-${i}`,
                label: html`<i class="fa-solid fa-xmark"></i>`,
                style: 'min-width:30px;padding:2px 8px;',
              })
            : ''
        }
      </div>`;
    }
    const leaving = population ? stored.filter((code) => !instanceCodes.includes(code)) : [];
    if (leaving.length > 0)
      out += html`<div style="color:#c90;font-size:12px;">
        Leaves at the publication: ${escapeHtml(leaving.join(', '))}
      </div>`;
    if (instanceCodes.length === 0)
      out += population
        ? html`<label style="display:block;font-size:12px;margin-top:4px;">
            <input type="checkbox" class="entity-engine-global" ${EntityEngineCyberia.global ? 'checked' : ''} />
            Every world runs it (global). Link an instance instead to keep it to that world.
          </label>`
        : html`<div style="color:#888;font-size:12px;">
            No instance references this row: it is a global row, and every world runs it.
          </div>`;
    htmls('.entity-engine-instance-list', out);
    if (s('.entity-engine-global'))
      s('.entity-engine-global').onchange = (event) => {
        EntityEngineCyberia.global = event.target.checked;
        EntityEngineCyberia.paintPopulation();
      };
    for (let i = 0; i < EntityEngineCyberia.instanceCodes.length; i++) {
      if (s(`.btn-entity-engine-rm-instance-${i}`))
        s(`.btn-entity-engine-rm-instance-${i}`).onclick = () => {
          EntityEngineCyberia.instanceCodes.splice(i, 1);
          EntityEngineCyberia.paintPopulation();
        };
    }
  }

  static addInstance() {
    const code = EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.instancePicker);
    if (!code) {
      NotificationManager.Push({ html: 'Select an instance code first.', status: 'error' });
      return;
    }
    if (EntityEngineCyberia.instanceCodes.includes(code)) {
      NotificationManager.Push({ html: `"${code}" already linked.`, status: 'warning' });
      return;
    }
    EntityEngineCyberia.instanceCodes.push(code);
    EntityEngineCyberia.global = false;
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.instancePicker, '');
    EntityEngineCyberia.paintPopulation();
  }

  /** Proposes a variant of the stored row for the picked instance, then opens it: a copy only that instance runs. */
  static async makeVariant() {
    const code = EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.instancePicker);
    if (!code) return NotificationManager.Push({ html: 'Pick the instance the variant is for.', status: 'error' });
    const { id, view } = EntityEngineCyberia.population;
    const result = await Population.proposeVariant({ id, code, rowId: view.rowId });
    if (result.status !== 'success')
      return NotificationManager.Push({ html: escapeHtml(result.message), status: 'error' });
    setQueryParams({ row: null, draft: null, instance: code, variant: result.data.key }, { replace: true });
  }

  // Persisted after the default itself: an instance can only reference a document that exists.
  static async persistInstanceLinks() {
    if (!EntityEngineCyberia.currentId) return;
    const result = await CyberiaEntityTypeDefaultService.setInstances({
      id: EntityEngineCyberia.currentId,
      body: { instanceCodes: EntityEngineCyberia.instanceCodes },
    });
    if (result.status === 'error') {
      NotificationManager.Push({ html: result.message, status: 'error' });
      return;
    }
    const { linked = [], unlinked = [] } = result.data || {};
    if (linked.length || unlinked.length) {
      NotificationManager.Push({
        html: `Instances updated${linked.length ? ` · linked ${linked.join(', ')}` : ''}${
          unlinked.length ? ` · unlinked ${unlinked.join(', ')}` : ''
        }`,
        status: 'success',
      });
    }
  }

  // ── Grid (CRUD list surface) ──────────────────────────────────────────────
  static ITEM_PREVIEW_PX = 60;

  // The item's first idle frame, or the placeholder when its type is unresolved or the art is
  // missing. Both absences look the same on purpose: either way the runtime cannot draw it.
  static itemPreview(itemId) {
    const size = EntityEngineCyberia.ITEM_PREVIEW_PX;
    const placeholder = (display) =>
      html`<div style="width:${size}px;height:${size}px;display:${display};align-items:center;justify-content:center;">
        <img
          src="${getProxyPath()}assets/ui-icons/empty-render.png"
          alt="Render unavailable"
          style="width:${Math.round((size * 2) / 3)}px;height:${Math.round((size * 2) / 3)}px;object-fit:contain;image-rendering:pixelated;"
        />
      </div>`;
    return html`<img
        src="${AtlasSpriteSheetService.idlePreviewUrl(itemId)}"
        style="width:${size}px;height:${size}px;display:block;image-rendering:pixelated;"
        alt="${itemId}"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
      />
      ${placeholder('none')}`;
  }

  // Item ids read as a strip of sprites, each labelled with its id: a default is recognised by
  // what it looks like long before anyone reads the ids. Arrays stay arrays on the row so the
  // renderer can lay them out; ag-grid's text filter still sees the comma-joined form.
  static itemIdsRenderer(field) {
    return class {
      eGui;

      init(params) {
        this.eGui = document.createElement('div');
        const itemIds = params.data?.[field] || [];
        if (itemIds.length === 0) {
          this.eGui.innerHTML = html`<span style="color:#666;font-style:italic;">—</span>`;
          return;
        }
        this.eGui.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 0;';
        this.eGui.innerHTML = itemIds
          .map(
            (itemId, index) =>
              html`<span
                style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-family:monospace;"
                title="${itemId}"
                >${EntityEngineCyberia.itemPreview(itemId)}${itemId}
                ${EntityEngineCyberia.bindingMark(itemId)}${index < itemIds.length - 1 ? ',' : ''}</span
              >`,
          )
          .join('');
      }

      getGui() {
        return this.eGui;
      }

      // A rebuilt cell shows the binding marks read since it was drawn.
      refresh() {
        return false;
      }
    };
  }

  // The overrides a default carries, one rule per line. No sprite here: a rule is read as a rule —
  // whether the id is active, how many of it, and which id it adjusts — and the id's own strip is
  // already three columns to the left.
  static overridesRenderer() {
    return class {
      eGui;

      init(params) {
        this.eGui = document.createElement('div');
        const rules = params.data?.overrideItemsIdsState || [];
        if (rules.length === 0) {
          this.eGui.innerHTML = html`<span style="color:#666;font-style:italic;">—</span>`;
          return;
        }
        this.eGui.style.cssText = 'display:flex;flex-direction:column;gap:2px;padding:4px 0;';
        this.eGui.innerHTML = rules
          .map(
            (rule) =>
              html`<span
                style="font-size:11px;font-family:monospace;white-space:nowrap;${rule.active ? '' : 'color:#888;'}"
                title="${rule.itemId}"
                >${rule.active ? 'active' : 'inactive'}
                ×${Math.max(1, rule.quantity || 1)}${
                  Number.isFinite(rule.dropChance) && 1 !== rule.dropChance ? ` drop ${rule.dropChance}` : ''
                }
                ${rule.itemId}</span
              >`,
          )
          .join('');
      }

      getGui() {
        return this.eGui;
      }

      refresh() {
        return true;
      }
    };
  }

  static toRow(doc) {
    return {
      _id: doc._id,
      entityType: doc.entityType || '',
      behavior: doc.behavior || '',
      instances: (doc.instanceCodes || []).join(', '),
      liveItemIds: [...(doc.liveItemIds || [])],
      deadItemIds: [...(doc.deadItemIds || [])],
      dropItemIds: [...(doc.dropItemIds || [])],
      inventoryItemsIds: [...(doc.inventoryItemsIds || [])],
      overrideItemsIdsState: [...(doc.overrideItemsIdsState || [])],
    };
  }

  /** Reads the page the query parameters name, filtered and sorted as the grid shows, with its pager. */
  static async refreshList() {
    const { page, limit } = pageQuery();
    const res = await CyberiaEntityTypeDefaultService.get({ page, limit, ...AgGrid.query(EntityEngineCyberia.gridId) });
    const { data = [], total = 0, totalPages = 1 } = res?.data || {};
    EntityEngineCyberia.listCache = data;
    EntityEngineCyberia.loadedPage = { page, limit };
    AgGrid.grids[EntityEngineCyberia.gridId].setGridOption(
      'rowData',
      data.map((d) => EntityEngineCyberia.toRow(d)),
    );
    EntityEngineCyberia.loadBindings(
      data.flatMap((doc) => Object.values(EntityEngineCyberia.ITEM_FIELD_KEYS).flatMap((key) => doc[key] || [])),
    );
    s(`#ag-pagination-${EntityEngineCyberia.gridId}`)?.showPage({ page, limit, total, totalPages });
    EntityEngineCyberia.renderInstanceList();
  }

  /** Reads the list again when the query parameters of its route name another page. */
  static followPageQuery() {
    if (!isCurrentRoute(EntityEngineCyberia.route) || !s('.entity-engine-container')) return;
    const { page, limit } = pageQuery();
    const loaded = EntityEngineCyberia.loadedPage;
    if (!loaded || loaded.page !== page || loaded.limit !== limit) EntityEngineCyberia.refreshList();
  }

  /** A new filter or sort reads from the first page. */
  static queryChanged() {
    firstPage(() => EntityEngineCyberia.refreshList());
  }

  // ── Payload / load / persistence ──────────────────────────────────────────
  static getPayload() {
    return {
      entityType: EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.entityType),
      behavior: EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.behavior),
      liveItemIds: [...EntityEngineCyberia.liveItemIds],
      deadItemIds: [...EntityEngineCyberia.deadItemIds],
      dropItemIds: [...EntityEngineCyberia.dropItemIds],
      inventoryItemsIds: [...EntityEngineCyberia.inventoryItemsIds],
      overrideItemsIdsState: EntityEngineCyberia.overrideItemsIdsState.map((rule) => ({
        itemId: rule.itemId,
        active: !!rule.active,
        quantity: Math.max(1, rule.quantity || 1),
        ...statedDropChance(rule),
      })),
    };
  }

  static load(doc) {
    EntityEngineCyberia.currentId = doc._id || null;
    EntityEngineCyberia.currentUpdatedAt = doc.updatedAt ?? null;
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.entityType, doc.entityType || '');
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.behavior, doc.behavior || '');
    EntityEngineCyberia.liveItemIds = [...(doc.liveItemIds || [])];
    EntityEngineCyberia.deadItemIds = [...(doc.deadItemIds || [])];
    EntityEngineCyberia.dropItemIds = [...(doc.dropItemIds || [])];
    EntityEngineCyberia.inventoryItemsIds = [...(doc.inventoryItemsIds || [])];
    EntityEngineCyberia.overrideItemsIdsState = (doc.overrideItemsIdsState || []).map((rule) => ({
      itemId: rule.itemId,
      active: !!rule.active,
      quantity: Math.max(1, rule.quantity || 1),
      ...statedDropChance(rule),
    }));
    EntityEngineCyberia.instanceCodes = [...(doc.instanceCodes || [])];
    for (const field of EntityEngineCyberia.ITEM_FIELDS) EntityEngineCyberia.renderItemList(field);
    EntityEngineCyberia.renderOverrideList();
    EntityEngineCyberia.renderInstanceList();
    EntityEngineCyberia.crud?.refresh();
    NotificationManager.Push({ html: `Entity default "${doc.entityType}" loaded`, status: 'success' });
  }

  static newDefault() {
    EntityEngineCyberia.currentId = null;
    EntityEngineCyberia.liveItemIds = [];
    EntityEngineCyberia.deadItemIds = [];
    EntityEngineCyberia.dropItemIds = [];
    EntityEngineCyberia.inventoryItemsIds = [];
    EntityEngineCyberia.overrideItemsIdsState = [];
    EntityEngineCyberia.instanceCodes = [];
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.entityType, '');
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.behavior, '');
    for (const field of EntityEngineCyberia.ITEM_FIELDS) EntityEngineCyberia.renderItemList(field);
    EntityEngineCyberia.renderOverrideList();
    EntityEngineCyberia.renderInstanceList();
    EntityEngineCyberia.crud?.refresh();
  }

  static validate(body) {
    if (!body.entityType) {
      NotificationManager.Push({ html: 'Entity type is required.', status: 'error' });
      return false;
    }
    if (body.liveItemIds.length === 0) {
      NotificationManager.Push({
        html: 'At least one live item id is required (it is the link to matching entities).',
        status: 'error',
      });
      return false;
    }
    if (!isAssignableEntityBehavior(body.entityType, body.behavior)) {
      NotificationManager.Push({
        html: `Behavior ${body.behavior} does not apply to ${body.entityType} entities.`,
        status: 'error',
      });
      return false;
    }
    return true;
  }

  /** The loaded default as the CRUD bar names it: its entity type and live item ids. */
  static currentName() {
    const { population } = EntityEngineCyberia;
    if (!EntityEngineCyberia.currentId && !population?.variant && !population?.view?.key) return '';
    const entityType = EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.entityType);
    return `${entityType} (${EntityEngineCyberia.liveItemIds.join(', ')})`;
  }

  /** Reloads the stored default over unsaved changes. */
  static async reset() {
    const { status, data, message } = await CyberiaEntityTypeDefaultService.get({ id: EntityEngineCyberia.currentId });
    if (status === 'success' && data) EntityEngineCyberia.load(data);
    else NotificationManager.Push({ html: message, status: 'error' });
  }

  static async save() {
    const body = EntityEngineCyberia.getPayload();
    if (!EntityEngineCyberia.validate(body)) return;
    if (EntityEngineCyberia.population) return await EntityEngineCyberia.saveToDraft(body);
    const { currentId, currentUpdatedAt } = EntityEngineCyberia;
    const result = await EditorCrud.save(CyberiaEntityTypeDefaultService, {
      id: currentId,
      body: currentId ? { ...body, updatedAt: currentUpdatedAt } : body,
    });
    if (result.status !== 'success') return;
    EntityEngineCyberia.currentId = result.data?._id ?? currentId;
    EntityEngineCyberia.currentUpdatedAt = result.data?.updatedAt ?? null;
    await EntityEngineCyberia.persistInstanceLinks();
    await EntityEngineCyberia.refreshList();
  }

  /**
   * Saves the form to the draft of the population, never to the stored defaults or confs, and goes back:
   * the variant of an instance, or the row with the instances that run it, in one write. A row no
   * instance runs needs the global choice, and losing its last instance asks first.
   */
  static async saveToDraft(row) {
    const { id, view, variant } = EntityEngineCyberia.population;
    const { instanceCodes, global } = EntityEngineCyberia;
    if (!variant && instanceCodes.length === 0) {
      if (!global)
        return NotificationManager.Push({
          html: 'Link the instances that run this default, or choose that every world runs it.',
          status: 'error',
        });
      if (view.instanceCodes.length > 0) {
        const answer = await Modal.RenderConfirm({
          id: 'entity-engine-global-confirm',
          html: async () =>
            html`<div class="in section-mp">
              ${escapeHtml(view.instanceCodes.join(', '))} stops running this default only for itself: every world runs
              it once the population publishes.
            </div>`,
          confirmLabel: 'Make it global',
          danger: true,
        });
        if (answer.status !== 'confirm') return;
      }
    }
    const result = variant
      ? await Population.saveVariant({
          id,
          code: variant.instanceCode,
          key: variant.key,
          body: { row, revision: variant.revision },
        })
      : await Population.saveDefault({
          id,
          body: {
            rowId: view.rowId,
            key: view.key,
            baseUpdatedAt: view.baseUpdatedAt,
            revision: view.revision,
            row,
            instanceCodes,
            global: instanceCodes.length === 0,
            populationRevision: view.populationRevision,
          },
        });
    if (result.status !== 'success')
      return NotificationManager.Push({
        html: escapeHtml(result.code === 409 ? `Conflict detected. ${result.message}` : result.message),
        status: result.code === 409 ? 'warning' : 'error',
      });
    NotificationManager.Push({
      html: 'Saved to the Procedural Draft. The stored defaults change when the population publishes.',
      status: 'success',
    });
    EntityEngineCyberia.returnToPopulation();
  }

  // Update: explicitly persist the loaded row (PUT). Requires a loaded document.
  // Clone posts the form as a new default and holds the copy. Subset matching allows shared item
  // ids, so a near duplicate is valid: the author then tweaks its behavior or live ids.
  static async clone() {
    const body = EntityEngineCyberia.getPayload();
    if (!EntityEngineCyberia.validate(body)) return;
    const { result } = await EditorCrud.clone(CyberiaEntityTypeDefaultService, body);
    if (result.status !== 'success') return;
    EntityEngineCyberia.currentId = result.data?._id ?? null;
    await EntityEngineCyberia.persistInstanceLinks();
    await EntityEngineCyberia.refreshList();
  }

  static async delete() {
    const result = await EditorCrud.remove(CyberiaEntityTypeDefaultService, {
      id: EntityEngineCyberia.currentId,
      subject: 'entity default',
      name: EntityEngineCyberia.currentName(),
    });
    if (result?.status !== 'success') return;
    EntityEngineCyberia.newDefault();
    await EntityEngineCyberia.refreshList();
  }

  // ── Procedural Engine context ────────────────────────────────────────────
  // ?population=<id> opens a default for the Procedural Engine as its working graph holds it: the stored
  // row ?row=, the default draft ?draft=, a new row of ?entityType= and ?liveItemIds=, or the variant
  // ?variant= that the draft of instance ?instance= proposes. A new row starts linked to ?instance=, else
  // to the one instance that lists the map of the population. A save writes the draft of the population
  // and returns to it.
  static async enterPopulation({
    population: id,
    row: rowId = '',
    draft = '',
    entityType = '',
    liveItemIds = '',
    instance = '',
    variant = '',
  }) {
    if (variant) {
      const { status, data, message } = await Population.getDocumentDraft({ id, kind: 'instances', code: instance });
      const copy = data?.variants?.find(({ key }) => key === variant);
      if (status !== 'success' || !copy)
        return NotificationManager.Push({
          html: escapeHtml(message || `Instance ${instance} proposes no variant ${variant}.`),
          status: 'error',
        });
      EntityEngineCyberia.population = {
        id,
        view: null,
        variant: { instanceCode: instance, key: variant, from: copy.from, revision: data.draftRevision },
      };
      EntityEngineCyberia.global = false;
      EntityEngineCyberia.load({ ...copy.row, instanceCodes: [instance] });
      EntityEngineCyberia.population.loaded = EntityEngineCyberia.formKey();
      return EntityEngineCyberia.paintPopulation();
    }
    const { status, data: view, message } = await Population.getDefault({ id, ref: draft || rowId || 'new' });
    if (status !== 'success') return NotificationManager.Push({ html: escapeHtml(message), status: 'error' });
    EntityEngineCyberia.population = { id, view, variant: null };
    EntityEngineCyberia.global = view.global || (view.state === 'persisted' && view.instanceCodes.length === 0);
    if (view.row)
      EntityEngineCyberia.load({
        ...view.row,
        _id: view.rowId,
        updatedAt: view.baseUpdatedAt,
        instanceCodes: view.instanceCodes,
      });
    else {
      EntityEngineCyberia.newDefault();
      EntityEngineCyberia.load({
        entityType,
        liveItemIds: liveItemIds ? liveItemIds.split(',') : [],
        instanceCodes: instance ? [instance] : view.mapInstances.length === 1 ? view.mapInstances : [],
      });
    }
    EntityEngineCyberia.population.loaded = EntityEngineCyberia.formKey();
    EntityEngineCyberia.paintPopulation();
  }

  static leavePopulation() {
    EntityEngineCyberia.population = null;
    EntityEngineCyberia.paintPopulation();
    EntityEngineCyberia.newDefault();
  }

  /** The form as a save to the population writes it: the row, the instances that run it and the global choice. */
  static formKey() {
    const { instanceCodes, global } = EntityEngineCyberia;
    return JSON.stringify([EntityEngineCyberia.getPayload(), instanceCodes, global]);
  }

  /** Whether the form differs from what the population holds. */
  static unsaved() {
    const { population } = EntityEngineCyberia;
    return Boolean(population) && population.loaded !== EntityEngineCyberia.formKey();
  }

  /** Back to the defaults of the population. Unsaved changes go once the moderator confirms; the saved draft stays. */
  static async leaveToPopulation() {
    if (EntityEngineCyberia.unsaved()) {
      const answer = await Modal.RenderConfirm({
        id: 'entity-engine-leave-confirm',
        html: async () =>
          html`<div class="in section-mp">
            Leave without saving? Your unsaved changes go. What the Procedural Draft holds stays.
          </div>`,
        confirmLabel: 'Leave without saving',
        danger: true,
      });
      if (answer.status !== 'confirm') return;
    }
    EntityEngineCyberia.returnToPopulation();
  }

  /** Back to the defaults of the population. */
  static returnToPopulation() {
    const { id } = EntityEngineCyberia.population;
    EntityEngineCyberia.population = null;
    EntityEngineCyberia.paintPopulation();
    setQueryParams(
      { population: null, row: null, draft: null, entityType: null, liveItemIds: null, instance: null, variant: null },
      { replace: true },
    );
    ProceduralEngineCyberia.open({ populationId: id, step: 'defaults' });
  }

  /** The state of the default and where it runs once the population publishes, as the form holds it. */
  static populationScope() {
    const { population, instanceCodes, global } = EntityEngineCyberia;
    const unsaved = EntityEngineCyberia.unsaved() ? ' · Unsaved changes' : '';
    if (population.variant)
      return {
        text: `Saved to Procedural Draft · Variant · ${population.variant.instanceCode}${unsaved}`,
        tone: unsaved ? 'warn' : 'good',
      };
    const state = {
      unsaved: 'New · Not saved',
      persisted: 'Persisted',
      draft: 'Saved to Procedural Draft',
      new: 'New · Saved to Procedural Draft',
    }[population.view.state];
    const scope =
      instanceCodes.length === 0
        ? global
          ? 'Global · every world runs it'
          : 'No instance yet: link one, or make it global'
        : instanceCodes.length === 1
          ? `Instance · ${instanceCodes[0]}`
          : `Shared · ${instanceCodes.length} instances: ${instanceCodes.join(', ')}`;
    return { text: `${state} · ${scope}${unsaved}`, tone: instanceCodes.length === 1 && !unsaved ? undefined : 'warn' };
  }

  static paintPopulation() {
    EntityEngineCyberia.crud?.refresh();
    const { population } = EntityEngineCyberia;
    // `.fl` sets a display, so the links hide by style: a variant runs only in its instance.
    for (const control of document.querySelectorAll('.entity-engine-instance-links'))
      control.style.display = population?.variant ? 'none' : '';
    if (s('.btn-entity-engine-variant'))
      s('.btn-entity-engine-variant').parentElement.style.display = population?.view?.rowId ? '' : 'none';
    EntityEngineCyberia.renderInstanceList();
    EntityEngineCyberia.paintScope();
  }

  /** The banner of a population: the state of the default, where it runs, and the way back. */
  static paintScope() {
    const { population } = EntityEngineCyberia;
    StudioCyberia.paintContext(
      s('.entity-engine-population'),
      population && {
        label: 'Procedural Engine · Entity Type Default',
        state: EntityEngineCyberia.populationScope(),
        note: population.variant
          ? `A copy of default …${population.variant.from.slice(-6)} that only ${population.variant.instanceCode} runs. Save to Procedural Draft keeps it in the population; the publication creates it with its reference.`
          : 'Save to Procedural Draft keeps the row and the instances that run it in the population; the publication writes them and reloads every world they change. Editing a shared default changes each instance that runs it: Make variant gives one instance its own copy.',
        back: () => EntityEngineCyberia.leaveToPopulation(),
      },
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  static async render(options = {}) {
    const { appStore } = options;
    const role = appStore?.Data?.user?.main?.model?.user?.role || 'guest';
    EntityEngineCyberia.canMutate = commonModeratorGuard(role);
    EntityEngineCyberia.listCache = [];
    EntityEngineCyberia.bindings = new Map();
    EntityEngineCyberia.loadedPage = null;
    EntityEngineCyberia.currentId = null;
    EntityEngineCyberia.population = null;
    EntityEngineCyberia.liveItemIds = [];
    EntityEngineCyberia.deadItemIds = [];
    EntityEngineCyberia.dropItemIds = [];
    EntityEngineCyberia.inventoryItemsIds = [];
    EntityEngineCyberia.overrideItemsIdsState = [];
    EntityEngineCyberia.instanceCodes = [];

    const ids = EntityEngineCyberia.ids;
    const entityTypeOptions = Object.values(ENTITY_TYPES).map((t) => dropdownOption(t));

    const group = (title, icon, inner) =>
      html`<div class="in studio-group">
        <div class="in studio-group-title"><i class="${icon}"></i> ${title}</div>
        ${inner}
      </div>`;

    // A reusable item-id picker + Add button feeding one of the list editors.
    const itemListEditor = async (field, pickerLabel) =>
      html`<div class="fl" style="align-items:flex-end;">
          <div class="in fll" style="flex:1;">
            ${await EntityEngineCyberia.buildItemIdDropdown(ids[`${field}ItemPicker`], pickerLabel)}
          </div>
          <div class="in fll" style="padding-left:6px;">
            ${await BtnIcon.instance({
              class: `wfa btn-entity-engine-add-${field}`,
              label: html`<i class="fa-solid fa-plus"></i> Add`,
            })}
          </div>
        </div>
        <div class="in entity-engine-${field}-list" style="margin-top:8px;"></div>`;

    // The server filters and sorts each page, so a column matches what its document stores.
    const table = await AgGrid.instance({
      id: EntityEngineCyberia.gridId,
      ownerRoute: EntityEngineCyberia.route,
      usePagination: true,
      paginationOptions: { limitOptions: [10, 25, 50, 100] },
      darkTheme,
      style: { width: '44rem', 'max-width': '100%', height: '50vh' },
      gridOptions: {
        rowData: [],
        columnDefs: [
          { field: 'entityType', headerName: 'Entity Type', minWidth: 120 },
          { field: 'behavior', headerName: 'Behavior', minWidth: 110 },
          // Instance confs hold the link, not the default: no server query reaches it.
          { field: 'instances', headerName: 'Instances', minWidth: 160, filter: false, sortable: false },
          {
            field: 'liveItemIds',
            headerName: 'Live Item Ids',
            minWidth: 220,
            autoHeight: true,
            cellRenderer: EntityEngineCyberia.itemIdsRenderer('liveItemIds'),
          },
          {
            field: 'deadItemIds',
            headerName: 'Dead Item Ids',
            minWidth: 220,
            autoHeight: true,
            cellRenderer: EntityEngineCyberia.itemIdsRenderer('deadItemIds'),
          },
          {
            field: 'dropItemIds',
            headerName: 'Drop Item Ids',
            minWidth: 220,
            autoHeight: true,
            cellRenderer: EntityEngineCyberia.itemIdsRenderer('dropItemIds'),
          },
          {
            field: 'inventoryItemsIds',
            headerName: 'Inventory Items Id',
            minWidth: 220,
            autoHeight: true,
            cellRenderer: EntityEngineCyberia.itemIdsRenderer('inventoryItemsIds'),
          },
          {
            field: 'overrideItemsIdsState',
            colId: 'overrideItemsIdsState.itemId',
            headerName: 'Resume Override',
            minWidth: 200,
            autoHeight: true,
            cellRenderer: EntityEngineCyberia.overridesRenderer(),
            filterValueGetter: ({ data }) => (data?.overrideItemsIdsState || []).map(({ itemId }) => itemId).join(', '),
          },
        ],
        rowSelection: 'single',
        onFilterChanged: () => EntityEngineCyberia.queryChanged(),
        onSortChanged: () => EntityEngineCyberia.queryChanged(),
        onRowClicked: (event) => {
          if (EntityEngineCyberia.population)
            return NotificationManager.Push({
              html: 'Save, or go back to the Procedural Engine, before you open another default.',
              status: 'warning',
            });
          const doc = EntityEngineCyberia.listCache.find((d) => d._id === event.data?._id);
          if (doc) EntityEngineCyberia.load(doc);
        },
      },
    });

    setTimeout(async () => {
      const container = s('.entity-engine-container');
      EditorLayout.bind(container);
      EditorLayout.pin(container, 'entity-engine-stage');
      for (const type of ['input', 'click'])
        container.addEventListener(type, () => EntityEngineCyberia.population && EntityEngineCyberia.paintScope());

      for (const field of EntityEngineCyberia.ITEM_FIELDS)
        if (s(`.btn-entity-engine-add-${field}`))
          s(`.btn-entity-engine-add-${field}`).onclick = () =>
            EntityEngineCyberia.addItem(field, ids[`${field}ItemPicker`]);

      if (s('.btn-entity-engine-add-override'))
        s('.btn-entity-engine-add-override').onclick = () => EntityEngineCyberia.addOverride();
      if (s('.btn-entity-engine-add-instance'))
        s('.btn-entity-engine-add-instance').onclick = () => EntityEngineCyberia.addInstance();
      if (s('.btn-entity-engine-variant'))
        s('.btn-entity-engine-variant').onclick = () => EntityEngineCyberia.makeVariant();
      EntityEngineCyberia.crud = EditorCrud.bind(container.querySelector('.entity-engine-crud'), () => ({
        subject: EntityEngineCyberia.population?.variant ? 'entity default variant' : 'entity default',
        id:
          EntityEngineCyberia.currentId ??
          EntityEngineCyberia.population?.variant?.key ??
          EntityEngineCyberia.population?.view?.key ??
          null,
        name: EntityEngineCyberia.currentName(),
        ...(!EntityEngineCyberia.population && { new: () => EntityEngineCyberia.newDefault() }),
        reset: () =>
          EntityEngineCyberia.population
            ? EntityEngineCyberia.enterPopulation(getQueryParams())
            : EntityEngineCyberia.reset(),
        ...(EntityEngineCyberia.population && {
          labels: { save: 'Save to Procedural Draft', reset: 'Reset to saved draft' },
        }),
        ...(EntityEngineCyberia.canMutate &&
          (EntityEngineCyberia.population
            ? { save: () => EntityEngineCyberia.save() }
            : {
                save: () => EntityEngineCyberia.save(),
                clone: () => EntityEngineCyberia.clone(),
                delete: () => EntityEngineCyberia.delete(),
              })),
      }));
      if (s('.btn-entity-engine-refresh'))
        s('.btn-entity-engine-refresh').onclick = () => EntityEngineCyberia.refreshList();
      if (s('.btn-entity-engine-item-catalog'))
        s('.btn-entity-engine-item-catalog').onclick = () => s('.main-btn-cyberia-item-catalog')?.click();

      for (const field of EntityEngineCyberia.ITEM_FIELDS) EntityEngineCyberia.renderItemList(field);
      EntityEngineCyberia.renderOverrideList();
      await EntityEngineCyberia.refreshList();
      listenQueryParamsChange({ id: 'entity-engine-page', event: () => EntityEngineCyberia.followPageQuery() });
      listenQueryParamsChange({
        id: 'entity-engine-population',
        event: (params) => {
          if (!isCurrentRoute(EntityEngineCyberia.route) || !s('.entity-engine-container')) return;
          if (params.population) EntityEngineCyberia.enterPopulation(params);
          else if (EntityEngineCyberia.population) EntityEngineCyberia.leavePopulation();
        },
      });
      if (getQueryParams().population) await EntityEngineCyberia.enterPopulation(getQueryParams());
    });

    return html`<div class="in section-mp studio-editor entity-engine-container">
      <div class="in studio-context entity-engine-population" role="status" aria-live="polite" hidden></div>
      ${EditorLayout.render({
        subject: 'table',
        readout: html`<div class="in studio-group-title" style="margin:0;">
            <i class="fa-solid fa-table-list"></i> Existing Entity Defaults
          </div>
          ${await BtnIcon.instance({
            class: 'btn-entity-engine-refresh',
            label: html`<i class="fa-solid fa-rotate"></i> Refresh`,
          })}
          <div class="in" style="font-size:12px;color:#888;">Click a row to load it into the form.</div>`,
        stage: table,
        tools: html`${EditorCrud.render({ id: 'entity-engine-crud', label: 'Entity default' })}
          ${group(
            'Entity Default',
            'fa-solid fa-circle-info',
            html`<div class="in" style="margin-bottom:8px;">
                ${await DropDown.instance({
                  id: ids.entityType,
                  label: html`Entity Type`,
                  data: entityTypeOptions,
                  containerClass: 'inl',
                })}
              </div>
              <div class="in" style="margin-bottom:8px;">
                ${await DropDown.instance({
                  id: ids.behavior,
                  label: html`Behavior`,
                  data: EntityEngineCyberia.behaviorOptions(),
                  containerClass: 'inl',
                })}
              </div>
              <div class="in" style="font-size:12px;color:#888;">
                <i class="fa-solid fa-circle-info"></i> Defaults are resolved by the entity's active itemId (usually the
                skin): the system finds the document whose <b>Live Item Ids</b> contains it, then applies its dead, drop and
                default object-layer ids — and its <b>Behavior</b> when set. Entity Type is a label only — it is not the
                lookup key and may repeat across documents. A behavior applies to its own entity type only. Leave
                Behavior on <b>auto</b>: a bot derives it (armed → hostile, else passive), a foreground stays normal.
              </div>`,
          )}
          ${group(
            'Live Item Ids',
            'fa-solid fa-heart',
            html`<div class="in" style="font-size:12px;color:#888;margin-bottom:8px;">
                <i class="fa-solid fa-key"></i> Lookup key — an entity runs on this default when it carries every live
                itemId. An itemId may appear in many defaults: the one with the most live itemIds wins, and between
                equal ones the first in the conf of the world.
              </div>
              <div class="in" style="font-size:12px;color:#888;margin-bottom:8px;">
                <i class="fa-solid fa-link"></i> Each item shows its runtime binding. A default names items only; the
                Cyberia Item Catalog binds each one to the definition the runtime runs.
                ${await BtnIcon.instance({
                  class: 'btn-entity-engine-item-catalog',
                  label: html`<i class="fa-solid fa-link"></i> Item Catalog`,
                  style: 'padding:2px 10px;',
                })}
              </div>
              ${await itemListEditor('live', html`Search live itemId`)}`,
          )}
          ${group('Dead Item Ids', 'fa-solid fa-skull', await itemListEditor('dead', html`Search dead itemId`))}
          ${group('Drop Item Ids', 'fa-solid fa-gift', await itemListEditor('drop', html`Search drop itemId`))}
          ${group(
            'Inventory Items Id',
            'fa-solid fa-box-open',
            html`<div class="in" style="font-size:12px;color:#888;margin-bottom:8px;">
                <i class="fa-solid fa-circle-info"></i> The entity carries the union of all four lists. These are the extras
                no lifecycle state activates — a coin balance, say; live, dead and drop ids are already carried and are
                activated by context.
              </div>
              ${await itemListEditor('inventory', html`Search inventory itemId`)}`,
          )}
          ${group(
            'Override Item State',
            'fa-solid fa-sliders',
            html`<div class="in" style="font-size:12px;color:#888;margin-bottom:8px;">
                <i class="fa-solid fa-circle-info"></i> Adjusts what the lists above derive for one id they already carry:
                <b>active</b> forces the spawn state — a skin the equipment rules would otherwise leave inactive — and the
                quantity sizes a stack, which is how a drop bundle declares how many it scatters. An empty box keeps its
                default. An override never adds an id.
              </div>
              <div class="fl" style="align-items:flex-end;">
                <div class="in fll" style="flex:1;">
                  ${await EntityEngineCyberia.buildItemIdDropdown(ids.overrideItemPicker, html`Search carried itemId`)}
                </div>
                <div class="in fll" style="padding-left:6px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-entity-engine-add-override',
                    label: html`<i class="fa-solid fa-plus"></i> Override`,
                  })}
                </div>
              </div>
              <div class="in entity-engine-override-list" style="margin-top:8px;"></div>`,
          )}
          ${group(
            'Instances',
            'fa-solid fa-earth-americas',
            html`<div class="in" style="font-size:12px;opacity:.8;margin-bottom:8px;">
                A world runs on this default only while its conf references it, and the reference is what scopes it — an
                instance never picks up another's wiring by sharing item ids.
              </div>
              <div class="fl entity-engine-instance-links" style="align-items:flex-end;">
                <div class="in fll" style="flex:1;">
                  ${await EntityEngineCyberia.buildInstanceDropdown(ids.instancePicker)}
                </div>
                <div class="in fll" style="padding-left:6px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-entity-engine-add-instance',
                    label: html`<i class="fa-solid fa-plus"></i> Link`,
                  })}
                </div>
                <div class="in fll" style="padding-left:6px;display:none;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-entity-engine-variant',
                    label: html`<i class="fa-solid fa-code-branch"></i> Make variant`,
                  })}
                </div>
              </div>
              <div class="in entity-engine-instance-list" style="margin-top:8px;"></div>`,
          )}`,
      })}
    </div>`;
  }
}

export { EntityEngineCyberia };
