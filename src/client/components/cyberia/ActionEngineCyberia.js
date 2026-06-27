import { BtnIcon } from '../core/BtnIcon.js';
import { Input } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { darkTheme, dynamicCol, ThemeEvents } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { getProxyPath } from '../core/Router.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { CyberiaQuestService } from '../../services/cyberia-quest/cyberia-quest.service.js';
import { CyberiaActionService } from '../../services/cyberia-action/cyberia-action.service.js';
import { CyberiaDialogueService } from '../../services/cyberia-dialogue/cyberia-dialogue.service.js';
import { CyberiaSkillService } from '../../services/cyberia-skill/cyberia-skill.service.js';
import { QUEST_STEPS_TYPES, getDefaultCyberiaItemById } from './SharedDefaultsCyberia.js';

const textFilter = (filter) => ({ filterType: 'text', type: 'equals', filter });
// DropDown invokes optionData.onClick on selection, so every option (including
// serviceProvider results) must carry one.
const dropdownOption = (value) => ({ value, display: value, data: value, onClick: () => {} });
const groupBorder = () => (darkTheme ? '#3a3a3a' : '#d4d4d4');
const subtleBorder = () => (darkTheme ? '#444' : '#e0e0e0');

// ActionEngineCyberia — a map-driven engine that unifies quest, action and
// dialogue authoring around a shared, visual map surface. It is intentionally
// decoupled from MapEngineCyberia: the only integration points are the public
// data services (maps, quests, actions, dialogues, object-layer item ids) and
// the same object-layer texture-loading convention. The engine reads a map
// purely as a placement backdrop and never mutates map documents. CRUD is
// surfaced as per-entity card lists (mirroring the map-engine entity list),
// not management grids.
class ActionEngineCyberia {
  static mode = 'quest';
  static mapCode = '';
  static mapDoc = null;
  static imageCache = {};
  static assignments = { quests: [], actions: [] };

  static questListCache = [];
  static actionListCache = [];
  static dialogueListCache = [];
  static skillListCache = [];

  static currentQuestId = null;
  static currentActionId = null;
  static currentDialogueId = null;
  static currentSkillId = null;

  static questSteps = [];
  static questRewards = [];
  static actionQuestDialogues = [];
  static loadedActionPayloadExtras = {};
  // Editable `skills[]` for the loaded CyberiaSkill (logicEventIds are derived
  // from these on save, mirroring DefaultSkillConfig).
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
        if (result.status === 'success' && result.data?.itemIds) {
          return result.data.itemIds.map((itemId) => dropdownOption(itemId));
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

  // ── Object-layer textures (same loading convention as MapEngineCyberia) ──
  static loadObjectLayerImage(itemId, onLoad) {
    if (ActionEngineCyberia.imageCache[itemId]) return;
    ActionEngineCyberia.imageCache[itemId] = { img: null, loaded: false, error: false };

    const loadImage = (type, id) => {
      const img = new Image();
      img.onload = () => {
        ActionEngineCyberia.imageCache[itemId].img = img;
        ActionEngineCyberia.imageCache[itemId].loaded = true;
        if (onLoad) onLoad();
      };
      img.onerror = () => {
        ActionEngineCyberia.imageCache[itemId].error = true;
      };
      img.src = `${getProxyPath()}assets/${type}/${id}/08/0.png`;
    };

    const sharedItem = getDefaultCyberiaItemById(itemId)?.item;
    if (sharedItem?.type && sharedItem?.id) {
      loadImage(sharedItem.type, sharedItem.id);
      return;
    }

    ObjectLayerService.get({
      limit: 1,
      filterModel: { 'data.item.id': { filterType: 'text', type: 'equals', filter: itemId } },
    })
      .then((res) => {
        const doc = res?.data?.data?.[0];
        if (!doc || !doc.data?.item?.type || !doc.data?.item?.id) {
          ActionEngineCyberia.imageCache[itemId].error = true;
          return;
        }
        loadImage(doc.data.item.type, doc.data.item.id);
      })
      .catch(() => {
        ActionEngineCyberia.imageCache[itemId].error = true;
      });
  }

  static preloadMapObjectLayers(onLoad) {
    for (const entity of ActionEngineCyberia.mapDoc?.entities || [])
      for (const itemId of entity.objectLayerItemIds || []) ActionEngineCyberia.loadObjectLayerImage(itemId, onLoad);
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
          const cached = ActionEngineCyberia.imageCache[itemId];
          if (cached?.loaded && cached.img) {
            ctx.drawImage(cached.img, x, y, w, h);
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
    for (const q of ActionEngineCyberia.assignments.quests)
      if (q.sourceCellX != null) drawMarker(q.sourceCellX, q.sourceCellY, 'rgba(40,120,220,0.92)', 'Q');
    for (const a of ActionEngineCyberia.assignments.actions)
      if (a.sourceCellX != null) drawMarker(a.sourceCellX, a.sourceCellY, 'rgba(220,120,40,0.92)', 'A');

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
    const result = await CyberiaMapService.get({ limit: 1, filterModel: { code: textFilter(code) } });
    const doc = result?.data?.data?.[0];
    if (!doc) {
      NotificationManager.Push({ html: `Map "${code}" not found`, status: 'error' });
      return;
    }
    ActionEngineCyberia.mapCode = code;
    ActionEngineCyberia.mapDoc = doc;
    htmls('.action-engine-map-meta', `${doc.code} · ${doc.gridX || 16}×${doc.gridY || 16} cells`);
    ActionEngineCyberia.preloadMapObjectLayers(() => ActionEngineCyberia.renderMapCanvas());
    await ActionEngineCyberia.refreshAssignments();
    ActionEngineCyberia.renderMapCanvas();
  }

  static async refreshAssignments() {
    const code = ActionEngineCyberia.mapCode;
    if (!code) {
      ActionEngineCyberia.assignments = { quests: [], actions: [] };
      ActionEngineCyberia.renderAssignmentReview();
      return;
    }
    const [questRes, actionRes] = await Promise.all([
      CyberiaQuestService.get({ limit: 500, filterModel: { sourceMapCode: textFilter(code) } }),
      CyberiaActionService.get({ limit: 500, filterModel: { sourceMapCode: textFilter(code) } }),
    ]);
    ActionEngineCyberia.assignments = {
      quests: questRes?.data?.data || [],
      actions: actionRes?.data?.data || [],
    };
    ActionEngineCyberia.renderMapCanvas();
    ActionEngineCyberia.renderAssignmentReview();
  }

  static renderAssignmentReview() {
    const container = s('.action-engine-assignment-review');
    if (!container) return;
    const { quests, actions } = ActionEngineCyberia.assignments;
    const row = (kind, color, doc) =>
      html`<div
        class="fl action-engine-assignment-row"
        style="border-bottom:1px solid ${subtleBorder()};padding:4px 0;align-items:center;cursor:pointer;"
        data-kind="${kind}"
        data-id="${doc._id}"
      >
        <div
          class="in fll"
          style="width:18px;height:18px;border-radius:50%;background:${color};color:#fff;text-align:center;font-size:11px;line-height:18px;margin-right:6px;"
        >
          ${kind === 'quest' ? 'Q' : 'A'}
        </div>
        <div class="in fll" style="flex:1;font-size:12px;font-family:monospace;">
          ${doc.code}
          ${doc.sourceCellX != null
            ? `(${doc.sourceCellX}, ${doc.sourceCellY})`
            : '<span style="color:#999;">unplaced</span>'}
        </div>
      </div>`;
    let out = '';
    for (const q of quests) out += row('quest', 'rgba(40,120,220,0.92)', q);
    for (const a of actions) out += row('action', 'rgba(220,120,40,0.92)', a);
    if (!out)
      out = `<div style="color:#888;font-size:13px;">${ActionEngineCyberia.mapCode ? 'No assignments on this map yet.' : 'Load a map to review assignments.'}</div>`;
    htmls('.action-engine-assignment-review', out);

    container.querySelectorAll('.action-engine-assignment-row').forEach((rowEl) => {
      rowEl.onclick = async () => {
        const { kind, id } = rowEl.dataset;
        if (kind === 'quest') {
          ActionEngineCyberia.setMode('quest');
          const res = await CyberiaQuestService.get({ id });
          if (res.status === 'success' && res.data) ActionEngineCyberia.loadQuest(res.data);
        } else {
          ActionEngineCyberia.setMode('action');
          const res = await CyberiaActionService.get({ id });
          if (res.status === 'success' && res.data) ActionEngineCyberia.loadAction(res.data);
        }
      };
    });
  }

  // ── Mode switching ──────────────────────────────────────────────────────
  static setMode(mode) {
    ActionEngineCyberia.mode = mode;
    for (const m of ['quest', 'action', 'dialogue', 'skill']) {
      const panel = s(`.action-engine-panel-${m}`);
      if (panel) panel.classList[m === mode ? 'remove' : 'add']('hide');
      const tab = s(`.action-engine-tab-${m}`);
      if (tab) {
        tab.style.opacity = m === mode ? '1' : '0.5';
        tab.style.fontWeight = m === mode ? 'bold' : 'normal';
        tab.style.borderBottomColor = m === mode ? '#1fd11f' : 'transparent';
      }
    }
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
          style="border-bottom:1px solid ${subtleBorder()};padding:3px 0;align-items:center;"
        >
          <div class="in fll" style="flex:1;font-family:monospace;font-size:12px;">
            <span style="color:${darkTheme ? '#8cf' : '#246'};">${o.type}</span> · ${o.itemId} ×${o.quantity}
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
        style="border:1px solid ${subtleBorder()};border-radius:6px;padding:8px;margin-bottom:8px;"
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
        style="border-bottom:1px solid ${subtleBorder()};padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
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
        style="border-bottom:1px solid ${subtleBorder()};padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">
          <span style="color:${darkTheme ? '#8cf' : '#246'};">${d.questCode}</span>
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
      BtnIcon.instance({
        class: delCls,
        label: html`<i class="fa-solid fa-trash"></i>`,
        style: 'min-width:34px;padding:3px 9px;',
      }),
    ]);
  }

  static cardWrap(inner) {
    return html`<div
      class="in"
      style="border:1px solid ${subtleBorder()};border-radius:6px;padding:8px;margin-bottom:6px;"
    >
      ${inner}
    </div>`;
  }

  static async renderQuestCards() {
    const container = s('.action-engine-quest-cards');
    if (!container) return;
    const filter = (s('.action-engine-quest-search')?.value || '').toLowerCase();
    const items = ActionEngineCyberia.questListCache.filter(
      (d) => !filter || (d.code || '').toLowerCase().includes(filter) || (d.title || '').toLowerCase().includes(filter),
    );
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
          </div>
          <div class="in fll" style="display:flex;gap:4px;">${loadBtn}${delBtn}</div>
        </div>`,
      );
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No quests found.</div>';
    htmls('.action-engine-quest-cards', out);
    for (const doc of items) {
      if (s(`.btn-aeq-load-${doc._id}`))
        s(`.btn-aeq-load-${doc._id}`).onclick = async () => {
          const res = await CyberiaQuestService.get({ id: doc._id });
          if (res.status === 'success' && res.data) ActionEngineCyberia.loadQuest(res.data);
        };
      if (s(`.btn-aeq-del-${doc._id}`))
        s(`.btn-aeq-del-${doc._id}`).onclick = () => ActionEngineCyberia.deleteQuest(doc._id);
    }
  }

  static async renderActionCards() {
    const container = s('.action-engine-action-cards');
    if (!container) return;
    const filter = (s('.action-engine-action-search')?.value || '').toLowerCase();
    const items = ActionEngineCyberia.actionListCache.filter(
      (d) => !filter || (d.code || '').toLowerCase().includes(filter) || (d.label || '').toLowerCase().includes(filter),
    );
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
          </div>
          <div class="in fll" style="display:flex;gap:4px;">${loadBtn}${delBtn}</div>
        </div>`,
      );
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No actions found.</div>';
    htmls('.action-engine-action-cards', out);
    for (const doc of items) {
      if (s(`.btn-aea-load-${doc._id}`))
        s(`.btn-aea-load-${doc._id}`).onclick = async () => {
          const res = await CyberiaActionService.get({ id: doc._id });
          if (res.status === 'success' && res.data) ActionEngineCyberia.loadAction(res.data);
        };
      if (s(`.btn-aea-del-${doc._id}`))
        s(`.btn-aea-del-${doc._id}`).onclick = () => ActionEngineCyberia.deleteAction(doc._id);
    }
  }

  static async renderDialogueCards() {
    const container = s('.action-engine-dialogue-cards');
    if (!container) return;
    const filter = (s('.action-engine-dialogue-search')?.value || '').toLowerCase();
    const items = ActionEngineCyberia.dialogueListCache.filter(
      (d) =>
        !filter ||
        (d.code || '').toLowerCase().includes(filter) ||
        (d.speaker || '').toLowerCase().includes(filter) ||
        (d.text || '').toLowerCase().includes(filter),
    );
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
          </div>
          <div class="in fll" style="display:flex;gap:4px;">${loadBtn}${delBtn}</div>
        </div>`,
      );
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No dialogue lines found.</div>';
    htmls('.action-engine-dialogue-cards', out);
    for (const doc of items) {
      if (s(`.btn-aed-load-${doc._id}`))
        s(`.btn-aed-load-${doc._id}`).onclick = async () => {
          const res = await CyberiaDialogueService.get({ id: doc._id });
          if (res.status === 'success' && res.data) ActionEngineCyberia.loadDialogue(res.data);
        };
      if (s(`.btn-aed-del-${doc._id}`))
        s(`.btn-aed-del-${doc._id}`).onclick = () => ActionEngineCyberia.deleteDialogue(doc._id);
    }
  }

  static async refreshQuestList() {
    const res = await CyberiaQuestService.get({ limit: 500 });
    ActionEngineCyberia.questListCache = res?.data?.data || [];
    await ActionEngineCyberia.renderQuestCards();
  }

  static async refreshActionList() {
    const res = await CyberiaActionService.get({ limit: 500 });
    ActionEngineCyberia.actionListCache = res?.data?.data || [];
    await ActionEngineCyberia.renderActionCards();
  }

  static async refreshDialogueList() {
    const res = await CyberiaDialogueService.get({ limit: 500 });
    ActionEngineCyberia.dialogueListCache = res?.data?.data || [];
    await ActionEngineCyberia.renderDialogueCards();
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

  static async loadQuest(doc) {
    ActionEngineCyberia.setMode('quest');
    ActionEngineCyberia.currentQuestId = doc._id || null;
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
    await ActionEngineCyberia.syncMapForLoadedDoc(doc);
    NotificationManager.Push({ html: `Quest "${doc.code}" loaded`, status: 'success' });
  }

  static resetQuest() {
    ActionEngineCyberia.currentQuestId = null;
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

  static async saveQuest() {
    const body = ActionEngineCyberia.getQuestPayload();
    if (!body.code || !body.title) {
      NotificationManager.Push({ html: 'Quest code and title are required.', status: 'error' });
      return;
    }
    const isUpdate = !!ActionEngineCyberia.currentQuestId;
    const result = isUpdate
      ? await CyberiaQuestService.put({ id: ActionEngineCyberia.currentQuestId, body })
      : await CyberiaQuestService.post({ body });
    ActionEngineCyberia.notifyResult(result, isUpdate);
    if (result.status === 'success') {
      if (result.data?._id) ActionEngineCyberia.currentQuestId = result.data._id;
      await ActionEngineCyberia.refreshQuestList();
      await ActionEngineCyberia.refreshAssignments();
    }
  }

  static async cloneQuest() {
    if (!ActionEngineCyberia.currentQuestId) {
      NotificationManager.Push({ html: 'Load a quest to clone first.', status: 'warning' });
      return;
    }
    const body = ActionEngineCyberia.getQuestPayload();
    body.code = `${body.code}-clone`;
    const result = await CyberiaQuestService.post({ body });
    ActionEngineCyberia.notifyResult(result, false);
    if (result.status === 'success') {
      if (result.data?._id) ActionEngineCyberia.currentQuestId = result.data._id;
      if (s('.action-engine-quest-code')) s('.action-engine-quest-code').value = body.code;
      await ActionEngineCyberia.refreshQuestList();
      await ActionEngineCyberia.refreshAssignments();
    }
  }

  static async deleteQuest(id) {
    const targetId = id || ActionEngineCyberia.currentQuestId;
    if (!targetId) return;
    const result = await CyberiaQuestService.delete({ id: targetId });
    NotificationManager.Push({
      html: result.status === 'error' ? result.message : Translate.instance('item-success-delete'),
      status: result.status,
    });
    if (result.status === 'success') {
      if (targetId === ActionEngineCyberia.currentQuestId) ActionEngineCyberia.resetQuest();
      await ActionEngineCyberia.refreshQuestList();
      await ActionEngineCyberia.refreshAssignments();
    }
  }

  // ── Action payload / load / persistence ─────────────────────────────────
  static getActionPayload() {
    const payload = {
      ...ActionEngineCyberia.loadedActionPayloadExtras,
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

  static async loadAction(doc) {
    ActionEngineCyberia.setMode('action');
    ActionEngineCyberia.currentActionId = doc._id || null;
    // Out-of-scope payloads (shop/craft/storage) are preserved verbatim so
    // editing an action here never drops data the engine doesn't manage yet.
    const {
      _id,
      code,
      label,
      dialogCode,
      questDialogueCodes,
      sourceMapCode,
      sourceCellX,
      sourceCellY,
      createdAt,
      updatedAt,
      __v,
      ...extras
    } = doc;
    ActionEngineCyberia.loadedActionPayloadExtras = extras;
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
    NotificationManager.Push({ html: `Action "${doc.code}" loaded`, status: 'success' });
  }

  static resetAction() {
    ActionEngineCyberia.currentActionId = null;
    ActionEngineCyberia.actionQuestDialogues = [];
    ActionEngineCyberia.loadedActionPayloadExtras = {};
    for (const cls of ['action-engine-action-code', 'action-engine-action-label'])
      if (s(`.${cls}`)) s(`.${cls}`).value = '';
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.actionDialogPicker, '');
    ActionEngineCyberia.renderQuestDialogueList();
  }

  static async saveAction() {
    const body = ActionEngineCyberia.getActionPayload();
    if (!body.code) {
      NotificationManager.Push({ html: 'Action code is required.', status: 'error' });
      return;
    }
    const isUpdate = !!ActionEngineCyberia.currentActionId;
    const result = isUpdate
      ? await CyberiaActionService.put({ id: ActionEngineCyberia.currentActionId, body })
      : await CyberiaActionService.post({ body });
    ActionEngineCyberia.notifyResult(result, isUpdate);
    if (result.status === 'success') {
      if (result.data?._id) ActionEngineCyberia.currentActionId = result.data._id;
      await ActionEngineCyberia.refreshActionList();
      await ActionEngineCyberia.refreshAssignments();
    }
  }

  static async cloneAction() {
    if (!ActionEngineCyberia.currentActionId) {
      NotificationManager.Push({ html: 'Load an action to clone first.', status: 'warning' });
      return;
    }
    const body = ActionEngineCyberia.getActionPayload();
    body.code = `${body.code}-clone`;
    const result = await CyberiaActionService.post({ body });
    ActionEngineCyberia.notifyResult(result, false);
    if (result.status === 'success') {
      if (result.data?._id) ActionEngineCyberia.currentActionId = result.data._id;
      if (s('.action-engine-action-code')) s('.action-engine-action-code').value = body.code;
      await ActionEngineCyberia.refreshActionList();
      await ActionEngineCyberia.refreshAssignments();
    }
  }

  static async deleteAction(id) {
    const targetId = id || ActionEngineCyberia.currentActionId;
    if (!targetId) return;
    const result = await CyberiaActionService.delete({ id: targetId });
    NotificationManager.Push({
      html: result.status === 'error' ? result.message : Translate.instance('item-success-delete'),
      status: result.status,
    });
    if (result.status === 'success') {
      if (targetId === ActionEngineCyberia.currentActionId) ActionEngineCyberia.resetAction();
      await ActionEngineCyberia.refreshActionList();
      await ActionEngineCyberia.refreshAssignments();
    }
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

  static loadDialogue(doc) {
    ActionEngineCyberia.setMode('dialogue');
    ActionEngineCyberia.currentDialogueId = doc._id || null;
    if (s('.action-engine-dialogue-code')) s('.action-engine-dialogue-code').value = doc.code || '';
    if (s('.action-engine-dialogue-order')) s('.action-engine-dialogue-order').value = doc.order ?? 0;
    if (s('.action-engine-dialogue-speaker')) s('.action-engine-dialogue-speaker').value = doc.speaker || '';
    if (s('.action-engine-dialogue-text')) s('.action-engine-dialogue-text').value = doc.text || '';
    if (s('.action-engine-dialogue-mood')) s('.action-engine-dialogue-mood').value = doc.mood || 'neutral';
    NotificationManager.Push({ html: `Dialogue line "${doc.code}" loaded`, status: 'success' });
  }

  static resetDialogue() {
    ActionEngineCyberia.currentDialogueId = null;
    if (s('.action-engine-dialogue-code')) s('.action-engine-dialogue-code').value = '';
    if (s('.action-engine-dialogue-order')) s('.action-engine-dialogue-order').value = 0;
    if (s('.action-engine-dialogue-speaker')) s('.action-engine-dialogue-speaker').value = '';
    if (s('.action-engine-dialogue-text')) s('.action-engine-dialogue-text').value = '';
    if (s('.action-engine-dialogue-mood')) s('.action-engine-dialogue-mood').value = 'neutral';
  }

  static async saveDialogue() {
    const body = ActionEngineCyberia.getDialoguePayload();
    if (!body.code || !body.text) {
      NotificationManager.Push({ html: 'Dialogue code and text are required.', status: 'error' });
      return;
    }
    const isUpdate = !!ActionEngineCyberia.currentDialogueId;
    const result = isUpdate
      ? await CyberiaDialogueService.put({ id: ActionEngineCyberia.currentDialogueId, body })
      : await CyberiaDialogueService.post({ body });
    ActionEngineCyberia.notifyResult(result, isUpdate);
    if (result.status === 'success') {
      if (result.data?._id) ActionEngineCyberia.currentDialogueId = result.data._id;
      await ActionEngineCyberia.refreshDialogueList();
    }
  }

  static async deleteDialogue(id) {
    const targetId = id || ActionEngineCyberia.currentDialogueId;
    if (!targetId) return;
    const result = await CyberiaDialogueService.delete({ id: targetId });
    NotificationManager.Push({
      html: result.status === 'error' ? result.message : Translate.instance('item-success-delete'),
      status: result.status,
    });
    if (result.status === 'success') {
      if (targetId === ActionEngineCyberia.currentDialogueId) ActionEngineCyberia.resetDialogue();
      await ActionEngineCyberia.refreshDialogueList();
    }
  }

  // ── Skill list editor + persistence (own model: CyberiaSkill) ────────────
  static async renderSkillDefList() {
    const container = s('.action-engine-skill-def-list');
    if (!container) return;
    let out = '';
    for (let i = 0; i < ActionEngineCyberia.skillDefs.length; i++) {
      const sk = ActionEngineCyberia.skillDefs[i];
      out += html`<div
        class="fl"
        style="border-bottom:1px solid ${subtleBorder()};padding:3px 0;align-items:center;font-size:12px;font-family:monospace;"
      >
        <div class="in fll" style="flex:1;">
          <span style="color:${darkTheme ? '#8cf' : '#246'};">${sk.logicEventId}</span>${sk.name
            ? ` · ${sk.name}`
            : ''}${sk.summonedEntityItemId
            ? html`<span style="margin:0 4px;">&rarr;</span>${sk.summonedEntityItemId}`
            : ''}
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
    const logicEventId = s('.action-engine-skill-logic-event')?.value?.trim();
    const name = s('.action-engine-skill-name')?.value?.trim() || '';
    const description = s('.action-engine-skill-description')?.value || '';
    const summonedEntityItemId = ActionEngineCyberia.getSingleDropdownValue(
      ActionEngineCyberia.ids.skillSummonedItemPicker,
    );
    if (!logicEventId) {
      NotificationManager.Push({ html: 'Logic event id is required.', status: 'error' });
      return;
    }
    if (ActionEngineCyberia.skillDefs.some((sk) => sk.logicEventId === logicEventId)) {
      NotificationManager.Push({ html: `Logic event "${logicEventId}" already added.`, status: 'error' });
      return;
    }
    ActionEngineCyberia.skillDefs.push({ logicEventId, name, description, summonedEntityItemId });
    for (const cls of ['action-engine-skill-logic-event', 'action-engine-skill-name', 'action-engine-skill-description'])
      if (s(`.${cls}`)) s(`.${cls}`).value = '';
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.skillSummonedItemPicker, '');
    ActionEngineCyberia.renderSkillDefList();
  }

  static async renderSkillCards() {
    const container = s('.action-engine-skill-cards');
    if (!container) return;
    const filter = (s('.action-engine-skill-search')?.value || '').toLowerCase();
    const items = ActionEngineCyberia.skillListCache.filter(
      (d) =>
        !filter ||
        (d.triggerItemId || '').toLowerCase().includes(filter) ||
        (d.logicEventIds || []).some((l) => (l || '').toLowerCase().includes(filter)),
    );
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
          </div>
          <div class="in fll" style="display:flex;gap:4px;">${loadBtn}${delBtn}</div>
        </div>`,
      );
    }
    if (!out) out = '<div style="color:#888;font-size:12px;">No skills found.</div>';
    htmls('.action-engine-skill-cards', out);
    for (const doc of items) {
      if (s(`.btn-aes-load-${doc._id}`))
        s(`.btn-aes-load-${doc._id}`).onclick = async () => {
          const res = await CyberiaSkillService.get({ id: doc._id });
          if (res.status === 'success' && res.data) ActionEngineCyberia.loadSkill(res.data);
        };
      if (s(`.btn-aes-del-${doc._id}`))
        s(`.btn-aes-del-${doc._id}`).onclick = () => ActionEngineCyberia.deleteSkill(doc._id);
    }
  }

  static async refreshSkillList() {
    const res = await CyberiaSkillService.get({ limit: 500 });
    ActionEngineCyberia.skillListCache = res?.data?.data || [];
    await ActionEngineCyberia.renderSkillCards();
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
    // so the two can never drift (matches DefaultSkillConfig).
    const logicEventIds = [...new Set(skills.map((sk) => sk.logicEventId).filter(Boolean))];
    return { triggerItemId, logicEventIds, skills };
  }

  static loadSkill(doc) {
    ActionEngineCyberia.setMode('skill');
    ActionEngineCyberia.currentSkillId = doc._id || null;
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.skillTriggerItemPicker, doc.triggerItemId || '');
    ActionEngineCyberia.skillDefs = (doc.skills || []).map((sk) => ({
      logicEventId: sk.logicEventId,
      name: sk.name || '',
      description: sk.description || '',
      summonedEntityItemId: sk.summonedEntityItemId || '',
    }));
    ActionEngineCyberia.renderSkillDefList();
    NotificationManager.Push({ html: `Skill "${doc.triggerItemId}" loaded`, status: 'success' });
  }

  static resetSkill() {
    ActionEngineCyberia.currentSkillId = null;
    ActionEngineCyberia.skillDefs = [];
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.skillTriggerItemPicker, '');
    ActionEngineCyberia.setSingleDropdownValue(ActionEngineCyberia.ids.skillSummonedItemPicker, '');
    for (const cls of ['action-engine-skill-logic-event', 'action-engine-skill-name', 'action-engine-skill-description'])
      if (s(`.${cls}`)) s(`.${cls}`).value = '';
    ActionEngineCyberia.renderSkillDefList();
  }

  static async saveSkill() {
    const body = ActionEngineCyberia.getSkillPayload();
    if (!body.triggerItemId) {
      NotificationManager.Push({ html: 'Trigger item id is required.', status: 'error' });
      return;
    }
    if (body.skills.length === 0) {
      NotificationManager.Push({ html: 'Add at least one skill (logic event).', status: 'error' });
      return;
    }
    const isUpdate = !!ActionEngineCyberia.currentSkillId;
    const result = isUpdate
      ? await CyberiaSkillService.put({ id: ActionEngineCyberia.currentSkillId, body })
      : await CyberiaSkillService.post({ body });
    ActionEngineCyberia.notifyResult(result, isUpdate);
    if (result.status === 'success') {
      if (result.data?._id) ActionEngineCyberia.currentSkillId = result.data._id;
      await ActionEngineCyberia.refreshSkillList();
    }
  }

  static async deleteSkill(id) {
    const targetId = id || ActionEngineCyberia.currentSkillId;
    if (!targetId) return;
    const result = await CyberiaSkillService.delete({ id: targetId });
    NotificationManager.Push({
      html: result.status === 'error' ? result.message : Translate.instance('item-success-delete'),
      status: result.status,
    });
    if (result.status === 'success') {
      if (targetId === ActionEngineCyberia.currentSkillId) ActionEngineCyberia.resetSkill();
      await ActionEngineCyberia.refreshSkillList();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  static async render() {
    ActionEngineCyberia.mode = 'quest';
    ActionEngineCyberia.mapCode = '';
    ActionEngineCyberia.mapDoc = null;
    ActionEngineCyberia.imageCache = {};
    ActionEngineCyberia.assignments = { quests: [], actions: [] };
    ActionEngineCyberia.questListCache = [];
    ActionEngineCyberia.actionListCache = [];
    ActionEngineCyberia.dialogueListCache = [];
    ActionEngineCyberia.skillListCache = [];
    ActionEngineCyberia.currentQuestId = null;
    ActionEngineCyberia.currentActionId = null;
    ActionEngineCyberia.currentDialogueId = null;
    ActionEngineCyberia.currentSkillId = null;
    ActionEngineCyberia.questSteps = [];
    ActionEngineCyberia.questRewards = [];
    ActionEngineCyberia.actionQuestDialogues = [];
    ActionEngineCyberia.loadedActionPayloadExtras = {};
    ActionEngineCyberia.skillDefs = [];

    const ids = ActionEngineCyberia.ids;
    const objectiveTypeOptions = QUEST_STEPS_TYPES.map((t) => ({ value: t, display: t, data: t, onClick: () => {} }));

    // Responsive column groups: dynamicCol collapses these to full width on
    // narrow / mobile widths (observing .action-engine-container).
    const cont = 'action-engine-container';
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
      html`<div class="in" style="border:1px solid ${groupBorder()};border-radius:8px;padding:12px;margin-bottom:14px;">
        <div
          class="in"
          style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;opacity:.85;"
        >
          <i class="${icon}"></i> ${title}
        </div>
        ${inner}
      </div>`;

    // Buttons grow equally and wrap to their own line once they drop below the
    // flex-basis, which keeps them tappable on narrow / mobile widths.
    const crudButtons = async (prefix, includeClone) =>
      html`<div class="fl" style="margin-top:4px;flex-wrap:wrap;">
        <div class="in fll" style="flex:1 1 120px;padding:3px;">
          ${await BtnIcon.instance({
            class: `wfa btn-action-engine-${prefix}-save`,
            label: html`<i class="fa-solid fa-floppy-disk"></i> Save`,
          })}
        </div>
        ${includeClone
          ? html`<div class="in fll" style="flex:1 1 120px;padding:3px;">
              ${await BtnIcon.instance({
                class: `wfa btn-action-engine-${prefix}-clone`,
                label: html`<i class="fa-solid fa-clone"></i> Clone`,
              })}
            </div>`
          : ''}
        <div class="in fll" style="flex:1 1 120px;padding:3px;">
          ${await BtnIcon.instance({
            class: `wfa btn-action-engine-${prefix}-delete`,
            label: html`<i class="fa-solid fa-trash"></i> Delete`,
          })}
        </div>
        <div class="in fll" style="flex:1 1 120px;padding:3px;">
          ${await BtnIcon.instance({
            class: `wfa btn-action-engine-${prefix}-new`,
            label: html`<i class="fa-solid fa-file"></i> New`,
          })}
        </div>
      </div>`;

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
      ThemeEvents['action-engine-theme'] = () => {
        ActionEngineCyberia.renderMapCanvas();
        ActionEngineCyberia.renderAssignmentReview();
      };

      for (const m of ['quest', 'action', 'dialogue', 'skill'])
        if (s(`.action-engine-tab-${m}`)) s(`.action-engine-tab-${m}`).onclick = () => ActionEngineCyberia.setMode(m);
      ActionEngineCyberia.setMode('quest');

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

      // Quest wiring
      if (s('.btn-action-engine-add-step'))
        s('.btn-action-engine-add-step').onclick = () => ActionEngineCyberia.addStep();
      if (s('.btn-action-engine-add-objective'))
        s('.btn-action-engine-add-objective').onclick = () => ActionEngineCyberia.addObjective();
      if (s('.btn-action-engine-add-reward'))
        s('.btn-action-engine-add-reward').onclick = () => ActionEngineCyberia.addReward();
      if (s('.btn-action-engine-quest-save'))
        s('.btn-action-engine-quest-save').onclick = () => ActionEngineCyberia.saveQuest();
      if (s('.btn-action-engine-quest-clone'))
        s('.btn-action-engine-quest-clone').onclick = () => ActionEngineCyberia.cloneQuest();
      if (s('.btn-action-engine-quest-delete'))
        s('.btn-action-engine-quest-delete').onclick = () => ActionEngineCyberia.deleteQuest();
      if (s('.btn-action-engine-quest-new'))
        s('.btn-action-engine-quest-new').onclick = () => ActionEngineCyberia.resetQuest();
      if (s('.btn-action-engine-quest-refresh'))
        s('.btn-action-engine-quest-refresh').onclick = () => ActionEngineCyberia.refreshQuestList();
      if (s('.action-engine-quest-search'))
        s('.action-engine-quest-search').addEventListener('input', () => ActionEngineCyberia.renderQuestCards());

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
      if (s('.btn-action-engine-action-save'))
        s('.btn-action-engine-action-save').onclick = () => ActionEngineCyberia.saveAction();
      if (s('.btn-action-engine-action-clone'))
        s('.btn-action-engine-action-clone').onclick = () => ActionEngineCyberia.cloneAction();
      if (s('.btn-action-engine-action-delete'))
        s('.btn-action-engine-action-delete').onclick = () => ActionEngineCyberia.deleteAction();
      if (s('.btn-action-engine-action-new'))
        s('.btn-action-engine-action-new').onclick = () => ActionEngineCyberia.resetAction();
      if (s('.btn-action-engine-action-refresh'))
        s('.btn-action-engine-action-refresh').onclick = () => ActionEngineCyberia.refreshActionList();
      if (s('.action-engine-action-search'))
        s('.action-engine-action-search').addEventListener('input', () => ActionEngineCyberia.renderActionCards());

      // Dialogue wiring
      if (s('.btn-action-engine-dialogue-save'))
        s('.btn-action-engine-dialogue-save').onclick = () => ActionEngineCyberia.saveDialogue();
      if (s('.btn-action-engine-dialogue-delete'))
        s('.btn-action-engine-dialogue-delete').onclick = () => ActionEngineCyberia.deleteDialogue();
      if (s('.btn-action-engine-dialogue-new'))
        s('.btn-action-engine-dialogue-new').onclick = () => ActionEngineCyberia.resetDialogue();
      if (s('.btn-action-engine-dialogue-refresh'))
        s('.btn-action-engine-dialogue-refresh').onclick = () => ActionEngineCyberia.refreshDialogueList();
      if (s('.action-engine-dialogue-search'))
        s('.action-engine-dialogue-search').addEventListener('input', () => ActionEngineCyberia.renderDialogueCards());

      // Skill wiring
      if (s('.btn-action-engine-add-skill-def'))
        s('.btn-action-engine-add-skill-def').onclick = () => ActionEngineCyberia.addSkillDef();
      if (s('.btn-action-engine-skill-save'))
        s('.btn-action-engine-skill-save').onclick = () => ActionEngineCyberia.saveSkill();
      if (s('.btn-action-engine-skill-delete'))
        s('.btn-action-engine-skill-delete').onclick = () => ActionEngineCyberia.deleteSkill();
      if (s('.btn-action-engine-skill-new'))
        s('.btn-action-engine-skill-new').onclick = () => ActionEngineCyberia.resetSkill();
      if (s('.btn-action-engine-skill-refresh'))
        s('.btn-action-engine-skill-refresh').onclick = () => ActionEngineCyberia.refreshSkillList();
      if (s('.action-engine-skill-search'))
        s('.action-engine-skill-search').addEventListener('input', () => ActionEngineCyberia.renderSkillCards());

      ActionEngineCyberia.renderStepList();
      ActionEngineCyberia.renderRewardList();
      ActionEngineCyberia.renderQuestDialogueList();
      ActionEngineCyberia.renderSkillDefList();
      ActionEngineCyberia.renderAssignmentReview();
      await ActionEngineCyberia.refreshQuestList();
      await ActionEngineCyberia.refreshActionList();
      await ActionEngineCyberia.refreshDialogueList();
      await ActionEngineCyberia.refreshSkillList();
    });

    const tabBtn = (mode, label) =>
      html`<div
        class="in fll action-engine-tab-${mode}"
        style="cursor:pointer;padding:9px 16px;font-size:13px;border-bottom:3px solid transparent;text-align:center;"
      >
        ${label}
      </div>`;

    return html`<div class="in section-mp action-engine-container">
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
          <div
            class="in action-engine-map-meta"
            style="font-size:12px;color:#888;font-family:monospace;margin:6px 0 2px;"
          ></div>
          <div class="in action-engine-cell-coords" style="font-size:12px;font-family:monospace;margin-bottom:6px;">
            Cell: (—, —)
          </div>
          <div class="in" style="overflow:auto;max-width:100%;border:1px solid ${subtleBorder()};border-radius:4px;">
            <canvas class="action-engine-canvas" style="display:block;cursor:crosshair;"></canvas>
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
          <div class="in action-engine-assignment-review" style="max-height:140px;overflow-y:auto;"></div>`,
      )}

      <div class="fl" style="border-bottom:1px solid ${groupBorder()};margin-bottom:14px;">
        ${tabBtn('quest', html`<i class="fa-solid fa-scroll"></i> Quests`)}
        ${tabBtn('action', html`<i class="fa-solid fa-handshake"></i> Actions`)}
        ${tabBtn('dialogue', html`<i class="fa-solid fa-comments"></i> Dialogues`)}
        ${tabBtn('skill', html`<i class="fa-solid fa-wand-sparkles"></i> Skills`)}
      </div>

      <!-- Quest panel -->
      <div class="in action-engine-panel-quest">
        ${group(
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
            <div class="in input-label" style="font-size:12px;margin-bottom:6px;opacity:.8;">Add objective to step</div>
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
        ${group('Save Quest', 'fa-solid fa-floppy-disk', await crudButtons('quest', true))}
        ${group(
          'Existing Quests',
          'fa-solid fa-scroll',
          html`${await listToolbar('quest')}
            <div class="in action-engine-quest-cards" style="max-height:300px;overflow-y:auto;"></div>`,
        )}
      </div>

      <!-- Action panel -->
      <div class="in action-engine-panel-action hide">
        ${group(
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
        ${group('Save Action', 'fa-solid fa-floppy-disk', await crudButtons('action', true))}
        ${group(
          'Existing Actions',
          'fa-solid fa-handshake',
          html`${await listToolbar('action')}
            <div class="in action-engine-action-cards" style="max-height:300px;overflow-y:auto;"></div>`,
        )}
      </div>

      <!-- Dialogue panel -->
      <div class="in action-engine-panel-dialogue hide">
        ${group(
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
        ${group('Save Dialogue Line', 'fa-solid fa-floppy-disk', await crudButtons('dialogue', false))}
        ${group(
          'Existing Dialogue Lines',
          'fa-solid fa-comments',
          html`${await listToolbar('dialogue')}
            <div class="in action-engine-dialogue-cards" style="max-height:300px;overflow-y:auto;"></div>`,
        )}
      </div>

      <!-- Skill panel -->
      <div class="in action-engine-panel-skill hide">
        ${group(
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
          html`<div class="in input-label" style="font-size:12px;margin-bottom:6px;opacity:.8;">Add logic event</div>
            ${dynamicCol({ containerSelector: cont, id: dc.skillDef, type: 'a-50-b-50' })}
            <div class="fl">
              <div class="in fll ${dc.skillDef}-col-a" style="padding-right:4px;">
                ${await Input.instance({
                  id: 'action-engine-skill-logic-event',
                  label: html`Logic Event Id`,
                  containerClass: 'inl',
                  type: 'text',
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
            <div class="in" style="margin-top:6px;">
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
        ${group('Save Skill', 'fa-solid fa-floppy-disk', await crudButtons('skill', false))}
        ${group(
          'Existing Skills',
          'fa-solid fa-wand-sparkles',
          html`${await listToolbar('skill')}
            <div class="in action-engine-skill-cards" style="max-height:300px;overflow-y:auto;"></div>`,
        )}
      </div>
    </div>`;
  }
}

export { ActionEngineCyberia };
