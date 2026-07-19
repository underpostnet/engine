import { BtnIcon } from '../core/BtnIcon.js';
import { Input, InputFile, getFileFromBlobEndpoint } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { dynamicCol, darkTheme, ThemeEvents } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { CyberiaInstanceManagement } from '../../services/cyberia-instance/cyberia-instance.management.js';
import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';
import { CyberiaInstanceConfService } from '../../services/cyberia-instance-conf/cyberia-instance-conf.service.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { FileService } from '../../services/file/file.service.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';

const dropdownValueKey = (value = '') => String(value).trim().replaceAll(' ', '-');
const createDropdownOption = (value, onClick = () => {}, display = value, data = value) => ({
  value,
  display,
  data,
  onClick,
});

class InstanceEngineCyberia {
  static currentInstanceId = null;
  static currentThumbnailId = null;
  static thumbnailDirty = false;
  static portals = [];
  static itemIdsDropdownId = 'instance-engine-item-ids-dropdown';
  static itemInventoryListId = 'instance-engine-item-inventory-list';
  // itemId → defaultPlayerInventory flag for the currently selected item ids.
  static itemInventoryFlags = {};

  // Current selection, read from the dropdown's `oncheckvalues` (always live —
  // it is updated before `_renderSelectedBadges` runs, unlike `.value` which
  // lags by one in the option-click path).
  static getSelectedItemIds() {
    const token = DropDown.Tokens[InstanceEngineCyberia.itemIdsDropdownId];
    if (!token) return [];
    const fromChecks = Object.values(token.oncheckvalues || {})
      .map((v) => v.data)
      .filter(Boolean);
    if (fromChecks.length > 0) return fromChecks;
    return Array.isArray(token.value) ? token.value.filter(Boolean) : [];
  }

  // Render the per-item "Default Player Inventory" toggles for every selected
  // item id. Kept in sync with the dropdown via a MutationObserver on its badge
  // container (see render()).
  static renderItemInventoryList(containerId = InstanceEngineCyberia.itemInventoryListId) {
    const container = s(`.${containerId}`);
    if (!container) return;

    const selected = InstanceEngineCyberia.getSelectedItemIds();

    // Drop flags for items no longer selected so the payload never carries them.
    for (const key of Object.keys(InstanceEngineCyberia.itemInventoryFlags)) {
      if (!selected.includes(key)) delete InstanceEngineCyberia.itemInventoryFlags[key];
    }

    if (selected.length === 0) {
      htmls(`.${containerId}`, html`<div style="color:#888;font-size:12px;">No item IDs selected.</div>`);
      return;
    }

    let listHtml = '';
    for (const itemId of selected) {
      const checked = InstanceEngineCyberia.itemInventoryFlags[itemId] ? 'checked' : '';
      listHtml += html`<div class="fl" style="border-bottom:1px solid #444;padding:4px 0;align-items:center;">
        <div class="in fll" style="flex:1;font-size:12px;font-family:monospace;">${itemId}</div>
        <div class="in fll" style="display:flex;align-items:center;justify-content:flex-end;">
          <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:5px;">
            <input
              type="checkbox"
              class="instance-engine-item-inv-checkbox"
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

    container.querySelectorAll('.instance-engine-item-inv-checkbox').forEach((cb) => {
      cb.onchange = () => {
        InstanceEngineCyberia.itemInventoryFlags[cb.dataset.itemId] = cb.checked;
      };
    });
  }

  static syncItemIdsDropdownSelection(itemIds = []) {
    const dropdownId = InstanceEngineCyberia.itemIdsDropdownId;
    if (!DropDown.Tokens[dropdownId]) return;

    // Accept both the new [{ id, defaultPlayerInventory }] shape and the legacy
    // string[] shape so older instance docs keep loading.
    const normalized = (itemIds || [])
      .map((entry) => (typeof entry === 'string' ? { id: entry, defaultPlayerInventory: false } : entry))
      .filter((entry) => entry && entry.id);

    DropDown.Tokens[dropdownId].value = [];
    if (s(`.${dropdownId}`)) s(`.${dropdownId}`).value = [];
    DropDown.Tokens[dropdownId].oncheckvalues = {};
    htmls(`.dropdown-current-${dropdownId}`, '');
    htmls(`.${dropdownId}-render-container`, '');

    InstanceEngineCyberia.itemInventoryFlags = {};
    const ids = [];
    for (const entry of normalized) {
      const key = dropdownValueKey(entry.id);
      DropDown.Tokens[dropdownId].oncheckvalues[key] = {
        data: entry.id,
        display: entry.id,
        value: entry.id,
      };
      InstanceEngineCyberia.itemInventoryFlags[entry.id] = !!entry.defaultPlayerInventory;
      ids.push(entry.id);
    }
    DropDown.Tokens[dropdownId].value = [...ids];
    if (s(`.${dropdownId}`)) s(`.${dropdownId}`).value = [...ids];
    DropDown.Tokens[dropdownId]._renderSelectedBadges?.();
    InstanceEngineCyberia.renderItemInventoryList();
  }

  static async buildItemIdsDropdown() {
    return await DropDown.instance({
      id: InstanceEngineCyberia.itemIdsDropdownId,
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

  static renderPortalList(containerId) {
    const container = s(`.${containerId}`);
    if (!container) return;

    const filterSource = s('.instance-engine-filter-source')?.value?.trim().toLowerCase() || '';
    const filterTarget = s('.instance-engine-filter-target')?.value?.trim().toLowerCase() || '';

    const filtered = [];
    InstanceEngineCyberia.portals.forEach((portal, i) => {
      if (filterSource && !(portal.sourceMapCode || '').toLowerCase().includes(filterSource)) return;
      if (filterTarget && !(portal.targetMapCode || '').toLowerCase().includes(filterTarget)) return;
      filtered.push({ portal, i });
    });

    let listHtml = '';
    filtered.forEach(({ portal, i }) => {
      listHtml += html`<div class="fl" style="border-bottom:1px solid #444; padding:4px 0; align-items:center;">
        <div class="in fll" style="flex:1;font-size:12px;font-family:monospace;">
          <span style="color:${darkTheme ? '#8cf' : '#246'};">${portal.sourceMapCode}</span>
          (${portal.sourceCellX}, ${portal.sourceCellY})
          <span style="margin:0 4px;">&rarr;</span>
          <span style="color:${darkTheme ? '#fc8' : '#842'};">${portal.targetMapCode}</span>
          ${portal.targetCellX < 0 || portal.targetCellY < 0
            ? '<span style="color:#aaa;">(random)</span>'
            : `(${portal.targetCellX}, ${portal.targetCellY})`}
          <span style="color:${darkTheme ? '#9e9' : '#383'};margin-left:4px;font-size:11px;"
            >[${portal.portalMode || 'inter-portal'}]</span
          >
        </div>
        <div class="in fll" style="display:flex;gap:3px;">
          <button
            class="btn-instance-engine-load-portal"
            data-index="${i}"
            style="cursor:pointer;background:#36a;color:#fff;border:none;padding:2px 8px;font-size:12px;"
          >
            <i class="fa-solid fa-clone"></i>
          </button>
          <button
            class="btn-instance-engine-remove-portal"
            data-index="${i}"
            style="cursor:pointer;background:#a00;color:#fff;border:none;padding:2px 8px;font-size:12px;"
          >
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`;
    });

    if (!listHtml)
      listHtml = `<div style="color:#888;font-size:13px;">${
        InstanceEngineCyberia.portals.length > 0 ? 'No matching portals.' : 'No portals added yet.'
      }</div>`;

    htmls(`.${containerId}`, listHtml);

    container.querySelectorAll('.btn-instance-engine-remove-portal').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index);
        InstanceEngineCyberia.portals.splice(idx, 1);
        InstanceEngineCyberia.renderPortalList(containerId);
      };
    });

    container.querySelectorAll('.btn-instance-engine-load-portal').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index);
        const portal = InstanceEngineCyberia.portals[idx];
        if (!portal) return;
        if (s('.instance-engine-source-map-code'))
          s('.instance-engine-source-map-code').value = portal.sourceMapCode || '';
        if (s('.instance-engine-source-cell-x')) s('.instance-engine-source-cell-x').value = portal.sourceCellX || 0;
        if (s('.instance-engine-source-cell-y')) s('.instance-engine-source-cell-y').value = portal.sourceCellY || 0;
        if (s('.instance-engine-target-map-code'))
          s('.instance-engine-target-map-code').value = portal.targetMapCode || '';
        if (s('.instance-engine-target-cell-x')) s('.instance-engine-target-cell-x').value = portal.targetCellX || 0;
        if (s('.instance-engine-target-cell-y')) s('.instance-engine-target-cell-y').value = portal.targetCellY || 0;
      };
    });
  }

  static async render(options = {}) {
    const { appStore } = options;
    const role = appStore?.Data?.user?.main?.model?.user?.role || 'guest';
    const canMutate = commonModeratorGuard(role);
    const idCode = 'instance-engine-input-code';
    const idName = 'instance-engine-input-name';
    const idDescription = 'instance-engine-input-description';
    const idTags = 'instance-engine-input-tags';
    const idStatus = 'instance-engine-input-status';
    const idHotReloadUrl = 'instance-engine-input-hot-reload-url';
    const idThumbnail = 'instance-engine-input-thumbnail';
    const idMapCodesDropdown = 'instance-engine-map-codes-dropdown';
    const idItemIdsDropdown = InstanceEngineCyberia.itemIdsDropdownId;
    const managementId = 'modal-cyberia-instance-engine';
    const portalListId = 'instance-engine-portal-list';
    const idSourceMapCode = 'instance-engine-source-map-code';
    const idSourceCellX = 'instance-engine-source-cell-x';
    const idSourceCellY = 'instance-engine-source-cell-y';
    const idTargetMapCode = 'instance-engine-target-map-code';
    const idTargetCellX = 'instance-engine-target-cell-x';
    const idTargetCellY = 'instance-engine-target-cell-y';
    const idFilterSource = 'instance-engine-filter-source';
    const idFilterTarget = 'instance-engine-filter-target';
    const idSpawnMapCode = 'instance-engine-spawn-map-code';
    const idSpawnCellX = 'instance-engine-spawn-cell-x';
    const idSpawnCellY = 'instance-engine-spawn-cell-y';
    const idSpawnRandom = 'instance-engine-spawn-random';
    const idAoiRadius = 'instance-engine-aoi-radius';

    InstanceEngineCyberia.currentInstanceId = null;
    InstanceEngineCyberia.currentThumbnailId = null;
    InstanceEngineCyberia.thumbnailDirty = false;
    InstanceEngineCyberia.portals = [];

    const getInstancePayload = () => {
      const tagsRaw = s(`.${idTags}`)?.value || '';
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);
      const cyberiaMapCodes = DropDown.Tokens[idMapCodesDropdown]?.value
        ? [...DropDown.Tokens[idMapCodesDropdown].value]
        : [];
      const itemIds = InstanceEngineCyberia.getSelectedItemIds().map((id) => ({
        id,
        defaultPlayerInventory: !!InstanceEngineCyberia.itemInventoryFlags[id],
      }));
      const payload = {
        code: s(`.${idCode}`)?.value || '',
        name: s(`.${idName}`)?.value || '',
        description: s(`.${idDescription}`)?.value || '',
        tags,
        status: DropDown.Tokens[idStatus]?.value || 'unlisted',
        cyberiaMapCodes,
        itemIds,
        portals: InstanceEngineCyberia.portals,
        playerSpawn: {
          sourceMapCode: s(`.${idSpawnMapCode}`)?.value?.trim() || '',
          sourceCellX: parseInt(s(`.${idSpawnCellX}`)?.value) || 0,
          sourceCellY: parseInt(s(`.${idSpawnCellY}`)?.value) || 0,
          random: !!s(`.${idSpawnRandom}`)?.checked,
        },
      };
      if (InstanceEngineCyberia.currentThumbnailId) payload.thumbnail = InstanceEngineCyberia.currentThumbnailId;
      return payload;
    };

    // AOI radius lives on the linked CyberiaInstanceConf (auto-upserted on
    // instance save). Fetch / update it by instanceCode so the engine can edit
    // it alongside instance identity without touching the rest of the conf.
    const fetchConfByCode = async (instanceCode) => {
      if (!instanceCode) return null;
      const res = await CyberiaInstanceConfService.get({
        filterModel: { instanceCode: { filterType: 'text', type: 'equals', filter: instanceCode } },
      });
      return res?.data?.data?.[0] || null;
    };

    const persistAoiRadius = async (instanceCode) => {
      const raw = s(`.${idAoiRadius}`)?.value;
      if (raw === undefined || raw === '') return;
      const aoiRadius = parseFloat(raw);
      if (!Number.isFinite(aoiRadius)) return;
      const conf = await fetchConfByCode(instanceCode);
      if (conf?._id) await CyberiaInstanceConfService.put({ id: conf._id, body: { aoiRadius } });
    };

    const persistInstance = async ({ notify = true } = {}) => {
      // Upload thumbnail file only if user selected a new one
      const thumbnailInput = s(`.${idThumbnail}`);
      if (
        InstanceEngineCyberia.thumbnailDirty &&
        thumbnailInput &&
        thumbnailInput.files &&
        thumbnailInput.files.length > 0
      ) {
        const formData = new FormData();
        formData.append('file', thumbnailInput.files[0]);
        const uploadResult = await FileService.post({ body: formData });
        if (uploadResult.status === 'success' && uploadResult.data && uploadResult.data.length > 0) {
          InstanceEngineCyberia.currentThumbnailId = uploadResult.data[0]._id;
        } else {
          if (notify) {
            NotificationManager.Push({
              html: uploadResult.message || 'Failed to upload thumbnail',
              status: 'error',
            });
          }
          return uploadResult;
        }
      }

      const body = getInstancePayload();
      const isUpdate = !!InstanceEngineCyberia.currentInstanceId;
      let result;
      if (isUpdate) {
        result = await CyberiaInstanceService.put({ id: InstanceEngineCyberia.currentInstanceId, body });
      } else {
        result = await CyberiaInstanceService.post({ body });
      }
      if (notify) {
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
      if (result.status === 'success') {
        if (result.data?._id) InstanceEngineCyberia.currentInstanceId = result.data._id;
        // The conf is auto-upserted on instance save; persist the AOI radius onto
        // it now that we know the instance code resolves to a conf document.
        await persistAoiRadius(body.code);
        await DefaultManagement.loadTable(managementId, { force: true, reload: true });
      }
      return result;
    };

    const saveInstance = async () => {
      await persistInstance({ notify: true });
    };

    const loadInstance = async (instanceData) => {
      InstanceEngineCyberia.currentInstanceId = instanceData._id || null;
      if (s(`.${idCode}`)) s(`.${idCode}`).value = instanceData.code || '';
      if (s(`.${idName}`)) s(`.${idName}`).value = instanceData.name || '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = instanceData.description || '';
      if (s(`.${idTags}`)) s(`.${idTags}`).value = (instanceData.tags || []).join(', ');
      const statusValue = instanceData.status || 'unlisted';
      if (DropDown.Tokens[idStatus]) {
        const statusIndex = statusOptions.findIndex((opt) => opt.value === statusValue);
        if (statusIndex > -1) s(`.dropdown-option-${idStatus}-${statusIndex}`).click();
      }

      // Thumbnail
      InstanceEngineCyberia.currentThumbnailId = instanceData.thumbnail || null;
      const thumbnailPreview = s(`.instance-engine-thumbnail-preview`);
      if (InstanceEngineCyberia.currentThumbnailId) {
        const thumbId =
          typeof InstanceEngineCyberia.currentThumbnailId === 'object'
            ? InstanceEngineCyberia.currentThumbnailId._id
            : InstanceEngineCyberia.currentThumbnailId;

        // Set preview image
        if (thumbnailPreview) {
          thumbnailPreview.innerHTML = html`<img
            src="${getApiBaseUrl({ id: thumbId, endpoint: 'file/blob' })}"
            style="max-width:120px;max-height:120px;border:1px solid #555;"
            onerror="this.style.display='none';"
          />`;
        }

        // Populate InputFile with the actual file from server
        if (s(`.${idThumbnail}`)) {
          const fileData = await getFileFromBlobEndpoint({ _id: thumbId, mimetype: 'image/png' });
          if (fileData) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(fileData);
            s(`.${idThumbnail}`).files = dataTransfer.files;
            s(`.${idThumbnail}`).onchange({ target: s(`.${idThumbnail}`) });
          }
        }
        InstanceEngineCyberia.thumbnailDirty = false;
      } else {
        if (thumbnailPreview) thumbnailPreview.innerHTML = '';
        if (s(`.${idThumbnail}`)) {
          s(`.${idThumbnail}`).value = '';
          s(`.${idThumbnail}`).onchange({ target: s(`.${idThumbnail}`) });
        }
      }

      // Creator display
      const creatorDisplay = s(`.instance-engine-creator-display`);
      if (creatorDisplay) {
        if (instanceData.creator) {
          const creatorUsername =
            typeof instanceData.creator === 'object'
              ? instanceData.creator.username || instanceData.creator._id
              : instanceData.creator;
          creatorDisplay.innerHTML = html`<span style="font-family:monospace;font-size:12px;"
            >${creatorUsername}</span
          >`;
        } else {
          creatorDisplay.innerHTML = html`<span style="color:#888;font-size:12px;">—</span>`;
        }
      }

      // Load cyberiaMapCodes into the dropdown
      if (DropDown.Tokens[idMapCodesDropdown]) {
        DropDown.Tokens[idMapCodesDropdown].oncheckvalues = {};
        const mapCodes = instanceData.cyberiaMapCodes || [];
        for (const code of mapCodes) {
          const key = code.trim().replaceAll(' ', '-');
          DropDown.Tokens[idMapCodesDropdown].oncheckvalues[key] = { data: code, display: code, value: code };
        }
        DropDown.Tokens[idMapCodesDropdown].value = mapCodes;
        if (s(`.${idMapCodesDropdown}`)) s(`.${idMapCodesDropdown}`).value = mapCodes;
        if (s(`.dropdown-current-${idMapCodesDropdown}`)) {
          DropDown.Tokens[idMapCodesDropdown]._renderSelectedBadges?.();
        }
      }

      InstanceEngineCyberia.syncItemIdsDropdownSelection(instanceData.itemIds || instanceData.itemsId || []);

      // Load portals
      InstanceEngineCyberia.portals = (instanceData.portals || []).map((p) => ({
        sourceMapCode: p.sourceMapCode || '',
        sourceCellX: p.sourceCellX || 0,
        sourceCellY: p.sourceCellY || 0,
        targetMapCode: p.targetMapCode || '',
        targetCellX: p.targetCellX || 0,
        targetCellY: p.targetCellY || 0,
        portalMode: p.portalMode || 'inter-portal',
      }));
      InstanceEngineCyberia.renderPortalList(portalListId);

      // Player spawn (instance-level).
      const spawn = instanceData.playerSpawn || {};
      if (s(`.${idSpawnMapCode}`)) s(`.${idSpawnMapCode}`).value = spawn.sourceMapCode || '';
      if (s(`.${idSpawnCellX}`)) s(`.${idSpawnCellX}`).value = spawn.sourceCellX ?? 0;
      if (s(`.${idSpawnCellY}`)) s(`.${idSpawnCellY}`).value = spawn.sourceCellY ?? 0;
      if (s(`.${idSpawnRandom}`)) s(`.${idSpawnRandom}`).checked = !!spawn.random;

      // AOI radius (lives on the linked conf, fetched by instance code).
      const conf = await fetchConfByCode(instanceData.code);
      if (s(`.${idAoiRadius}`)) s(`.${idAoiRadius}`).value = conf?.aoiRadius ?? '';
    };

    const resetForm = () => {
      InstanceEngineCyberia.currentInstanceId = null;
      InstanceEngineCyberia.currentThumbnailId = null;
      InstanceEngineCyberia.thumbnailDirty = false;
      if (s(`.${idCode}`)) s(`.${idCode}`).value = '';
      if (s(`.${idName}`)) s(`.${idName}`).value = '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = '';
      if (s(`.${idTags}`)) s(`.${idTags}`).value = '';
      if (DropDown.Tokens[idStatus]) {
        const resetIndex = statusOptions.findIndex((opt) => opt.value === 'unlisted');
        if (resetIndex > -1) s(`.dropdown-option-${idStatus}-${resetIndex}`).click();
      }
      const thumbnailPreview = s(`.instance-engine-thumbnail-preview`);
      if (thumbnailPreview) thumbnailPreview.innerHTML = '';
      if (s(`.${idThumbnail}`)) {
        s(`.${idThumbnail}`).value = '';
        s(`.${idThumbnail}`).onchange({ target: s(`.${idThumbnail}`) });
      }
      const creatorDisplay = s(`.instance-engine-creator-display`);
      if (creatorDisplay) creatorDisplay.innerHTML = '<span style="color:#888;font-size:12px;">—</span>';
      if (DropDown.Tokens[idMapCodesDropdown]) {
        DropDown.Tokens[idMapCodesDropdown].oncheckvalues = {};
        DropDown.Tokens[idMapCodesDropdown].value = [];
        htmls(`.dropdown-current-${idMapCodesDropdown}`, '');
        htmls(`.${idMapCodesDropdown}-render-container`, '');
      }
      if (DropDown.Tokens[idItemIdsDropdown]) {
        DropDown.Tokens[idItemIdsDropdown].oncheckvalues = {};
        DropDown.Tokens[idItemIdsDropdown].value = [];
        htmls(`.dropdown-current-${idItemIdsDropdown}`, '');
        htmls(`.${idItemIdsDropdown}-render-container`, '');
      }
      InstanceEngineCyberia.itemInventoryFlags = {};
      InstanceEngineCyberia.renderItemInventoryList();
      InstanceEngineCyberia.portals = [];
      InstanceEngineCyberia.renderPortalList(portalListId);
      if (s(`.${idSpawnMapCode}`)) s(`.${idSpawnMapCode}`).value = '';
      if (s(`.${idSpawnCellX}`)) s(`.${idSpawnCellX}`).value = 0;
      if (s(`.${idSpawnCellY}`)) s(`.${idSpawnCellY}`).value = 0;
      if (s(`.${idSpawnRandom}`)) s(`.${idSpawnRandom}`).checked = false;
      if (s(`.${idAoiRadius}`)) s(`.${idAoiRadius}`).value = '';
    };

    setTimeout(() => {
      if (s(`.btn-instance-engine-save`)) s(`.btn-instance-engine-save`).onclick = () => saveInstance();
      if (s(`.btn-instance-engine-new`)) s(`.btn-instance-engine-new`).onclick = () => resetForm();

      if (s(`.btn-instance-engine-toggle-thumbnail`))
        s(`.btn-instance-engine-toggle-thumbnail`).onclick = () => {
          const body = s(`.instance-engine-thumbnail-body`);
          const caret = s(`.instance-engine-thumbnail-caret`);
          if (body) body.classList.toggle('hide');
          if (caret) {
            caret.classList.toggle('fa-caret-right');
            caret.classList.toggle('fa-caret-down');
          }
        };

      // Hot reload — trigger a world rebuild on a running cyberia-server.
      if (s(`.btn-instance-engine-toggle-hot-reload`))
        s(`.btn-instance-engine-toggle-hot-reload`).onclick = () => {
          const body = s(`.instance-engine-hot-reload-body`);
          const caret = s(`.instance-engine-hot-reload-caret`);
          if (body) body.classList.toggle('hide');
          if (caret) {
            caret.classList.toggle('fa-caret-right');
            caret.classList.toggle('fa-caret-down');
          }
        };

      const triggerHotReload = async (mode) => {
        const buttons = [s(`.btn-instance-engine-hot-reload`), s(`.btn-instance-engine-hot-reload-incremental`)];
        const statusSelector = `.instance-engine-hot-reload-status`;
        const serverUrl = s(`.${idHotReloadUrl}`)?.value?.trim();
        if (!serverUrl) {
          NotificationManager.Push({ html: 'Set the cyberia-server URL first.', status: 'warning' });
          return;
        }
        // The server rejects a trigger aimed at a different instance, so the
        // instance must exist before it can be named.
        const persistResult = await persistInstance({ notify: false });
        if (!persistResult || persistResult.status !== 'success' || !InstanceEngineCyberia.currentInstanceId) {
          NotificationManager.Push({
            html: persistResult?.message || Translate.instance('save-instance-first') || 'Save the instance first.',
            status: persistResult?.status === 'error' ? 'error' : 'warning',
          });
          return;
        }

        for (const btn of buttons) if (btn) btn.disabled = true;
        if (s(statusSelector))
          htmls(statusSelector, html`<span style="color:#888;">Triggering ${mode} hot reload…</span>`);
        try {
          const result = await CyberiaInstanceService.hotReload({
            id: InstanceEngineCyberia.currentInstanceId,
            body: { serverUrl, mode },
          });
          if (result.status === 'error') {
            NotificationManager.Push({ html: result.message, status: 'error' });
            if (s(statusSelector)) htmls(statusSelector, html`<span style="color:#d66;">${result.message}</span>`);
            return;
          }
          const { transport, durationMs, message, grpcError } = result.data || {};
          NotificationManager.Push({ html: `Hot reload via ${transport}: ${message}`, status: 'success' });
          if (s(statusSelector))
            htmls(
              statusSelector,
              html`<span style="color:#6b6;">via <b>${transport}</b> · ${durationMs}ms · ${message}</span>${grpcError
                  ? html`<div style="color:#a80;">gRPC unavailable: ${grpcError}</div>`
                  : ''}`,
            );
        } catch (error) {
          NotificationManager.Push({ html: error.message, status: 'error' });
          if (s(statusSelector)) htmls(statusSelector, html`<span style="color:#d66;">${error.message}</span>`);
        } finally {
          for (const btn of buttons) if (btn) btn.disabled = false;
        }
      };

      if (s(`.btn-instance-engine-hot-reload`))
        s(`.btn-instance-engine-hot-reload`).onclick = () => triggerHotReload('full');
      if (s(`.btn-instance-engine-hot-reload-incremental`))
        s(`.btn-instance-engine-hot-reload-incremental`).onclick = () => triggerHotReload('incremental');

      // Portal management
      if (s(`.btn-instance-engine-portal-connect`))
        s(`.btn-instance-engine-portal-connect`).onclick = async () => {
          const btn = s(`.btn-instance-engine-portal-connect`);
          if (btn) btn.disabled = true;
          try {
            const persistResult = await persistInstance({ notify: false });
            if (!persistResult || persistResult.status !== 'success' || !InstanceEngineCyberia.currentInstanceId) {
              NotificationManager.Push({
                html: persistResult?.message || Translate.instance('save-instance-first') || 'Save the instance first.',
                status: persistResult?.status === 'error' ? 'error' : 'warning',
              });
              return;
            }
            const result = await CyberiaInstanceService.portalConnect({ id: InstanceEngineCyberia.currentInstanceId });
            if (result.status === 'error') {
              NotificationManager.Push({ html: result.message, status: 'error' });
              return;
            }
            const { portals: generated, topology, message } = result.data || {};
            if (!generated || generated.length === 0) {
              NotificationManager.Push({
                html: message || 'No portals could be generated.',
                status: 'warning',
              });
              return;
            }
            // Replace all portals with the centralized topology output
            // (ring + random behavior for remaining unassigned portals)
            InstanceEngineCyberia.portals = generated.map((p) => ({
              sourceMapCode: p.sourceMapCode || '',
              sourceCellX: p.sourceCellX || 0,
              sourceCellY: p.sourceCellY || 0,
              targetMapCode: p.targetMapCode || '',
              targetCellX: p.targetCellX || 0,
              targetCellY: p.targetCellY || 0,
              portalMode: p.portalMode || 'inter-portal',
            }));
            InstanceEngineCyberia.renderPortalList(portalListId);
            NotificationManager.Push({
              html: `${topology} — ${generated.length} portal(s) generated.`,
              status: 'success',
            });
          } catch (e) {
            NotificationManager.Push({ html: e.message, status: 'error' });
          } finally {
            if (btn) btn.disabled = false;
          }
        };

      if (s(`.btn-instance-engine-add-portal`))
        s(`.btn-instance-engine-add-portal`).onclick = () => {
          const portal = {
            sourceMapCode: s(`.${idSourceMapCode}`)?.value || '',
            sourceCellX: parseInt(s(`.${idSourceCellX}`)?.value) || 0,
            sourceCellY: parseInt(s(`.${idSourceCellY}`)?.value) || 0,
            targetMapCode: s(`.${idTargetMapCode}`)?.value || '',
            targetCellX: parseInt(s(`.${idTargetCellX}`)?.value) || 0,
            targetCellY: parseInt(s(`.${idTargetCellY}`)?.value) || 0,
            portalMode: 'inter-portal',
          };
          InstanceEngineCyberia.portals.push(portal);
          InstanceEngineCyberia.renderPortalList(portalListId);
        };

      if (s('.btn-instance-engine-toggle-portal-filter'))
        s('.btn-instance-engine-toggle-portal-filter').onclick = () => {
          const body = s('.instance-engine-portal-filter-body');
          const caret = s('.instance-engine-portal-filter-caret');
          if (body) body.classList.toggle('hide');
          if (caret) {
            caret.classList.toggle('fa-caret-right');
            caret.classList.toggle('fa-caret-down');
          }
        };

      let portalFilterTimeout = null;
      const applyPortalFilter = () => {
        clearTimeout(portalFilterTimeout);
        portalFilterTimeout = setTimeout(() => {
          InstanceEngineCyberia.renderPortalList(portalListId);
        }, 300);
      };
      [idFilterSource, idFilterTarget].forEach((cls) => {
        if (s(`.${cls}`)) s(`.${cls}`).addEventListener('input', applyPortalFilter);
      });

      if (s('.btn-instance-engine-clear-portal-filter'))
        s('.btn-instance-engine-clear-portal-filter').onclick = () => {
          [idFilterSource, idFilterTarget].forEach((cls) => {
            if (s(`.${cls}`)) s(`.${cls}`).value = '';
          });
          InstanceEngineCyberia.renderPortalList(portalListId);
        };

      // Keep the per-item "Default Player Inventory" toggles in sync with the
      // item-ids dropdown. Every add/remove/clear re-renders the dropdown badge
      // container, so observing it is a reliable change hook (the dropdown
      // exposes no onChange callback).
      const itemBadgeContainer = s(`.dropdown-current-${idItemIdsDropdown}`);
      if (itemBadgeContainer) {
        const itemInventoryObserver = new MutationObserver(() => {
          InstanceEngineCyberia.renderItemInventoryList();
        });
        itemInventoryObserver.observe(itemBadgeContainer, { childList: true, subtree: true });
      }
      InstanceEngineCyberia.renderItemInventoryList();

      ThemeEvents['instance-engine-theme'] = () => {
        InstanceEngineCyberia.renderPortalList(portalListId);
      };
    });

    const statusOptions = [
      { value: 'unlisted', display: 'unlisted', data: 'unlisted', onClick: () => {} },
      { value: 'draft', display: 'draft', data: 'draft', onClick: () => {} },
      { value: 'published', display: 'published', data: 'published', onClick: () => {} },
      { value: 'archived', display: 'archived', data: 'archived', onClick: () => {} },
    ];

    const managementTableHtml = await CyberiaInstanceManagement.instance({
      idModal: managementId,
      loadInstanceCallback: loadInstance,
      appStore,
      readyRowDataEvent: {
        'instance-engine-check-deleted': (rowData) => {
          if (InstanceEngineCyberia.currentInstanceId) {
            const stillExists = rowData.some((row) => row._id === InstanceEngineCyberia.currentInstanceId);
            if (!stillExists) InstanceEngineCyberia.currentInstanceId = null;
          }
        },
      },
    });

    const dcFields = 'instance-engine-dc-fields';
    const dcMetaFields = 'instance-engine-dc-meta';
    const dcSaveNew = 'instance-engine-dc-save-new';
    const dcPortalSource = 'instance-engine-dc-portal-source';
    const dcPortalTarget = 'instance-engine-dc-portal-target';
    const dcPortalFilter = 'instance-engine-dc-portal-filter';
    const dcSpawn = 'instance-engine-dc-spawn';

    return html`<div class="in section-mp instance-engine-container">
      ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcFields, type: 'search-inputs' })}
      <div class="fl">
        <div class="in fll ${dcFields}-col-a">
          ${await Input.instance({
            id: idCode,
            label: html`Code`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcFields}-col-b">
          ${await Input.instance({
            id: idName,
            label: html`Name`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcFields}-col-c">
          ${await Input.instance({
            id: idDescription,
            label: html`Description`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
      </div>
      ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcMetaFields, type: 'search-inputs' })}
      <div class="fl">
        <div class="in fll ${dcMetaFields}-col-a">
          ${await Input.instance({
            id: idTags,
            label: html`Tags (comma separated)`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcMetaFields}-col-b">
          ${await DropDown.instance({
            id: idStatus,
            label: html`Status`,
            data: statusOptions.map((opt) => ({ ...opt })),
            value: 'unlisted',
            containerClass: 'inl',
          })}
        </div>
        <div class="in fll ${dcMetaFields}-col-c">
          <div class="inl">
            <div class="in input-label">Creator</div>
            <div class="in instance-engine-creator-display">
              <span style="color:#888;font-size:12px;">—</span>
            </div>
          </div>
        </div>
      </div>
      <div class="in section-mp" style="margin-top: 5px;">
        <div class="in instance-engine-thumbnail-preview" style="margin-bottom: 5px;"></div>
        ${await BtnIcon.instance({
          class: 'wfa btn-instance-engine-toggle-thumbnail',
          label: html`<i class="fa-solid fa-caret-right instance-engine-thumbnail-caret"></i> Thumbnail`,
        })}
        <div class="in instance-engine-thumbnail-body hide">
          ${await InputFile.instance(
            {
              id: idThumbnail,
              multiple: false,
              extensionsAccept: ['image/png', 'image/jpeg'],
            },
            {
              change: (e) => {
                const file = e.target.files[0];
                if (file) {
                  InstanceEngineCyberia.thumbnailDirty = true;
                  const url = URL.createObjectURL(file);
                  const preview = s('.instance-engine-thumbnail-preview');
                  if (preview)
                    preview.innerHTML = html`<img
                      src="${url}"
                      class="in"
                      style="max-width:300px;height:auto;border:1px solid #555;margin:auto"
                    />`;
                }
              },
              clear: () => {
                InstanceEngineCyberia.thumbnailDirty = true;
                InstanceEngineCyberia.currentThumbnailId = null;
                const preview = s('.instance-engine-thumbnail-preview');
                if (preview) preview.innerHTML = '';
              },
            },
          )}
        </div>
      </div>
      <div class="in section-mp" style="margin-top: 10px;">
        ${await DropDown.instance({
          id: idMapCodesDropdown,
          label: html`Cyberia Map Codes`,
          data: [],
          type: 'checkbox',
          containerClass: 'inl',
          excludeSelected: true,
          serviceProvider: async (q) => {
            const result = await CyberiaMapService.searchCodes({ q });
            if (result.status === 'success' && result.data?.codes) {
              return result.data.codes.map((code) => ({
                value: code,
                display: code,
                data: code,
                onClick: () => {},
              }));
            }
            return [];
          },
        })}
      </div>
      <div class="in section-mp" style="margin-top: 10px;">${await InstanceEngineCyberia.buildItemIdsDropdown()}</div>
      <div class="in section-mp" style="margin-top: 5px;">
        <div class="in input-label" style="font-size:13px;margin-bottom:5px;">Default Player Inventory</div>
        <div class="in ${InstanceEngineCyberia.itemInventoryListId}" style="max-height:200px;overflow-y:auto;"></div>
      </div>
      <div class="in section-mp" style="margin-top: 10px;">
        <div class="in input-label" style="font-size:14px;margin-bottom:5px;">Portals</div>
        ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcPortalSource, type: 'search-inputs' })}
        <div class="fl">
          <div class="in fll ${dcPortalSource}-col-a">
            ${await Input.instance({
              id: idSourceMapCode,
              label: html`Source Map Code`,
              containerClass: 'inl',
              type: 'text',
            })}
          </div>
          <div class="in fll ${dcPortalSource}-col-b">
            ${await Input.instance({
              id: idSourceCellX,
              label: html`Source Cell X`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
          <div class="in fll ${dcPortalSource}-col-c">
            ${await Input.instance({
              id: idSourceCellY,
              label: html`Source Cell Y`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
        </div>
        ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcPortalTarget, type: 'search-inputs' })}
        <div class="fl">
          <div class="in fll ${dcPortalTarget}-col-a">
            ${await Input.instance({
              id: idTargetMapCode,
              label: html`Target Map Code`,
              containerClass: 'inl',
              type: 'text',
            })}
          </div>
          <div class="in fll ${dcPortalTarget}-col-b">
            ${await Input.instance({
              id: idTargetCellX,
              label: html`Target Cell X`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
          <div class="in fll ${dcPortalTarget}-col-c">
            ${await Input.instance({
              id: idTargetCellY,
              label: html`Target Cell Y`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
        </div>
        <div class="in" style="display:flex;gap:5px;flex-wrap:wrap;">
          ${await BtnIcon.instance({
            class: 'wfa btn-instance-engine-add-portal',
            label: html`<i class="fa-solid fa-plus"></i> Add Portal`,
          })}
          ${await BtnIcon.instance({
            class: 'wfa btn-instance-engine-portal-connect',
            label: html`<i class="fa-solid fa-circle-nodes"></i> Portal Connector`,
          })}
        </div>
        <div class="in" style="margin-top: 10px;">
          ${await BtnIcon.instance({
            class: 'wfa btn-instance-engine-toggle-portal-filter',
            label: html`<i class="fa-solid fa-caret-right instance-engine-portal-filter-caret"></i> Filters`,
          })}
          <div class="in instance-engine-portal-filter-body hide">
            ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcPortalFilter, type: 'a-50-b-50' })}
            <div class="fl">
              <div class="in fll ${dcPortalFilter}-col-a">
                ${await Input.instance({
                  id: idFilterSource,
                  label: html`Source Map Code`,
                  containerClass: 'inl',
                  type: 'text',
                  placeholder: true,
                })}
              </div>
              <div class="in fll ${dcPortalFilter}-col-b">
                ${await Input.instance({
                  id: idFilterTarget,
                  label: html`Target Map Code`,
                  containerClass: 'inl',
                  type: 'text',
                  placeholder: true,
                })}
              </div>
            </div>
            <div class="in" style="margin-top:5px;">
              ${await BtnIcon.instance({
                class: 'wfa btn-instance-engine-clear-portal-filter',
                label: html`<i class="fa-solid fa-broom"></i> Clear Filters`,
              })}
            </div>
          </div>
        </div>
        <div class="in ${portalListId}" style="margin-top: 10px; max-height: 200px; overflow-y: auto;"></div>
      </div>
      <div class="in section-mp" style="margin-top: 10px;">
        <div class="in input-label" style="font-size:14px;margin-bottom:5px;">Player Spawn &amp; World</div>
        <div class="in" style="font-size:12px;color:#888;margin-bottom:6px;">
          Fixed spawn places every new player at the cell below. Enable Random (or leave the map code blank) to spawn at
          a random walkable cell on a random map.
        </div>
        ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcSpawn, type: 'search-inputs' })}
        <div class="fl">
          <div class="in fll ${dcSpawn}-col-a">
            ${await Input.instance({
              id: idSpawnMapCode,
              label: html`Spawn Map Code`,
              containerClass: 'inl',
              type: 'text',
            })}
          </div>
          <div class="in fll ${dcSpawn}-col-b">
            ${await Input.instance({
              id: idSpawnCellX,
              label: html`Spawn Cell X`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
          <div class="in fll ${dcSpawn}-col-c">
            ${await Input.instance({
              id: idSpawnCellY,
              label: html`Spawn Cell Y`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
        </div>
        <div class="in" style="margin-top:6px;">
          <label style="font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
            <input class="${idSpawnRandom}" type="checkbox" style="cursor:pointer;" /> Random spawn (ignore the fixed
            cell)
          </label>
        </div>
        <div class="in" style="margin-top:10px;">
          ${await Input.instance({
            id: idAoiRadius,
            label: html`AOI Radius (cells)`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
          })}
        </div>
      </div>
      ${canMutate
        ? html`<div class="in section-mp" style="margin-top: 10px;">
            ${await BtnIcon.instance({
              class: 'wfa btn-instance-engine-toggle-hot-reload',
              label: html`<i class="fa-solid fa-caret-right instance-engine-hot-reload-caret"></i> Hot Reload`,
            })}
            <div class="in instance-engine-hot-reload-body hide">
              <div class="in" style="color:#888;font-size:12px;margin:5px 0;">
                Rebuilds the world of a running cyberia-server for this instance now, instead of waiting for its polling
                interval. Tries the gRPC control service first and falls back to the REST endpoint.
              </div>
              ${await Input.instance({
                id: idHotReloadUrl,
                label: html`<i class="fa-solid fa-server"></i> Cyberia Server URL`,
                containerClass: 'in',
                placeholder: 'https://server.cyberiaonline.com',
                type: 'text',
              })}
              <div class="in" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;">
                ${await BtnIcon.instance({
                  class: 'wfa btn-instance-engine-hot-reload',
                  label: html`<i class="fa-solid fa-rotate"></i> Trigger Hot Reload`,
                })}
                ${await BtnIcon.instance({
                  class: 'wfa btn-instance-engine-hot-reload-incremental',
                  label: html`<i class="fa-solid fa-layer-group"></i> Incremental (assets only)`,
                })}
              </div>
              <div class="in instance-engine-hot-reload-status" style="margin-top:5px;font-size:12px;"></div>
            </div>
          </div>`
        : ''}
      <div class="in section-mp" style="margin-top: 10px;">
        ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcSaveNew, type: 'a-50-b-50' })}
        <div class="fl">
          ${canMutate
            ? html`<div class="in fll ${dcSaveNew}-col-a" style="padding: 5px;">
                ${await BtnIcon.instance({
                  class: 'wfa btn-instance-engine-save',
                  label: html`<i class="fa-solid fa-floppy-disk"></i> Save Instance`,
                })}
              </div>`
            : ''}
          <div class="in fll ${dcSaveNew}-col-b" style="padding: 5px;">
            ${await BtnIcon.instance({
              class: 'wfa btn-instance-engine-new',
              label: html`<i class="fa-solid fa-file"></i> New Instance`,
            })}
          </div>
        </div>
        <div class="in" style="margin-top: 10px;">${managementTableHtml}</div>
      </div>
    </div>`;
  }
}

export { InstanceEngineCyberia };
