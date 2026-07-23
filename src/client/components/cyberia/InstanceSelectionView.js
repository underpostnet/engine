// InstanceSelectionView.js — Cyberia's World / Instance selection screen.
//
// A modern AAA-MMORPG world-select experience (WoW realm status, FFXIV world
// congestion, New World population bars, Lost Ark status pills) adapted to
// Cyberia's instance-based architecture and pixel-art RPG identity:
//   - a fully responsive grid of Instance Cards (thumbnail, name, live status,
//     population, tags, prominent PLAY button);
//   - search + status-filter chips so it scales to any number of instances;
//   - a play CTA that disables with a clear reason when a world is not joinable.
//
// The view is pure presentation and completely separated from the data layer.
// It consumes an injected `fetchInstances` provider that returns a list of
// normalized, playable instances (see NormalizedInstance below); a default
// provider adapting `CyberiaInstanceService` is supplied for convenience.
//
// NormalizedInstance:
//   { id, code, name, description, thumbnailUrl, status, players, capacity,
//     tags[], playUrl, playable }
// `status` ∈ STATUS_ORDER. `playable` is derived from status but may be
// overridden by the provider.

import { ThemeEvents, darkTheme } from '../core/Css.js';
import { Translate } from '../core/Translate.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { htmls, s, htmlStrSanitize } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';
import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';

// Client deployment that actually hosts the playable worlds. Matches the portal
// landing CTA (MainBodyCyberiaPortal); override per-instance via `onPlay`.
const DEFAULT_CLIENT_BASE_URL = 'https://client.cyberiaonline.com';

// Authoritative simulation host and the default instance's code, mirroring the
// mmo-server multiInstance block in conf.instances.json. The default variant is
// served at the root path; other variants at `/<CODE>`.
const DEFAULT_SERVER_BASE_URL = 'https://server.cyberiaonline.com';
const DEFAULT_INSTANCE_CODE = 'amethyst-strata-expansion';

const placeholderThumbnail = () => `${getProxyPath()}assets/ui-icons/world-default-forest-city.png`;

// Live status vocabulary. `playable` gates the PLAY button; `tone` selects the
// pill colour (resolved to a CSS var so it stays theme-aware); `cta` is the
// button label when the world is NOT joinable.
const STATUS_META = {
  online: { label: 'Online', tone: 'ok', playable: true },
  busy: { label: 'Busy', tone: 'warn', playable: true },
  full: { label: 'Full', tone: 'err', playable: false, cta: 'Full' },
  maintenance: { label: 'Maintenance', tone: 'info', playable: false, cta: 'Down' },
  offline: { label: 'Offline', tone: 'muted', playable: false, cta: 'Offline' },
  'coming-soon': { label: 'Coming Soon', tone: 'accent', playable: false, cta: 'Soon' },
};
const STATUS_ORDER = ['online', 'busy', 'full', 'maintenance', 'coming-soon', 'offline'];
const statusMeta = (status) => STATUS_META[status] || STATUS_META.offline;

// ── Data layer (default provider) ────────────────────────────────────────────

const thumbnailUrlOf = (thumbnail) => {
  if (!thumbnail) return placeholderThumbnail();
  const fileId = typeof thumbnail === 'object' ? thumbnail._id : thumbnail;
  return fileId ? getApiBaseUrl({ id: fileId, endpoint: 'file/blob' }) : placeholderThumbnail();
};

// Map a raw instance document to a live status. A running-server enrichment can
// set `runtimeStatus` or `players`/`capacity`; absent those we fall back to the
// content lifecycle (`status`) so drafts read as maintenance and the rest as
// online. This is the single seam where live telemetry would plug in.
const resolveStatus = (doc) => {
  if (STATUS_META[doc.runtimeStatus]) return doc.runtimeStatus;
  const players = Number(doc.players ?? doc.onlinePlayers);
  const capacity = Number(doc.capacity ?? doc.maxPlayers);
  if (Number.isFinite(players) && Number.isFinite(capacity) && capacity > 0) {
    const ratio = players / capacity;
    if (ratio >= 1) return 'full';
    if (ratio >= 0.75) return 'busy';
    return 'online';
  }
  if (doc.status === 'draft') return 'maintenance';
  if (doc.status === 'archived') return 'offline';
  return 'online';
};

const normalizeInstance = (doc, { clientBaseUrl }) => {
  const code = doc.code || '';
  const status = resolveStatus(doc);
  const players = Number(doc.players ?? doc.onlinePlayers);
  const capacity = Number(doc.capacity ?? doc.maxPlayers);
  return {
    id: doc._id || code,
    code,
    name: doc.name || code || 'Unknown Instance',
    description: doc.description || 'A dynamic pixel-art sandbox world awaiting explorers.',
    thumbnailUrl: thumbnailUrlOf(doc.thumbnail),
    status,
    players: Number.isFinite(players) ? players : null,
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
    tags: Array.isArray(doc.tags) ? doc.tags.filter(Boolean) : [],
    playUrl: `${clientBaseUrl}${code ? `/${encodeURIComponent(code)}` : ''}`,
    playable: statusMeta(status).playable,
  };
};

// ── Live status via the cyberia-server metrics API ───────────────────────────
// Each variant is served at server.cyberiaonline.com/<path> — '/' for the
// default instance, '/<CODE>' for the rest (the multiInstance variants in
// conf.instances.json). The proxy strips the prefix, so each world's own
// /api/v1/metrics reports its health + capacity. Cross-origin, so the metrics
// CORS allow-list (CYBERIA_CORS_ALLOWED_ORIGINS) must include this portal.

const metricsUrlFor = (code, { serverBaseUrl, defaultInstanceCode }) => {
  const path = code && code !== defaultInstanceCode ? `/${encodeURIComponent(code)}` : '';
  return `${serverBaseUrl}${path}/api/v1/metrics`;
};

// Map a metrics snapshot onto the card status vocabulary. Both sides are closed
// sets (metrics.go HealthStatus / WorkloadLevel); a null snapshot means the
// world was unreachable → offline.
const statusFromMetrics = (m) => {
  if (!m) return 'offline';
  const players = Number(m.entities?.total_entities);
  const capacity = Number(m.workload?.max_entity_capacity);
  const load = m.workload?.current_load;
  if (m.health === 'maintenance') return 'maintenance';
  if (load === 'critical' || (capacity > 0 && players >= capacity)) return 'full';
  if (m.health === 'critical' || m.health === 'degraded' || load === 'high') return 'busy';
  return 'online';
};

const fetchInstanceMetrics = async (url, timeoutMs = 3500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    return res.ok ? await res.json() : null;
  } catch (_) {
    return null; // unreachable / CORS-blocked / timed-out → treated as offline
  } finally {
    clearTimeout(timer);
  }
};

// Best-effort live overlay: replaces each instance's status + population from its
// metrics endpoint (parallel; unreachable reads as offline). Mutates in place.
const enrichWithLiveStatus = async (instances, opts) => {
  await Promise.all(
    instances.map(async (inst) => {
      const m = await fetchInstanceMetrics(metricsUrlFor(inst.code, opts));
      inst.status = statusFromMetrics(m);
      if (m) {
        const players = Number(m.entities?.total_entities);
        const capacity = Number(m.workload?.max_entity_capacity);
        if (Number.isFinite(players)) inst.players = players;
        if (Number.isFinite(capacity) && capacity > 0) inst.capacity = capacity;
      }
      inst.playable = statusMeta(inst.status).playable;
    }),
  );
  return instances;
};

// Default provider: the only place the view touches the instance service. Loads
// the instance catalogue, then (when `liveStatus`) overlays real Online/Busy/
// Full/Maintenance/Offline from each world's metrics API. Swap the whole thing
// via `render({ fetchInstances })` to source instances from anywhere.
const defaultInstanceProvider = async ({
  clientBaseUrl = DEFAULT_CLIENT_BASE_URL,
  serverBaseUrl = DEFAULT_SERVER_BASE_URL,
  defaultInstanceCode = DEFAULT_INSTANCE_CODE,
  liveStatus = true,
} = {}) => {
  const res = await CyberiaInstanceService.get({ sort: 'createdAt', order: 'asc', limit: 60, fallback: true });
  if (!res || res.status !== 'success') throw new Error(res?.message || 'Could not load instances');
  const raw = res.data;
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  const instances = list
    .filter((doc) => doc && doc.status !== 'archived')
    .map((doc) => normalizeInstance(doc, { clientBaseUrl }));
  if (liveStatus && instances.length > 0) await enrichWithLiveStatus(instances, { serverBaseUrl, defaultInstanceCode });
  return instances;
};

// ── Presentation ─────────────────────────────────────────────────────────────

const escapeHtml = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const populationLabel = (instance) => {
  if (instance.capacity == null || instance.players == null) return '';
  const pct = Math.min(100, Math.round((instance.players / instance.capacity) * 100));
  return html`
    <div class="isv-pop" title="${instance.players} / ${instance.capacity} players">
      <div class="isv-pop-bar">
        <span class="isv-pop-fill isv-tone-${statusMeta(instance.status).tone}" style="width:${pct}%"></span>
      </div>
      <span class="isv-pop-text">${instance.players}/${instance.capacity}</span>
    </div>
  `;
};

const instanceCard = (instance) => {
  const meta = statusMeta(instance.status);
  const tagsHtml = instance.tags
    .slice(0, 3)
    .map((t) => html`<span class="isv-tag">${escapeHtml(t)}</span>`)
    .join('');
  // Trusted markup, inserted raw (not escaped): the playable branch is a
  // Translate live-translation <span>; the other is a fixed STATUS_META label.
  // Escaping here would render the <span> as literal text.
  const playLabel = meta.playable ? Translate.instance('play') : meta.cta || meta.label;
  return html`
    <article class="isv-card" data-instance-id="${escapeHtml(instance.id)}" data-status="${instance.status}">
      <div class="isv-card-thumb">
        <img
          class="isv-thumb-img"
          src="${escapeHtml(instance.thumbnailUrl)}"
          alt="${escapeHtml(instance.name)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='${placeholderThumbnail()}';"
        />
        <span class="isv-status isv-tone-${meta.tone}"> <span class="isv-status-dot"></span>${meta.label} </span>
        ${instance.code ? html`<span class="isv-code">${escapeHtml(instance.code)}</span>` : ''}
      </div>
      <div class="isv-card-body">
        <h3 class="isv-card-name" title="${escapeHtml(instance.name)}">${escapeHtml(instance.name)}</h3>
        <p class="isv-card-desc">${escapeHtml(instance.description)}</p>
        ${populationLabel(instance)} ${tagsHtml ? html`<div class="isv-tags">${tagsHtml}</div>` : ''}
      </div>
      <div class="isv-card-foot">
        <button
          class="isv-play isv-tone-${meta.tone} ${meta.playable ? '' : 'isv-play-disabled'}"
          data-instance-id="${escapeHtml(instance.id)}"
          ${meta.playable ? '' : 'disabled'}
          type="button"
        >
          ${meta.playable ? html`<i class="fa-solid fa-play"></i> ` : ''}${playLabel}
        </button>
      </div>
    </article>
  `;
};

const skeletonGrid = (n = 6) =>
  Array.from({ length: n })
    .map(
      () =>
        html`<div class="isv-card isv-skeleton">
          <div class="isv-card-thumb"></div>
          <div class="isv-card-body">
            <div class="isv-sk-line isv-sk-line-lg"></div>
            <div class="isv-sk-line"></div>
            <div class="isv-sk-line isv-sk-line-sm"></div>
          </div>
          <div class="isv-card-foot"><div class="isv-sk-btn"></div></div>
        </div>`,
    )
    .join('');

const emptyState = (message) => html`
  <div class="isv-empty">
    <img class="isv-empty-img" src="${getProxyPath()}assets/ui-icons/polyhedron.png" alt="" />
    <div class="isv-empty-title">${escapeHtml(message || 'No worlds available')}</div>
    <div class="isv-empty-sub">New instances appear here as they come online.</div>
  </div>
`;

const errorState = (message) => html`
  <div class="isv-empty isv-error">
    <img class="isv-empty-img" src="${getProxyPath()}assets/ui-icons/skull.png" alt="" />
    <div class="isv-empty-title">Could not reach the world registry</div>
    <div class="isv-empty-sub">${escapeHtml(message || 'Please try again.')}</div>
    <button class="isv-retry" type="button"><i class="fa-solid fa-rotate"></i> ${Translate.instance('retry')}</button>
  </div>
`;

class InstanceSelectionView {
  static async render(options = {}) {
    const {
      fetchInstances = (o) => defaultInstanceProvider(o),
      onPlay,
      clientBaseUrl = DEFAULT_CLIENT_BASE_URL,
      serverBaseUrl = DEFAULT_SERVER_BASE_URL,
      defaultInstanceCode = DEFAULT_INSTANCE_CODE,
      liveStatus = true,
    } = options;

    const id = 'instance-selection';
    // Per-render UI state (closure-scoped; the view owns no persistent data).
    const state = { all: [], query: '', filter: 'all' };

    const gridSel = `.isv-grid`;
    const countSel = `.isv-count`;
    const filtersSel = `.isv-filters`;

    const visibleInstances = () => {
      const q = state.query.trim().toLowerCase();
      return state.all.filter((it) => {
        if (state.filter !== 'all' && it.status !== state.filter) return false;
        if (!q) return true;
        return (
          it.name.toLowerCase().includes(q) ||
          it.code.toLowerCase().includes(q) ||
          it.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
    };

    const launch = (instance) => {
      if (!instance) return;
      if (!instance.playable) {
        NotificationManager.Push({
          html: `${instance.name} is ${statusMeta(instance.status).label}.`,
          status: 'warning',
        });
        return;
      }
      if (instance.playUrl.split('/').pop() === DEFAULT_INSTANCE_CODE)
        instance.playUrl = instance.playUrl.replace(DEFAULT_INSTANCE_CODE, '');

      if (typeof onPlay === 'function') return onPlay(instance);
      if (instance.playUrl) location.href = instance.playUrl;
    };

    const renderGrid = () => {
      if (!s(gridSel)) return;
      const list = visibleInstances();
      if (list.length === 0) {
        htmls(gridSel, state.all.length === 0 ? emptyState() : emptyState('No worlds match your filters'));
      } else {
        htmls(gridSel, list.map(instanceCard).join(''));
      }
      const online = state.all.filter((it) => statusMeta(it.status).playable).length;
      if (s(countSel))
        htmls(countSel, `${state.all.length} ${state.all.length === 1 ? 'world' : 'worlds'} · ${online} joinable`);
    };

    const renderFilters = () => {
      if (!s(filtersSel)) return;
      const present = STATUS_ORDER.filter((st) => state.all.some((it) => it.status === st));
      const chip = (key, label) =>
        html`<button
          class="isv-chip ${state.filter === key ? 'isv-chip-active' : ''}"
          data-filter="${key}"
          type="button"
        >
          ${escapeHtml(label)}
        </button>`;
      htmls(filtersSel, [chip('all', 'All'), ...present.map((st) => chip(st, statusMeta(st).label))].join(''));
    };

    const load = async () => {
      if (s(gridSel)) htmls(gridSel, skeletonGrid());
      try {
        state.all = await fetchInstances({ clientBaseUrl, serverBaseUrl, defaultInstanceCode, liveStatus });
        renderFilters();
        renderGrid();
      } catch (err) {
        if (s(gridSel)) htmls(gridSel, errorState(err?.message));
      }
    };

    ThemeEvents[id] = () => {
      if (!s(`.style-${id}`)) return;
      const accent = darkTheme ? '#bb8fce' : '#e6b800';
      const accent2 = darkTheme ? '#9b59b6' : '#ffcc00';
      htmls(
        `.style-${id}`,
        html`<style>
          .instance-selection {
            --isv-bg: ${darkTheme ? '#161616' : '#f1f3f5'};
            --isv-panel: ${darkTheme ? '#202024' : '#ffffff'};
            --isv-panel-2: ${darkTheme ? '#2a2a30' : '#eef0f3'};
            --isv-text: ${darkTheme ? '#e8e8ea' : '#23262b'};
            --isv-dim: ${darkTheme ? '#9a9aa5' : '#6b7280'};
            --isv-muted: ${darkTheme ? '#6a6a76' : '#9aa0aa'};
            --isv-border: ${darkTheme ? '#33333c' : '#d6dae0'};
            --isv-accent: ${accent};
            --isv-accent-2: ${accent2};
            --isv-ok: ${darkTheme ? '#43d17a' : '#1f9d55'};
            --isv-warn: ${darkTheme ? '#f0b429' : '#c77700'};
            --isv-err: ${darkTheme ? '#ff5b5b' : '#d63031'};
            --isv-info: ${darkTheme ? '#c084fc' : '#7c3aed'};
            --isv-grid-line: ${darkTheme ? 'rgba(155, 89, 182, 0.14)' : 'rgba(255, 204, 0, 0.22)'};
            --isv-shadow: ${darkTheme ? '0 10px 26px rgba(0,0,0,0.55)' : '0 10px 26px rgba(0,0,0,0.12)'};
            position: relative;
            color: var(--isv-text);
            font-family: 'Roboto', 'Helvetica', sans-serif;
            padding: 22px 20px 40px;
            min-height: 100%;
          }
          .instance-selection::before {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
            background-image:
              linear-gradient(var(--isv-grid-line) 2px, transparent 2px),
              linear-gradient(90deg, var(--isv-grid-line) 2px, transparent 2px);
            background-size: 34px 34px;
            -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.5), transparent 60%);
            mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.5), transparent 60%);
            z-index: 0;
          }
          .instance-selection > * {
            position: relative;
            z-index: 1;
          }

          .isv-head {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
            margin-bottom: 18px;
          }
          .isv-title {
            margin: 0;
            font-size: 2rem;
            font-weight: 800;
            letter-spacing: 3px;
            text-transform: uppercase;
            color: ${darkTheme ? '#fff' : '#ffdd54'};
            text-shadow:
              3px 3px 0 var(--isv-accent),
              6px 6px 0 ${darkTheme ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)'};
          }
          .isv-subtitle {
            margin: 6px 0 0;
            color: var(--isv-dim);
            font-size: 0.95rem;
            letter-spacing: 0.4px;
          }
          .isv-count {
            font-size: 0.85rem;
            color: var(--isv-dim);
            letter-spacing: 1px;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .isv-toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 20px;
          }
          .isv-search {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1 1 240px;
            min-width: 180px;
            background: var(--isv-panel);
            border: 2px solid var(--isv-border);
            padding: 8px 12px;
          }
          .isv-search i {
            color: var(--isv-muted);
          }
          .isv-search input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: var(--isv-text);
            font-family: inherit;
            font-size: 0.95rem;
            height: auto;
            line-height: 1.4;
          }
          .isv-filters {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .isv-chip,
          .isv-refresh {
            background: var(--isv-panel);
            border: 2px solid var(--isv-border);
            color: var(--isv-dim);
            padding: 7px 14px;
            font-family: inherit;
            font-size: 0.82rem;
            letter-spacing: 1px;
            text-transform: uppercase;
            cursor: pointer;
            transition:
              border-color 0.15s,
              color 0.15s,
              background 0.15s;
          }
          .isv-chip:hover,
          .isv-refresh:hover {
            border-color: var(--isv-accent);
            color: var(--isv-text);
          }
          .isv-chip-active {
            background: var(--isv-accent);
            border-color: var(--isv-accent);
            color: #1a1a1a;
            font-weight: 700;
          }

          .isv-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 18px;
          }
          @media (max-width: 560px) {
            .isv-grid {
              grid-template-columns: 1fr;
            }
            .isv-title {
              font-size: 1.5rem;
            }
          }

          .isv-card {
            display: flex;
            flex-direction: column;
            background: var(--isv-panel);
            border: 2px solid var(--isv-border);
            box-shadow: var(--isv-shadow);
            transition:
              transform 0.18s ease,
              border-color 0.18s ease,
              box-shadow 0.18s ease;
            overflow: hidden;
          }
          .isv-card:not(.isv-skeleton):hover {
            transform: translateY(-6px);
            border-color: var(--isv-accent);
            box-shadow: 0 16px 34px ${darkTheme ? 'rgba(155,89,182,0.35)' : 'rgba(230,182,0,0.35)'};
          }
          .isv-card-thumb {
            position: relative;
            aspect-ratio: 16 / 10;
            background: var(--isv-panel-2)
              linear-gradient(135deg, ${darkTheme ? 'rgba(155,89,182,0.18)' : 'rgba(255,204,0,0.18)'}, transparent);
            overflow: hidden;
          }
          .isv-thumb-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            image-rendering: pixelated;
            transition: transform 0.3s ease;
          }
          .isv-card:hover .isv-thumb-img {
            transform: scale(1.06);
          }
          .isv-card-thumb::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(
              180deg,
              transparent 55%,
              ${darkTheme ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.45)'}
            );
          }
          .isv-status {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 2;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 9px;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: #fff;
            background: rgba(0, 0, 0, 0.62);
            border: 2px solid currentColor;
          }
          .isv-status-dot {
            width: 8px;
            height: 8px;
            background: currentColor;
            box-shadow: 0 0 7px currentColor;
          }
          .isv-tone-ok:not(.isv-play):not(.isv-pop-fill) .isv-status-dot,
          .isv-status.isv-tone-ok .isv-status-dot {
            animation: isvPulse 1.5s steps(2, end) infinite;
          }
          @keyframes isvPulse {
            0%,
            55% {
              opacity: 1;
            }
            60%,
            100% {
              opacity: 0.3;
            }
          }
          .isv-code {
            position: absolute;
            left: 10px;
            bottom: 8px;
            z-index: 2;
            font-size: 0.72rem;
            letter-spacing: 1px;
            color: #fff;
            opacity: 0.82;
            text-transform: uppercase;
          }

          .isv-card-body {
            padding: 12px 14px 6px;
            flex: 1;
          }
          .isv-card-name {
            margin: 0 0 6px;
            font-size: 1.15rem;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: var(--isv-text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .isv-card-desc {
            margin: 0 0 10px;
            color: var(--isv-dim);
            font-size: 0.86rem;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .isv-pop {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
          }
          .isv-pop-bar {
            flex: 1;
            height: 8px;
            background: var(--isv-panel-2);
            border: 1px solid var(--isv-border);
            overflow: hidden;
          }
          .isv-pop-fill {
            display: block;
            height: 100%;
          }
          .isv-pop-text {
            font-size: 0.76rem;
            color: var(--isv-dim);
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
          }
          .isv-tags {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }
          .isv-tag {
            font-size: 0.72rem;
            letter-spacing: 0.5px;
            color: var(--isv-dim);
            background: var(--isv-panel-2);
            border: 1px solid var(--isv-border);
            padding: 2px 7px;
            text-transform: uppercase;
          }

          .isv-card-foot {
            padding: 10px 14px 14px;
          }
          .isv-play {
            width: 100%;
            padding: 11px 14px;
            border: none;
            background: linear-gradient(45deg, var(--isv-accent-2), var(--isv-accent));
            color: #1a1a1a;
            font-family: inherit;
            font-size: 0.95rem;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            cursor: pointer;
            transition:
              transform 0.12s ease,
              box-shadow 0.12s ease,
              filter 0.12s ease;
            box-shadow: 0 4px 0 ${darkTheme ? '#5b2c6f' : '#b38f00'};
          }
          .isv-play:hover {
            filter: brightness(1.08);
            transform: translateY(-2px);
            box-shadow: 0 6px 0 ${darkTheme ? '#5b2c6f' : '#b38f00'};
          }
          .isv-play:active {
            transform: translateY(2px);
            box-shadow: 0 2px 0 ${darkTheme ? '#5b2c6f' : '#b38f00'};
          }
          .isv-play-disabled,
          .isv-play-disabled:hover {
            background: var(--isv-panel-2);
            color: var(--isv-muted);
            box-shadow: 0 4px 0 var(--isv-border);
            cursor: not-allowed;
            filter: none;
            transform: none;
          }

          .isv-tone-ok {
            color: var(--isv-ok);
          }
          .isv-tone-warn {
            color: var(--isv-warn);
          }
          .isv-tone-err {
            color: var(--isv-err);
          }
          .isv-tone-info {
            color: var(--isv-info);
          }
          .isv-tone-accent {
            color: var(--isv-accent);
          }
          .isv-tone-muted {
            color: var(--isv-muted);
          }
          .isv-pop-fill.isv-tone-ok {
            background: var(--isv-ok);
          }
          .isv-pop-fill.isv-tone-warn {
            background: var(--isv-warn);
          }
          .isv-pop-fill.isv-tone-err {
            background: var(--isv-err);
          }

          .isv-empty {
            grid-column: 1 / -1;
            text-align: center;
            padding: 60px 20px;
            color: var(--isv-dim);
          }
          .isv-empty-img {
            width: 64px;
            height: 64px;
            image-rendering: pixelated;
            opacity: 0.8;
            margin-bottom: 14px;
          }
          .isv-empty-title {
            font-size: 1.15rem;
            font-weight: 700;
            color: var(--isv-text);
            margin-bottom: 6px;
          }
          .isv-empty-sub {
            font-size: 0.9rem;
          }
          .isv-retry {
            margin-top: 16px;
            background: var(--isv-accent);
            border: none;
            color: #1a1a1a;
            font-family: inherit;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            padding: 9px 18px;
            cursor: pointer;
          }

          .isv-skeleton {
            pointer-events: none;
          }
          .isv-skeleton .isv-card-thumb {
            aspect-ratio: 16 / 10;
          }
          .isv-sk-line,
          .isv-sk-btn,
          .isv-skeleton .isv-card-thumb {
            background: linear-gradient(90deg, var(--isv-panel-2) 25%, var(--isv-border) 37%, var(--isv-panel-2) 63%);
            background-size: 400% 100%;
            animation: isvShimmer 1.3s ease infinite;
          }
          .isv-sk-line {
            height: 12px;
            margin: 10px 14px;
          }
          .isv-sk-line-lg {
            height: 18px;
            width: 65%;
          }
          .isv-sk-line-sm {
            width: 40%;
          }
          .isv-sk-btn {
            height: 40px;
            margin: 10px 14px 14px;
          }
          @keyframes isvShimmer {
            0% {
              background-position: 100% 0;
            }
            100% {
              background-position: 0 0;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .isv-card,
            .isv-thumb-img,
            .isv-play,
            .isv-status-dot,
            .isv-sk-line,
            .isv-sk-btn,
            .isv-skeleton .isv-card-thumb {
              animation: none !important;
              transition: none !important;
            }
          }
        </style>`,
      );
    };

    setTimeout(() => {
      ThemeEvents[id]();

      const container = s(`.${id}`);
      if (container) {
        // Delegated events survive grid re-renders (filter/search/refresh/retry).
        container.addEventListener('click', (event) => {
          const playBtn = event.target.closest?.('.isv-play:not(.isv-play-disabled)');
          if (playBtn) {
            launch(state.all.find((it) => it.id === playBtn.dataset.instanceId));
            return;
          }
          const chip = event.target.closest?.('.isv-chip');
          if (chip) {
            state.filter = chip.dataset.filter;
            renderFilters();
            renderGrid();
            return;
          }
          if (event.target.closest?.('.isv-refresh') || event.target.closest?.('.isv-retry')) load();
        });
      }

      const input = s(`.isv-search input`);
      if (input)
        input.addEventListener('input', (event) => {
          state.query = event.target.value || '';
          renderGrid();
        });

      load();
    });

    return html`
      <div class="style-${id}"></div>
      <div class="${id}">
        <div class="isv-head">
          <div>
            <h1 class="isv-title">${Translate.instance('instance-selection')}</h1>
            <p class="isv-subtitle">Choose an instance to enter the Cyberia universe.</p>
          </div>
          <span class="isv-count"></span>
        </div>
        <div class="isv-toolbar">
          <label class="isv-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              placeholder="${htmlStrSanitize(Translate.instance('search'))} worlds…"
              autocomplete="off"
            />
          </label>
          <div class="isv-filters"></div>
          <button class="isv-refresh" type="button">
            <i class="fa-solid fa-rotate"></i> ${Translate.instance('reload')}
          </button>
        </div>
        <div class="isv-grid">${skeletonGrid()}</div>
      </div>
    `;
  }
}

export {
  InstanceSelectionView,
  defaultInstanceProvider,
  normalizeInstance,
  resolveStatus,
  statusFromMetrics,
  STATUS_META,
  STATUS_ORDER,
};
