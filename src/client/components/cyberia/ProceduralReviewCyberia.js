/**
 * Candidate review in the Procedural Engine view: the grid columns of a candidate, the decisions on
 * it, its detail panel and the notifications of what changed on the server. The item generation and
 * the map population review their candidates through this module; every decision is the server's.
 *
 * @module src/client/components/cyberia/ProceduralReviewCyberia.js
 */
import { NotificationManager } from '../core/NotificationManager.js';
import { ObjectLayerEngineModal } from '../objectlayer-studio/ObjectLayerEngineModal.js';
import { swatches } from './ProceduralPaletteCyberia.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { CyberiaProceduralJobService } from '../../services/cyberia-procedural-job/cyberia-procedural-job.service.js';

export const ACCESS_MESSAGE = 'Moderator access required to manage procedural generation.';
export const ITEM_STATUS = Object.freeze([
  'queued',
  'running',
  'generated',
  'review',
  'editing',
  'approved',
  'promoted',
  'rejected',
  'failed',
  'cancelled',
]);
/** The statuses in which a job still has work for the server or a decision for a moderator. */
export const ACTIVE = Object.freeze(['queued', 'running', 'generated', 'review', 'editing']);
/** The decisions each candidate status offers. */
export const ACTIONS = Object.freeze({
  review: ['edit', 'regenerate', 'approve', 'reject'],
  editing: ['edit', 'regenerate', 'approve', 'reject'],
  approved: ['edit', 'promote', 'reject'],
  rejected: ['regenerate'],
  failed: ['regenerate'],
});
export const ACTION_ICONS = Object.freeze({
  edit: 'fa-solid fa-pen-to-square',
  regenerate: 'fa-solid fa-dice',
  approve: 'fa-solid fa-check',
  reject: 'fa-solid fa-xmark',
  promote: 'fa-solid fa-cloud-arrow-up',
  open: 'fa-solid fa-folder-open',
  cancel: 'fa-solid fa-ban',
  delete: 'fa-solid fa-trash',
});
/** What each action does, and why it is off when it is. */
export const ACTION_HINTS = Object.freeze({
  edit: ['Open the candidate in the Object Layer Studio.'],
  regenerate: ['Make a new candidate from a new seed.'],
  approve: ['Approve this revision.', 'Only a valid revision can be approved.'],
  reject: ['Reject this revision.'],
  promote: ['Make this revision the active definition of its item.'],
  open: ['Show the candidates of this run.'],
  cancel: ['Stop the run. Nothing is deleted.', 'The run has no active work.'],
  delete: ['Delete the run and everything it left. A run that still works stops first.'],
});
export const REVISION_KINDS = Object.freeze({
  generated: 'generated',
  regenerated: 'regenerated',
  edited: 'human-retouched',
});
/** The state a moderator reads from a candidate status: a draft never reads as the live asset. */
const STATES = Object.freeze({
  queued: ['Generating', 'pending'],
  running: ['Generating', 'pending'],
  generated: ['Validating', 'pending'],
  approved: ['Approved', 'good'],
  promoted: ['Promoted · live', 'live'],
  rejected: ['Rejected', 'muted'],
  failed: ['Failed', 'bad'],
  cancelled: ['Cancelled', 'muted'],
});

export const element = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
export const shortCid = (cid) => (cid ? `${cid.slice(0, 9)}…${cid.slice(-5)}` : '—');
export const stamp = (date) => (date ? new Date(date).toLocaleString() : '—');

/** Frame counts by direction code, as a line: `08 ×3, 18 ×2`. */
export const frameSummary = (counts) =>
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => `${code} ×${count}`)
    .join(', ') || 'none';
export const notify = (text, status = 'error') => NotificationManager.Push({ html: text, status });
export const denied = () => notify(`Permission denied. ${ACCESS_MESSAGE}`);
/** Tells why a request failed: a conflict, a refusal for lack of the moderator role, or the server message. */
export const refusal = (response) => {
  if (response.code === 409) return notify(`Conflict detected. ${response.message}`, 'warning');
  if (response.code === 401 || response.code === 403) return denied();
  return notify(response.message);
};

/**
 * The grid answer of a moderator read as `{ data, total }`, or null when the read failed, after the
 * user is told. Another role reads nothing and sees an empty grid.
 * @param {boolean} canMutate - Whether the user is a moderator.
 * @param {() => Promise<Object>} read
 * @returns {Promise<{data:Object[],total:number}|null>}
 */
export async function readPage(canMutate, read) {
  if (!canMutate) return { data: [], total: 0 };
  const response = await read();
  if (response.status !== 'success') {
    refusal(response);
    return null;
  }
  return response.data;
}

/**
 * The state label and tone of a candidate: a draft as generated or as edited by a human, an
 * approved candidate, or the promoted runtime version.
 * @param {Object} item - A candidate.
 * @returns {[string,string]} Label, tone.
 */
export const candidateState = (item) =>
  STATES[item.status] ??
  (item.revisions.at(-1)?.kind === 'edited' ? ['Edited draft', 'draft'] : ['Generated draft', 'draft']);

/**
 * What a candidate starts from: the current render of its item, a Genesis Template that replaces
 * that render, or a Genesis Template for a new item.
 * @param {Object|null} job - The job of the candidate.
 * @param {Object} item
 * @returns {string}
 */
export const originOf = (job, item) => {
  if (!job) return '';
  if (job.spec.mode === 'create-new') return 'Template · new item';
  return job.spec.sources.find(({ itemId }) => itemId === item.targetItemId)?.origin === 'render'
    ? 'Current render'
    : 'Template · replaces render';
};

/** Notifies what changed on the server between two reads of the selected job and its candidates. */
export function changesBetween(before, job, items) {
  const notes = [];
  if (before && before.jobId === job._id) {
    if (before.status === 'queued' && job.status === 'running') notes.push(['Job started.', 'info']);
    if (before.status !== 'completed' && job.status === 'completed') notes.push(['Job completed.', 'success']);
    if (before.status !== 'cancelled' && job.status === 'cancelled') notes.push(['Job cancelled.', 'warning']);
    for (const item of items) {
      const was = before.items[item._id];
      if (!was) continue;
      const revision = item.revision ?? -1;
      const changed = was.status !== item.status;
      if (revision > was.revision && ['review', 'editing', 'approved'].includes(was.status))
        notes.push([`${item.targetItemId}: revision ${revision} saved.`, 'success']);
      else if (changed && item.status === 'failed' && item.validation.problems.length > 0)
        notes.push([`${item.targetItemId}: validation failed. ${item.validation.problems.join('; ')}`, 'error']);
      else if (changed && item.status === 'failed')
        notes.push([`${item.targetItemId}: generation failed. ${item.error?.message ?? ''}`, 'error']);
      else if (changed && item.status === 'review' && was.status !== 'editing') {
        if (item.metrics?.rejectedTries > 0)
          notes.push([
            `${item.targetItemId}: ${item.metrics.rejectedTries} tries failed the diversity check.`,
            'warning',
          ]);
        notes.push(
          was.revision >= 0
            ? [`${item.targetItemId}: regenerated as revision ${revision}.`, 'success']
            : [`${item.targetItemId} is ready for review.`, 'info'],
        );
      }
    }
  }
  return notes;
}

/**
 * Keeps what the last read of a job showed and tells what changed since.
 * @param {Object|null} seen - What the read before showed.
 * @param {Object} job
 * @param {Object[]} items - The candidates the read showed.
 * @returns {Object} What this read showed.
 */
export function observe(seen, job, items) {
  for (const [text, status] of changesBetween(seen, job, items)) notify(text, status);
  return {
    jobId: job._id,
    status: job.status,
    items: {
      ...(seen?.jobId === job._id ? seen.items : {}),
      ...Object.fromEntries(
        items.map(({ _id, status: state, revision }) => [_id, { status: state, revision: revision ?? -1 }]),
      ),
    },
  };
}

/** A grid column over a server field: the field is also its id, so a filter and a sort name that field. */
export const column = (field, headerName, extra = {}) => ({ field, colId: field, headerName, minWidth: 90, ...extra });

/**
 * The action buttons of a grid row: `build` answers the `[action, enabled]` pairs of the row, `act`
 * runs one. The row grows to show every button.
 */
export function actionsColumn(build, act) {
  return {
    headerName: 'Actions',
    minWidth: 300,
    sortable: false,
    filter: false,
    autoHeight: true,
    cellRenderer: ({ data }) => {
      const cell = element('div', 'procedural-cell-actions');
      for (const [action, enabled] of build(data)) {
        const control = element('button', '', ` ${action}`);
        control.type = 'button';
        control.prepend(element('i', ACTION_ICONS[action]));
        control.disabled = !enabled;
        const [hint, off = hint] = ACTION_HINTS[action];
        control.title = enabled ? hint : off;
        control.setAttribute('aria-label', `${action} ${data.targetItemId ?? data.generationRunId ?? ''}`.trim());
        control.onclick = (event) => {
          event.stopPropagation();
          act(data, action);
        };
        cell.append(control);
      }
      return cell;
    },
  };
}

/**
 * What colored a candidate: the palette its run holds for it, or the foundation palettes
 * of the item of an update, and the slots set for the run or for that item.
 * @param {Object|null} job - The job of the candidate.
 * @param {Object} item
 * @returns {{label: string, colors: string[]}}
 */
export function paletteOf(job, item) {
  const { spec } = job ?? {};
  if (!spec) return { label: '—', colors: [] };
  const update = spec.mode === 'update-existing';
  const set = update
    ? spec.palette.items.find(({ itemId }) => itemId === item.targetItemId)?.slots
    : spec.palette.slots;
  const slots = Object.values(set ?? {});
  const overrides = slots.length > 0 ? ' and slots set' : '';
  const palette = spec.palettes.find(({ id }) => id === item.paletteId);
  if (palette) return { label: `${palette.name}${overrides}`, colors: [...Object.values(palette.roles), ...slots] };
  const palettes = spec.sources.find(({ itemId }) => itemId === item.targetItemId)?.artDirection?.palettes ?? [];
  return {
    label: `${palettes.map(({ name }) => name).join(', ') || 'default colors'}${overrides}`,
    colors: [...palettes.flatMap(({ roles }) => roles.base ?? []), ...slots],
  };
}

const preview = (cid, className) => {
  const image = element('img', className);
  image.alt = '';
  if (cid) image.src = AtlasSpriteSheetService.idlePreviewUrl(cid);
  return image;
};

/**
 * The columns of a candidate grid.
 * @param {Object} params
 * @param {(item:Object) => Object|null} params.jobOf - The job of a candidate.
 * @param {(item:Object, action:string) => void} params.act
 * @param {(item:Object) => string[]} [params.actions] - The decisions a candidate offers.
 * @returns {Object[]}
 */
export function candidateColumns({ jobOf, act, actions = (item) => ACTIONS[item.status] ?? [] }) {
  const text = { sortable: true, filter: 'agTextColumnFilter' };
  return [
    {
      headerName: 'Draft preview',
      field: 'candidateCid',
      colId: 'preview',
      minWidth: 90,
      maxWidth: 110,
      autoHeight: true,
      cellRenderer: ({ value: cid }) => preview(cid, 'procedural-preview'),
    },
    column('targetItemId', 'Item ID', { ...text, minWidth: 140 }),
    column('status', 'State', {
      ...text,
      minWidth: 140,
      cellRenderer: ({ data }) => {
        const [label, tone] = candidateState(data);
        return element('span', `procedural-state procedural-state-${tone}`, label);
      },
    }),
    { headerName: 'Starts from', minWidth: 170, valueGetter: ({ data }) => originOf(jobOf(data), data) },
    column('sourceCid', 'Current CID', { ...text, minWidth: 140, valueFormatter: ({ value: cid }) => shortCid(cid) }),
    column('candidateCid', 'Candidate CID', {
      ...text,
      minWidth: 140,
      valueFormatter: ({ value: cid }) => shortCid(cid),
    }),
    column('revision', 'Revision', {
      sortable: true,
      filter: 'agNumberColumnFilter',
      minWidth: 130,
      valueFormatter: ({ data }) =>
        data.revision === null ? '—' : `${data.revision} · ${REVISION_KINDS[data.revisions.at(-1).kind]}`,
    }),
    column('templateId', 'Template', { ...text, minWidth: 130 }),
    column('paletteId', 'Palette', {
      ...text,
      minWidth: 130,
      valueFormatter: ({ data }) => paletteOf(jobOf(data), data).label,
    }),
    column('diversity.score', 'Diversity', {
      sortable: true,
      filter: 'agNumberColumnFilter',
      valueFormatter: ({ value: score }) => (score === null || score === undefined ? '—' : score.toFixed(3)),
    }),
    {
      headerName: 'Validation',
      minWidth: 180,
      autoHeight: true,
      cellRenderer: ({ data }) => {
        const checked = Boolean(data.validation.checkedAt);
        return element(
          'span',
          `procedural-cell-text ${!checked ? 'procedural-muted' : data.validation.ok ? 'procedural-good' : 'procedural-bad'}`,
          checked
            ? data.validation.ok
              ? 'valid'
              : data.validation.problems.join('; ')
            : data.error?.message || 'pending',
        );
      },
    },
    column('createdAt', 'Created', {
      sortable: true,
      minWidth: 150,
      valueFormatter: ({ value: date }) => stamp(date),
    }),
    actionsColumn(
      (item) => actions(item).map((action) => [action, !(action === 'approve' && !item.validation.ok)]),
      act,
    ),
  ];
}

/**
 * The larger view of a candidate: the live render of its item beside the draft, what it replaces or
 * proposes, its palette and its template.
 * @param {HTMLElement} panel
 * @param {Object} job - The job of the candidate.
 * @param {Object} item
 */
export function showCandidate(panel, job, item) {
  const update = job.spec.mode === 'update-existing';
  const palette = paletteOf(job, item);
  const [state] = candidateState(item);
  const lines = update
    ? [
        `Item: ${item.targetItemId}`,
        `State: ${state}`,
        `Starts from: ${originOf(job, item)}`,
        `Current: ${shortCid(item.sourceCid)}`,
        `Candidate: ${shortCid(item.candidateCid)}`,
        `Genesis Template: ${item.templateId}`,
      ]
    : [
        `Proposed item ID: ${item.targetItemId}`,
        `State: ${state}`,
        `Candidate CID: ${shortCid(item.candidateCid)}`,
        `Genesis Template: ${item.templateId}`,
        `Variation: ${job.spec.variation.level}`,
      ];
  const figure = (cid, caption) => {
    const view = element('figure', 'procedural-candidate-view');
    view.append(
      cid ? preview(cid, 'procedural-preview-large') : element('div', 'procedural-muted', 'No artwork'),
      element('figcaption', '', caption),
    );
    return view;
  };
  const source = job.spec.sources.find(({ itemId }) => itemId === item.targetItemId);
  const details = element('div', 'procedural-candidate-facts');
  for (const line of lines) details.append(element('div', '', line));
  const palettes = element('div');
  palettes.innerHTML = `Palette: ${palette.label} ${swatches(palette.colors)}`;
  details.append(palettes);
  panel.replaceChildren(
    ...(update && item.status !== 'promoted'
      ? [figure(source?.hasRender ? item.sourceCid : '', source?.hasRender ? 'Runs now' : 'Runs now: no render')]
      : []),
    figure(item.candidateCid, item.status === 'promoted' ? 'Published: runs now' : `${state} · not published`),
    details,
  );
}

/**
 * A decision on a candidate. Edit opens the Object Layer Studio on its current revision.
 * @param {Object} item
 * @param {string} action - `edit`, `regenerate`, `approve`, `reject` or `promote`.
 * @param {Object|null} job - The job of the candidate.
 * @returns {Promise<boolean>} Whether the decision changed the candidate.
 */
export async function decide(item, action, job) {
  const target = item.targetItemId;
  const response =
    action === 'promote'
      ? await CyberiaProceduralJobService.promote({ jobId: item.jobId, itemId: item._id })
      : await CyberiaProceduralJobService.decide({
          jobId: item.jobId,
          itemId: item._id,
          action,
          body: action === 'approve' ? { cid: item.candidateCid } : {},
        });
  if (response.status !== 'success') {
    refusal(response);
    return false;
  }
  if (action === 'edit') {
    const { candidateCid, jobItemId } = response.data;
    if (!ObjectLayerEngineModal.open({ cid: candidateCid, review: jobItemId }))
      notify('This host has no Object Layer Studio.', 'warning');
    else notify(`${target} opened for edit in the Object Layer Studio.`, 'info');
    return false;
  }
  const update = job?.spec.mode === 'update-existing';
  notify(
    {
      approve: `${target}: approval succeeded for revision ${item.revision}.`,
      reject: `${target} rejected.`,
      regenerate: `${target} queued for regeneration.`,
      promote: update
        ? `${target}: promotion succeeded. It runs on ${shortCid(item.candidateCid)}.`
        : `New item ${target} created.`,
    }[action],
    action === 'reject' ? 'warning' : 'success',
  );
  return true;
}
