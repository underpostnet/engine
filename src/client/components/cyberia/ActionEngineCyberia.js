import { BtnIcon } from '../core/BtnIcon.js';
import { Input } from '../core/Input.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { darkTheme, dynamicCol, ThemeEvents } from '../core/Css.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { Tabs } from '../core/Tabs.js';
import { DropDown } from '../core/DropDown.js';
import { ListPager } from '../core/ListPager.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { CyberiaQuestService } from '../../services/cyberia-quest/cyberia-quest.service.js';
import { CyberiaActionService } from '../../services/cyberia-action/cyberia-action.service.js';
import { CyberiaDialogueService } from '../../services/cyberia-dialogue/cyberia-dialogue.service.js';
import { CyberiaSkillService } from '../../services/cyberia-skill/cyberia-skill.service.js';
import { CyberiaSagaService } from '../../services/cyberia-saga/cyberia-saga.service.js';
import { CyberiaMarketService } from '../../services/cyberia-market/cyberia-market.service.js';
import { getQueryParams, listenQueryParamsChange, setQueryParams } from '../core/Router.js';
import { contextIconSrc } from '../objectlayer-studio/ContextPanel.js';
import { QUEST_STEPS_TYPES, SKILL_LOGIC_IDS, skillSummonedItemId } from './SharedDefaultsCyberia.js';
import { sagaBadgeList } from './SagaCyberia.js';
import { SagaSync } from './SagaSyncCyberia.js';
import { StudioCyberia } from './StudioCyberia.js';
import { STUDIO_FORM_STYLE, toggleField } from './StudioFormCyberia.js';

const textFilter = (filter) => ({ filterType: 'text', type: 'equals', filter });
// The map marker of each kind a map places.
const MARKERS = {
  quest: { color: 'rgba(40,120,220,0.92)', glyph: 'Q' },
  action: { color: 'rgba(220,120,40,0.92)', glyph: 'A' },
};
// DropDown invokes optionData.onClick on selection, so every option (including
// serviceProvider results) must carry one.
const dropdownOption = (value) => ({ value, display: value, data: value, onClick: () => {} });

/** The economy capabilities an action edits: an empty list, a zero or an empty code turns one off. */
const blankCapabilities = () => ({
  storageSlots: 0,
  buybackItems: [],
  burnItems: [],
  market: { marketCode: '', selection: 'policy', itemIds: [], listingModes: ['fixed', 'auction'] },
});

const MODE_LABELS = Object.freeze({ fixed: 'Fixed price', auction: 'Auction' });

/** The item lists of the capabilities, each with its picker. */
const CAPABILITY_LISTS = Object.freeze([
  {
    id: 'buyback',
    label: 'Bought back by the merchant',
    list: (caps) => caps.buybackItems,
    picker: 'action-engine-buyback-item-picker',
  },
  {
    id: 'burn',
    label: 'Burned for salvage',
    list: (caps) => caps.burnItems,
    picker: 'action-engine-burn-item-picker',
  },
  {
    id: 'market',
    label: 'Items a seller lists at this terminal',
    list: (caps) => caps.market.itemIds,
    picker: 'action-engine-market-item-picker',
  },
]);

// ActionEngineCyberia — a map-driven engine that unifies quest, action and
// dialogue authoring around a shared, visual map surface. It is intentionally
// decoupled from MapEngineCyberia: the only integration points are the public
// data services (maps, quests, actions, dialogues, sagas, object-layer item ids) and
// the same object-layer texture-loading convention. The engine reads a map
// purely as a placement backdrop and never mutates map documents. CRUD is
// surfaced as per-entity card lists (mirroring the map-engine entity list),
// not management grids.
class ActionEngineCyberia {
  static mode = 'quest';
  static mapCode = '';
  static mapDoc = null;
  // The shown page of the quests and actions the loaded map places.
  static assignments = { quest: [], action: [] };
  // The sagas of each code, by bucket: `{ items, maps, quests, actions, dialogues }`.
  static sagaSources = {};

  // The loaded document of each kind, `{ id, name }`, or null while its form holds a new one.
  static current = { quest: null, action: null, dialogue: null, skill: null };
  static crud = null;

  static questSteps = [];
  static questRewards = [];
  static actionQuestDialogues = [];
  static loadedActionPayloadExtras = {};
  static capabilities = blankCapabilities();
  // The market scopes, selections and modes of the economy contract.
  static marketContract = { selections: [], modes: [] };
  // The stored profile of the market the form names, or null.
  static marketProfile = null;
  // What the economy capabilities of the saved action do in each world of its map.
  static diagnostics = null;
  // Editable `skills[]` for the loaded CyberiaSkill (logicEventIds are derived
  // from these on save).
  static skillDefs = [];

  static ids = {
    mapDropdown: 'action-engine-map-dropdown',
    objectiveItemPicker: 'action-engine-objective-item-picker',
    rewardItemPicker: 'action-engine-reward-item-picker',
    objectiveType: 'action-engine-objective-type',
    actionDialogPicker: 'action-engine-action-dialog-picker',
    actionQuestDialogPicker: 'action-engine-action-quest-dialog-picker',
    skillTriggerItemPicker: 'action-engine-skill-trigger-item-picker',
    skillSummonedItemPicker: 'action-engine-skill-summoned-item-picker',
  };

  // ── Searchable dropdown helpers ─────────────────────────────────────────
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

  // itemId references the item/object-layer collection, so the picker is a fast
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

  static async buildMapDropdown(id) {
    return await DropDown.instance({
      id,
      label: html`Map`,
      data: [],
      containerClass: 'inl',
      serviceProvider: async (q) => {
        const result = await CyberiaMapService.searchCodes({ q });
        if (result.status === 'success' && result.data?.codes) {
          return result.data.codes.map((code) => dropdownOption(code));
        }
        return [];
      },
    });
  }

  // Dialogue groups are keyed by `code`; the picker derives distinct codes from
  // the dialogue collection so authors can reuse existing dialogue groups.
  /** The market profile a terminal opens: a server-backed search by code. */
  static async buildMarketDropdown(id, label) {
    const pick = async (code) => {
      ActionEngineCyberia.capabilities = ActionEngineCyberia.readCapabilities();
      await ActionEngineCyberia.selectMarket(code);
    };
    return await DropDown.instance({
      id,
      label,
      data: [],
      containerClass: 'inl',
      serviceProvider: async (q) => {
        const result = await CyberiaMarketService.get({
          limit: 50,
          filterModel: { code: { filterType: 'text', type: 'contains', filter: q } },
        });
        return [
          { value: '', display: '(no market)', data: '', onClick: () => pick('') },
          ...(result?.data?.data || []).map(({ code, status }) => ({
            value: code,
            display: status === 'active' ? code : `${code} (retired)`,
            data: code,
            onClick: () => pick(code),
          })),
        ];
      },
    });
  }

  static async buildDialogCodeDropdown(id, label) {
    return await DropDown.instance({
      id,
      label,
      data: [],
      containerClass: 'inl',
      serviceProvider: async (q) => {
        const result = await CyberiaDialogueService.get({
          limit: 100,
          filterModel: { code: { filterType: 'text', type: 'contains', filter: q } },
        });
        const rows = result?.data?.data || [];
        const codes = [...new Set(rows.map((r) => r.code).filter(Boolean))];
        return codes.map((code) => dropdownOption(code));
      },
    });
  }

  // ── Object-layer textures: the idle previews every editor shares ──
  static preloadMapObjectLayers(onLoad) {
    AtlasSpriteSheetService.preloadIdlePreviews(
      (ActionEngineCyberia.mapDoc?.entities || []).flatMap((entity) => entity.objectLayerItemIds || []),
      onLoad,
    );
  }

  // ── Map canvas ──────────────────────────────────────────────────────────
  static getMapGeometry() {
    const map = ActionEngineCyberia.mapDoc;
    return {
      cols: map?.gridX || 16,
      rows: map?.gridY || 16,
      cellW: Math.max(8, Math.min(28, map?.cellWidth || 18)),
      cellH: Math.max(8, Math.min(28, map?.cellHeight || 18)),
    };
  }

  static getSelectedCell() {
    return {
      x: parseInt(s('.action-engine-cell-x')?.value),
      y: parseInt(s('.action-engine-cell-y')?.value),
    };
  }

  static renderMapCanvas() {
    const canvas = s('.action-engine-canvas');
    if (!canvas) return;
    const { cols, rows, cellW, cellH } = ActionEngineCyberia.getMapGeometry();
    canvas.width = cols * cellW;
    canvas.height = rows * cellH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const entity of ActionEngineCyberia.mapDoc?.entities || []) {
      const x = entity.initCellX * cellW;
      const y = entity.initCellY * cellH;
      const w = entity.dimX * cellW;
      const h = entity.dimY * cellH;
      let drew = false;
      if (entity.objectLayerItemIds?.length) {
        for (const itemId of entity.objectLayerItemIds) {
          const img = AtlasSpriteSheetService.idlePreviewImage(itemId);
          if (img) {
            ctx.drawImage(img, x, y, w, h);
            drew = true;
          }
        }
      }
      if (!drew) {
        ctx.fillStyle = entity.color || 'rgba(80,80,80,0.6)';
        ctx.fillRect(x, y, w, h);
      }
    }

    ctx.strokeStyle = darkTheme ? '#3a3a3a' : '#cccccc';
    ctx.lineWidth = 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);

    const drawMarker = (x, y, color, glyph) => {
      const cx = x * cellW + cellW / 2;
      const cy = y * cellH + cellH / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cellW, cellH) / 2.4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.floor(Math.min(cellW, cellH) * 0.7)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, cx, cy);
    };
    for (const [kind, { color, glyph }] of Object.entries(MARKERS))
      for (const doc of ActionEngineCyberia.assignments[kind])
        if (doc.sourceCellX != null) drawMarker(doc.sourceCellX, doc.sourceCellY, color, glyph);

    const sel = ActionEngineCyberia.getSelectedCell();
    if (Number.isFinite(sel.x) && Number.isFinite(sel.y)) {
      ctx.strokeStyle = '#1fd11f';
      ctx.lineWidth = 3;
      ctx.strokeRect(sel.x * cellW + 1, sel.y * cellH + 1, cellW - 2, cellH - 2);
    }
  }

  static async loadMap(code) {
    if (!code) {
      NotificationManager.Push({ html: 'Select a map first.', status: 'warning' });
      return;
    }
    const result = await CyberiaMapService.get({ id: code });
    const doc = result?.status === 'success' ? result.data : null;
    if (!doc) {
      NotificationManager.Push({ html: `Map "${code}" not found`, status: 'error' });
      return;
    }
    ActionEngineCyberia.mapCode = code;
    ActionEngineCyberia.mapDoc = doc;
    htmls('.action-engine-map-meta', `${doc.code} · ${doc.gridX || 16}×${doc.gridY || 16} cells`);
    ActionEngineCyberia.preloadMapObjectLayers(() => ActionEngineCyberia.renderMapCanvas());
    await ActionEngineCyberia.refreshAssignments(1);
  }

  /** Reads the quests and actions the loaded map places, at page `page`, the shown one by default. */
  static refreshAssignments(page) {
    return Promise.all(Object.keys(MARKERS).map((kind) => ListPager.load(`action-engine-map-${kind}`, page)));
  }

  /** One page of the documents of a kind the loaded map places. */
  static async fetchAssignments(kind, query) {
    const code = ActionEngineCyberia.mapCode;
    if (!code) return { data: [], total: 0 };
    const { status, data } = await ActionEngineCyberia.KINDS[kind].service.get({
      ...query,
      filterModel: { sourceMapCode: textFilter(code) },
    });
    return status === 'success' ? data : null;
  }

  /** Shows one page of the assignments of a kind, in its review list and on the map. */
  static showAssignments(kind, docs) {
    ActionEngineCyberia.assignments[kind] = docs;
    ActionEngineCyberia.renderAssignmentReview(kind);
    ActionEngineCyberia.renderMapCanvas();
  }

  static renderAssignmentReview(kind) {
    const selector = `.action-engine-assignment-${kind}`;
    const container = s(selector);
    if (!container) return;
    const { color, glyph } = MARKERS[kind];
    let out = ActionEngineCyberia.assignments[kind]
      .map(
        (doc) =>
          html`<div
            class="fl action-engine-assignment-row"
            style="border-bottom:1px solid var(--studio-subtle-border);padding:4px 0;align-items:center;cursor:pointer;"
            data-id="${doc._id}"
          >
            <div
              class="in fll"
              style="width:18px;height:18px;border-radius:50%;background:${color};color:#fff;text-align:center;font-size:11px;line-height:18px;margin-right:6px;"
            >
              ${glyph}
            </div>
            <div class="in fll" style="flex:1;font-size:12px;font-family:monospace;">
              ${doc.code}
              ${doc.sourceCellX != null
                ? `(${doc.sourceCellX}, ${doc.sourceCellY})`
                : '<span style="color:#999;">unplaced</span>'}
            </div>
          </div>`,
      )
      .join('');
    if (!out)
      out = `<div style="color:#888;font-size:13px;">${ActionEngineCyberia.mapCode ? `No ${kind}s on this map yet.` : 'Load a map to review assignments.'}</div>`;
    htmls(selector, out);
    container.querySelectorAll('.action-engine-assignment-row').forEach((rowEl) => {
      rowEl.onclick = () => ActionEngineCyberia.open(kind, rowEl.dataset.id);
    });
  }

  // ── Mode switching ──────────────────────────────────────────────────────
  // `mode` is the document kind the CRUD bar edits; a tab with no kind hides the bar.
  static setMode(mode) {
    Tabs.select(s('.action-engine-tabs'), mode);
    const kind = Boolean(ActionEngineCyberia.KINDS[mode]);
    s('.action-engine-crud').style.display = kind ? '' : 'none';
    if (!kind) return;
    ActionEngineCyberia.mode = mode;
    ActionEngineCyberia.crud?.refresh();
  }

  // Keeps the shared map surface in sync with the loaded document: reflects the
  // map dropdown, loads the matching map (with object-layer textures) and
  // highlights the assigned cell so the editor is reactive on load.
  static async syncMapForLoadedDoc(doc) {
    if (doc.sourceMapCode) {
      ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.mapDropdown, doc.sourceMapCode);
      if (doc.sourceMapCode !== ActionEngineCyberia.mapCode) {
        await ActionEngineCyberia.loadMap(doc.sourceMapCode);
        return;
      }
    }
    ActionEngineCyberia.renderMapCanvas();
  }

  // ── Multi-step quest editor ─────────────────────────────────────────────
  static syncStepDescriptions() {
    ActionEngineCyberia.questSteps.forEach((step, i) => {
      const el = s(`.action-engine-step-desc-${i}`);
      if (el) step.description = el.value;
    });
  }

  static async renderStepList() {
    const container = s('.action-engine-step-list');
    if (!container) return;
    const steps = ActionEngineCyberia.questSteps;
    let out = '';
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let objOut = '';
      for (let j = 0; j < step.objectives.length; j++) {
        const o = step.objectives[j];
        objOut += html`<div
          class="fl"
          style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;"
        >
          <div class="in fll" style="flex:1;font-family:monospace;font-size:12px;">
            <span style="color:var(--studio-accent);">${o.type}</span> · ${o.itemId} ×${o.quantity}
          </div>
          ${await BtnIcon.instance({
            class: `btn-aeq-rmobj-${i}-${j}`,
            label: html`<i class="fa-solid fa-xmark"></i>`,
            style: 'min-width:30px;padding:2px 8px;',
          })}
        </div>`;
      }
      if (!objOut) objOut = '<div style="color:#888;font-size:11px;padding:2px 0;">No objectives in this step.</div>';
      out += html`<div
        class="in"
        style="border:1px solid var(--studio-subtle-border);border-radius:6px;padding:8px;margin-bottom:8px;"
      >
        <div class="fl" style="align-items:center;margin-bottom:6px;">
          <div class="in fll" style="flex:1;font-weight:bold;font-size:12px;">
            <i class="fa-solid fa-layer-group"></i> Step ${i + 1}
          </div>
          ${await BtnIcon.instance({
            class: `btn-aeq-rmstep-${i}`,
            label: html`<i class="fa-solid fa-trash"></i>`,
            style: 'min-width:30px;padding:2px 8px;',
          })}
        </div>
        ${await Input.instance({
          id: `action-engine-step-desc-${i}`,
          label: html`Step description`,
          containerClass: 'inl',
          type: 'text',
          value: step.description || '',
        })}
        <div class="in" style="margin-top:6px;">${objOut}</div>
      </div>`;
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No steps yet. Add a step to begin.</div>';
    htmls('.action-engine-step-list', out);

    for (let i = 0; i < steps.length; i++) {
      if (s(`.btn-aeq-rmstep-${i}`))
        s(`.btn-aeq-rmstep-${i}`).onclick = () => {
          ActionEngineCyberia.syncStepDescriptions();
          ActionEngineCyberia.questSteps.splice(i, 1);
          ActionEngineCyberia.renderStepList();
        };
      for (let j = 0; j < steps[i].objectives.length; j++) {
        if (s(`.btn-aeq-rmobj-${i}-${j}`))
          s(`.btn-aeq-rmobj-${i}-${j}`).onclick = () => {
            ActionEngineCyberia.syncStepDescriptions();
            ActionEngineCyberia.questSteps[i].objectives.splice(j, 1);
            ActionEngineCyberia.renderStepList();
          };
      }
    }
  }

  static addStep() {
    ActionEngineCyberia.syncStepDescriptions();
    const n = ActionEngineCyberia.questSteps.length + 1;
    ActionEngineCyberia.questSteps.push({ id: `step-${n}`, description: '', objectives: [] });
    ActionEngineCyberia.renderStepList();
    if (s('.action-engine-objective-step')) s('.action-engine-objective-step').value = n;
  }

  static addObjective() {
    const itemId = ActionEngineCyberia.getSingleDropdownValue(ActionEngineCyberia.ids.objectiveItemPicker);
    const type = DropDown.Tokens[ActionEngineCyberia.ids.objectiveType]?.value || QUEST_STEPS_TYPES[0];
    const quantity = Math.max(1, parseInt(s('.action-engine-objective-qty')?.value) || 1);
    if (!itemId) {
      NotificationManager.Push({ html: 'Select an itemId for the objective.', status: 'error' });
      return;
    }
    ActionEngineCyberia.syncStepDescriptions();
    let stepIdx = (parseInt(s('.action-engine-objective-step')?.value) || 1) - 1;
    if (ActionEngineCyberia.questSteps.length === 0) {
      ActionEngineCyberia.questSteps.push({ id: 'step-1', description: '', objectives: [] });
      stepIdx = 0;
      if (s('.action-engine-objective-step')) s('.action-engine-objective-step').value = 1;
    }
    if (stepIdx < 0 || stepIdx >= ActionEngineCyberia.questSteps.length) {
      NotificationManager.Push({ html: `Step #${stepIdx + 1} does not exist.`, status: 'error' });
      return;
    }
    const duplicate = ActionEngineCyberia.questSteps[stepIdx].objectives.some(
      (o) => o.type === type && o.itemId === itemId,
    );
    if (duplicate) {
      NotificationManager.Push({
        html: `Step ${stepIdx + 1} already has a "${type}" objective for "${itemId}".`,
        status: 'error',
      });
      return;
    }
    ActionEngineCyberia.questSteps[stepIdx].objectives.push({ type, itemId, quantity });
    ActionEngineCyberia.renderStepList();
  }

  static async renderRewardList() {
    const container = s('.action-engine-reward-list');
    if (!container) return;
    let out = '';
    for (let i = 0; i < ActionEngineCyberia.questRewards.length; i++) {
      const r = ActionEngineCyberia.questRewards[i];
      out += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">${r.itemId} ×${r.quantity}</div>
        ${await BtnIcon.instance({
          class: `btn-aeq-rmreward-${i}`,
          label: html`<i class="fa-solid fa-xmark"></i>`,
          style: 'min-width:30px;padding:2px 8px;',
        })}
      </div>`;
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No rewards.</div>';
    htmls('.action-engine-reward-list', out);
    for (let i = 0; i < ActionEngineCyberia.questRewards.length; i++) {
      if (s(`.btn-aeq-rmreward-${i}`))
        s(`.btn-aeq-rmreward-${i}`).onclick = () => {
          ActionEngineCyberia.questRewards.splice(i, 1);
          ActionEngineCyberia.renderRewardList();
        };
    }
  }

  static addReward() {
    const itemId = ActionEngineCyberia.getSingleDropdownValue(ActionEngineCyberia.ids.rewardItemPicker);
    const quantity = Math.max(1, parseInt(s('.action-engine-reward-qty')?.value) || 1);
    if (!itemId) {
      NotificationManager.Push({ html: 'Select an itemId for the reward.', status: 'error' });
      return;
    }
    ActionEngineCyberia.questRewards.push({ itemId, quantity });
    ActionEngineCyberia.renderRewardList();
  }

  static async renderQuestDialogueList() {
    const container = s('.action-engine-quest-dialogue-list');
    if (!container) return;
    let out = '';
    for (let i = 0; i < ActionEngineCyberia.actionQuestDialogues.length; i++) {
      const d = ActionEngineCyberia.actionQuestDialogues[i];
      out += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">
          <span style="color:var(--studio-accent);">${d.questCode}</span>
          <span style="margin:0 4px;">&rarr;</span>${d.dialogCode}
        </div>
        ${await BtnIcon.instance({
          class: `btn-aea-rmqd-${i}`,
          label: html`<i class="fa-solid fa-xmark"></i>`,
          style: 'min-width:30px;padding:2px 8px;',
        })}
      </div>`;
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No quest dialogues mapped.</div>';
    htmls('.action-engine-quest-dialogue-list', out);
    for (let i = 0; i < ActionEngineCyberia.actionQuestDialogues.length; i++) {
      if (s(`.btn-aea-rmqd-${i}`))
        s(`.btn-aea-rmqd-${i}`).onclick = () => {
          ActionEngineCyberia.actionQuestDialogues.splice(i, 1);
          ActionEngineCyberia.renderQuestDialogueList();
        };
    }
  }

  // ── Card lists (CRUD surface, mirrors the map-engine entity list) ────────
  static cardActionsHtml(loadCls, delCls) {
    return Promise.all([
      BtnIcon.instance({
        class: loadCls,
        label: html`<i class="fa-solid fa-upload"></i>`,
        style: 'min-width:34px;padding:3px 9px;',
      }),
      ActionEngineCyberia.canMutate
        ? BtnIcon.instance({
            class: delCls,
            label: html`<i class="fa-solid fa-trash"></i>`,
            style: 'min-width:34px;padding:3px 9px;',
          })
        : '',
    ]);
  }

  static cardWrap(inner) {
    return html`<div
      class="in"
      style="border:1px solid var(--studio-subtle-border);border-radius:6px;padding:8px;margin-bottom:6px;"
    >
      ${inner}
    </div>`;
  }

  static async renderQuestCards(items) {
    const container = s('.action-engine-quest-cards');
    if (!container) return;
    let out = '';
    for (const doc of items) {
      const stepCount = (doc.steps || []).length;
      const objCount = (doc.steps || []).reduce((a, st) => a + (st.objectives || []).length, 0);
      const [loadBtn, delBtn] = await ActionEngineCyberia.cardActionsHtml(
        `btn-aeq-load-${doc._id}`,
        `btn-aeq-del-${doc._id}`,
      );
      out += ActionEngineCyberia.cardWrap(
        html`<div class="fl" style="align-items:center;">
          <div class="in fll" style="flex:1;">
            <div style="font-weight:bold;font-family:monospace;font-size:12px;">${doc.code}</div>
            <div style="font-size:11px;color:#888;">${doc.title || ''}</div>
            <div style="font-size:11px;color:#888;">
              ${doc.sourceMapCode ? `${doc.sourceMapCode} (${doc.sourceCellX}, ${doc.sourceCellY})` : 'unplaced'} ·
              ${stepCount} step(s) · ${objCount} objective(s)
            </div>
            ${sagaBadgeList(ActionEngineCyberia.sagasOf('quest', doc))}
          </div>
          <div class="in fll" style="display:flex;gap:4px;">${loadBtn}${delBtn}</div>
        </div>`,
      );
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No quests found.</div>';
    htmls('.action-engine-quest-cards', out);
    for (const doc of items) {
      if (s(`.btn-aeq-load-${doc._id}`))
        s(`.btn-aeq-load-${doc._id}`).onclick = () => ActionEngineCyberia.open('quest', doc._id);
      if (s(`.btn-aeq-del-${doc._id}`))
        s(`.btn-aeq-del-${doc._id}`).onclick = () => ActionEngineCyberia.remove('quest', doc);
    }
  }

  static async renderActionCards(items) {
    const container = s('.action-engine-action-cards');
    if (!container) return;
    let out = '';
    for (const doc of items) {
      const [loadBtn, delBtn] = await ActionEngineCyberia.cardActionsHtml(
        `btn-aea-load-${doc._id}`,
        `btn-aea-del-${doc._id}`,
      );
      out += ActionEngineCyberia.cardWrap(
        html`<div class="fl" style="align-items:center;">
          <div class="in fll" style="flex:1;">
            <div style="font-weight:bold;font-family:monospace;font-size:12px;">${doc.code}</div>
            <div style="font-size:11px;color:#888;">${doc.label || ''}</div>
            <div style="font-size:11px;color:#888;">
              ${doc.sourceMapCode ? `${doc.sourceMapCode} (${doc.sourceCellX}, ${doc.sourceCellY})` : 'unplaced'} ·
              dialog: ${doc.dialogCode || '—'} · ${(doc.questDialogueCodes || []).length} quest-dialog(s)
            </div>
            ${sagaBadgeList(ActionEngineCyberia.sagasOf('action', doc))}
          </div>
          <div class="in fll" style="display:flex;gap:4px;">${loadBtn}${delBtn}</div>
        </div>`,
      );
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No actions found.</div>';
    htmls('.action-engine-action-cards', out);
    for (const doc of items) {
      if (s(`.btn-aea-load-${doc._id}`))
        s(`.btn-aea-load-${doc._id}`).onclick = () => ActionEngineCyberia.open('action', doc._id);
      if (s(`.btn-aea-del-${doc._id}`))
        s(`.btn-aea-del-${doc._id}`).onclick = () => ActionEngineCyberia.remove('action', doc);
    }
  }

  static async renderDialogueCards(items) {
    const container = s('.action-engine-dialogue-cards');
    if (!container) return;
    let out = '';
    for (const doc of items) {
      const [loadBtn, delBtn] = await ActionEngineCyberia.cardActionsHtml(
        `btn-aed-load-${doc._id}`,
        `btn-aed-del-${doc._id}`,
      );
      const snippet = (doc.text || '').length > 60 ? `${doc.text.slice(0, 60)}…` : doc.text || '';
      out += ActionEngineCyberia.cardWrap(
        html`<div class="fl" style="align-items:center;">
          <div class="in fll" style="flex:1;">
            <div style="font-weight:bold;font-family:monospace;font-size:12px;">${doc.code} #${doc.order ?? 0}</div>
            <div style="font-size:11px;color:#888;">${doc.speaker || '—'} · ${doc.mood || 'neutral'}</div>
            <div style="font-size:11px;color:#888;">${snippet}</div>
            ${sagaBadgeList(ActionEngineCyberia.sagasOf('dialogue', doc))}
          </div>
          <div class="in fll" style="display:flex;gap:4px;">${loadBtn}${delBtn}</div>
        </div>`,
      );
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No dialogue lines found.</div>';
    htmls('.action-engine-dialogue-cards', out);
    for (const doc of items) {
      if (s(`.btn-aed-load-${doc._id}`))
        s(`.btn-aed-load-${doc._id}`).onclick = () => ActionEngineCyberia.open('dialogue', doc._id);
      if (s(`.btn-aed-del-${doc._id}`))
        s(`.btn-aed-del-${doc._id}`).onclick = () => ActionEngineCyberia.remove('dialogue', doc);
    }
  }

  /**
   * Loads again each loaded quest or action a synchronization changed, so the form never saves the
   * copy it held before.
   */
  static async reloadSynced(report) {
    for (const kind of ['quest', 'action']) {
      const current = ActionEngineCyberia.current[kind];
      const changed = report?.entries.some(
        (entry) =>
          entry.outcome === 'assigned' &&
          ((entry.kind === kind && entry.code === current?.name) ||
            (kind === 'action' && entry.actionCode === current?.name)),
      );
      if (current && changed) await ActionEngineCyberia.open(kind, current.id);
    }
  }

  static async refreshSagaSources() {
    const { status, data } = await CyberiaSagaService.getSources().catch(() => ({}));
    ActionEngineCyberia.sagaSources = status === 'success' ? data : {};
  }

  /** Reads again the saga sources, the shown page of every list and the assignments of the loaded map. */
  static async refreshAll() {
    await ActionEngineCyberia.refreshSagaSources();
    await Promise.all([
      ...Object.keys(ActionEngineCyberia.KINDS).map((kind) => ActionEngineCyberia.refreshList(kind)),
      ActionEngineCyberia.refreshAssignments(),
    ]);
  }

  /** Reads again the shown page of the list of a kind. */
  static refreshList(kind) {
    return ListPager.load(`action-engine-${kind}`);
  }

  /** The sagas a document of a kind belongs to. */
  static sagasOf(kind, doc) {
    const spec = ActionEngineCyberia.KINDS[kind];
    return ActionEngineCyberia.sagaSources[spec.sagas]?.[doc[spec.field]] ?? [];
  }

  /** One page of the documents of a kind whose key, or the code of one of its sagas, holds the search text. */
  static async fetchList(kind, query) {
    const spec = ActionEngineCyberia.KINDS[kind];
    const text = s(`.action-engine-${kind}-search`)?.value.trim().toLowerCase() ?? '';
    const contains = { filterType: 'text', type: 'contains', filter: text };
    const sagaKeys = Object.entries(ActionEngineCyberia.sagaSources[spec.sagas] ?? {})
      .filter(([, sagas]) => sagas.some((code) => code.toLowerCase().includes(text)))
      .map(([key]) => key);
    const search = sagaKeys.length
      ? { filterType: 'multi', operator: 'OR', filterModels: [contains, { filterType: 'set', values: sagaKeys }] }
      : contains;
    const { status, data } = await spec.service.get({ ...query, filterModel: text ? { [spec.field]: search } : {} });
    return status === 'success' ? data : null;
  }

  // Each tab defines its document service, form operations, search field and clone support.
  static KINDS = {
    quest: {
      subject: 'quest',
      service: CyberiaQuestService,
      canClone: true,
      name: (doc) => doc.code,
      field: 'code',
      sagas: 'quests',
      render: (docs) => ActionEngineCyberia.renderQuestCards(docs),
      payload: () => ActionEngineCyberia.getQuestPayload(),
      check: (body) => (body.code && body.title ? '' : 'Quest code and title are required.'),
      new: () => ActionEngineCyberia.newQuest(),
      load: (doc, options) => ActionEngineCyberia.loadQuest(doc, options),
      refresh: () => Promise.all([ActionEngineCyberia.refreshList('quest'), ActionEngineCyberia.refreshAssignments()]),
    },
    action: {
      subject: 'action',
      service: CyberiaActionService,
      canClone: true,
      name: (doc) => doc.code,
      field: 'code',
      sagas: 'actions',
      render: (docs) => ActionEngineCyberia.renderActionCards(docs),
      payload: () => ActionEngineCyberia.getActionPayload(),
      check: (body) => (body.code ? '' : 'Action code is required.'),
      new: () => ActionEngineCyberia.newAction(),
      load: (doc, options) => ActionEngineCyberia.loadAction(doc, options),
      refresh: () => Promise.all([ActionEngineCyberia.refreshList('action'), ActionEngineCyberia.refreshAssignments()]),
    },
    dialogue: {
      subject: 'dialogue line',
      service: CyberiaDialogueService,
      name: (doc) => `${doc.code} #${doc.order ?? 0}`,
      field: 'code',
      sagas: 'dialogues',
      render: (docs) => ActionEngineCyberia.renderDialogueCards(docs),
      payload: () => ActionEngineCyberia.getDialoguePayload(),
      check: (body) => (body.code && body.text ? '' : 'Dialogue code and text are required.'),
      new: () => ActionEngineCyberia.newDialogue(),
      load: (doc, options) => ActionEngineCyberia.loadDialogue(doc, options),
      refresh: () => ActionEngineCyberia.refreshList('dialogue'),
    },
    skill: {
      subject: 'skill',
      service: CyberiaSkillService,
      name: (doc) => doc.triggerItemId,
      field: 'triggerItemId',
      sagas: 'items',
      render: (docs) => ActionEngineCyberia.renderSkillCards(docs),
      payload: () => ActionEngineCyberia.getSkillPayload(),
      check: (body) =>
        !body.triggerItemId
          ? 'Trigger item id is required.'
          : body.skills.length === 0
            ? 'Add at least one skill (logic event).'
            : '',
      new: () => ActionEngineCyberia.newSkill(),
      load: (doc, options) => ActionEngineCyberia.loadSkill(doc, options),
      refresh: () => ActionEngineCyberia.refreshList('skill'),
    },
  };

  /** A document of a kind as the CRUD bar names it. */
  static entry(kind, doc) {
    return { id: doc._id, name: ActionEngineCyberia.KINDS[kind].name(doc) };
  }

  /** Holds `doc` as the loaded document of a kind; null holds a new one. */
  static setCurrent(kind, doc) {
    ActionEngineCyberia.current[kind] = doc?._id ? ActionEngineCyberia.entry(kind, doc) : null;
    ActionEngineCyberia.crud?.refresh();
  }

  /** Loads the stored document `id` of a kind into its tab; `quiet` loads it without a notice. */
  static async open(kind, id, { quiet = false } = {}) {
    const spec = ActionEngineCyberia.KINDS[kind];
    const { status, data, message } = await spec.service.get({ id });
    if (status === 'success' && data) await spec.load(data, { quiet });
    else NotificationManager.Push({ html: message, status: 'error' });
  }

  /** Loads the stored document of a kind that `key` names into its tab. */
  static async openByKey(kind, key) {
    const spec = ActionEngineCyberia.KINDS[kind];
    const { status, data } = await spec.service.get({ limit: 1, filterModel: { [spec.field]: textFilter(key) } });
    const doc = status === 'success' ? data.data[0] : null;
    if (doc) await ActionEngineCyberia.open(kind, doc._id);
    else NotificationManager.Push({ html: `No ${spec.subject} ${key} is stored.`, status: 'warning' });
  }

  static async save(kind) {
    const spec = ActionEngineCyberia.KINDS[kind];
    const body = spec.payload();
    const problem = spec.check(body);
    if (problem) return NotificationManager.Push({ html: problem, status: 'error' });
    const id = ActionEngineCyberia.current[kind]?.id;
    const result = await EditorCrud.save(spec.service, { id, body });
    if (result.status !== 'success') {
      if (/reload it/.test(result.message ?? ''))
        NotificationManager.Push({
          html: `Another editor saved this ${spec.subject} first. Your changes stay here: Reset loads the newer one.`,
          status: 'warning',
        });
      return;
    }
    // The form takes the stored document: its revision, and what the server made of the save.
    await ActionEngineCyberia.open(kind, result.data?._id || id, { quiet: true });
    await spec.refresh();
  }

  static async clone(kind) {
    const spec = ActionEngineCyberia.KINDS[kind];
    const { result, body } = await EditorCrud.clone(spec.service, spec.payload());
    if (result.status !== 'success') return;
    ActionEngineCyberia.setCurrent(kind, { ...body, _id: result.data?._id });
    await spec.refresh();
  }

  /** Deletes `doc`, or the loaded document of the kind. */
  static async remove(kind, doc) {
    const spec = ActionEngineCyberia.KINDS[kind];
    const { id, name } = doc ? ActionEngineCyberia.entry(kind, doc) : (ActionEngineCyberia.current[kind] ?? {});
    const result = await EditorCrud.remove(spec.service, { id, subject: spec.subject, name });
    if (result?.status !== 'success') return;
    if (id === ActionEngineCyberia.current[kind]?.id) spec.new();
    await spec.refresh();
  }

  // ── Quest payload / load / persistence ──────────────────────────────────
  static getQuestPayload() {
    ActionEngineCyberia.syncStepDescriptions();
    const csv = (v) =>
      (v || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    const payload = {
      code: s('.action-engine-quest-code')?.value?.trim() || '',
      title: s('.action-engine-quest-title')?.value?.trim() || '',
      description: s('.action-engine-quest-description')?.value || '',
      prerequisiteCodes: csv(s('.action-engine-quest-prerequisites')?.value),
      unlocksQuestCodes: csv(s('.action-engine-quest-unlocks')?.value),
      steps: ActionEngineCyberia.questSteps.map((st, i) => ({
        id: st.id || `step-${i + 1}`,
        description: st.description || '',
        objectives: st.objectives.map((o) => ({ ...o })),
      })),
      rewards: ActionEngineCyberia.questRewards.map((r) => ({ ...r })),
    };
    const mapCode = s('.action-engine-quest-map-code')?.value?.trim();
    const cellX = parseInt(s('.action-engine-cell-x')?.value);
    const cellY = parseInt(s('.action-engine-cell-y')?.value);
    if (mapCode) payload.sourceMapCode = mapCode;
    if (Number.isFinite(cellX)) payload.sourceCellX = cellX;
    if (Number.isFinite(cellY)) payload.sourceCellY = cellY;
    return payload;
  }

  static async loadQuest(doc, { quiet = false } = {}) {
    ActionEngineCyberia.setMode('quest');
    ActionEngineCyberia.setCurrent('quest', doc);
    if (s('.action-engine-quest-code')) s('.action-engine-quest-code').value = doc.code || '';
    if (s('.action-engine-quest-title')) s('.action-engine-quest-title').value = doc.title || '';
    if (s('.action-engine-quest-description')) s('.action-engine-quest-description').value = doc.description || '';
    if (s('.action-engine-quest-prerequisites'))
      s('.action-engine-quest-prerequisites').value = (doc.prerequisiteCodes || []).join(', ');
    if (s('.action-engine-quest-unlocks'))
      s('.action-engine-quest-unlocks').value = (doc.unlocksQuestCodes || []).join(', ');
    if (s('.action-engine-quest-map-code')) s('.action-engine-quest-map-code').value = doc.sourceMapCode || '';
    if (s('.action-engine-cell-x')) s('.action-engine-cell-x').value = doc.sourceCellX ?? '';
    if (s('.action-engine-cell-y')) s('.action-engine-cell-y').value = doc.sourceCellY ?? '';
    ActionEngineCyberia.questSteps = (doc.steps || []).map((st, i) => ({
      id: st.id || `step-${i + 1}`,
      description: st.description || '',
      objectives: (st.objectives || []).map((o) => ({ type: o.type, itemId: o.itemId, quantity: o.quantity || 1 })),
    }));
    ActionEngineCyberia.questRewards = (doc.rewards || []).map((r) => ({
      itemId: r.itemId,
      quantity: r.quantity || 1,
    }));
    ActionEngineCyberia.renderStepList();
    ActionEngineCyberia.renderRewardList();
    setQueryParams({ questCode: doc.code || null }, { replace: true });
    await ActionEngineCyberia.syncMapForLoadedDoc(doc);
    if (!quiet) NotificationManager.Push({ html: `Quest "${doc.code}" loaded`, status: 'success' });
  }

  static newQuest() {
    ActionEngineCyberia.setCurrent('quest', null);
    setQueryParams({ questCode: null }, { replace: true });
    ActionEngineCyberia.questSteps = [];
    ActionEngineCyberia.questRewards = [];
    for (const cls of [
      'action-engine-quest-code',
      'action-engine-quest-title',
      'action-engine-quest-description',
      'action-engine-quest-prerequisites',
      'action-engine-quest-unlocks',
    ])
      if (s(`.${cls}`)) s(`.${cls}`).value = '';
    ActionEngineCyberia.renderStepList();
    ActionEngineCyberia.renderRewardList();
  }

  // ── Economy capabilities ────────────────────────────────────────────────
  /** The capabilities the form holds: the item lists, the vault slots and the terminal of a market. */
  static readCapabilities() {
    const caps = structuredClone(ActionEngineCyberia.capabilities);
    caps.storageSlots = Math.max(0, parseInt(s('.action-engine-storage-slots')?.value) || 0);
    caps.market.marketCode = ActionEngineCyberia.getSingleDropdownValue('action-engine-market-picker');
    caps.market.selection = s('.action-engine-market-selection')?.value ?? caps.market.selection;
    const modes = [...document.querySelectorAll('.action-engine-market-mode')];
    if (modes.length > 0) caps.market.listingModes = modes.filter((box) => box.checked).map((box) => box.value);
    return caps;
  }

  /** The market capability as a save sends it: the items count only for the selection items. */
  static terminalPayload(market) {
    return { ...market, itemIds: market.selection === 'items' ? market.itemIds : [] };
  }

  /** Reads the profile of market `code` and shows its shared terms. */
  static async selectMarket(code) {
    ActionEngineCyberia.capabilities.market.marketCode = code;
    const { status, data } = code ? await CyberiaMarketService.get({ id: code }).catch(() => ({})) : {};
    ActionEngineCyberia.marketProfile = status === 'success' && data?.code ? data : null;
    ActionEngineCyberia.renderCapabilities();
  }

  /** The shared terms of the market profile, read only: the market editor owns them. */
  static sharedMarketHtml(market) {
    const profile = ActionEngineCyberia.marketProfile;
    if (!market.marketCode)
      return html`<div class="studio-form-hint">
        This terminal opens no market. Pick a market profile to open one.
      </div>`;
    if (!profile)
      return html`<div class="studio-form-dirty">
        No market profile has the code ${escapeHtml(market.marketCode)}.
      </div>`;
    const terms = [
      [
        'Scope',
        profile.scope === 'universe' ? 'every world of the universe of this terminal' : 'the world of this terminal',
      ],
      ['Status', profile.status === 'active' ? 'active' : 'retired: no new listing'],
      ['Modes', profile.modes.map((mode) => MODE_LABELS[mode]).join(', ')],
      ['Durations', profile.hours.map((hours) => `${hours} h`).join(', ')],
      ['Fees', `listing ${profile.fees.listing}, sale ${profile.fees.sale}`],
      ['Prices', `${profile.limits.priceMin} to ${profile.limits.priceMax}`],
      ['Auction', `raise ${profile.auction.raisePercent}%, ${profile.auction.minRaise} coin(s) at least`],
    ];
    return html`<div class="studio-form-grid">
        ${terms
          .map(
            ([label, value]) =>
              html`<div class="studio-form-field">
                <span class="studio-form-hint">${label}</span><span>${escapeHtml(value)}</span>
              </div>`,
          )
          .join('')}
      </div>
      <div class="studio-form-row" style="margin-top:6px;">
        <span class="studio-form-chip studio-form-mono">${escapeHtml(profile.code)}@${profile.revision}</span>
        <button type="button" class="studio-form-button action-engine-open-market">
          <i class="fa-solid fa-store"></i> Open in the market editor
        </button>
      </div>`;
  }

  /** The local rules of the terminal: what a seller lists here and in which modes. */
  static terminalRulesHtml(market) {
    const profile = ActionEngineCyberia.marketProfile;
    const disabled = ActionEngineCyberia.canMutate && market.marketCode ? '' : 'disabled';
    const supported = profile?.modes ?? [];
    const selections = { policy: 'Policy: every item the economy allows', items: 'Specific items' };
    return html`<div class="studio-form-grid">
      <label class="studio-form-field"
        ><span>Selection</span>
        <select class="action-engine-market-selection" ${disabled}>
          ${ActionEngineCyberia.marketContract.selections
            .map(
              (value) =>
                html`<option value="${value}" ${value === market.selection ? 'selected' : ''}>
                  ${selections[value] ?? value}
                </option>`,
            )
            .join('')}
        </select>
        <span class="studio-form-hint">
          ${
            market.selection === 'policy'
              ? 'The item policy of the economy decides; no item list applies.'
              : 'Only the items below, and only those the economy allows.'
          }
        </span>
      </label>
      <div class="studio-form-field">
        <span>Listing modes at this terminal</span>
        <div class="studio-form-row">
          ${ActionEngineCyberia.marketContract.modes
            .map((mode) =>
              toggleField({
                className: 'action-engine-market-mode',
                value: mode,
                label:
                  supported.includes(mode) || !profile ? MODE_LABELS[mode] : `${MODE_LABELS[mode]}: not in the market`,
                checked: market.listingModes.includes(mode),
                disabled: disabled || (supported.includes(mode) ? '' : 'disabled'),
              }),
            )
            .join('')}
        </div>
        <span class="studio-form-hint"
          >They restrict what is listed here. Every terminal shows, sells and bids on the whole market.</span
        >
      </div>
    </div>`;
  }

  /** Shows the capabilities held in `ActionEngineCyberia.capabilities`. */
  static renderCapabilities() {
    const caps = ActionEngineCyberia.capabilities;
    if (s('.action-engine-storage-slots')) s('.action-engine-storage-slots').value = caps.storageSlots;
    ActionEngineCyberia.setSingleDropdownValue('action-engine-market-picker', caps.market.marketCode);
    htmls('.action-engine-market-shared', ActionEngineCyberia.sharedMarketHtml(caps.market));
    htmls('.action-engine-market-rules', ActionEngineCyberia.terminalRulesHtml(caps.market));
    const itemList = s('.action-engine-cap-market');
    if (itemList) itemList.classList.toggle('hide', !caps.market.marketCode || caps.market.selection !== 'items');
    for (const { id, list } of CAPABILITY_LISTS) {
      const items = list(caps);
      let out = '';
      for (let i = 0; i < items.length; i++)
        out += html`<span class="studio-form-chip studio-form-mono" style="margin:2px;"
          >${escapeHtml(items[i])}${
            ActionEngineCyberia.canMutate
              ? html`<button
                  type="button"
                  class="action-engine-cap-remove"
                  data-list="${id}"
                  data-index="${i}"
                  aria-label="Remove ${escapeHtml(items[i])}"
                  style="border:0;background:transparent;color:inherit;cursor:pointer;min-height:0;padding:0 2px;"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>`
              : ''
          }</span
        >`;
      htmls(`.action-engine-cap-${id}-list`, out || html`<span class="studio-form-hint">None.</span>`);
    }
    for (const button of document.querySelectorAll('.action-engine-cap-remove'))
      button.onclick = () => {
        ActionEngineCyberia.capabilities = ActionEngineCyberia.readCapabilities();
        CAPABILITY_LISTS.find(({ id }) => id === button.dataset.list)
          .list(ActionEngineCyberia.capabilities)
          .splice(Number(button.dataset.index), 1);
        ActionEngineCyberia.renderCapabilities();
      };
    const rerender = () => {
      ActionEngineCyberia.capabilities = ActionEngineCyberia.readCapabilities();
      ActionEngineCyberia.renderCapabilities();
    };
    if (s('.action-engine-market-selection')) s('.action-engine-market-selection').onchange = rerender;
    for (const box of document.querySelectorAll('.action-engine-market-mode')) box.onchange = rerender;
    if (s('.action-engine-open-market'))
      s('.action-engine-open-market').onclick = () =>
        StudioCyberia.open('cyberia-market-engine', { marketCode: caps.market.marketCode });
  }

  /** Adds the picked item to the list `id` of the capabilities. */
  static addCapabilityItem(id) {
    const spec = CAPABILITY_LISTS.find((list) => list.id === id);
    const itemId = ActionEngineCyberia.getSingleDropdownValue(spec.picker);
    if (!itemId) return NotificationManager.Push({ html: 'Select an item id.', status: 'error' });
    ActionEngineCyberia.capabilities = ActionEngineCyberia.readCapabilities();
    const items = spec.list(ActionEngineCyberia.capabilities);
    if (!items.includes(itemId)) items.push(itemId);
    ActionEngineCyberia.renderCapabilities();
  }

  /** Reads what the capabilities of the saved action do in each world of its map. */
  static async refreshDiagnostics() {
    const id = ActionEngineCyberia.current.action?.id;
    const { status, data } = id ? await CyberiaActionService.diagnostics({ id }).catch(() => ({})) : {};
    ActionEngineCyberia.diagnostics = status === 'success' ? data : null;
    ActionEngineCyberia.renderDiagnostics();
  }

  /** One table of a capability in one world: each item with its permission, binding, amount and state. */
  static diagnosticsTable(title, capability, amountLabel = '') {
    if (!capability || (capability.items.length === 0 && !capability.warning)) return '';
    const rows = capability.items
      .map(
        (row) =>
          html`<tr>
            <td class="studio-form-mono">${escapeHtml(row.itemId)}</td>
            <td>${row.allowed ? 'allowed' : 'refused'}</td>
            <td class="studio-form-mono" title="${escapeHtml(row.olCid)}">
              ${row.olCid ? escapeHtml(`${row.olCid.slice(0, 12)}…`) : 'unbound'}
            </td>
            ${amountLabel ? html`<td>${row.amount ?? '—'}</td>` : ''}
            <td>
              <span class="studio-form-chip ${row.usable ? '' : 'studio-form-bad'}"
                >${row.usable ? 'usable' : 'blocked'}</span
              >
              ${row.reason ? html`<span class="studio-form-hint">${escapeHtml(row.reason)}</span>` : ''}
            </td>
          </tr>`,
      )
      .join('');
    return html`<div style="margin-top:6px;">
      <b>${title}</b>
      ${capability.warning ? html`<div class="studio-form-dirty" role="alert">${escapeHtml(capability.warning)}</div>` : ''}
      ${
        rows
          ? html`<div style="overflow-x:auto;">
              <table style="width:100%;font-size:12px;border-collapse:collapse;">
                <thead>
                  <tr style="text-align:left;">
                    <th>Item</th>
                    <th>Economy policy</th>
                    <th>Binding</th>
                    ${amountLabel ? html`<th>${amountLabel}</th>` : ''}
                    <th>Here</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>`
          : ''
      }
    </div>`;
  }

  /** Shows what the capabilities of the saved action do, world by world. */
  static renderDiagnostics() {
    const report = ActionEngineCyberia.diagnostics;
    if (!report) {
      htmls(
        '.action-engine-diagnostics',
        html`<div class="studio-form-hint">
          Save the action to see what its capabilities do in the worlds of its map.
        </div>`,
      );
      return;
    }
    const worlds = report.worlds
      .map(
        (world) =>
          html`<div class="studio-form-card">
            <div class="studio-form-row">
              <b class="studio-form-mono">${escapeHtml(world.instanceCode)}</b>
              <span class="studio-form-chip">economy ${escapeHtml(world.economy.code)}@${world.economy.revision}</span>
              ${world.market?.ref ? html`<span class="studio-form-chip studio-form-mono">${escapeHtml(world.market.ref)}</span>` : ''}
            </div>
            ${world.economy.defect ? html`<div class="studio-form-dirty">${escapeHtml(world.economy.defect)}</div>` : ''}
            ${ActionEngineCyberia.diagnosticsTable('Buyback', world.capabilities?.buyback, 'Payout')}
            ${ActionEngineCyberia.diagnosticsTable('Burn', world.capabilities?.burn, 'Fee')}
            ${ActionEngineCyberia.diagnosticsTable(
              world.capabilities?.market.selection === 'policy'
                ? 'Market: what the economy allows'
                : 'Market: listed items',
              world.capabilities?.market,
            )}
          </div>`,
      )
      .join('');
    htmls(
      '.action-engine-diagnostics',
      html`${report.defects.map((defect) => html`<div class="studio-form-dirty">${escapeHtml(defect)}</div>`).join('')}
      ${worlds}`,
    );
  }

  // ── Action payload / load / persistence ─────────────────────────────────
  static getActionPayload() {
    const capabilities = ActionEngineCyberia.readCapabilities();
    const payload = {
      ...ActionEngineCyberia.loadedActionPayloadExtras,
      ...capabilities,
      market: ActionEngineCyberia.terminalPayload(capabilities.market),
      code: s('.action-engine-action-code')?.value?.trim() || '',
      label: s('.action-engine-action-label')?.value?.trim() || '',
      dialogCode: ActionEngineCyberia.getSingleDropdownValue(ActionEngineCyberia.ids.actionDialogPicker),
      questDialogueCodes: ActionEngineCyberia.actionQuestDialogues.map((d) => ({ ...d })),
    };
    const mapCode = s('.action-engine-action-map-code')?.value?.trim();
    const cellX = parseInt(s('.action-engine-cell-x')?.value);
    const cellY = parseInt(s('.action-engine-cell-y')?.value);
    if (mapCode) payload.sourceMapCode = mapCode;
    if (Number.isFinite(cellX)) payload.sourceCellX = cellX;
    if (Number.isFinite(cellY)) payload.sourceCellY = cellY;
    return payload;
  }

  static async loadAction(doc, { quiet = false } = {}) {
    ActionEngineCyberia.setMode('action');
    ActionEngineCyberia.setCurrent('action', doc);
    // The shop and craft payloads this form does not edit stay as they are.
    const {
      _id,
      code,
      label,
      dialogCode,
      questDialogueCodes,
      sourceMapCode,
      sourceCellX,
      sourceCellY,
      storageSlots,
      buybackItems,
      burnItems,
      market,
      createdAt,
      updatedAt,
      __v,
      ...extras
    } = doc;
    ActionEngineCyberia.loadedActionPayloadExtras = extras;
    const blank = blankCapabilities();
    ActionEngineCyberia.capabilities = {
      storageSlots: storageSlots ?? 0,
      buybackItems: [...(buybackItems ?? [])],
      burnItems: [...(burnItems ?? [])],
      market: {
        marketCode: market?.marketCode ?? '',
        selection: market?.selection ?? blank.market.selection,
        itemIds: [...(market?.itemIds ?? [])],
        listingModes: [...(market?.listingModes ?? blank.market.listingModes)],
      },
    };
    await ActionEngineCyberia.selectMarket(ActionEngineCyberia.capabilities.market.marketCode);
    await ActionEngineCyberia.refreshDiagnostics();
    setQueryParams({ actionCode: doc.code || null }, { replace: true });
    if (s('.action-engine-action-code')) s('.action-engine-action-code').value = doc.code || '';
    if (s('.action-engine-action-label')) s('.action-engine-action-label').value = doc.label || '';
    if (s('.action-engine-action-map-code')) s('.action-engine-action-map-code').value = doc.sourceMapCode || '';
    if (s('.action-engine-cell-x')) s('.action-engine-cell-x').value = doc.sourceCellX ?? '';
    if (s('.action-engine-cell-y')) s('.action-engine-cell-y').value = doc.sourceCellY ?? '';
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.actionDialogPicker, doc.dialogCode || '');
    ActionEngineCyberia.actionQuestDialogues = (doc.questDialogueCodes || []).map((d) => ({
      questCode: d.questCode,
      dialogCode: d.dialogCode,
    }));
    ActionEngineCyberia.renderQuestDialogueList();
    await ActionEngineCyberia.syncMapForLoadedDoc(doc);
    if (!quiet) NotificationManager.Push({ html: `Action "${doc.code}" loaded`, status: 'success' });
  }

  static newAction() {
    ActionEngineCyberia.setCurrent('action', null);
    ActionEngineCyberia.actionQuestDialogues = [];
    ActionEngineCyberia.loadedActionPayloadExtras = {};
    ActionEngineCyberia.capabilities = blankCapabilities();
    ActionEngineCyberia.marketProfile = null;
    ActionEngineCyberia.diagnostics = null;
    ActionEngineCyberia.renderCapabilities();
    ActionEngineCyberia.renderDiagnostics();
    setQueryParams({ actionCode: null }, { replace: true });
    for (const cls of ['action-engine-action-code', 'action-engine-action-label'])
      if (s(`.${cls}`)) s(`.${cls}`).value = '';
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.actionDialogPicker, '');
    ActionEngineCyberia.renderQuestDialogueList();
  }

  // ── Dialogue line persistence ───────────────────────────────────────────
  static getDialoguePayload() {
    return {
      code: s('.action-engine-dialogue-code')?.value?.trim() || '',
      order: parseInt(s('.action-engine-dialogue-order')?.value) || 0,
      speaker: s('.action-engine-dialogue-speaker')?.value || '',
      text: s('.action-engine-dialogue-text')?.value || '',
      mood: s('.action-engine-dialogue-mood')?.value?.trim() || 'neutral',
    };
  }

  static loadDialogue(doc, { quiet = false } = {}) {
    ActionEngineCyberia.setMode('dialogue');
    ActionEngineCyberia.setCurrent('dialogue', doc);
    if (s('.action-engine-dialogue-code')) s('.action-engine-dialogue-code').value = doc.code || '';
    if (s('.action-engine-dialogue-order')) s('.action-engine-dialogue-order').value = doc.order ?? 0;
    if (s('.action-engine-dialogue-speaker')) s('.action-engine-dialogue-speaker').value = doc.speaker || '';
    if (s('.action-engine-dialogue-text')) s('.action-engine-dialogue-text').value = doc.text || '';
    if (s('.action-engine-dialogue-mood')) s('.action-engine-dialogue-mood').value = doc.mood || 'neutral';
    if (!quiet) NotificationManager.Push({ html: `Dialogue line "${doc.code}" loaded`, status: 'success' });
  }

  static newDialogue() {
    ActionEngineCyberia.setCurrent('dialogue', null);
    if (s('.action-engine-dialogue-code')) s('.action-engine-dialogue-code').value = '';
    if (s('.action-engine-dialogue-order')) s('.action-engine-dialogue-order').value = 0;
    if (s('.action-engine-dialogue-speaker')) s('.action-engine-dialogue-speaker').value = '';
    if (s('.action-engine-dialogue-text')) s('.action-engine-dialogue-text').value = '';
    if (s('.action-engine-dialogue-mood')) s('.action-engine-dialogue-mood').value = 'neutral';
  }

  // ── Skill list editor + persistence (own model: CyberiaSkill) ────────────
  static async renderSkillDefList() {
    const container = s('.action-engine-skill-def-list');
    if (!container) return;
    const triggerItemId = ActionEngineCyberia.getSingleDropdownValue(ActionEngineCyberia.ids.skillTriggerItemPicker);
    let out = '';
    for (let i = 0; i < ActionEngineCyberia.skillDefs.length; i++) {
      const sk = ActionEngineCyberia.skillDefs[i];
      const summoned = skillSummonedItemId(sk, triggerItemId);
      out += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border);padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">
          <span style="color:var(--studio-accent);">${sk.logicEventId}</span>${sk.name
            ? ` · ${sk.name}`
            : ''}${summoned ? html`<span style="margin:0 4px;">&rarr;</span>${summoned}` : ''}
        </div>
        ${await BtnIcon.instance({
          class: `btn-aes-rmskill-${i}`,
          label: html`<i class="fa-solid fa-xmark"></i>`,
          style: 'min-width:30px;padding:2px 8px;',
        })}
      </div>`;
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No skills. Add at least one logic event.</div>';
    htmls('.action-engine-skill-def-list', out);
    for (let i = 0; i < ActionEngineCyberia.skillDefs.length; i++) {
      if (s(`.btn-aes-rmskill-${i}`))
        s(`.btn-aes-rmskill-${i}`).onclick = () => {
          ActionEngineCyberia.skillDefs.splice(i, 1);
          ActionEngineCyberia.renderSkillDefList();
        };
    }
  }

  static addSkillDef() {
    const logicEventId = ActionEngineCyberia.getSingleDropdownValue('action-engine-skill-logic-event');
    const name = s('.action-engine-skill-name')?.value?.trim() || '';
    const description = s('.action-engine-skill-description')?.value || '';
    const picked = ActionEngineCyberia.getSingleDropdownValue(ActionEngineCyberia.ids.skillSummonedItemPicker);
    // A logic that summons its trigger item stores no summon: the runtime resolves it.
    const summonedEntityItemId = skillSummonedItemId({ logicEventId, summonedEntityItemId: picked }, '');
    if (!logicEventId) {
      NotificationManager.Push({ html: 'Select a canonical logic event id first.', status: 'error' });
      return;
    }
    if (ActionEngineCyberia.skillDefs.some((sk) => sk.logicEventId === logicEventId)) {
      NotificationManager.Push({ html: `Logic event "${logicEventId}" already added.`, status: 'error' });
      return;
    }
    ActionEngineCyberia.skillDefs.push({ logicEventId, name, description, summonedEntityItemId });
    ActionEngineCyberia.setSingleDropdownValue('action-engine-skill-logic-event', '');
    for (const cls of ['action-engine-skill-name', 'action-engine-skill-description'])
      if (s(`.${cls}`)) s(`.${cls}`).value = '';
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.skillSummonedItemPicker, '');
    ActionEngineCyberia.showSummonPicker(true);
    ActionEngineCyberia.renderSkillDefList();
  }

  /** Shows the summoned entity picker; a logic that summons its trigger item hides it. */
  static showSummonPicker(shown) {
    s('.action-engine-skill-summon')?.classList.toggle('hide', !shown);
  }

  static async renderSkillCards(items) {
    const container = s('.action-engine-skill-cards');
    if (!container) return;
    let out = '';
    for (const doc of items) {
      const [loadBtn, delBtn] = await ActionEngineCyberia.cardActionsHtml(
        `btn-aes-load-${doc._id}`,
        `btn-aes-del-${doc._id}`,
      );
      out += ActionEngineCyberia.cardWrap(
        html`<div class="fl" style="align-items:center;">
          <div class="in fll" style="flex:1;">
            <div style="font-weight:bold;font-family:monospace;font-size:12px;">${doc.triggerItemId}</div>
            <div style="font-size:11px;color:#888;">${(doc.logicEventIds || []).join(', ') || '—'}</div>
            <div style="font-size:11px;color:#888;">${(doc.skills || []).length} skill(s)</div>
            ${sagaBadgeList(ActionEngineCyberia.sagasOf('skill', doc))}
          </div>
          <div class="in fll" style="display:flex;gap:4px;">${loadBtn}${delBtn}</div>
        </div>`,
      );
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No skills found.</div>';
    htmls('.action-engine-skill-cards', out);
    for (const doc of items) {
      if (s(`.btn-aes-load-${doc._id}`))
        s(`.btn-aes-load-${doc._id}`).onclick = () => ActionEngineCyberia.open('skill', doc._id);
      if (s(`.btn-aes-del-${doc._id}`))
        s(`.btn-aes-del-${doc._id}`).onclick = () => ActionEngineCyberia.remove('skill', doc);
    }
  }

  static getSkillPayload() {
    const triggerItemId = ActionEngineCyberia.getSingleDropdownValue(ActionEngineCyberia.ids.skillTriggerItemPicker);
    const skills = ActionEngineCyberia.skillDefs.map((sk) => ({
      logicEventId: sk.logicEventId,
      name: sk.name || '',
      description: sk.description || '',
      summonedEntityItemId: sk.summonedEntityItemId || '',
    }));
    // logicEventIds is the compact discriminator list — derived from the skills
    // so the two can never drift.
    const logicEventIds = [...new Set(skills.map((sk) => sk.logicEventId).filter(Boolean))];
    return { triggerItemId, logicEventIds, skills };
  }

  static loadSkill(doc, { quiet = false } = {}) {
    ActionEngineCyberia.setMode('skill');
    ActionEngineCyberia.setCurrent('skill', doc);
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.skillTriggerItemPicker, doc.triggerItemId || '');
    ActionEngineCyberia.skillDefs = (doc.skills || []).map((sk) => ({
      logicEventId: sk.logicEventId,
      name: sk.name || '',
      description: sk.description || '',
      summonedEntityItemId: sk.summonedEntityItemId || '',
    }));
    ActionEngineCyberia.renderSkillDefList();
    if (!quiet) NotificationManager.Push({ html: `Skill "${doc.triggerItemId}" loaded`, status: 'success' });
  }

  static newSkill() {
    ActionEngineCyberia.setCurrent('skill', null);
    ActionEngineCyberia.skillDefs = [];
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.skillTriggerItemPicker, '');
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.skillSummonedItemPicker, '');
    ActionEngineCyberia.setSingleDropdownValue('action-engine-skill-logic-event', '');
    ActionEngineCyberia.showSummonPicker(true);
    for (const cls of ['action-engine-skill-name', 'action-engine-skill-description'])
      if (s(`.${cls}`)) s(`.${cls}`).value = '';
    ActionEngineCyberia.renderSkillDefList();
  }

  // ── Render ──────────────────────────────────────────────────────────────
  static async render(options = {}) {
    const { appStore } = options;
    const role = appStore?.Data?.user?.main?.model?.user?.role || 'guest';
    ActionEngineCyberia.canMutate = commonModeratorGuard(role);
    ActionEngineCyberia.mode = 'quest';
    ActionEngineCyberia.mapCode = '';
    ActionEngineCyberia.mapDoc = null;
    ActionEngineCyberia.assignments = { quest: [], action: [] };
    ActionEngineCyberia.sagaSources = {};
    ActionEngineCyberia.current = { quest: null, action: null, dialogue: null, skill: null };
    ActionEngineCyberia.questSteps = [];
    ActionEngineCyberia.questRewards = [];
    ActionEngineCyberia.actionQuestDialogues = [];
    ActionEngineCyberia.loadedActionPayloadExtras = {};
    ActionEngineCyberia.capabilities = blankCapabilities();
    ActionEngineCyberia.skillDefs = [];

    const ids = ActionEngineCyberia.ids;
    const objectiveTypeOptions = QUEST_STEPS_TYPES.map((t) => ({ value: t, display: t, data: t, onClick: () => {} }));

    // Responsive column groups: dynamicCol collapses these to full width on
    // narrow / mobile widths (observing .action-engine-tools).
    const cont = 'action-engine-tools';
    const dc = {
      cell: 'action-engine-dc-cell',
      questCt: 'action-engine-dc-quest-ct',
      questChain: 'action-engine-dc-quest-chain',
      objective: 'action-engine-dc-objective',
      reward: 'action-engine-dc-reward',
      actionCl: 'action-engine-dc-action-cl',
      actionQd: 'action-engine-dc-action-qd',
      dialogue: 'action-engine-dc-dialogue',
      skillDef: 'action-engine-dc-skill-def',
    };

    const group = (title, icon, inner) =>
      html`<div class="in studio-group">
        <div class="in studio-group-title"><i class="${icon}"></i> ${title}</div>
        ${inner}
      </div>`;

    const capabilityList = async ({ id, label, picker }) =>
      html`<div class="in" style="margin-top:8px;">
        <div style="font-size:12px;">${label}</div>
        <div class="in action-engine-cap-${id}-list"></div>
        ${
          ActionEngineCyberia.canMutate
            ? html`<div class="fl" style="align-items:flex-end;">
                <div class="in fll" style="flex:1;">
                  ${await ActionEngineCyberia.buildItemIdDropdown(picker, html`Item`)}
                </div>
                <div class="in fll" style="padding-left:6px;">
                  ${await BtnIcon.instance({
                    class: `wfa btn-action-engine-cap-add-${id}`,
                    label: html`<i class="fa-solid fa-plus"></i> Add`,
                  })}
                </div>
              </div>`
            : ''
        }
      </div>`;

    const listPager = (kind) =>
      ListPager.instance({
        id: `action-engine-${kind}`,
        fetch: (query) => ActionEngineCyberia.fetchList(kind, query),
        render: ActionEngineCyberia.KINDS[kind].render,
      });
    const assignmentList = async (kind) =>
      html`<div class="in action-engine-assignment-${kind}"></div>
        ${await ListPager.instance({
          id: `action-engine-map-${kind}`,
          limit: 5,
          fetch: (query) => ActionEngineCyberia.fetchAssignments(kind, query),
          render: (docs) => ActionEngineCyberia.showAssignments(kind, docs),
        })}`;

    const listToolbar = async (prefix) =>
      html`<div class="fl" style="align-items:flex-end;margin-bottom:8px;flex-wrap:wrap;">
        <div class="in fll" style="flex:1 1 160px;">
          ${await Input.instance({
            id: `action-engine-${prefix}-search`,
            label: html`Search`,
            containerClass: 'inl',
            type: 'text',
            placeholder: true,
          })}
        </div>
        <div class="in fll" style="padding-left:6px;">
          ${await BtnIcon.instance({
            class: `wfa btn-action-engine-${prefix}-refresh`,
            label: html`<i class="fa-solid fa-rotate"></i> Refresh`,
          })}
        </div>
      </div>`;

    setTimeout(async () => {
      ThemeEvents['action-engine-theme'] = () => ActionEngineCyberia.renderMapCanvas();
      const container = s('.action-engine-container');
      EditorLayout.bind(container);
      EditorLayout.pin(container, 'action-engine-stage');

      Tabs.bind(container.querySelector('.action-engine-tabs'), {
        onChange: (mode) => ActionEngineCyberia.setMode(mode),
      });
      ActionEngineCyberia.crud = EditorCrud.bind(container.querySelector('.action-engine-crud'), () => {
        const kind = ActionEngineCyberia.mode;
        const spec = ActionEngineCyberia.KINDS[kind];
        return {
          subject: spec.subject,
          ...ActionEngineCyberia.current[kind],
          new: spec.new,
          reset: () => ActionEngineCyberia.open(kind, ActionEngineCyberia.current[kind].id),
          ...(ActionEngineCyberia.canMutate && {
            save: () => ActionEngineCyberia.save(kind),
            ...(spec.canClone && { clone: () => ActionEngineCyberia.clone(kind) }),
            delete: () => ActionEngineCyberia.remove(kind),
          }),
        };
      });

      if (s('.btn-action-engine-load-map'))
        s('.btn-action-engine-load-map').onclick = () =>
          ActionEngineCyberia.loadMap(ActionEngineCyberia.getSingleDropdownValue(ids.mapDropdown));

      const canvas = s('.action-engine-canvas');
      if (canvas)
        canvas.onclick = (e) => {
          if (!ActionEngineCyberia.mapDoc) return;
          const rect = canvas.getBoundingClientRect();
          const { cellW, cellH } = ActionEngineCyberia.getMapGeometry();
          const col = Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width)) / cellW);
          const row = Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height)) / cellH);
          if (s('.action-engine-cell-x')) s('.action-engine-cell-x').value = col;
          if (s('.action-engine-cell-y')) s('.action-engine-cell-y').value = row;
          const mapField =
            ActionEngineCyberia.mode === 'action' ? '.action-engine-action-map-code' : '.action-engine-quest-map-code';
          if (s(mapField)) s(mapField).value = ActionEngineCyberia.mapCode;
          htmls('.action-engine-cell-coords', `Cell: (${col}, ${row})`);
          ActionEngineCyberia.renderMapCanvas();
        };

      for (const kind of Object.keys(ActionEngineCyberia.KINDS)) {
        if (s(`.btn-action-engine-${kind}-refresh`))
          s(`.btn-action-engine-${kind}-refresh`).onclick = () => ActionEngineCyberia.refreshAll();
        if (s(`.action-engine-${kind}-search`))
          ListPager.search(`action-engine-${kind}`, s(`.action-engine-${kind}-search`));
      }

      // Quest wiring
      if (s('.btn-action-engine-add-step'))
        s('.btn-action-engine-add-step').onclick = () => ActionEngineCyberia.addStep();
      if (s('.btn-action-engine-add-objective'))
        s('.btn-action-engine-add-objective').onclick = () => ActionEngineCyberia.addObjective();
      if (s('.btn-action-engine-add-reward'))
        s('.btn-action-engine-add-reward').onclick = () => ActionEngineCyberia.addReward();

      // Action wiring
      if (s('.btn-action-engine-add-quest-dialogue'))
        s('.btn-action-engine-add-quest-dialogue').onclick = () => {
          const questCode = s('.action-engine-action-quest-code')?.value?.trim();
          const dialogCode = ActionEngineCyberia.getSingleDropdownValue(ids.actionQuestDialogPicker);
          if (!questCode || !dialogCode) {
            NotificationManager.Push({ html: 'Quest code and dialog code are required.', status: 'error' });
            return;
          }
          ActionEngineCyberia.actionQuestDialogues.push({ questCode, dialogCode });
          ActionEngineCyberia.renderQuestDialogueList();
        };

      // Dialogue wiring

      // Skill wiring
      if (s('.btn-action-engine-add-skill-def'))
        s('.btn-action-engine-add-skill-def').onclick = () => ActionEngineCyberia.addSkillDef();

      for (const { id } of CAPABILITY_LISTS)
        if (s(`.btn-action-engine-cap-add-${id}`))
          s(`.btn-action-engine-cap-add-${id}`).onclick = () => ActionEngineCyberia.addCapabilityItem(id);

      ActionEngineCyberia.renderStepList();
      ActionEngineCyberia.renderRewardList();
      ActionEngineCyberia.renderQuestDialogueList();
      ActionEngineCyberia.renderSkillDefList();
      const contract = await CyberiaMarketService.contract().catch(() => null);
      if (contract?.status === 'success') ActionEngineCyberia.marketContract = contract.data;
      ActionEngineCyberia.renderCapabilities();
      ActionEngineCyberia.renderDiagnostics();
      await Promise.all([ActionEngineCyberia.refreshAll(), SagaSync.mount()]);

      const followQuery = async ({ questCode, actionCode }) => {
        if (!s('.action-engine-container')) return;
        if (questCode && questCode !== ActionEngineCyberia.current.quest?.name)
          await ActionEngineCyberia.openByKey('quest', questCode);
        if (actionCode && actionCode !== ActionEngineCyberia.current.action?.name)
          await ActionEngineCyberia.openByKey('action', actionCode);
      };
      listenQueryParamsChange({ id: 'cyberia-action-engine-query-listener', event: followQuery });
      await followQuery(getQueryParams());
    });

    return html`<div class="in section-mp studio-editor action-engine-container">
      <style>
        ${STUDIO_FORM_STYLE}
      </style>
      ${EditorLayout.render({
        subject: 'map',
        readout: html`<div class="in action-engine-cell-coords" style="font-size:12px;font-family:monospace;">
            Cell: (—, —)
          </div>
          <div class="in action-engine-map-meta" style="font-size:12px;color:#888;font-family:monospace;"></div>`,
        stage: html`<canvas
          class="action-engine-canvas"
          style="display:block;cursor:crosshair;border:1px solid var(--studio-subtle-border);"
        ></canvas>`,
        tools: html`<div class="in action-engine-tools">
          ${group(
            'Map Placement',
            'fa-solid fa-map-location-dot',
            html`<div class="fl" style="align-items:flex-end;">
                <div class="in fll" style="flex:1;">${await ActionEngineCyberia.buildMapDropdown(ids.mapDropdown)}</div>
                <div class="in fll" style="padding-left:6px;">
                  ${await BtnIcon.instance({
                    class: 'wfa btn-action-engine-load-map',
                    label: html`<i class="fa-solid fa-download"></i> Load Map`,
                  })}
                </div>
              </div>
              ${dynamicCol({ containerSelector: cont, id: dc.cell, type: 'a-50-b-50' })}
              <div class="fl" style="margin-top:8px;">
                <div class="in fll ${dc.cell}-col-a" style="padding-right:4px;">
                  ${await Input.instance({
                    id: 'action-engine-cell-x',
                    label: html`Cell X`,
                    containerClass: 'inl',
                    type: 'number',
                    min: 0,
                  })}
                </div>
                <div class="in fll ${dc.cell}-col-b" style="padding-left:4px;">
                  ${await Input.instance({
                    id: 'action-engine-cell-y',
                    label: html`Cell Y`,
                    containerClass: 'inl',
                    type: 'number',
                    min: 0,
                  })}
                </div>
              </div>
              <div class="in input-label" style="font-size:12px;margin:10px 0 4px;opacity:.8;">
                <i class="fa-solid fa-list-check"></i> Assignments on map
              </div>
              ${await assignmentList('quest')} ${await assignmentList('action')}`,
          )}
          ${EditorCrud.render({ id: 'action-engine-crud', label: 'Document' })}
          ${Tabs.render({
            id: 'action-engine-tabs',
            label: 'Action tools',
            tabs: [
              {
                id: 'quest',
                label: 'Quests',
                icon: 'fa-solid fa-scroll',
                content: html` ${group(
              'Quest Details',
              'fa-solid fa-circle-info',
              html`${dynamicCol({ containerSelector: cont, id: dc.questCt, type: 'a-50-b-50' })}
                <div class="fl">
                  <div class="in fll ${dc.questCt}-col-a" style="padding-right:4px;">
                    ${await Input.instance({
                      id: 'action-engine-quest-code',
                      label: html`Quest Code`,
                      containerClass: 'inl',
                      type: 'text',
                    })}
                  </div>
                  <div class="in fll ${dc.questCt}-col-b" style="padding-left:4px;">
                    ${await Input.instance({
                      id: 'action-engine-quest-title',
                      label: html`Title`,
                      containerClass: 'inl',
                      type: 'text',
                    })}
                  </div>
                </div>
                <div class="in" style="margin-top:6px;">
                  ${await Input.instance({
                    id: 'action-engine-quest-description',
                    label: html`Description`,
                    containerClass: 'inl',
                    type: 'text',
                  })}
                </div>
                <div class="in" style="margin-top:6px;">
                  ${await Input.instance({
                    id: 'action-engine-quest-map-code',
                    label: html`Source Map Code (click a cell to assign)`,
                    containerClass: 'inl',
                    type: 'text',
                  })}
                </div>`,
            )}
                ${group(
                  'Quest Chain',
                  'fa-solid fa-diagram-project',
                  html`${dynamicCol({ containerSelector: cont, id: dc.questChain, type: 'a-50-b-50' })}
                    <div class="fl">
                      <div class="in fll ${dc.questChain}-col-a" style="padding-right:4px;">
                        ${await Input.instance({
                          id: 'action-engine-quest-prerequisites',
                          label: html`Prerequisite Codes (csv)`,
                          containerClass: 'inl',
                          type: 'text',
                        })}
                      </div>
                      <div class="in fll ${dc.questChain}-col-b" style="padding-left:4px;">
                        ${await Input.instance({
                          id: 'action-engine-quest-unlocks',
                          label: html`Unlocks Codes (csv)`,
                          containerClass: 'inl',
                          type: 'text',
                        })}
                      </div>
                    </div>`,
                )}
                ${group(
                  'Steps & Objectives',
                  'fa-solid fa-list-ol',
                  html`<div class="in" style="margin-bottom:8px;">
                      ${await BtnIcon.instance({
                        class: 'wfa btn-action-engine-add-step',
                        label: html`<i class="fa-solid fa-plus"></i> Add Step`,
                      })}
                    </div>
                    <div class="in action-engine-step-list" style="margin-bottom:10px;"></div>
                    <div class="in input-label" style="font-size:12px;margin-bottom:6px;opacity:.8;">
                      Add objective to step
                    </div>
                    ${dynamicCol({ containerSelector: cont, id: dc.objective, type: 'search-inputs' })}
                    <div class="fl" style="align-items:flex-end;">
                      <div class="in fll ${dc.objective}-col-a" style="padding-right:4px;">
                        ${await Input.instance({
                          id: 'action-engine-objective-step',
                          label: html`Step #`,
                          containerClass: 'inl',
                          type: 'number',
                          min: 1,
                          value: 1,
                        })}
                      </div>
                      <div class="in fll ${dc.objective}-col-b" style="padding-right:4px;">
                        ${await DropDown.instance({
                          id: ids.objectiveType,
                          label: html`Type`,
                          data: objectiveTypeOptions,
                          value: QUEST_STEPS_TYPES[0],
                          containerClass: 'inl',
                        })}
                      </div>
                      <div class="in fll ${dc.objective}-col-c" style="padding-right:4px;">
                        ${await Input.instance({
                          id: 'action-engine-objective-qty',
                          label: html`Qty`,
                          containerClass: 'inl',
                          type: 'number',
                          min: 1,
                          value: 1,
                        })}
                      </div>
                    </div>
                    <div class="in" style="margin-top:6px;">
                      ${await ActionEngineCyberia.buildItemIdDropdown(ids.objectiveItemPicker, html`Search itemId`)}
                    </div>
                    <div class="in" style="margin-top:6px;">
                      ${await BtnIcon.instance({
                        class: 'wfa btn-action-engine-add-objective',
                        label: html`<i class="fa-solid fa-plus"></i> Add Objective`,
                      })}
                    </div>`,
                )}
                ${group(
                  'Rewards',
                  'fa-solid fa-gift',
                  html`${dynamicCol({ containerSelector: cont, id: dc.reward, type: 'default' })}
                    <div class="fl" style="align-items:flex-end;">
                      <div class="in fll ${dc.reward}-col-a" style="padding-right:4px;">
                        ${await Input.instance({
                          id: 'action-engine-reward-qty',
                          label: html`Qty`,
                          containerClass: 'inl',
                          type: 'number',
                          min: 1,
                          value: 1,
                        })}
                      </div>
                      <div class="in fll ${dc.reward}-col-b">
                        ${await ActionEngineCyberia.buildItemIdDropdown(ids.rewardItemPicker, html`Search itemId`)}
                      </div>
                    </div>
                    <div class="in" style="margin-top:6px;">
                      ${await BtnIcon.instance({
                        class: 'wfa btn-action-engine-add-reward',
                        label: html`<i class="fa-solid fa-plus"></i> Add Reward`,
                      })}
                    </div>
                    <div class="in action-engine-reward-list" style="margin-top:8px;"></div>`,
                )}
                ${group(
                  'Existing Quests',
                  'fa-solid fa-scroll',
                  html`${await listToolbar('quest')}
                    <div class="in action-engine-quest-cards" style="max-height:300px;overflow-y:auto;"></div>
                    ${await listPager('quest')}`,
                )}`,
              },
              {
                id: 'action',
                label: 'Actions',
                icon: 'fa-solid fa-handshake',
                content: html` ${group(
              'Action Details',
              'fa-solid fa-circle-info',
              html`${dynamicCol({ containerSelector: cont, id: dc.actionCl, type: 'a-50-b-50' })}
                <div class="fl">
                  <div class="in fll ${dc.actionCl}-col-a" style="padding-right:4px;">
                    ${await Input.instance({
                      id: 'action-engine-action-code',
                      label: html`Action Code`,
                      containerClass: 'inl',
                      type: 'text',
                    })}
                  </div>
                  <div class="in fll ${dc.actionCl}-col-b" style="padding-left:4px;">
                    ${await Input.instance({
                      id: 'action-engine-action-label',
                      label: html`Label (nameplate)`,
                      containerClass: 'inl',
                      type: 'text',
                    })}
                  </div>
                </div>
                <div class="in" style="margin-top:6px;">
                  ${await Input.instance({
                    id: 'action-engine-action-map-code',
                    label: html`Source Map Code (click a cell to assign)`,
                    containerClass: 'inl',
                    type: 'text',
                  })}
                </div>
                <div class="in" style="margin-top:8px;">
                  ${await ActionEngineCyberia.buildDialogCodeDropdown(
                    ids.actionDialogPicker,
                    html`Default greeting dialog code`,
                  )}
                </div>`,
            )}
                ${group(
                  'Per-quest Dialogue Mapping',
                  'fa-solid fa-comments',
                  html`${dynamicCol({ containerSelector: cont, id: dc.actionQd, type: 'a-50-b-50' })}
                    <div class="fl" style="align-items:flex-end;">
                      <div class="in fll ${dc.actionQd}-col-a" style="padding-right:4px;">
                        ${await Input.instance({
                          id: 'action-engine-action-quest-code',
                          label: html`Quest Code`,
                          containerClass: 'inl',
                          type: 'text',
                        })}
                      </div>
                      <div class="in fll ${dc.actionQd}-col-b">
                        ${await ActionEngineCyberia.buildDialogCodeDropdown(ids.actionQuestDialogPicker, html`Dialog Code`)}
                      </div>
                    </div>
                    <div class="in" style="margin-top:6px;">
                      ${await BtnIcon.instance({
                        class: 'wfa btn-action-engine-add-quest-dialogue',
                        label: html`<i class="fa-solid fa-plus"></i> Map Dialogue`,
                      })}
                    </div>
                    <div class="in action-engine-quest-dialogue-list" style="margin-top:8px;"></div>`,
                )}
                ${group(
                  'Shared Market',
                  'fa-solid fa-store',
                  html`<div class="studio-form-hint">
                      The market profile owns the scope, modes, durations, fees and limits of the market every terminal
                      of its code shares.
                    </div>
                    <div class="in" style="margin-top:6px;">
                      ${await ActionEngineCyberia.buildMarketDropdown('action-engine-market-picker', html`Market profile`)}
                    </div>
                    <div class="in action-engine-market-shared" style="margin-top:6px;"></div>`,
                )}
                ${group(
                  'Local Terminal Rules',
                  'fa-solid fa-sliders',
                  html`<div class="in action-engine-market-rules"></div>
                    <div class="in action-engine-cap-market">${await capabilityList(CAPABILITY_LISTS[2])}</div>`,
                )}
                ${group(
                  'Other Interaction Capabilities',
                  'fa-solid fa-coins',
                  html`<div class="studio-form-hint">
                      The item policy of the economy must allow each operation too: a list never grants what the policy
                      refuses. The shop and the recipes of the action come from content; a save keeps them.
                    </div>
                    <label class="in" style="font-size:12px;margin-top:6px;"
                      >Vault slots (0: no vault)
                      <input
                        type="number"
                        min="0"
                        class="wfa action-engine-storage-slots"
                        ${ActionEngineCyberia.canMutate ? '' : 'disabled'}
                      />
                    </label>
                    ${await capabilityList(CAPABILITY_LISTS[0])} ${await capabilityList(CAPABILITY_LISTS[1])}`,
                )}
                ${group(
                  'Effective Capabilities',
                  'fa-solid fa-stethoscope',
                  html`<div class="studio-form-hint">
                      What the saved action does in each world of its map: its lists, the item policy of the economy,
                      the catalog binding and the market together.
                    </div>
                    <div class="in action-engine-diagnostics" style="margin-top:6px;"></div>`,
                )}
                ${group(
                  'Existing Actions',
                  'fa-solid fa-handshake',
                  html`${await listToolbar('action')}
                    <div class="in action-engine-action-cards" style="max-height:300px;overflow-y:auto;"></div>
                    ${await listPager('action')}`,
                )}`,
              },
              {
                id: 'dialogue',
                label: 'Dialogues',
                icon: 'fa-solid fa-comments',
                content: html` ${group(
              'Dialogue Line',
              'fa-solid fa-comment-dots',
              html`${dynamicCol({ containerSelector: cont, id: dc.dialogue, type: 'search-inputs' })}
                <div class="fl">
                  <div class="in fll ${dc.dialogue}-col-a" style="padding-right:4px;">
                    ${await Input.instance({
                      id: 'action-engine-dialogue-code',
                      label: html`Dialogue Code`,
                      containerClass: 'inl',
                      type: 'text',
                    })}
                  </div>
                  <div class="in fll ${dc.dialogue}-col-b" style="padding-right:4px;">
                    ${await Input.instance({
                      id: 'action-engine-dialogue-order',
                      label: html`Order`,
                      containerClass: 'inl',
                      type: 'number',
                      min: 0,
                      value: 0,
                    })}
                  </div>
                  <div class="in fll ${dc.dialogue}-col-c">
                    ${await Input.instance({
                      id: 'action-engine-dialogue-mood',
                      label: html`Mood`,
                      containerClass: 'inl',
                      type: 'text',
                    })}
                  </div>
                </div>
                <div class="in" style="margin-top:6px;">
                  ${await Input.instance({
                    id: 'action-engine-dialogue-speaker',
                    label: html`Speaker`,
                    containerClass: 'inl',
                    type: 'text',
                  })}
                </div>
                <div class="in" style="margin-top:6px;">
                  ${await Input.instance({
                    id: 'action-engine-dialogue-text',
                    label: html`Text`,
                    containerClass: 'inl',
                    type: 'text',
                  })}
                </div>`,
            )}
                ${group(
                  'Existing Dialogue Lines',
                  'fa-solid fa-comments',
                  html`${await listToolbar('dialogue')}
                    <div class="in action-engine-dialogue-cards" style="max-height:300px;overflow-y:auto;"></div>
                    ${await listPager('dialogue')}`,
                )}`,
              },
              {
                id: 'skill',
                label: 'Skills',
                icon: 'fa-solid fa-wand-sparkles',
                content: html` ${group(
              'Skill Definition',
              'fa-solid fa-circle-info',
              html`<div class="in input-label" style="font-size:12px;margin-bottom:6px;opacity:.8;">
                  Trigger item — the ObjectLayer item whose active layer fires these skills.
                </div>
                ${await ActionEngineCyberia.buildItemIdDropdown(ids.skillTriggerItemPicker, html`Search trigger itemId`)}`,
            )}
                ${group(
                  'Logic Skills',
                  'fa-solid fa-bolt',
                  html`<div class="in input-label" style="font-size:12px;margin-bottom:6px;opacity:.8;">
                      Add logic event
                    </div>
                    ${dynamicCol({ containerSelector: cont, id: dc.skillDef, type: 'a-50-b-50' })}
                    <div class="fl">
                      <div class="in fll ${dc.skillDef}-col-a" style="padding-right:4px;">
                        ${await DropDown.instance({
                          id: 'action-engine-skill-logic-event',
                          label: html`Logic Event Id`,
                          containerClass: 'inl',
                          data: SKILL_LOGIC_IDS.map((l) => ({
                            value: l.id,
                            display: l.name ? `${l.id} — ${l.name}` : l.id,
                            data: l.id,
                            onClick: () => ActionEngineCyberia.showSummonPicker(!l.summonsTrigger),
                          })),
                        })}
                      </div>
                      <div class="in fll ${dc.skillDef}-col-b" style="padding-left:4px;">
                        ${await Input.instance({
                          id: 'action-engine-skill-name',
                          label: html`Name`,
                          containerClass: 'inl',
                          type: 'text',
                        })}
                      </div>
                    </div>
                    <div class="in" style="margin-top:6px;">
                      ${await Input.instance({
                        id: 'action-engine-skill-description',
                        label: html`Description`,
                        containerClass: 'inl',
                        type: 'text',
                      })}
                    </div>
                    <div class="in action-engine-skill-summon" style="margin-top:6px;">
                      ${await ActionEngineCyberia.buildItemIdDropdown(
                        ids.skillSummonedItemPicker,
                        html`Summoned entity itemId`,
                      )}
                    </div>
                    <div class="in" style="margin-top:6px;">
                      ${await BtnIcon.instance({
                        class: 'wfa btn-action-engine-add-skill-def',
                        label: html`<i class="fa-solid fa-plus"></i> Add Skill`,
                      })}
                    </div>
                    <div class="in action-engine-skill-def-list" style="margin-top:8px;"></div>`,
                )}
                ${group(
                  'Existing Skills',
                  'fa-solid fa-wand-sparkles',
                  html`${await listToolbar('skill')}
                    <div class="in action-engine-skill-cards" style="max-height:300px;overflow-y:auto;"></div>
                    ${await listPager('skill')}`,
                )}`,
              },
              {
                id: 'saga',
                label: 'Saga integration',
                image: contextIconSrc(),
                content: await SagaSync.render({
                  canMutate: ActionEngineCyberia.canMutate,
                  onOpen: (kind, key) => ActionEngineCyberia.openByKey(kind, key),
                  onSynced: async () => {
                    await ActionEngineCyberia.refreshAll();
                    await ActionEngineCyberia.reloadSynced(SagaSync.report);
                  },
                }),
              },
            ],
          })}
        </div>`,
      })}
    </div>`;
  }
}

export { ActionEngineCyberia };
