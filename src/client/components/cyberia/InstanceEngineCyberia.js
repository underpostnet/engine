import { BtnIcon } from '../core/BtnIcon.js';
import { Input, InputFile, getFileFromBlobEndpoint } from '../core/Input.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { Tabs } from '../core/Tabs.js';
import { CyberiaInstanceManagement } from '../../services/cyberia-instance/cyberia-instance.management.js';
import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';
import { CyberiaInstanceConfService } from '../../services/cyberia-instance-conf/cyberia-instance-conf.service.js';
import { CyberiaEntityTypeDefaultService } from '../../services/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { CyberiaEconomyService } from '../../services/cyberia-economy/cyberia-economy.service.js';
import { FileService } from '../../services/file/file.service.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';
import { getQueryParams, listenQueryParamsChange, setQueryParams } from '../core/Router.js';
import { GraphLayoutCyberia } from './GraphLayoutCyberia.js';
import { StudioCyberia } from './StudioCyberia.js';
import { resolveGraphLayout, worldPreviewPicture } from './SharedDefaultsCyberia.js';

const ROUTE = 'cyberia-instance-engine';

class InstanceEngineCyberia {
  static currentInstanceId = null;
  static currentInstanceCode = null;
  // The revision of the stored instance the editor loaded; a save names it.
  static currentRevision = 1;
  static crud = null;
  static currentThumbnailId = null;
  static thumbnailDirty = false;
  static portals = [];
  // The saved cells of the graph view; a map without one takes the default cell.
  static mapLayout = [];
  static layoutGraph = null;
  // Name and preview of each map: from the instance map payload, else from the stored map.
  static mapCards = new Map();
  // The map codes whose card is being read.
  static cardLoads = new Set();

  /**
   * Opens the editor on an instance.
   * @param {{instanceCode: string}} params
   * @returns {boolean} Whether the host offers the editor.
   */
  static open({ instanceCode }) {
    return StudioCyberia.open(ROUTE, { instanceCode });
  }

  /** The world preview the engine draws from the saved maps, cells and portals: what the universe shows. */
  static renderWorldPreview() {
    const slot = s('.instance-engine-world-preview');
    if (!slot) return;
    const code = InstanceEngineCyberia.currentInstanceCode;
    const src = code ? `${getApiBaseUrl(worldPreviewPicture(code))}?revision=${InstanceEngineCyberia.currentRevision}` : '';
    if (slot.dataset.src === src) return;
    slot.dataset.src = src;
    slot.innerHTML = src
      ? html`<img
          src="${src}"
          alt="World preview of ${code}"
          style="max-width:100%;max-height:220px;image-rendering:pixelated;border:1px solid var(--studio-subtle-border);"
          onerror="this.style.display='none';"
        />`
      : html`<span>Save the instance to draw its world preview.</span>`;
  }
  /**
   * Reads the card of each map a code names: its name and its stored preview, from the stored map.
   * A map added to the form shows it before the instance is saved; a map that draws nothing shows
   * as empty. A card changes only once its new one arrives.
   */
  static async loadCards(mapCodes) {
    if (mapCodes.length === 0) return InstanceEngineCyberia.renderLayout();
    for (const code of mapCodes) InstanceEngineCyberia.cardLoads.add(code);
    const result = await CyberiaMapService.get({
      filterModel: { code: { filterType: 'set', values: mapCodes } },
      limit: mapCodes.length,
    });
    for (const code of mapCodes) InstanceEngineCyberia.cardLoads.delete(code);
    if (result.status !== 'success') return;
    const stored = new Map(result.data.data.map((map) => [map.code, map]));
    for (const code of mapCodes) {
      const map = stored.get(code);
      const preview = map?.preview?._id ?? map?.preview;
      const empty = Boolean(map) && !preview && map.media?.status === 'ready';
      InstanceEngineCyberia.mapCards.set(code, {
        name: map?.name || code,
        note: !map ? 'Not stored here' : empty ? 'Empty map' : '',
        previewUrl: preview
          ? getApiBaseUrl({ id: preview, endpoint: 'file/blob' })
          : map && !empty
            ? CyberiaMapService.previewUrl(code)
            : '',
      });
    }
    InstanceEngineCyberia.renderLayout();
  }

  /** The maps of the instance on their cells, with the portals between them. */
  static renderLayout() {
    InstanceEngineCyberia.renderWorldPreview();
    const graph = InstanceEngineCyberia.layoutGraph;
    if (!graph) return;
    const mapCodes = DropDown.Tokens['instance-engine-map-codes-dropdown']?.value ?? [];
    const unread = mapCodes.filter(
      (code) => !InstanceEngineCyberia.mapCards.has(code) && !InstanceEngineCyberia.cardLoads.has(code),
    );
    if (unread.length > 0) InstanceEngineCyberia.loadCards(unread);
    const cells = resolveGraphLayout([...mapCodes], InstanceEngineCyberia.mapLayout, 'mapCode');
    const loops = new Map();
    const pairs = new Map();
    for (const { sourceMapCode: source, targetMapCode: target } of InstanceEngineCyberia.portals) {
      if (source === target) {
        loops.set(source, (loops.get(source) ?? 0) + 1);
        continue;
      }
      const key = [source, target].sort().join('\u0000');
      const pair = pairs.get(key) ?? { source, target, forward: 0, back: 0 };
      if (pair.source === source) pair.forward++;
      else pair.back++;
      pairs.set(key, pair);
    }
    graph.update({
      nodes: cells.map(({ mapCode, x, y }) => {
        const card = InstanceEngineCyberia.mapCards.get(mapCode);
        return {
          code: mapCode,
          label: card?.name || mapCode,
          sublabel: card?.name && card.name !== mapCode ? mapCode : '',
          note: card ? card.note : 'Reading the map',
          x,
          y,
          image: card?.previewUrl ?? '',
          loops: loops.get(mapCode) ?? 0,
        };
      }),
      edges: [...pairs.values()].map(({ source, target, forward, back }) => ({
        source: forward > 0 ? source : target,
        target: forward > 0 ? target : source,
        bidirectional: forward > 0 && back > 0,
        label: forward + back > 1 ? `${forward + back} portals` : '',
      })),
      empty: 'Add maps in the Maps tab to lay out the instance.',
      hint: 'Drag a map to a free cell. The layout moves no portal and no entity.',
    });
  }
  static topologyTimer = null;

  /** Checks what the portals of the form connect, a moment after the last change. */
  static checkTopology() {
    clearTimeout(InstanceEngineCyberia.topologyTimer);
    InstanceEngineCyberia.topologyTimer = setTimeout(async () => {
      const panel = s('.instance-engine-topology');
      const mapCodes = [...(DropDown.Tokens['instance-engine-map-codes-dropdown']?.value ?? [])];
      if (!panel) return;
      if (mapCodes.length === 0) return (panel.innerHTML = '');
      const result = await CyberiaInstanceService.getTopology({
        body: { mapCodes, portals: InstanceEngineCyberia.portals },
      });
      if (result.status !== 'success') return (panel.textContent = result.message);
      const { maps, portalEntities, connections, unreachable, unresolved, invalid, unconnected } = result.data;
      const cell = ({ sourceMapCode, sourceCellX, sourceCellY }) => `${sourceMapCode} (${sourceCellX}, ${sourceCellY})`;
      const issues = [
        [`Maps a player cannot reach from ${mapCodes[0]}`, unreachable],
        ['Portals with no portal entity at their source cell', unresolved.map(cell)],
        ['Portals to a map outside the instance', invalid.map((portal) => `${cell(portal)} → ${portal.targetMapCode}`)],
        [
          'Portal entities no portal starts from',
          unconnected.map(({ mapCode, cellX, cellY }) => `${mapCode} (${cellX}, ${cellY})`),
        ],
      ].filter(([, entries]) => entries.length > 0);
      panel.innerHTML = html`<div style="font-weight:bold;">
          Topology · ${maps} maps · ${portalEntities} portal entities · ${connections} connections
        </div>
        ${
          portalEntities === 0
            ? html`<div>
                No map holds a portal entity: place portals in the Map Studio, then run the Portal Connector.
              </div>`
            : ''
        }
        ${
          issues.length > 0
            ? html`<ul style="margin:4px 0;padding-left:18px;color:#ff8a9e;">
                ${issues.map(([label, entries]) => html`<li>${label}: ${entries.join(', ')}</li>`).join('')}
              </ul>`
            : portalEntities > 0
              ? html`<div style="color:var(--studio-positive);">
                  Every map is reachable, and every portal entity leads somewhere.
                </div>`
              : ''
        }`;
    }, 300);
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
      listHtml += html`<div class="fl" style="border-bottom:1px solid var(--studio-subtle-border); padding:4px 0; align-items:center;">
        <div class="in fll" style="flex:1;font-size:12px;font-family:monospace;">
          <span style="color:var(--studio-accent);">${portal.sourceMapCode}</span>
          (${portal.sourceCellX}, ${portal.sourceCellY})
          <span style="margin:0 4px;">&rarr;</span>
          <span style="color:var(--studio-accent-warm);">${portal.targetMapCode}</span>
          ${portal.targetCellX < 0 || portal.targetCellY < 0
            ? '<span style="color:#aaa;">(random)</span>'
            : `(${portal.targetCellX}, ${portal.targetCellY})`}
          <span style="color:var(--studio-positive);margin-left:4px;font-size:11px;"
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
    InstanceEngineCyberia.renderLayout();
    InstanceEngineCyberia.checkTopology();

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
    const idSpawnMapCode = 'instance-engine-spawn-map-code';
    const idSpawnCellX = 'instance-engine-spawn-cell-x';
    const idSpawnCellY = 'instance-engine-spawn-cell-y';
    const idSpawnRandom = 'instance-engine-spawn-random';
    const idAoiRadius = 'instance-engine-aoi-radius';
    const idEconomy = 'instance-engine-economy';

    InstanceEngineCyberia.currentInstanceId = null;
    InstanceEngineCyberia.currentInstanceCode = null;
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
        mapLayout: InstanceEngineCyberia.mapLayout.filter((cell) => cyberiaMapCodes.includes(cell.mapCode)),
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

    // The AOI radius and the economy live on the linked CyberiaInstanceConf (auto-upserted on
    // instance save). Fetch / update it by instanceCode so the engine can edit them alongside
    // instance identity without touching the rest of the conf.
    const fetchConfByCode = async (instanceCode) => {
      if (!instanceCode) return null;
      const res = await CyberiaInstanceConfService.get({
        filterModel: { instanceCode: { filterType: 'text', type: 'equals', filter: instanceCode } },
      });
      return res?.data?.data?.[0] || null;
    };

    /** Writes the AOI radius and the economy the form holds; the server refuses an economy that splits a wallet. */
    const persistConf = async (instanceCode) => {
      const body = {};
      const aoiRadius = parseFloat(s(`.${idAoiRadius}`)?.value ?? '');
      if (Number.isFinite(aoiRadius)) body.aoiRadius = aoiRadius;
      const economyCode = s(`.${idEconomy}`)?.value;
      if (economyCode) body.economyCode = economyCode;
      const conf = await fetchConfByCode(instanceCode);
      if (!conf?._id || Object.keys(body).length === 0) return null;
      const result = await CyberiaInstanceConfService.put({ id: conf._id, body });
      if (result?.status !== 'success') {
        NotificationManager.Push({ html: result?.message || 'Could not save the instance settings.', status: 'error' });
        if (s(`.${idEconomy}`)) s(`.${idEconomy}`).value = conf.economyCode || '';
      }
      return result;
    };

    /** The economies a world may run: the active ones, and the one its conf names. */
    const renderEconomyOptions = async (selected) => {
      const select = s(`.${idEconomy}`);
      if (!select) return;
      const result = await CyberiaEconomyService.get({ limit: 50, sort: 'code', order: 'asc' });
      const economies = result?.status === 'success' ? result.data.data : [];
      const codes = economies.filter(({ status }) => status !== 'retired').map(({ code }) => code);
      if (selected && !codes.includes(selected)) codes.push(selected);
      select.innerHTML = codes
        .map(
          (code) =>
            html`<option value="${escapeHtml(code)}" ${code === selected ? 'selected' : ''}>
              ${escapeHtml(code)}
            </option>`,
        )
        .join('');
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
        body.revision = InstanceEngineCyberia.currentRevision;
        result = await CyberiaInstanceService.put({ id: InstanceEngineCyberia.currentInstanceId, body });
      } else {
        result = await CyberiaInstanceService.post({ body });
      }
      if (notify) EditorCrud.notify(result, isUpdate ? 'success-update-item' : 'success-create-item');
      if (result.status === 'success') {
        if (result.data?._id) InstanceEngineCyberia.currentInstanceId = result.data._id;
        InstanceEngineCyberia.currentRevision = result.data?.revision ?? InstanceEngineCyberia.currentRevision;
        if (s(`.${idCode}`)) s(`.${idCode}`).disabled = true;
        // A newly saved instance becomes the one the URL points at.
        InstanceEngineCyberia.currentInstanceCode = body.code || null;
        InstanceEngineCyberia.renderWorldPreview();
        InstanceEngineCyberia.crud?.refresh();
        setQueryParams({ instanceCode: body.code || null }, { replace: true });
        // The conf is auto-upserted on instance save; persist the AOI radius and the economy onto
        // it now that we know the instance code resolves to a conf document.
        await persistConf(body.code);
        await DefaultManagement.loadTable(managementId, { force: true, reload: true });
      }
      return result;
    };

    const saveInstance = async () => {
      await persistInstance({ notify: true });
    };

    // The maps of the instance, as the map codes dropdown shows them.
    const setMapCodes = (mapCodes) => {
      const token = DropDown.Tokens[idMapCodesDropdown];
      if (!token) return;
      token.oncheckvalues = {};
      for (const code of mapCodes) {
        const key = code.trim().replaceAll(' ', '-');
        token.oncheckvalues[key] = { data: code, display: code, value: code };
      }
      token.value = mapCodes;
      if (s(`.${idMapCodesDropdown}`)) s(`.${idMapCodesDropdown}`).value = mapCodes;
      if (s(`.dropdown-current-${idMapCodesDropdown}`)) token._renderSelectedBadges?.();
    };

    // The maps a source adds: each in the instance already, added, or skipped because this host
    // does not store it. Adding is a change of the form; a save keeps it.
    const previewMapImport = (title, maps) => {
      const current = DropDown.Tokens[idMapCodesDropdown]?.value ?? [];
      const rows = maps.map((map) => ({
        ...map,
        status: current.includes(map.code)
          ? 'In the instance'
          : map.stored
            ? 'Adds'
            : 'Not stored here: import its content first',
      }));
      const adds = rows.filter(({ status }) => status === 'Adds').map(({ code }) => code);
      const panel = s('.instance-engine-map-import');
      panel.innerHTML = html`<div class="in" style="margin-top:8px;font-weight:bold;">${title}</div>
        <ul style="margin:4px 0;padding-left:18px;font-size:13px;">
          ${rows
            .map(
              ({ code, name, status }) =>
                html`<li>
                  ${name ? `${name} · ` : ''}<code>${code}</code> —
                  <span style="opacity:${status === 'Adds' ? 1 : 0.7}">${status}</span>
                </li>`,
            )
            .join('')}
        </ul>
        <div class="in" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="btn-instance-engine-map-import-apply" ${adds.length === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-plus"></i> Add ${adds.length} maps
          </button>
          <button type="button" class="btn-instance-engine-map-import-close">
            <i class="fa-solid fa-xmark"></i> Close
          </button>
        </div>`;
      panel.querySelector('.btn-instance-engine-map-import-apply').onclick = () => {
        setMapCodes([...current, ...adds]);
        panel.innerHTML = '';
        InstanceEngineCyberia.renderLayout();
        InstanceEngineCyberia.checkTopology();
        NotificationManager.Push({
          html: `${adds.length} maps added. Save the instance to keep them.`,
          status: 'success',
        });
      };
      panel.querySelector('.btn-instance-engine-map-import-close').onclick = () => (panel.innerHTML = '');
    };

    const readMapSources = async () => {
      const result = await CyberiaInstanceService.getMapSources();
      if (result.status !== 'success') {
        NotificationManager.Push({ html: result.message, status: 'error' });
        return null;
      }
      const sagas = s('.instance-engine-saga');
      if (sagas && sagas.options.length === 0)
        sagas.innerHTML = result.data.sagas
          .map(({ code, name }) => html`<option value="${code}">${name || code}</option>`)
          .join('');
      return result.data;
    };

    const loadInstance = async (instanceData) => {
      InstanceEngineCyberia.currentInstanceId = instanceData._id || null;
      InstanceEngineCyberia.currentInstanceCode = instanceData.code || null;
      InstanceEngineCyberia.currentRevision = instanceData.revision ?? 1;
      InstanceEngineCyberia.crud?.refresh();
      setQueryParams({ instanceCode: instanceData.code || null }, { replace: true });
      if (s(`.${idCode}`)) {
        s(`.${idCode}`).value = instanceData.code || '';
        s(`.${idCode}`).disabled = !!instanceData._id;
      }
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

      setMapCodes(instanceData.cyberiaMapCodes || []);

      InstanceEngineCyberia.mapLayout = (instanceData.mapLayout || []).map(({ mapCode, x, y }) => ({ mapCode, x, y }));

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
      InstanceEngineCyberia.loadCards(instanceData.cyberiaMapCodes || []);

      // Player spawn (instance-level).
      const spawn = instanceData.playerSpawn || {};
      if (s(`.${idSpawnMapCode}`)) s(`.${idSpawnMapCode}`).value = spawn.sourceMapCode || '';
      if (s(`.${idSpawnCellX}`)) s(`.${idSpawnCellX}`).value = spawn.sourceCellX ?? 0;
      if (s(`.${idSpawnCellY}`)) s(`.${idSpawnCellY}`).value = spawn.sourceCellY ?? 0;
      if (s(`.${idSpawnRandom}`)) s(`.${idSpawnRandom}`).checked = !!spawn.random;

      // AOI radius and economy (live on the linked conf, fetched by instance code).
      const conf = await fetchConfByCode(instanceData.code);
      if (s(`.${idAoiRadius}`)) s(`.${idAoiRadius}`).value = conf?.aoiRadius ?? '';
      await renderEconomyOptions(conf?.economyCode ?? '');
    };

    const newInstance = () => {
      InstanceEngineCyberia.currentInstanceId = null;
      InstanceEngineCyberia.currentInstanceCode = null;
      InstanceEngineCyberia.currentRevision = 1;
      InstanceEngineCyberia.mapLayout = [];
      InstanceEngineCyberia.mapCards = new Map();
      if (s(`.${idCode}`)) s(`.${idCode}`).disabled = false;
      InstanceEngineCyberia.crud?.refresh();
      setQueryParams({ instanceCode: null }, { replace: true });
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
      InstanceEngineCyberia.renderLayout();
      if (s(`.${idSpawnMapCode}`)) s(`.${idSpawnMapCode}`).value = '';
      if (s(`.${idSpawnCellX}`)) s(`.${idSpawnCellX}`).value = 0;
      if (s(`.${idSpawnCellY}`)) s(`.${idSpawnCellY}`).value = 0;
      if (s(`.${idSpawnRandom}`)) s(`.${idSpawnRandom}`).checked = false;
      if (s(`.${idAoiRadius}`)) s(`.${idAoiRadius}`).value = '';
      void renderEconomyOptions('');
    };

    const resetInstance = async () => {
      const { status, data, message } = await CyberiaInstanceService.get({
        id: InstanceEngineCyberia.currentInstanceId,
      });
      if (status === 'success' && data) await loadInstance(data);
      else NotificationManager.Push({ html: message, status: 'error' });
    };

    // ?instanceCode=<code> loads that instance into the form on arrival.
    const loadInstanceByCode = async (code) => {
      if (!code || code === InstanceEngineCyberia.currentInstanceCode) return;
      const { status, data } = await CyberiaInstanceService.get({ id: code });
      if (status !== 'success' || !data?._id) {
        NotificationManager.Push({ html: `No instance answers to the code "${code}"`, status: 'error' });
        return;
      }
      await loadInstance(data);
      NotificationManager.Push({ html: `Instance "${data.name || data.code}" loaded`, status: 'success' });
    };

    listenQueryParamsChange({
      id: 'cyberia-instance-engine-query-listener',
      event: async (queryParams) => {
        if (!s(`.${idCode}`)) return;
        const code = queryParams.instanceCode || null;
        if (code) await loadInstanceByCode(code);
        else if (InstanceEngineCyberia.currentInstanceCode) newInstance();
      },
    });

    setTimeout(async () => {
      EditorLayout.pin(s('.instance-engine-container'), 'instance-engine-stage');
      Tabs.bind(s('.instance-engine-tabs'), {
        onChange: (tab) => {
          if (tab !== 'layout') return;
          InstanceEngineCyberia.renderLayout();
          InstanceEngineCyberia.layoutGraph?.fit();
        },
      });
      InstanceEngineCyberia.layoutGraph = GraphLayoutCyberia.bind(s('.instance-engine-layout'), {
        editable: () => canMutate,
        onMove: (mapCode, x, y) => {
          InstanceEngineCyberia.mapLayout = [
            ...InstanceEngineCyberia.mapLayout.filter((cell) => cell.mapCode !== mapCode),
            { mapCode, x, y },
          ];
          InstanceEngineCyberia.renderLayout();
        },
      });
      InstanceEngineCyberia.crud = EditorCrud.bind(s('.instance-engine-crud'), () => ({
        subject: 'instance',
        id: InstanceEngineCyberia.currentInstanceId,
        name: InstanceEngineCyberia.currentInstanceCode,
        new: () => {
          newInstance();
          Tabs.select(s('.instance-engine-tabs'), 'instance');
        },
        reset: resetInstance,
        ...(canMutate && { save: saveInstance }),
      }));
      await loadInstanceByCode(getQueryParams().instanceCode);
      if (!InstanceEngineCyberia.currentInstanceCode) await renderEconomyOptions('');
      if (s('.btn-instance-engine-open-economy'))
        s('.btn-instance-engine-open-economy').onclick = () =>
          StudioCyberia.open('cyberia-economy-engine', { economyCode: s(`.${idEconomy}`)?.value || null });

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
        // The registry finds the servers of a saved instance only.
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
            body: { mode },
          });
          if (result.status === 'error') {
            NotificationManager.Push({ html: result.message, status: 'error' });
            if (s(statusSelector)) htmls(statusSelector, html`<span style="color:#d66;">${result.message}</span>`);
            return;
          }
          const { endpoints = [] } = result.data || {};
          const failed = endpoints.filter((endpoint) => endpoint.error);
          NotificationManager.Push({
            html: `Hot reload reached ${endpoints.length - failed.length} of ${endpoints.length} server endpoint(s)`,
            status: failed.length ? 'warning' : 'success',
          });
          if (s(statusSelector))
            htmls(
              statusSelector,
              endpoints
                .map((endpoint) =>
                  endpoint.error
                    ? html`<div style="color:#d66;">${escapeHtml(endpoint.url)} · ${escapeHtml(endpoint.error)}</div>`
                    : html`<div style="color:#6b6;">
                        ${escapeHtml(endpoint.url)} · via <b>${endpoint.transport}</b> · ${escapeHtml(endpoint.message)}
                      </div>`,
                )
                .join(''),
            );
        } catch (error) {
          NotificationManager.Push({ html: error.message, status: 'error' });
          if (s(statusSelector)) htmls(statusSelector, html`<span style="color:#d66;">${error.message}</span>`);
        } finally {
          for (const btn of buttons) if (btn) btn.disabled = false;
        }
      };

      // Syncs against what is on screen: the instance is persisted first so the conf and the map
      // selection agree, then the server rewrites the placed entities by the defaults they resolve to.
      if (s(`.btn-instance-engine-sync-entities`))
        s(`.btn-instance-engine-sync-entities`).onclick = async () => {
          const btn = s(`.btn-instance-engine-sync-entities`);
          const status = s(`.instance-engine-sync-entities-status`);
          const code = s(`.${idCode}`)?.value?.trim();
          if (!code) {
            NotificationManager.Push({ html: 'Instance code is required to sync.', status: 'error' });
            return;
          }
          if (btn) btn.disabled = true;
          if (status) htmls(`.instance-engine-sync-entities-status`, 'Syncing…');
          try {
            const persisted = await persistInstance({ notify: false });
            if (persisted?.status !== 'success') {
              NotificationManager.Push({ html: persisted?.message || 'Could not save the instance.', status: 'error' });
              if (status) htmls(`.instance-engine-sync-entities-status`, '');
              return;
            }
            const mapCodes = DropDown.Tokens[idMapCodesDropdown]?.value
              ? [...DropDown.Tokens[idMapCodesDropdown].value]
              : [];
            const result = await CyberiaEntityTypeDefaultService.syncInstance({
              instanceCode: code,
              body: { mapCodes },
            });
            if (result.status === 'error') {
              NotificationManager.Push({ html: result.message, status: 'error' });
              if (status) htmls(`.instance-engine-sync-entities-status`, '');
              return;
            }
            const {
              dropped = [],
              entityDefaults = [],
              skills = [],
              entitiesUpdated = [],
              duplicates = [],
            } = result.data || {};
            const placedRewritten = entitiesUpdated.reduce((sum, { entities }) => sum + entities, 0);
            if (status) {
              htmls(
                `.instance-engine-sync-entities-status`,
                html`${entityDefaults.length} instance row${1 === entityDefaults.length ? '' : 's'}${dropped.length
                  ? ` · dropped ${dropped.length}`
                  : ''}${skills.length
                  ? ` · ${skills.length} skill${1 === skills.length ? '' : 's'}`
                  : ''}${placedRewritten
                  ? ` · placed ${placedRewritten}`
                  : ''}${duplicates.length
                  ? html`<div style="margin-top:3px;color:#c90;">
                      ${duplicates.length} instance row${1 === duplicates.length ? '' : 's'} answer for a build another
                      row of this instance already covers — which one applies depends on list order. Unlink or delete
                      the redundant record in the Entity engine.
                    </div>`
                  : ''}`,
              );
            }
            NotificationManager.Push({
              html: `Entity type defaults synced — ${entityDefaults.length} instance rows`,
              status: 'success',
            });
          } finally {
            if (btn) btn.disabled = false;
          }
        };

      if (s(`.btn-instance-engine-hot-reload`))
        s(`.btn-instance-engine-hot-reload`).onclick = () => triggerHotReload('full');
      if (s(`.btn-instance-engine-hot-reload-incremental`))
        s(`.btn-instance-engine-hot-reload-incremental`).onclick = () => triggerHotReload('incremental');

      if (s('.btn-instance-engine-foundation-maps'))
        s('.btn-instance-engine-foundation-maps').onclick = async () => {
          const sources = await readMapSources();
          if (sources) previewMapImport('The maps of the Foundation', sources.foundation);
        };
      if (s('.btn-instance-engine-saga-maps'))
        s('.btn-instance-engine-saga-maps').onclick = async () => {
          const sources = await readMapSources();
          const saga = sources?.sagas.find(({ code }) => code === s('.instance-engine-saga').value);
          if (saga) previewMapImport(`The maps of ${saga.name || saga.code}`, saga.maps);
          else if (sources) NotificationManager.Push({ html: 'This host stores no saga.', status: 'warning' });
        };
      if (canMutate) void readMapSources();

      if (s(`.btn-instance-engine-arrange`))
        s(`.btn-instance-engine-arrange`).onclick = () => {
          InstanceEngineCyberia.mapLayout = [];
          InstanceEngineCyberia.renderLayout();
          InstanceEngineCyberia.layoutGraph?.fit();
        };

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
    });

    const statusOptions = [
      { value: 'unlisted', display: 'unlisted', data: 'unlisted', onClick: () => {} },
      { value: 'draft', display: 'draft', data: 'draft', onClick: () => {} },
      { value: 'published', display: 'published', data: 'published', onClick: () => {} },
      { value: 'archived', display: 'archived', data: 'archived', onClick: () => {} },
    ];

    const managementTableHtml = await CyberiaInstanceManagement.instance({
      idModal: managementId,
      loadInstanceCallback: async (instance) => {
        await loadInstance(instance);
        Tabs.select(s('.instance-engine-tabs'), 'instance');
      },
      appStore,
    });

    const dcFields = 'instance-engine-dc-fields';
    const dcMetaFields = 'instance-engine-dc-meta';
    const dcPortalSource = 'instance-engine-dc-portal-source';
    const dcPortalTarget = 'instance-engine-dc-portal-target';
    const dcPortalFilter = 'instance-engine-dc-portal-filter';
    const dcSpawn = 'instance-engine-dc-spawn';

    return html`<div class="in section-mp studio-editor instance-engine-container">
      ${EditorCrud.render({ id: 'instance-engine-crud', label: 'Instance' })}
      ${Tabs.render({
        id: 'instance-engine-tabs',
        label: 'Instance tools',
        tabs: [
          {
            id: 'instance',
            label: 'Instance',
            icon: 'fa-solid fa-circle-info',
            content: html`
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
            `,
          },
          {
            id: 'maps',
            label: 'Maps',
            icon: 'fa-solid fa-map',
            content: html`
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
                <div class="in" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;">
                  ${await BtnIcon.instance({
                    class: 'btn-instance-engine-foundation-maps',
                    label: html`<i class="fa-solid fa-landmark"></i> Add the Foundation maps`,
                  })}
                  <select class="instance-engine-saga" aria-label="Saga"></select>
                  ${await BtnIcon.instance({
                    class: 'btn-instance-engine-saga-maps',
                    label: html`<i class="fa-solid fa-book-open"></i> Add the maps of the saga`,
                  })}
                </div>
                <div class="in instance-engine-map-import" aria-live="polite"></div>
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
                <div class="in instance-engine-topology" style="margin-top: 10px; font-size: 13px;" aria-live="polite"></div>
              </div>
            `,
          },
          {
            id: 'layout',
            label: 'Layout',
            icon: 'fa-solid fa-circle-nodes',
            content: html`<div class="in section-mp" style="margin-top: 10px;">
              <div class="in" style="font-size:12px;color:#888;margin-bottom:6px;">
                Where each map sits on the instance map players open. A cell is view data only: it moves no portal,
                no portal cell and no entity. Save keeps it.
              </div>
              ${canMutate
                ? await BtnIcon.instance({
                    class: 'wfa btn-instance-engine-arrange',
                    label: html`<i class="fa-solid fa-table-cells"></i> Arrange on the default cells`,
                  })
                : ''}
              <div class="in instance-engine-layout" style="margin-top: 6px;">
                ${GraphLayoutCyberia.render({ id: 'instance-engine-layout-graph', label: 'Instance map layout' })}
              </div>
              <div class="in input-label" style="font-size:14px;margin:10px 0 5px;">World preview</div>
              <div class="in" style="font-size:12px;color:#888;margin-bottom:6px;">
                The picture of each map on its saved cell. The universe and the world list show it, unless a
                thumbnail is set. A save draws it again.
              </div>
              <div class="in instance-engine-world-preview" style="font-size:12px;color:#888;"></div>
            </div>`,
          },
          {
            id: 'world',
            label: 'World',
            icon: 'fa-solid fa-earth-americas',
            content: html`
              <div class="in section-mp" style="margin-top: 10px;">
                <div class="in input-label" style="font-size:14px;margin-bottom:5px;">Player Spawn &amp; World</div>
                <div class="in" style="font-size:12px;color:#888;margin-bottom:6px;">
                  Fixed spawn places every new player at the cell below. Enable Random (or leave the map code blank) to
                  spawn at a random walkable cell on a random map.
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
                    <input class="${idSpawnRandom}" type="checkbox" style="cursor:pointer;" /> Random spawn (ignore the
                    fixed cell)
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
                <div class="in" style="margin-top:10px;">
                  <label class="in" style="font-size:13px;"
                    >Economy: the wallet, fees and item policies this world runs
                    <select class="wfa ${idEconomy}" ${canMutate ? '' : 'disabled'}></select>
                  </label>
                  <div class="in" style="font-size:12px;color:#888;">
                    The worlds of one universe share one wallet: the server refuses an economy with another currency
                    or maximum.
                  </div>
                  ${await BtnIcon.instance({
                    class: 'wfa btn-instance-engine-open-economy',
                    label: html`<i class="fa-solid fa-coins"></i> Open in the economy editor`,
                  })}
                </div>
              </div>
            `,
          },
          ...(canMutate
            ? [
                {
                  id: 'runtime',
                  label: 'Runtime',
                  icon: 'fa-solid fa-server',
                  content: html`<div class="in section-mp" style="margin-top: 10px;">
                      <div class="in" style="color:#888;font-size:12px;margin-bottom:6px;">
                        Points this instance's conf at every entity-type default the maps of the Maps tab actually place
                        — matched the way the runtime matches them, by live item ids — and at every skill their items
                        trigger. References whose document is gone, and skills nothing carries, are dropped. Saves the
                        instance first, so the maps it syncs against are the ones in the form.
                      </div>
                      ${await BtnIcon.instance({
                        class: 'wfa btn-instance-engine-sync-entities',
                        label: html`<i class="fa-solid fa-diagram-project"></i> Sync Entity Type Defaults`,
                      })}
                      <div class="in instance-engine-sync-entities-status" style="margin-top:5px;font-size:12px;"></div>
                    </div>
                    <div class="in section-mp" style="margin-top: 10px;">
                      ${await BtnIcon.instance({
                        class: 'wfa btn-instance-engine-toggle-hot-reload',
                        label: html`<i class="fa-solid fa-caret-right instance-engine-hot-reload-caret"></i> Hot Reload`,
                      })}
                      <div class="in instance-engine-hot-reload-body hide">
                        <div class="in" style="color:#888;font-size:12px;margin:5px 0;">
                          Rebuilds the world of the live servers of this instance now, instead of waiting for their
                          polling interval. The server registry names the endpoints; a trigger reaches one replica of
                          each, and the other replicas follow with their reload loop.
                        </div>
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
                    </div>`,
                },
              ]
            : []),
          {
            id: 'library',
            label: 'Library',
            icon: 'fa-solid fa-folder-open',
            content: html`${managementTableHtml}`,
          },
        ],
      })}
    </div>`;
  }
}

export { InstanceEngineCyberia };
