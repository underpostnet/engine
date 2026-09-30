import { getProxyPath } from '../core/Router.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { htmls, s } from '../core/VanillaJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { darkTheme } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { AgGrid } from '../core/AgGrid.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaEntityTypeDefaultService } from '../../services/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { CyberiaInstanceConfService } from '../../services/cyberia-instance-conf/cyberia-instance-conf.service.js';
import { ENTITY_TYPES, SELECTABLE_ENTITY_BEHAVIORS } from './SharedDefaultsCyberia.js';

// DropDown invokes optionData.onClick on selection, so every option must carry one.
const dropdownOption = (value) => ({ value, display: value, data: value, onClick: () => {} });

// EntityEngineCyberia — CRUD surface for the cyberia-entity-type-default
// collection (instance wiring over the foundation baseline). An ag-grid lists
// every default; clicking a row loads it into the form. The form binds an
// entityType to its lifecycle item-id sets (live / dead / drop) plus the
// inventory-only extras, with server-backed item-id autocomplete pickers so the
// high-frequency itemId fields stay fast and typo-free. The runtime linking
// rule (entity matches entityType AND carries an active itemId from liveItemIds)
// is content-authority only; this engine never mutates entities or the
// simulation — it owns the default content the seed/instance pipelines consume.
class EntityEngineCyberia {
  static listCache = [];
  static currentId = null;
  static crud = null;

  // Editable working copies of the array fields for the loaded document.
  static liveItemIds = [];
  static deadItemIds = [];
  static dropItemIds = [];
  static inventoryItemsIds = [];
  // Per-id overrides of what the lists derive: { itemId, active, quantity }.
  static overrideItemsIdsState = [];
  // Instance codes whose conf references the loaded default, and every code that could.
  static instanceCodes = [];
  static availableInstanceCodes = [];
  // entityDefault _id → instance codes, for the grid column. Built with the list.
  static instanceLinks = new Map();
  // itemId → item type. A sprite lives under its type, so an item id alone cannot be previewed.
  // Types never change, so this is a cache that only ever grows: ids reach it from the list and
  // from every id added in the form, which is what makes a just-picked item preview immediately.

  static gridId = 'entity-engine-grid';

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

  // Behavior options: a leading "auto" (empty → a bot derives armed→hostile,
  // else passive; a foreground stays normal) plus the author-assignable canonical behaviors.
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

  // Instance codes are a small, already-loaded set, so the picker filters them in place rather
  // than round-tripping per keystroke the way the item-id pickers do.
  static async buildInstanceDropdown(id) {
    return await DropDown.instance({
      id,
      label: html`Search instance code`,
      data: [],
      containerClass: 'inl',
      serviceProvider: async (q) => {
        const query = String(q || '').toLowerCase();
        return EntityEngineCyberia.availableInstanceCodes
          .filter((code) => !query || code.toLowerCase().includes(query))
          .map((code) => dropdownOption(code));
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
          ${EntityEngineCyberia.itemPreview(items[i])}${items[i]}
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
      // offered where it can do something and the reason is stated where it cannot.
      const isDrop = EntityEngineCyberia.listFieldOf('drop').includes(rule.itemId);
      out += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;display:flex;align-items:center;gap:6px;">
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
          ${isDrop
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
            : ''}
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
          const parsed = parseFloat(dropChance.value);
          const rule = EntityEngineCyberia.overrideItemsIdsState[i];
          // An empty or unreadable box means "say nothing", which the whole pipeline reads as
          // always drops — the same as a world that never set one.
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
    let out = '';
    for (let i = 0; i < EntityEngineCyberia.instanceCodes.length; i++) {
      out += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">${EntityEngineCyberia.instanceCodes[i]}</div>
        ${await BtnIcon.instance({
          class: `btn-entity-engine-rm-instance-${i}`,
          label: html`<i class="fa-solid fa-xmark"></i>`,
          style: 'min-width:30px;padding:2px 8px;',
        })}
      </div>`;
    }
    if (!out) {
      out = html`<div style="color:#888;font-size:12px;">
        No instance runs on this default — it reaches no world until one references it.
      </div>`;
    }
    htmls('.entity-engine-instance-list', out);
    for (let i = 0; i < EntityEngineCyberia.instanceCodes.length; i++) {
      if (s(`.btn-entity-engine-rm-instance-${i}`))
        s(`.btn-entity-engine-rm-instance-${i}`).onclick = () => {
          EntityEngineCyberia.instanceCodes.splice(i, 1);
          EntityEngineCyberia.renderInstanceList();
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
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.instancePicker, '');
    EntityEngineCyberia.renderInstanceList();
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
                >${EntityEngineCyberia.itemPreview(itemId)}${itemId}${index < itemIds.length - 1 ? ',' : ''}</span
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
            ({ itemId, active, quantity, dropChance }) =>
              html`<span
                style="font-size:11px;font-family:monospace;white-space:nowrap;${active ? '' : 'color:#888;'}"
                title="${itemId}"
                >${active ? 'active' : 'inactive'} ×${Math.max(1, quantity || 1)}${Number.isFinite(dropChance) &&
                1 !== dropChance
                  ? ` drop ${dropChance}`
                  : ''} ${itemId}</span
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

  // What the grid's text filter reads for a column of rules, since an array of objects has no
  // useful string form of its own.
  static overridesFilterText = (rules = []) =>
    rules
      .map(
        ({ itemId, active, quantity, dropChance }) =>
          `${itemId} ${active ? 'active' : 'inactive'} x${quantity || 1}` +
          (Number.isFinite(dropChance) && 1 !== dropChance ? ` drop${dropChance}` : ''),
      )
      .join(', ');

  static toRow(doc) {
    return {
      _id: doc._id,
      entityType: doc.entityType || '',
      behavior: doc.behavior || '',
      instances: (EntityEngineCyberia.instanceLinks.get(String(doc._id)) || []).join(', '),
      liveItemIds: [...(doc.liveItemIds || [])],
      deadItemIds: [...(doc.deadItemIds || [])],
      dropItemIds: [...(doc.dropItemIds || [])],
      inventoryItemsIds: [...(doc.inventoryItemsIds || [])],
      overrideItemsIdsState: [...(doc.overrideItemsIdsState || [])],
    };
  }

  // The link lives on CyberiaInstanceConf.entityDefaults, so one conf read answers it for every
  // row at once — there is no second place to ask, and nothing to keep in sync.
  static async refreshInstanceLinks() {
    const res = await CyberiaInstanceConfService.get({ limit: 500 });
    const confs = res?.data?.data || [];
    EntityEngineCyberia.availableInstanceCodes = confs.map((conf) => conf.instanceCode).sort();
    EntityEngineCyberia.instanceLinks = new Map();
    for (const conf of confs) {
      for (const ref of conf.entityDefaults || []) {
        const key = String(ref);
        if (!EntityEngineCyberia.instanceLinks.has(key)) EntityEngineCyberia.instanceLinks.set(key, []);
        EntityEngineCyberia.instanceLinks.get(key).push(conf.instanceCode);
      }
    }
    for (const codes of EntityEngineCyberia.instanceLinks.values()) codes.sort();
  }

  static async refreshList() {
    const [res] = await Promise.all([
      CyberiaEntityTypeDefaultService.get({ limit: 500 }),
      EntityEngineCyberia.refreshInstanceLinks(),
    ]);
    EntityEngineCyberia.listCache = res?.data?.data || [];
    const rows = EntityEngineCyberia.listCache.map((d) => EntityEngineCyberia.toRow(d));
    if (AgGrid.grids[EntityEngineCyberia.gridId])
      AgGrid.grids[EntityEngineCyberia.gridId].setGridOption('rowData', rows);
    EntityEngineCyberia.renderInstanceList();
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
        // Sent only when authored. Omitting it is what makes the id drop every time, so a rule
        // that never touched the input reads the same as every rule written before it existed.
        ...(Number.isFinite(rule.dropChance) ? { dropChance: rule.dropChance } : {}),
      })),
    };
  }

  static load(doc) {
    EntityEngineCyberia.currentId = doc._id || null;
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
      ...(Number.isFinite(rule.dropChance) ? { dropChance: rule.dropChance } : {}),
    }));
    EntityEngineCyberia.instanceCodes = [...(EntityEngineCyberia.instanceLinks.get(String(doc._id)) || [])];
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
    const behavior = SELECTABLE_ENTITY_BEHAVIORS.find((b) => b.id === body.behavior);
    if (behavior && behavior.entityType !== body.entityType) {
      NotificationManager.Push({
        html: `Behavior ${behavior.label} applies to ${behavior.entityType} entities only.`,
        status: 'error',
      });
      return false;
    }
    return true;
  }

  /** The loaded default as the CRUD bar names it: its entity type and live item ids. */
  static currentName() {
    const doc = EntityEngineCyberia.listCache.find(({ _id }) => _id === EntityEngineCyberia.currentId);
    return doc ? `${doc.entityType} (${(doc.liveItemIds || []).join(', ')})` : '';
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
    const result = await EditorCrud.save(CyberiaEntityTypeDefaultService, { id: EntityEngineCyberia.currentId, body });
    if (result.status !== 'success') return;
    if (result.data?._id) EntityEngineCyberia.currentId = result.data._id;
    await EntityEngineCyberia.persistInstanceLinks();
    await EntityEngineCyberia.refreshList();
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

  // ── Render ──────────────────────────────────────────────────────────────
  static async render(options = {}) {
    const { appStore } = options;
    const role = appStore?.Data?.user?.main?.model?.user?.role || 'guest';
    EntityEngineCyberia.canMutate = commonModeratorGuard(role);
    EntityEngineCyberia.listCache = [];
    EntityEngineCyberia.currentId = null;
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

    setTimeout(async () => {
      const container = s('.entity-engine-container');
      EditorLayout.bind(container);
      EditorLayout.pin(container, 'entity-engine-stage');

      for (const field of EntityEngineCyberia.ITEM_FIELDS)
        if (s(`.btn-entity-engine-add-${field}`))
          s(`.btn-entity-engine-add-${field}`).onclick = () =>
            EntityEngineCyberia.addItem(field, ids[`${field}ItemPicker`]);

      if (s('.btn-entity-engine-add-override'))
        s('.btn-entity-engine-add-override').onclick = () => EntityEngineCyberia.addOverride();
      if (s('.btn-entity-engine-add-instance'))
        s('.btn-entity-engine-add-instance').onclick = () => EntityEngineCyberia.addInstance();
      EntityEngineCyberia.crud = EditorCrud.bind(container.querySelector('.entity-engine-crud'), () => ({
        subject: 'entity default',
        id: EntityEngineCyberia.currentId,
        name: EntityEngineCyberia.currentName(),
        new: () => EntityEngineCyberia.newDefault(),
        reset: () => EntityEngineCyberia.reset(),
        ...(EntityEngineCyberia.canMutate && {
          save: () => EntityEngineCyberia.save(),
          clone: () => EntityEngineCyberia.clone(),
          delete: () => EntityEngineCyberia.delete(),
        }),
      }));
      if (s('.btn-entity-engine-refresh'))
        s('.btn-entity-engine-refresh').onclick = () => EntityEngineCyberia.refreshList();

      for (const field of EntityEngineCyberia.ITEM_FIELDS) EntityEngineCyberia.renderItemList(field);
      EntityEngineCyberia.renderOverrideList();
      await EntityEngineCyberia.refreshList();
    });

    return html`<div class="in section-mp studio-editor entity-engine-container">
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
        stage: await AgGrid.instance({
          id: EntityEngineCyberia.gridId,
          darkTheme,
          style: { width: '44rem', 'max-width': '100%', height: '50vh' },
          gridOptions: {
            rowData: [],
            columnDefs: [
              { field: 'entityType', headerName: 'Entity Type', minWidth: 120 },
              { field: 'behavior', headerName: 'Behavior', minWidth: 110 },
              { field: 'instances', headerName: 'Instances', minWidth: 160 },
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
                headerName: 'Resume Override',
                minWidth: 200,
                autoHeight: true,
                cellRenderer: EntityEngineCyberia.overridesRenderer(),
                filterValueGetter: (params) =>
                  EntityEngineCyberia.overridesFilterText(params.data?.overrideItemsIdsState),
              },
            ],
            rowSelection: 'single',
            onRowClicked: (event) => {
              const doc = EntityEngineCyberia.listCache.find((d) => d._id === event.data?._id);
              if (doc) EntityEngineCyberia.load(doc);
            },
          },
        }),
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
                <i class="fa-solid fa-key"></i> Lookup key — each itemId may belong to only one entity default across the
                whole collection (empty is allowed for non-lookup categories).
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
                quantity sizes a stack, which is how a drop bundle declares how many it scatters. An override never adds an
                id.
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
              <div class="fl" style="align-items:flex-end;">
                <div class="in fll" style="flex:1;">
                  ${await EntityEngineCyberia.buildInstanceDropdown(ids.instancePicker)}
                </div>
                <div class="in fll" style="padding-left:6px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-entity-engine-add-instance',
                    label: html`<i class="fa-solid fa-plus"></i> Link`,
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
