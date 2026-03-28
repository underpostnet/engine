import { BtnIcon } from '../core/BtnIcon.js';
import { Input, InputFile, getFileFromBlobEndpoint } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { dynamicCol, darkTheme, ThemeEvents } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { CyberiaInstanceManagement } from '../../services/cyberia-instance/cyberia-instance.management.js';
import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { FileService } from '../../services/file/file.service.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';

class InstanceEngineCyberia {
  static currentInstanceId = null;
  static currentThumbnailId = null;
  static thumbnailDirty = false;
  static portals = [];

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
          (${portal.targetCellX}, ${portal.targetCellY})
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
    const { Elements } = options;
    const idCode = 'instance-engine-input-code';
    const idName = 'instance-engine-input-name';
    const idDescription = 'instance-engine-input-description';
    const idTags = 'instance-engine-input-tags';
    const idStatus = 'instance-engine-input-status';
    const idThumbnail = 'instance-engine-input-thumbnail';
    const idMapCodesDropdown = 'instance-engine-map-codes-dropdown';
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
      const payload = {
        code: s(`.${idCode}`)?.value || '',
        name: s(`.${idName}`)?.value || '',
        description: s(`.${idDescription}`)?.value || '',
        tags,
        status: DropDown.Tokens[idStatus]?.value || 'unlisted',
        cyberiaMapCodes,
        portals: InstanceEngineCyberia.portals,
      };
      if (InstanceEngineCyberia.currentThumbnailId) payload.thumbnail = InstanceEngineCyberia.currentThumbnailId;
      return payload;
    };

    const saveInstance = async () => {
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
          NotificationManager.Push({
            html: uploadResult.message || 'Failed to upload thumbnail',
            status: 'error',
          });
          return;
        }
      }

      const body = getInstancePayload();
      let result;
      if (InstanceEngineCyberia.currentInstanceId) {
        result = await CyberiaInstanceService.put({ id: InstanceEngineCyberia.currentInstanceId, body });
      } else {
        result = await CyberiaInstanceService.post({ body });
      }
      NotificationManager.Push({
        html:
          result.status === 'error'
            ? result.message
            : InstanceEngineCyberia.currentInstanceId
              ? Translate.Render('success-update-item')
              : Translate.Render('success-create-item'),
        status: result.status,
      });
      if (result.status === 'success') {
        if (result.data?._id) InstanceEngineCyberia.currentInstanceId = result.data._id;
        await DefaultManagement.loadTable(managementId, { force: true, reload: true });
      }
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

      // Load portals
      InstanceEngineCyberia.portals = (instanceData.portals || []).map((p) => ({
        sourceMapCode: p.sourceMapCode || '',
        sourceCellX: p.sourceCellX || 0,
        sourceCellY: p.sourceCellY || 0,
        targetMapCode: p.targetMapCode || '',
        targetCellX: p.targetCellX || 0,
        targetCellY: p.targetCellY || 0,
      }));
      InstanceEngineCyberia.renderPortalList(portalListId);
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
      InstanceEngineCyberia.portals = [];
      InstanceEngineCyberia.renderPortalList(portalListId);
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

      // Portal management
      if (s(`.btn-instance-engine-add-portal`))
        s(`.btn-instance-engine-add-portal`).onclick = () => {
          const portal = {
            sourceMapCode: s(`.${idSourceMapCode}`)?.value || '',
            sourceCellX: parseInt(s(`.${idSourceCellX}`)?.value) || 0,
            sourceCellY: parseInt(s(`.${idSourceCellY}`)?.value) || 0,
            targetMapCode: s(`.${idTargetMapCode}`)?.value || '',
            targetCellX: parseInt(s(`.${idTargetCellX}`)?.value) || 0,
            targetCellY: parseInt(s(`.${idTargetCellY}`)?.value) || 0,
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

    const managementTableHtml = await CyberiaInstanceManagement.RenderTable({
      idModal: managementId,
      loadInstanceCallback: loadInstance,
      Elements,
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

    return html`<div class="in section-mp instance-engine-container">
      ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcFields, type: 'search-inputs' })}
      <div class="fl">
        <div class="in fll ${dcFields}-col-a">
          ${await Input.Render({
            id: idCode,
            label: html`Code`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcFields}-col-b">
          ${await Input.Render({
            id: idName,
            label: html`Name`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcFields}-col-c">
          ${await Input.Render({
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
          ${await Input.Render({
            id: idTags,
            label: html`Tags (comma separated)`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcMetaFields}-col-b">
          ${await DropDown.Render({
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
        ${await BtnIcon.Render({
          class: 'wfa btn-instance-engine-toggle-thumbnail',
          label: html`<i class="fa-solid fa-caret-right instance-engine-thumbnail-caret"></i> Thumbnail`,
        })}
        <div class="in instance-engine-thumbnail-body hide">
          ${await InputFile.Render(
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
        ${await DropDown.Render({
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
      <div class="in section-mp" style="margin-top: 10px;">
        <div class="in input-label" style="font-size:14px;margin-bottom:5px;">Portals</div>
        ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcPortalSource, type: 'search-inputs' })}
        <div class="fl">
          <div class="in fll ${dcPortalSource}-col-a">
            ${await Input.Render({
              id: idSourceMapCode,
              label: html`Source Map Code`,
              containerClass: 'inl',
              type: 'text',
            })}
          </div>
          <div class="in fll ${dcPortalSource}-col-b">
            ${await Input.Render({
              id: idSourceCellX,
              label: html`Source Cell X`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
          <div class="in fll ${dcPortalSource}-col-c">
            ${await Input.Render({
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
            ${await Input.Render({
              id: idTargetMapCode,
              label: html`Target Map Code`,
              containerClass: 'inl',
              type: 'text',
            })}
          </div>
          <div class="in fll ${dcPortalTarget}-col-b">
            ${await Input.Render({
              id: idTargetCellX,
              label: html`Target Cell X`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
          <div class="in fll ${dcPortalTarget}-col-c">
            ${await Input.Render({
              id: idTargetCellY,
              label: html`Target Cell Y`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
        </div>
        <div class="in">
          ${await BtnIcon.Render({
            class: 'wfa btn-instance-engine-add-portal',
            label: html`<i class="fa-solid fa-plus"></i> Add Portal`,
          })}
        </div>
        <div class="in" style="margin-top: 10px;">
          ${await BtnIcon.Render({
            class: 'wfa btn-instance-engine-toggle-portal-filter',
            label: html`<i class="fa-solid fa-caret-right instance-engine-portal-filter-caret"></i> Filters`,
          })}
          <div class="in instance-engine-portal-filter-body hide">
            ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcPortalFilter, type: 'a-50-b-50' })}
            <div class="fl">
              <div class="in fll ${dcPortalFilter}-col-a">
                ${await Input.Render({
                  id: idFilterSource,
                  label: html`Source Map Code`,
                  containerClass: 'inl',
                  type: 'text',
                  placeholder: true,
                })}
              </div>
              <div class="in fll ${dcPortalFilter}-col-b">
                ${await Input.Render({
                  id: idFilterTarget,
                  label: html`Target Map Code`,
                  containerClass: 'inl',
                  type: 'text',
                  placeholder: true,
                })}
              </div>
            </div>
            <div class="in" style="margin-top:5px;">
              ${await BtnIcon.Render({
                class: 'wfa btn-instance-engine-clear-portal-filter',
                label: html`<i class="fa-solid fa-broom"></i> Clear Filters`,
              })}
            </div>
          </div>
        </div>
        <div class="in ${portalListId}" style="margin-top: 10px; max-height: 200px; overflow-y: auto;"></div>
      </div>
      <div class="in section-mp" style="margin-top: 10px;">
        ${dynamicCol({ containerSelector: 'instance-engine-container', id: dcSaveNew, type: 'a-50-b-50' })}
        <div class="fl">
          <div class="in fll ${dcSaveNew}-col-a" style="padding: 5px;">
            ${await BtnIcon.Render({
              class: 'wfa btn-instance-engine-save',
              label: html`<i class="fa-solid fa-floppy-disk"></i> Save Instance`,
            })}
          </div>
          <div class="in fll ${dcSaveNew}-col-b" style="padding: 5px;">
            ${await BtnIcon.Render({
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
