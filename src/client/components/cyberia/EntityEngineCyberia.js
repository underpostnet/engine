import { BtnIcon } from '../core/BtnIcon.js';
import { Input } from '../core/Input.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { htmls, s } from '../core/VanillaJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { darkTheme, dynamicCol, ThemeEvents } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { AgGrid } from '../core/AgGrid.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaEntityTypeDefaultService } from '../../services/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { ENTITY_TYPES, SELECTABLE_ENTITY_BEHAVIORS } from './SharedDefaultsCyberia.js';

// DropDown invokes optionData.onClick on selection, so every option must carry one.
const dropdownOption = (value) => ({ value, display: value, data: value, onClick: () => {} });
const groupBorder = () => (darkTheme ? '#3a3a3a' : '#d4d4d4');
const subtleBorder = () => (darkTheme ? '#444' : '#e0e0e0');

// EntityEngineCyberia — CRUD surface for the cyberia-entity-type-default
// collection (the DB-backed mirror of ENTITY_TYPE_DEFAULTS). An ag-grid lists
// every default; clicking a row loads it into the form. The form binds an
// entityType to its lifecycle item-id sets (live / dead / drop) plus the seed
// defaultObjectLayers, with server-backed item-id autocomplete pickers so the
// high-frequency itemId fields stay fast and typo-free. The runtime linking
// rule (entity matches entityType AND carries an active itemId from liveItemIds)
// is content-authority only; this engine never mutates entities or the
// simulation — it owns the default content the seed/instance pipelines consume.
class EntityEngineCyberia {
  static listCache = [];
  static currentId = null;

  // Editable working copies of the array fields for the loaded document.
  static liveItemIds = [];
  static deadItemIds = [];
  static dropItemIds = [];
  static defaultObjectLayers = [];

  static gridId = 'entity-engine-grid';

  static ids = {
    entityType: 'entity-engine-entity-type',
    behavior: 'entity-engine-behavior',
    liveItemPicker: 'entity-engine-live-item-picker',
    deadItemPicker: 'entity-engine-dead-item-picker',
    dropItemPicker: 'entity-engine-drop-item-picker',
    layerItemPicker: 'entity-engine-layer-item-picker',
  };

  // Behavior options: a leading "auto" (empty → runtime derives armed→hostile,
  // else passive) plus the author-assignable canonical behaviors.
  static behaviorOptions() {
    return [
      { value: '', display: '— auto (derive) —', data: '', onClick: () => {} },
      ...SELECTABLE_ENTITY_BEHAVIORS.map((b) => ({
        value: b.id,
        display: b.label,
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
        if (result.status === 'success' && result.data?.itemIds) {
          return result.data.itemIds.map((itemId) => dropdownOption(itemId));
        }
        return [];
      },
    });
  }

  // ── Item-id list editors (live / dead / drop) ────────────────────────────
  static listFieldOf(field) {
    return {
      live: EntityEngineCyberia.liveItemIds,
      dead: EntityEngineCyberia.deadItemIds,
      drop: EntityEngineCyberia.dropItemIds,
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
        style="border-bottom:1px solid ${subtleBorder()};padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">${items[i]}</div>
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

  static addItem(field, pickerId) {
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
    EntityEngineCyberia.renderItemList(field);
  }

  // ── Default object-layer rows ({ itemId, active, quantity }) ──────────────
  static async renderLayerList() {
    const container = s('.entity-engine-layer-list');
    if (!container) return;
    let out = '';
    for (let i = 0; i < EntityEngineCyberia.defaultObjectLayers.length; i++) {
      const l = EntityEngineCyberia.defaultObjectLayers[i];
      out += html`<div
        class="fl"
        style="border-bottom:1px solid ${subtleBorder()};padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">
          ${l.itemId}
          <span style="color:${l.active ? (darkTheme ? '#7ec77e' : '#2a7d2a') : '#888'};">
            · ${l.active ? 'active' : 'inactive'}</span
          >
          · ×${l.quantity}
        </div>
        ${await BtnIcon.instance({
          class: `btn-entity-engine-rm-layer-${i}`,
          label: html`<i class="fa-solid fa-xmark"></i>`,
          style: 'min-width:30px;padding:2px 8px;',
        })}
      </div>`;
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No default object layers.</div>';
    htmls('.entity-engine-layer-list', out);
    for (let i = 0; i < EntityEngineCyberia.defaultObjectLayers.length; i++) {
      if (s(`.btn-entity-engine-rm-layer-${i}`))
        s(`.btn-entity-engine-rm-layer-${i}`).onclick = () => {
          EntityEngineCyberia.defaultObjectLayers.splice(i, 1);
          EntityEngineCyberia.renderLayerList();
        };
    }
  }

  static addLayer() {
    const itemId = EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.layerItemPicker);
    if (!itemId) {
      NotificationManager.Push({ html: 'Select an itemId for the object layer.', status: 'error' });
      return;
    }
    if (EntityEngineCyberia.defaultObjectLayers.some((l) => l.itemId === itemId)) {
      NotificationManager.Push({ html: `Object layer "${itemId}" already added.`, status: 'warning' });
      return;
    }
    const active = !!s('.entity-engine-layer-active')?.checked;
    const quantity = Math.max(0, parseInt(s('.entity-engine-layer-qty')?.value) || 0);
    EntityEngineCyberia.defaultObjectLayers.push({ itemId, active, quantity });
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.layerItemPicker, '');
    if (s('.entity-engine-layer-active')) s('.entity-engine-layer-active').checked = false;
    if (s('.entity-engine-layer-qty')) s('.entity-engine-layer-qty').value = 0;
    EntityEngineCyberia.renderLayerList();
  }

  // ── Grid (CRUD list surface) ──────────────────────────────────────────────
  static toRow(doc) {
    return {
      _id: doc._id,
      entityType: doc.entityType || '',
      behavior: doc.behavior || '',
      liveItemIds: (doc.liveItemIds || []).join(', '),
      deadItemIds: (doc.deadItemIds || []).join(', '),
      dropItemIds: (doc.dropItemIds || []).join(', '),
      objectLayers: (doc.defaultObjectLayers || []).length,
    };
  }

  static async refreshList() {
    const res = await CyberiaEntityTypeDefaultService.get({ limit: 500 });
    EntityEngineCyberia.listCache = res?.data?.data || [];
    const rows = EntityEngineCyberia.listCache.map((d) => EntityEngineCyberia.toRow(d));
    if (AgGrid.grids[EntityEngineCyberia.gridId])
      AgGrid.grids[EntityEngineCyberia.gridId].setGridOption('rowData', rows);
  }

  static notifyResult(result, isUpdate) {
    NotificationManager.Push({
      html:
        result.status === 'error'
          ? result.message
          : isUpdate
            ? Translate.instance('success-update-item')
            : Translate.instance('success-create-item'),
      status: result.status,
    });
  }

  // ── Payload / load / persistence ──────────────────────────────────────────
  static getPayload() {
    return {
      entityType: EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.entityType),
      behavior: EntityEngineCyberia.getSingleDropdownValue(EntityEngineCyberia.ids.behavior),
      liveItemIds: [...EntityEngineCyberia.liveItemIds],
      deadItemIds: [...EntityEngineCyberia.deadItemIds],
      dropItemIds: [...EntityEngineCyberia.dropItemIds],
      defaultObjectLayers: EntityEngineCyberia.defaultObjectLayers.map((l) => ({
        itemId: l.itemId,
        active: !!l.active,
        quantity: l.quantity || 0,
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
    EntityEngineCyberia.defaultObjectLayers = (doc.defaultObjectLayers || []).map((l) => ({
      itemId: l.itemId,
      active: !!l.active,
      quantity: l.quantity || 0,
    }));
    EntityEngineCyberia.renderItemList('live');
    EntityEngineCyberia.renderItemList('dead');
    EntityEngineCyberia.renderItemList('drop');
    EntityEngineCyberia.renderLayerList();
    NotificationManager.Push({ html: `Entity default "${doc.entityType}" loaded`, status: 'success' });
  }

  static reset() {
    EntityEngineCyberia.currentId = null;
    EntityEngineCyberia.liveItemIds = [];
    EntityEngineCyberia.deadItemIds = [];
    EntityEngineCyberia.dropItemIds = [];
    EntityEngineCyberia.defaultObjectLayers = [];
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.entityType, '');
    EntityEngineCyberia.setSingleDropdownValue(EntityEngineCyberia.ids.behavior, '');
    EntityEngineCyberia.renderItemList('live');
    EntityEngineCyberia.renderItemList('dead');
    EntityEngineCyberia.renderItemList('drop');
    EntityEngineCyberia.renderLayerList();
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
    return true;
  }

  // Save: create-or-update by whether a row is loaded. Use Update for an explicit
  // update of the loaded row, or Clone to force a new copy.
  static async save() {
    const body = EntityEngineCyberia.getPayload();
    if (!EntityEngineCyberia.validate(body)) return;
    const isUpdate = !!EntityEngineCyberia.currentId;
    const result = isUpdate
      ? await CyberiaEntityTypeDefaultService.put({ id: EntityEngineCyberia.currentId, body })
      : await CyberiaEntityTypeDefaultService.post({ body });
    EntityEngineCyberia.notifyResult(result, isUpdate);
    if (result.status === 'success') {
      if (result.data?._id) EntityEngineCyberia.currentId = result.data._id;
      await EntityEngineCyberia.refreshList();
    }
  }

  // Update: explicitly persist the loaded row (PUT). Requires a loaded document.
  static async update() {
    if (!EntityEngineCyberia.currentId) {
      NotificationManager.Push({ html: 'Load an entity default to update first.', status: 'warning' });
      return;
    }
    const body = EntityEngineCyberia.getPayload();
    if (!EntityEngineCyberia.validate(body)) return;
    const result = await CyberiaEntityTypeDefaultService.put({ id: EntityEngineCyberia.currentId, body });
    EntityEngineCyberia.notifyResult(result, true);
    if (result.status === 'success') await EntityEngineCyberia.refreshList();
  }

  // Clone: create a NEW document from the current form values (POST), then load
  // the created copy. Subset matching allows shared itemIds, so a near-duplicate
  // default is valid — typically the author then tweaks behavior or live ids.
  static async clone() {
    const body = EntityEngineCyberia.getPayload();
    if (!EntityEngineCyberia.validate(body)) return;
    EntityEngineCyberia.currentId = null;
    const result = await CyberiaEntityTypeDefaultService.post({ body });
    EntityEngineCyberia.notifyResult(result, false);
    if (result.status === 'success') {
      if (result.data?._id) EntityEngineCyberia.currentId = result.data._id;
      await EntityEngineCyberia.refreshList();
      NotificationManager.Push({ html: 'Cloned into a new entity default.', status: 'success' });
    }
  }

  static async delete() {
    const targetId = EntityEngineCyberia.currentId;
    if (!targetId) {
      NotificationManager.Push({ html: 'Load an entity default to delete first.', status: 'warning' });
      return;
    }
    const result = await CyberiaEntityTypeDefaultService.delete({ id: targetId });
    NotificationManager.Push({
      html: result.status === 'error' ? result.message : Translate.instance('item-success-delete'),
      status: result.status,
    });
    if (result.status === 'success') {
      EntityEngineCyberia.reset();
      await EntityEngineCyberia.refreshList();
    }
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
    EntityEngineCyberia.defaultObjectLayers = [];

    const ids = EntityEngineCyberia.ids;
    const entityTypeOptions = Object.values(ENTITY_TYPES).map((t) => dropdownOption(t));
    const cont = 'entity-engine-container';
    const dc = { layer: 'entity-engine-dc-layer' };

    const group = (title, icon, inner) =>
      html`<div class="in" style="border:1px solid ${groupBorder()};border-radius:8px;padding:12px;margin-bottom:14px;">
        <div
          class="in"
          style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;opacity:.85;"
        >
          <i class="${icon}"></i> ${title}
        </div>
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
      ThemeEvents['entity-engine-theme'] = () => {
        EntityEngineCyberia.renderItemList('live');
        EntityEngineCyberia.renderItemList('dead');
        EntityEngineCyberia.renderItemList('drop');
        EntityEngineCyberia.renderLayerList();
      };

      for (const field of ['live', 'dead', 'drop'])
        if (s(`.btn-entity-engine-add-${field}`))
          s(`.btn-entity-engine-add-${field}`).onclick = () =>
            EntityEngineCyberia.addItem(field, ids[`${field}ItemPicker`]);

      if (s('.btn-entity-engine-add-layer'))
        s('.btn-entity-engine-add-layer').onclick = () => EntityEngineCyberia.addLayer();
      if (s('.btn-entity-engine-save')) s('.btn-entity-engine-save').onclick = () => EntityEngineCyberia.save();
      if (s('.btn-entity-engine-update')) s('.btn-entity-engine-update').onclick = () => EntityEngineCyberia.update();
      if (s('.btn-entity-engine-clone')) s('.btn-entity-engine-clone').onclick = () => EntityEngineCyberia.clone();
      if (s('.btn-entity-engine-delete')) s('.btn-entity-engine-delete').onclick = () => EntityEngineCyberia.delete();
      if (s('.btn-entity-engine-new')) s('.btn-entity-engine-new').onclick = () => EntityEngineCyberia.reset();
      if (s('.btn-entity-engine-refresh'))
        s('.btn-entity-engine-refresh').onclick = () => EntityEngineCyberia.refreshList();

      EntityEngineCyberia.renderItemList('live');
      EntityEngineCyberia.renderItemList('dead');
      EntityEngineCyberia.renderItemList('drop');
      EntityEngineCyberia.renderLayerList();
      await EntityEngineCyberia.refreshList();
    });

    return html`<div class="in section-mp entity-engine-container">
      ${group(
        'Existing Entity Defaults',
        'fa-solid fa-table-list',
        html`<div class="fl" style="margin-bottom:8px;">
            <div class="in fll">
              ${await BtnIcon.instance({
                class: 'wfa btn-entity-engine-refresh',
                label: html`<i class="fa-solid fa-rotate"></i> Refresh`,
              })}
            </div>
          </div>
          <div class="in" style="font-size:12px;color:#888;margin-bottom:6px;">
            Click a row to load it into the form.
          </div>
          ${await AgGrid.instance({
            id: EntityEngineCyberia.gridId,
            darkTheme,
            style: { height: '300px' },
            gridOptions: {
              rowData: [],
              columnDefs: [
                { field: 'entityType', headerName: 'Entity Type', minWidth: 120 },
                { field: 'behavior', headerName: 'Behavior', minWidth: 110 },
                { field: 'liveItemIds', headerName: 'Live Item Ids' },
                { field: 'deadItemIds', headerName: 'Dead Item Ids' },
                { field: 'dropItemIds', headerName: 'Drop Item Ids' },
                { field: 'objectLayers', headerName: 'OL', minWidth: 70 },
              ],
              rowSelection: 'single',
              onRowClicked: (event) => {
                const doc = EntityEngineCyberia.listCache.find((d) => d._id === event.data?._id);
                if (doc) EntityEngineCyberia.load(doc);
              },
            },
          })}`,
      )}
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
            lookup key and may repeat across documents. Leave Behavior on <b>auto</b> to derive it (armed → hostile,
            else passive).
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
        'Default Object Layers',
        'fa-solid fa-layer-group',
        html`${dynamicCol({ containerSelector: cont, id: dc.layer, type: 'a-50-b-50' })}
          <div class="fl" style="align-items:flex-end;">
            <div class="in fll ${dc.layer}-col-a" style="padding-right:4px;">
              ${await EntityEngineCyberia.buildItemIdDropdown(ids.layerItemPicker, html`Search itemId`)}
            </div>
            <div class="in fll ${dc.layer}-col-b" style="padding-left:4px;">
              ${await Input.instance({
                id: 'entity-engine-layer-qty',
                label: html`Quantity`,
                containerClass: 'inl',
                type: 'number',
                min: 0,
                value: 0,
              })}
            </div>
          </div>
          <div class="in" style="margin-top:8px;">
            <label style="font-size:13px;cursor:pointer;">
              <input class="entity-engine-layer-active" type="checkbox" /> Active on spawn
            </label>
          </div>
          <div class="in" style="margin-top:8px;">
            ${await BtnIcon.instance({
              class: 'wfa btn-entity-engine-add-layer',
              label: html`<i class="fa-solid fa-plus"></i> Add Object Layer`,
            })}
          </div>
          <div class="in entity-engine-layer-list" style="margin-top:8px;"></div>`,
      )}
      ${group(
        'Save Entity Default',
        'fa-solid fa-floppy-disk',
        html`<div class="fl" style="margin-top:4px;flex-wrap:wrap;">
          ${EntityEngineCyberia.canMutate
            ? html`<div class="in fll" style="flex:1 1 120px;padding:3px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-entity-engine-save',
                    label: html`<i class="fa-solid fa-floppy-disk"></i> Save`,
                  })}
                </div>
                <div class="in fll" style="flex:1 1 120px;padding:3px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-entity-engine-update',
                    label: html`<i class="fa-solid fa-pen-to-square"></i> Update`,
                  })}
                </div>
                <div class="in fll" style="flex:1 1 120px;padding:3px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-entity-engine-clone',
                    label: html`<i class="fa-solid fa-clone"></i> Clone`,
                  })}
                </div>
                <div class="in fll" style="flex:1 1 120px;padding:3px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-entity-engine-delete',
                    label: html`<i class="fa-solid fa-trash"></i> Delete`,
                  })}
                </div>`
            : ''}
          <div class="in fll" style="flex:1 1 120px;padding:3px;">
            ${await BtnIcon.instance({
              class: 'wfa btn-entity-engine-new',
              label: html`<i class="fa-solid fa-file"></i> New`,
            })}
          </div>
        </div>`,
      )}
    </div>`;
  }
}

export { EntityEngineCyberia };
