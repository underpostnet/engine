/**
 * The player manager of the Cyberia Studio: the profiles of accounts, the live sessions that play
 * them, their stacks and the restriction of their accounts, for operators.
 *
 * A profile persists: the state of an account in one universe. A session is runtime: the lease one
 * game server holds to write the profile, with the save health that server reports at each
 * checkpoint. Moderators read both, lock accounts and lift locks; an admin also ends a session,
 * changes the stacks of an offline profile, and bans. A batch applies one operation to the checked
 * profiles after a preview. The server decides and records every request; the view shows what it
 * answers.
 *
 * @module src/client/components/cyberia/PlayerCyberiaManager.js
 */
import { commonAdminGuard } from '../core/CommonJs.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { ListPager } from '../core/ListPager.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getQueryParams, setQueryParams } from '../core/Router.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { CyberiaPlayerService } from '../../services/cyberia-player/cyberia-player.service.js';
import { CyberiaPlayerAuditService } from '../../services/cyberia-player-audit/cyberia-player-audit.service.js';
import { STUDIO_FORM_STYLE } from './StudioFormCyberia.js';

/** What an operator reads of the save health of a profile, by the durability its session reports. */
const HEALTH = Object.freeze({
  saved: { label: 'Healthy', tone: 'good', note: 'The engine holds every change of this session.' },
  saving: { label: 'Saving', tone: '', note: 'A change is on its way to the engine.' },
  degraded: {
    label: 'Degraded',
    tone: 'warn',
    note: 'Commits fail and retry. Trades wait; the server keeps every change while the session lives.',
  },
  recovery: {
    label: 'Recovery required',
    tone: 'bad',
    note: 'The server keeps this state and retries every 30 s; it saves once the cause below is repaired.',
  },
  offline: { label: 'Offline', tone: '', note: 'No session plays this profile.' },
  unknown: { label: 'Unknown', tone: '', note: 'The server of this session has not reported yet.' },
});

const STATUS_LABELS = Object.freeze({ online: 'Online', closing: 'Closing', offline: 'Offline' });

/** The cause of the failing commits, by the class the server reports. */
const FAILURES = Object.freeze({
  transport: 'Cause: the engine call fails; the server retries it at once.',
  integrity:
    'Cause: the database refuses the write as it stands. Sync the indexes with node bin/cyberia runtime-indexes --apply.',
  rejected: 'Cause: the engine rejects the call itself. Check the server key and the versions.',
});

/** Why the server refused a request, by its refusal. */
const REFUSALS = Object.freeze({
  changed: 'The profile changed since this view read it. Refresh, then check again.',
  no_session: 'No live session plays this profile now.',
  online: 'A live session plays this profile: end the session first.',
  unknown_item: 'No definition is bound to that item id.',
  coin: 'Coins stay in the wallet, never in a slot.',
  no_room: 'The container has no open slot.',
  locked_slot: 'That slot is locked at the level of the player.',
  slot_taken: 'Another stack holds that slot.',
  no_stack: 'No stack of that item is in that place.',
  stored: 'A stored item is never worn.',
  not_wearable: 'Items of that type are not worn.',
  too_many_layers: 'The player would wear more layers than a world allows.',
  skin_required: 'A player always wears a skin.',
  no_account: 'The account of this profile is gone.',
  self: 'An operator never restricts the account it signs in with.',
  protected: 'That account is protected from this operator.',
  not_restricted: 'The account has no restriction to lift.',
  forbidden: 'Only an admin lifts a ban.',
});

/** The operations of a batch: who may run each, and the fields it takes. */
const BATCH_OPERATIONS = Object.freeze([
  { id: 'add', label: 'Add a stack', admin: true, fields: ['container', 'itemId', 'quantity'] },
  { id: 'remove', label: 'Remove an item', admin: true, fields: ['container', 'itemId'] },
  { id: 'activate', label: 'Wear an item', admin: true, fields: ['itemId'] },
  { id: 'deactivate', label: 'Take off an item', admin: true, fields: ['itemId'] },
  { id: 'lock', label: 'Lock the account', admin: false, fields: ['until'] },
  { id: 'ban', label: 'Ban the account', admin: true, fields: ['until'] },
  { id: 'lift', label: 'Lift the restriction', admin: false, fields: [] },
]);

/** How a request or a batch result ended, as a chip. */
const OUTCOMES = Object.freeze({
  done: ['Done', 'good'],
  eligible: ['Applies', 'good'],
  refused: ['Refused', 'warn'],
  failed: ['Failed', 'bad'],
});

const healthOf = (row) => (!row.session?.live ? 'offline' : (row.session.health?.durability ?? 'unknown'));
const stamp = (date) => (date ? new Date(date).toLocaleString() : '—');
const age = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`);
const chip = (text, tone = '') =>
  html`<span class="studio-form-chip player-manager-${tone}">${escapeHtml(text)}</span>`;
const field = (label, value) =>
  html`<div class="studio-form-field"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value))}</b></div>`;

/** The changes a session has captured that the engine has not applied, in words. */
const unsavedOf = (health) =>
  health && health.seq > health.durableSeq
    ? `${health.seq - health.durableSeq} change(s) not saved, the oldest ${age(health.unsavedMs)} old`
    : 'every change saved';

/** The restriction of an account, in words. */
const restrictionLabel = ({ kind, until }) =>
  `${kind === 'ban' ? 'Banned' : 'Locked'} ${until ? `until ${stamp(until)}` : 'with no end'}`;

/** A stack or a restriction a request found or left, in words. */
const changedText = (entry) =>
  entry.kind
    ? restrictionLabel(entry)
    : `${entry.itemId} ×${entry.quantity} in slot ${entry.slot}${entry.active ? ', worn' : ''}`;

/** A time `days` from now, as a datetime-local field reads it. */
const localTime = (days) => {
  const date = new Date(Date.now() + days * 86400000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** The answer of a request, as a notification. */
const notifyAnswer = (result, doneText) => {
  const done = result.status === 'success' && result.data.outcome === 'done';
  NotificationManager.Push({
    html: escapeHtml(
      result.status !== 'success'
        ? result.message
        : done
          ? doneText
          : (REFUSALS[result.data.refusal] ?? result.data.refusal),
    ),
    status: done ? 'success' : 'warning',
  });
  return done;
};

class PlayerCyberiaManager {
  static async render({ appStore }) {
    const me = appStore?.Data?.user?.main?.model?.user ?? {};
    const isAdmin = commonAdminGuard(me.role || 'guest');
    const listId = 'player-manager-list';
    const auditId = 'player-manager-audit';
    const state = {
      filter: { q: '', universeCode: '', status: '' },
      id: null,
      detail: null,
      stacks: null,
      stackReason: '',
      load: 0,
      checked: new Map(),
      batch: null,
    };

    const renderProfile = (detail) => {
      const health = HEALTH[healthOf(detail)];
      const session = detail.session;
      const report = session?.health;
      const ended = session?.ended ? chip('Ended by an operator', 'bad') : '';
      htmls(
        '.player-manager-detail',
        html`<div class="studio-form-row" style="margin-bottom: 8px;">
            <h3 style="margin: 0; flex: 1 1 auto;">${escapeHtml(detail.username || detail.accountId)}</h3>
            ${chip(STATUS_LABELS[detail.status])} ${chip(health.label, health.tone)} ${ended}
            <button type="button" class="player-manager-refresh">
              <i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh
            </button>
          </div>
          <div class="studio-form-split">
            <div class="studio-form-card">
              <h4>Profile</h4>
              <div class="studio-form-hint">Persistent: what the account keeps in this universe.</div>
              <div class="studio-form-grid">
                ${field('Universe', detail.universeCode)} ${field('Profile', detail.id)}
                ${field('Account', detail.accountId)} ${field('Last played', stamp(detail.lastPlayedAt))}
                ${field('Epoch', detail.epoch)} ${field('Last commit', `seq ${detail.commitSeq}`)}
                ${field('Revision', detail.revision)}
                ${field('Shape', detail.schemaCurrent ? `v${detail.schemaVersion}, current` : `v${detail.schemaVersion}, old`)}
                ${field('Coins', detail.coins)} ${field('XP', detail.xp)}
                ${field('Bag / storage / held', `${detail.carried.bag} / ${detail.carried.storage} / ${detail.carried.held}`)}
              </div>
            </div>
            <div class="studio-form-card" role="status" aria-live="polite">
              <h4>Live session</h4>
              <div class="studio-form-hint">Runtime: the lease one game server holds to write the profile.</div>
              ${
                session
                  ? html`<div class="studio-form-grid">
                      ${field('World', session.instanceCode)} ${field('Map', session.mapCode || '—')}
                      ${field('Server', session.serverId)} ${field('Started', stamp(session.startedAt))}
                      ${field('Lease until', stamp(session.expiresAt))}
                      ${field('Reported', report ? stamp(report.at) : 'not yet')}
                      ${field('Saved', report ? unsavedOf(report) : '—')}
                      ${report?.closing ? field('Closing', 'the final state is on its way') : ''}
                    </div>`
                  : ''
              }
              <div class="studio-form-dirty" style="margin-top: 6px;">
                ${escapeHtml(health.note)} ${report?.failure ? escapeHtml(FAILURES[report.failure] ?? '') : ''}
              </div>
            </div>
          </div>
          <div class="studio-form-card">
            <h4>Worlds</h4>
            ${
              detail.worlds.length === 0
                ? html`<div>This profile has not played a world yet.</div>`
                : detail.worlds
                    .map(
                      (world) =>
                        html`<div class="studio-form-row">
                          <span class="studio-form-mono" style="flex: 1 1 8rem;"
                            >${escapeHtml(world.instanceCode)}</span
                          >
                          <span style="flex: 1 1 8rem;">${escapeHtml(world.mapCode || '—')}</span>
                          ${chip(`${world.vaults} vaults`)} ${chip(`${world.held} held`)}
                          ${chip(`${world.quests.active} active / ${world.quests.completed} completed quests`)}
                        </div>`,
                    )
                    .join('')
            }
          </div>
          <div class="studio-form-card">
            <h4>End the session</h4>
            <div class="studio-form-hint">
              Raises the epoch of the profile, so its server can write nothing more, and ends the session at its next
              checkpoint. What the session has not saved is discarded. Only an admin ends a session; each request is
              recorded with its reason.
            </div>
            <div class="studio-form-row" style="margin-top: 6px;">
              <input
                class="player-manager-reason"
                maxlength="200"
                placeholder="Why the session ends"
                aria-label="Reason"
                ${isAdmin && session?.live ? '' : 'disabled'}
              />
              <button type="button" class="player-manager-end" ${isAdmin && session?.live ? '' : 'disabled'}>
                <i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i> End session
              </button>
            </div>
          </div>
          <div class="studio-form-card player-manager-stacks" aria-live="polite">
            <h4>Inventory</h4>
            <div>Loading…</div>
          </div>
          <div class="studio-form-card player-manager-account"></div>
          <div class="studio-form-card">
            <h4>Operator log</h4>
            <div class="${auditId}-rows" style="display: grid; gap: 4px;"></div>
            ${state.auditPager}
          </div>`,
      );
      s('.player-manager-refresh').onclick = () => open(detail.id);
      s('.player-manager-end').onclick = () => endSession();
      renderAccount(detail);
    };

    const renderStacks = (data) => {
      const editable = isAdmin && !data.live;
      const stackRow = (container, stack) =>
        html`<div
          class="studio-form-row player-manager-stack"
          data-container="${container}"
          data-slot="${stack.slot}"
          data-item="${escapeHtml(stack.itemId)}"
        >
          <span class="studio-form-mono" style="flex: 0 0 3rem;">#${stack.slot}</span>
          <span style="flex: 1 1 8rem;">${escapeHtml(stack.itemId)}</span>
          ${chip(stack.itemType || 'no definition')} ${stack.active ? chip('Worn', 'good') : ''}
          ${stack.boundCid && stack.boundCid !== stack.olCid ? chip('Its item runs another definition now', 'warn') : ''}
          ${
            editable
              ? html`<input
                    type="number"
                    class="player-manager-quantity"
                    min="1"
                    value="${stack.quantity}"
                    aria-label="Quantity of ${escapeHtml(stack.itemId)} in slot ${stack.slot}"
                    style="flex: 0 0 6rem;"
                  />
                  <button type="button" data-op="quantity">Set</button>
                  ${
                    container === 'bag' && data.wearable.includes(stack.itemType)
                      ? html`<button type="button" data-op="${stack.active ? 'deactivate' : 'activate'}">
                          ${stack.active ? 'Take off' : 'Wear'}
                        </button>`
                      : ''
                  }
                  <button type="button" data-op="remove">Remove</button>`
              : html`<b>×${stack.quantity}</b>`
          }
        </div>`;
      const block = (container, label, { slots, max, stacks }) =>
        html`<h5 style="margin: 8px 0 4px;">${label} · ${stacks.length} stacks · ${slots} of ${max} slots open</h5>
          ${stacks.length === 0 ? html`<div class="studio-form-hint">Empty.</div>` : stacks.map((stack) => stackRow(container, stack)).join('')}`;
      htmls(
        '.player-manager-stacks',
        html`<h4>Inventory</h4>
          <div class="studio-form-hint">
            Level ${data.level} · ${data.coins} coins in the wallet · ${data.held} held stacks.
            ${
              data.live
                ? 'A live session plays this profile: end the session first to change its stacks.'
                : isAdmin
                  ? 'Each change follows the rules of the game and is recorded with its reason.'
                  : 'Only an admin changes the stacks.'
            }
          </div>
          ${block('bag', 'Bag', data.bag)} ${block('storage', 'Storage', data.storage)}
          ${
            editable
              ? html`<div class="studio-form-row" style="margin-top: 8px;">
                    <input
                      class="player-manager-stack-reason"
                      maxlength="200"
                      placeholder="Why the stacks change"
                      aria-label="Reason for the change"
                      value="${escapeHtml(state.stackReason)}"
                    />
                  </div>
                  <form class="studio-form-row player-manager-add" style="margin-top: 6px;">
                    <select name="container" aria-label="Container">
                      <option value="bag">Bag</option>
                      <option value="storage">Storage</option>
                    </select>
                    <input name="itemId" required maxlength="128" placeholder="Item id" aria-label="Item id" />
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      value="1"
                      required
                      aria-label="Quantity"
                      style="flex: 0 0 6rem;"
                    />
                    <input
                      name="slot"
                      type="number"
                      min="0"
                      placeholder="First open slot"
                      aria-label="Slot"
                      style="flex: 0 0 9rem;"
                    />
                    <button type="submit"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add stack</button>
                  </form>`
              : ''
          }`,
      );
      for (const button of document.querySelectorAll('.player-manager-stack button[data-op]'))
        button.onclick = () => {
          const row = button.closest('.player-manager-stack');
          const { op } = button.dataset;
          changeStack({
            op,
            container: row.dataset.container,
            itemId: row.dataset.item,
            slot: Number(row.dataset.slot),
            ...(op === 'quantity' && { quantity: Number(row.querySelector('.player-manager-quantity').value) }),
          });
        };
      const form = s('.player-manager-add');
      if (form)
        form.onsubmit = (event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(form));
          changeStack({
            op: 'add',
            container: values.container,
            itemId: values.itemId.trim(),
            quantity: Number(values.quantity),
            ...(values.slot !== '' && { slot: Number(values.slot) }),
          });
        };
    };

    const loadStacks = async (id) => {
      const result = await CyberiaPlayerService.getStacks({ id });
      if (id !== state.id) return;
      if (result.status !== 'success') {
        htmls(
          '.player-manager-stacks',
          html`<h4>Inventory</h4>
            <div>${escapeHtml(result.message)}</div>`,
        );
        return;
      }
      state.stacks = result.data;
      renderStacks(result.data);
    };

    const changeStack = async (change) => {
      const reason = s('.player-manager-stack-reason')?.value.trim() ?? '';
      state.stackReason = reason;
      if (reason.length < 3) {
        NotificationManager.Push({ html: 'Give the reason: at least 3 characters.', status: 'error' });
        return;
      }
      if (
        change.op === 'remove' &&
        !(await EditorCrud.confirm(
          'remove-stack',
          `Remove ${change.itemId} from slot ${change.slot} of the ${change.container}?`,
        ))
      )
        return;
      const result = await CyberiaPlayerService.changeStacks({
        id: state.id,
        body: { operationId: crypto.randomUUID(), reason, epoch: state.stacks.epoch, change },
      });
      notifyAnswer(result, 'The stacks changed. The next session of the player loads them.');
      await open(state.id);
    };

    const renderAccount = (detail) => {
      const { restriction } = detail;
      const self = detail.accountId === String(me._id ?? '');
      const guarded = self || detail.role === 'admin' || (detail.role === 'moderator' && !isAdmin);
      const liftable = restriction && (restriction.kind === 'lock' || isAdmin);
      htmls(
        '.player-manager-account',
        html`<h4>Account</h4>
          <div class="studio-form-row">
            ${restriction ? chip(restrictionLabel(restriction), 'bad') : chip('No restriction', 'good')}
            ${restriction ? html`<span class="studio-form-hint">${escapeHtml(restriction.reason)}</span>` : ''}
          </div>
          <div class="studio-form-hint">
            A lock or a ban signs the account out everywhere, ends its live session, and refuses every new session until
            it ends. A moderator locks for up to 90 days and lifts a lock; an admin also bans and lifts a ban.
            ${guarded ? 'This operator does not restrict this account.' : ''}
          </div>
          ${
            guarded
              ? ''
              : html`<div class="studio-form-row" style="margin-top: 6px;">
                    <input
                      class="player-manager-account-reason"
                      maxlength="200"
                      placeholder="Why"
                      aria-label="Reason"
                    />
                  </div>
                  <div class="studio-form-row" style="margin-top: 6px;">
                    <label
                      >Ends <input type="datetime-local" class="player-manager-account-until" value="${localTime(1)}"
                    /></label>
                    <button type="button" data-account="lock">
                      <i class="fa-solid fa-lock" aria-hidden="true"></i> Lock
                    </button>
                    ${
                      isAdmin
                        ? html`<button type="button" data-account="ban">
                            <i class="fa-solid fa-ban" aria-hidden="true"></i> Ban
                          </button>`
                        : ''
                    }
                    ${
                      liftable
                        ? html`<button type="button" data-account="lift">
                            <i class="fa-solid fa-lock-open" aria-hidden="true"></i> Lift
                          </button>`
                        : ''
                    }
                  </div>
                  ${isAdmin ? html`<div class="studio-form-hint">A ban with no end date has no end.</div>` : ''}`
          }`,
      );
      for (const button of document.querySelectorAll('.player-manager-account button[data-account]'))
        button.onclick = () => restrict(button.dataset.account);
    };

    const restrict = async (op) => {
      const { detail } = state;
      const reason = s('.player-manager-account-reason').value.trim();
      if (reason.length < 3) {
        NotificationManager.Push({ html: 'Give the reason: at least 3 characters.', status: 'error' });
        return;
      }
      const value = s('.player-manager-account-until').value;
      const until = op === 'lift' || !value ? null : new Date(value).toISOString();
      const name = detail.username || detail.accountId;
      const question =
        op === 'lift'
          ? `Lift the restriction of ${name}?`
          : `${op === 'ban' ? 'Ban' : 'Lock'} ${name} ${until ? `until ${stamp(until)}` : 'with no end'}? Every session of the account ends now.`;
      if (!(await EditorCrud.confirm('restrict-account', question))) return;
      const result = await CyberiaPlayerService.restrictAccount({
        id: detail.id,
        body: { operationId: crypto.randomUUID(), reason, op, until },
      });
      notifyAnswer(result, op === 'lift' ? 'The restriction is lifted.' : 'The account is restricted and signed out.');
      await open(detail.id);
      await ListPager.load(listId);
    };

    const renderBatch = () => {
      const count = state.checked.size;
      if (count === 0) {
        state.batch = null;
        return htmls('.player-manager-batch', '');
      }
      const operations = BATCH_OPERATIONS.filter((operation) => isAdmin || !operation.admin);
      const batch = (state.batch ??= { batchId: crypto.randomUUID().replaceAll('-', ''), op: operations[0].id });
      const operation = operations.find(({ id }) => id === batch.op);
      const fields = new Set(operation.fields);
      const results = batch.results
        ? html`<div style="display: grid; gap: 4px; margin-top: 6px;">
            ${batch.results
              .map(
                (result) =>
                  html`<div class="studio-form-row">
                    <span style="flex: 1 1 8rem;"
                      >${escapeHtml(result.username || state.checked.get(result.playerId)?.username || result.playerId)}</span
                    >
                    ${chip(...OUTCOMES[result.outcome])}
                    <span class="studio-form-hint" style="flex: 2 1 12rem;"
                      >${escapeHtml(
                        result.outcome === 'failed'
                          ? result.error
                          : result.refusal
                            ? (REFUSALS[result.refusal] ?? result.refusal)
                            : (result.after ?? []).map(changedText).join('; ') || 'No change to show',
                      )}</span
                    >
                  </div>`,
              )
              .join('')}
          </div>`
        : '';
      const eligible = batch.preview ? batch.results.filter(({ outcome }) => outcome === 'eligible').length : 0;
      const failed =
        !batch.preview && batch.results ? batch.results.filter(({ outcome }) => outcome === 'failed').length : 0;
      htmls(
        '.player-manager-batch',
        html`<div class="studio-form-card">
          <h4>Batch · ${count} ${count === 1 ? 'profile' : 'profiles'}</h4>
          <div class="studio-form-row">
            <select class="player-manager-batch-op" aria-label="Batch operation">
              ${operations
                .map(
                  ({ id, label }) => html`<option value="${id}" ${id === batch.op ? 'selected' : ''}>${label}</option>`,
                )
                .join('')}
            </select>
            <button type="button" class="player-manager-batch-clear">Clear selection</button>
          </div>
          <div class="studio-form-row" style="margin-top: 6px;">
            ${
              fields.has('container')
                ? html`<select class="player-manager-batch-container" aria-label="Container">
                    <option value="bag">Bag</option>
                    <option value="storage">Storage</option>
                  </select>`
                : ''
            }
            ${fields.has('itemId') ? html`<input class="player-manager-batch-item" maxlength="128" placeholder="Item id" aria-label="Item id" />` : ''}
            ${fields.has('quantity') ? html`<input class="player-manager-batch-quantity" type="number" min="1" value="1" aria-label="Quantity" style="flex: 0 0 6rem;" />` : ''}
            ${fields.has('until') ? html`<label>Ends <input type="datetime-local" class="player-manager-batch-until" value="${batch.op === 'lock' ? localTime(1) : ''}" /></label>` : ''}
          </div>
          <div class="studio-form-row" style="margin-top: 6px;">
            <input class="player-manager-batch-reason" maxlength="200" placeholder="Why" aria-label="Batch reason" />
            <button type="button" class="player-manager-batch-preview">Preview</button>
            ${batch.preview ? html`<button type="button" class="player-manager-batch-run" ${eligible ? '' : 'disabled'}>Apply to ${eligible}</button>` : ''}
            ${failed ? html`<button type="button" class="player-manager-batch-retry">Retry ${failed} failed</button>` : ''}
          </div>
          <div role="status" aria-live="polite">
            ${batch.results ? html`<div class="studio-form-hint">${batch.preview ? 'Preview: nothing is written yet.' : 'Applied: each profile is its own request.'}</div>` : ''}
            ${results}
          </div>
        </div>`,
      );
      if (batch.form) {
        for (const [selector, key] of [
          ['.player-manager-batch-container', 'container'],
          ['.player-manager-batch-item', 'itemId'],
          ['.player-manager-batch-quantity', 'quantity'],
          ['.player-manager-batch-until', 'until'],
          ['.player-manager-batch-reason', 'reason'],
        ])
          if (s(selector) && batch.form[key] !== undefined) s(selector).value = batch.form[key];
      }
      s('.player-manager-batch-op').onchange = (event) => {
        state.batch = { batchId: batch.batchId, op: event.target.value };
        renderBatch();
      };
      s('.player-manager-batch-clear').onclick = () => {
        state.checked.clear();
        for (const box of document.querySelectorAll('.player-manager-check')) box.checked = false;
        renderBatch();
      };
      s('.player-manager-batch-preview').onclick = () => runBatch({ preview: true });
      if (s('.player-manager-batch-run')) s('.player-manager-batch-run').onclick = () => runBatch({ preview: false });
      if (s('.player-manager-batch-retry'))
        s('.player-manager-batch-retry').onclick = () => runBatch({ preview: false, only: 'failed' });
    };

    const runBatch = async ({ preview, only }) => {
      const { batch } = state;
      const read = (selector) => s(selector)?.value ?? '';
      batch.form = {
        container: read('.player-manager-batch-container'),
        itemId: read('.player-manager-batch-item').trim(),
        quantity: read('.player-manager-batch-quantity'),
        until: read('.player-manager-batch-until'),
        reason: read('.player-manager-batch-reason').trim(),
      };
      if (batch.form.reason.length < 3) {
        NotificationManager.Push({ html: 'Give the reason: at least 3 characters.', status: 'error' });
        return;
      }
      const { op } = batch;
      const stacks = ['add', 'remove', 'activate', 'deactivate'].includes(op);
      const operation = stacks
        ? {
            type: 'stacks',
            change: {
              op,
              container: batch.form.container || 'bag',
              itemId: batch.form.itemId,
              ...(op === 'add' && { quantity: Number(batch.form.quantity) }),
            },
          }
        : {
            type: 'account',
            op,
            until: op === 'lift' || !batch.form.until ? null : new Date(batch.form.until).toISOString(),
          };
      const chosen = [...state.checked].map(([playerId, { epoch }]) => ({ playerId, epoch }));
      const targets = preview
        ? chosen
        : chosen.filter(({ playerId }) =>
            batch.results.some((result) => result.playerId === playerId && result.outcome === (only ?? 'eligible')),
          );
      if (!preview && !only) {
        const question = `Apply "${BATCH_OPERATIONS.find(({ id }) => id === op).label}" to ${targets.length} ${targets.length === 1 ? 'profile' : 'profiles'}?`;
        if (!(await EditorCrud.confirm('run-batch', question))) return;
      }
      const result = await CyberiaPlayerService.batch({
        body: { batchId: batch.batchId, targets, operation, reason: batch.form.reason, preview },
      });
      if (result.status !== 'success') {
        NotificationManager.Push({ html: escapeHtml(result.message), status: 'error' });
        return;
      }
      batch.preview = preview;
      batch.results = only
        ? batch.results.map(
            (earlier) => result.data.results.find(({ playerId }) => playerId === earlier.playerId) ?? earlier,
          )
        : result.data.results;
      renderBatch();
      if (!preview) {
        await ListPager.load(listId);
        if (state.id) await open(state.id);
      }
    };

    const open = async (id) => {
      const request = ++state.load;
      const { status, data, message } = await CyberiaPlayerService.get({ id });
      if (request !== state.load) return;
      if (status !== 'success') {
        NotificationManager.Push({ html: escapeHtml(message), status: 'error' });
        return;
      }
      if (id !== state.id) state.stackReason = '';
      state.id = id;
      state.detail = data;
      setQueryParams({ playerId: id }, { replace: true });
      renderProfile(data);
      await Promise.all([loadStacks(id), ListPager.load(auditId, 1)]);
    };

    const endSession = async () => {
      const { detail } = state;
      const reason = s('.player-manager-reason').value.trim();
      if (reason.length < 3) {
        NotificationManager.Push({ html: 'Give the reason: at least 3 characters.', status: 'error' });
        return;
      }
      const question =
        `End the session of ${detail.username || detail.accountId} in ${detail.session.instanceCode}? ` +
        `Its server reports ${unsavedOf(detail.session.health)}; what is not saved is discarded.`;
      if (!(await EditorCrud.confirm('end-session', question))) return;
      const result = await CyberiaPlayerService.endSession({
        id: detail.id,
        body: { operationId: crypto.randomUUID(), reason, epoch: detail.epoch },
      });
      const done = result.status === 'success' && result.data.outcome === 'done';
      NotificationManager.Push({
        html:
          result.status !== 'success'
            ? escapeHtml(result.message)
            : done
              ? 'Session ended. Its server ends it at the next checkpoint.'
              : REFUSALS[result.data.refusal],
        status: done ? 'success' : 'warning',
      });
      await open(detail.id);
      await ListPager.load(listId);
    };

    state.auditPager = await ListPager.instance({
      id: auditId,
      limit: 20,
      unit: 'records',
      fetch: async ({ after }) => {
        if (!state.id) return { data: [], next: '' };
        const result = await CyberiaPlayerAuditService.get({ player: state.id, after });
        return result?.status === 'success' ? result.data : null;
      },
      render: (records) =>
        htmls(
          `.${auditId}-rows`,
          records.length === 0
            ? html`<div>No operator acted on this profile.</div>`
            : records
                .map(
                  (record) =>
                    html`<div class="studio-form-row">
                      <span style="flex: 0 0 11rem;">${escapeHtml(stamp(record.createdAt))}</span>
                      ${chip(record.action)}
                      ${chip(record.outcome === 'done' ? 'done' : `refused: ${record.refusal}`, record.outcome === 'done' ? 'good' : 'warn')}
                      ${record.batchId ? chip(`batch ${record.batchId.slice(0, 8)}`) : ''}
                      <span style="flex: 1 1 10rem;">${escapeHtml(record.actor)}: ${escapeHtml(record.reason)}</span>
                      <span class="studio-form-hint"
                        >${escapeHtml(
                          [
                            ...(record.before?.length ? [`was ${record.before.map(changedText).join('; ')}`] : []),
                            ...(record.after?.length ? [`now ${record.after.map(changedText).join('; ')}`] : []),
                          ].join(' · '),
                        )}
                        epoch ${record.epochBefore} → ${record.epochAfter}</span
                      >
                    </div>`,
                )
                .join(''),
        ),
    });

    const listHtml = await ListPager.instance({
      id: listId,
      limit: 25,
      unit: 'profiles',
      fetch: async ({ limit, after }) => {
        const result = await CyberiaPlayerService.get({ ...state.filter, limit, after });
        return result?.status === 'success' ? result.data : null;
      },
      render: (rows) => {
        for (const row of rows)
          if (state.checked.has(row.id))
            state.checked.set(row.id, { epoch: row.epoch, username: row.username || row.accountId });
        htmls(
          `.${listId}-rows`,
          rows.length === 0
            ? html`<div class="studio-form-card">No profile matches.</div>`
            : rows
                .map((row) => {
                  const health = HEALTH[healthOf(row)];
                  return html`<div class="player-manager-line">
                    <input
                      type="checkbox"
                      class="player-manager-check"
                      data-id="${row.id}"
                      data-epoch="${row.epoch}"
                      data-name="${escapeHtml(row.username || row.accountId)}"
                      aria-label="Check ${escapeHtml(row.username || row.accountId)} for a batch"
                      ${state.checked.has(row.id) ? 'checked' : ''}
                    />
                    <button
                      type="button"
                      class="studio-form-card player-manager-row ${row.id === state.id ? 'player-manager-current' : ''}"
                      data-id="${row.id}"
                    >
                      <span class="player-manager-name">${escapeHtml(row.username || row.accountId)}</span>
                      <span class="studio-form-mono">${escapeHtml(row.universeCode)}</span>
                      ${chip(STATUS_LABELS[row.status])} ${chip(health.label, health.tone)}
                      <span class="studio-form-hint"
                        >${escapeHtml(row.session?.instanceCode ?? '')} ${escapeHtml(stamp(row.lastPlayedAt))}</span
                      >
                    </button>
                  </div>`;
                })
                .join(''),
        );
        for (const button of document.querySelectorAll('.player-manager-row'))
          button.onclick = () => open(button.dataset.id);
        for (const box of document.querySelectorAll('.player-manager-check'))
          box.onchange = () => {
            if (box.checked)
              state.checked.set(box.dataset.id, { epoch: Number(box.dataset.epoch), username: box.dataset.name });
            else state.checked.delete(box.dataset.id);
            if (state.batch) Object.assign(state.batch, { results: null, preview: false });
            renderBatch();
          };
      },
    });

    setTimeout(async () => {
      const root = s('.player-manager-container');
      if (!root) return;
      const search = s('.player-manager-search');
      search.addEventListener('input', () => (state.filter.q = search.value.trim()));
      ListPager.search(listId, search);
      for (const [selector, key] of [
        ['.player-manager-status', 'status'],
        ['.player-manager-universe', 'universeCode'],
      ])
        s(selector).onchange = (event) => {
          state.filter[key] = event.target.value.trim();
          ListPager.load(listId, 1);
        };
      await ListPager.load(listId, 1);
      const id = getQueryParams().playerId;
      if (id) await open(id);
    });

    return html`<style>
        ${STUDIO_FORM_STYLE} .player-manager-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          width: 100%;
          margin: 0;
          text-align: left;
        }
        .player-manager-line {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .player-manager-row:focus-visible {
          outline: 2px solid var(--studio-accent, #48f);
        }
        .player-manager-current {
          border-color: var(--studio-accent, #48f);
        }
        .player-manager-name {
          flex: 1 1 8rem;
          font-weight: bold;
        }
        .studio-form-chip.player-manager-good {
          background: #2a7a4a;
          color: #fff;
        }
        .studio-form-chip.player-manager-warn {
          background: #b07818;
          color: #000;
        }
        .studio-form-chip.player-manager-bad {
          background: #a8322a;
          color: #fff;
        }
      </style>
      <div class="in section-mp studio-editor studio-form player-manager-container">
        <div class="studio-form-split">
          <div style="flex: 1 1 320px; max-width: 520px;">
            <div class="studio-form-card">
              <div class="studio-form-row">
                <input class="player-manager-search" placeholder="Account name or id" aria-label="Search accounts" />
              </div>
              <div class="studio-form-row" style="margin-top: 6px;">
                <select class="player-manager-status" aria-label="Session status">
                  <option value="">Every status</option>
                  <option value="online">Online</option>
                  <option value="closing">Closing</option>
                </select>
                <input class="player-manager-universe" placeholder="Universe code" aria-label="Universe" />
              </div>
            </div>
            <div class="player-manager-batch"></div>
            <div class="${listId}-rows" style="display: grid; gap: 6px;"></div>
            ${listHtml}
          </div>
          <div class="player-manager-detail" style="flex: 2 1 420px;">
            <div class="studio-form-card">Choose a profile to see it and its session.</div>
          </div>
        </div>
      </div>`;
  }
}

export { PlayerCyberiaManager };
