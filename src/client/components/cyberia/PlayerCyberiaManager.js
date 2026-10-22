/**
 * The player manager of the Cyberia Studio: the profiles of accounts and the live sessions that play
 * them, for operators.
 *
 * A profile persists: the state of an account in one universe. A session is runtime: the lease one
 * game server holds to write the profile, with the save health that server reports at each
 * checkpoint. Moderators read both; an admin ends a session, which discards what it has not saved
 * and is recorded with its reason. The view reads one page of profiles and the detail of one, never
 * their goods.
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

const REFUSALS = Object.freeze({
  changed: 'The profile changed since this view read it. Refresh, then check again.',
  no_session: 'No live session plays this profile now.',
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

class PlayerCyberiaManager {
  static async render({ appStore }) {
    const canEnd = commonAdminGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest');
    const listId = 'player-manager-list';
    const auditId = 'player-manager-audit';
    const state = { filter: { q: '', universeCode: '', status: '' }, id: null, detail: null, load: 0 };

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
                ${canEnd && session?.live ? '' : 'disabled'}
              />
              <button type="button" class="player-manager-end" ${canEnd && session?.live ? '' : 'disabled'}>
                <i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i> End session
              </button>
            </div>
          </div>
          <div class="studio-form-card">
            <h4>Operator log</h4>
            <div class="${auditId}-rows" style="display: grid; gap: 4px;"></div>
            ${state.auditPager}
          </div>`,
      );
      s('.player-manager-refresh').onclick = () => open(detail.id);
      s('.player-manager-end').onclick = () => endSession();
    };

    const open = async (id) => {
      const request = ++state.load;
      const { status, data, message } = await CyberiaPlayerService.get({ id });
      if (request !== state.load) return;
      if (status !== 'success') {
        NotificationManager.Push({ html: escapeHtml(message), status: 'error' });
        return;
      }
      state.id = id;
      state.detail = data;
      setQueryParams({ playerId: id }, { replace: true });
      renderProfile(data);
      await ListPager.load(auditId, 1);
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
                      <span style="flex: 1 1 10rem;">${escapeHtml(record.actor)}: ${escapeHtml(record.reason)}</span>
                      <span class="studio-form-hint">epoch ${record.epochBefore} → ${record.epochAfter}</span>
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
        htmls(
          `.${listId}-rows`,
          rows.length === 0
            ? html`<div class="studio-form-card">No profile matches.</div>`
            : rows
                .map((row) => {
                  const health = HEALTH[healthOf(row)];
                  return html`<button
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
                  </button>`;
                })
                .join(''),
        );
        for (const button of document.querySelectorAll('.player-manager-row'))
          button.onclick = () => open(button.dataset.id);
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
