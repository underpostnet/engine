// CyberiaServerMetrics.js — SSR dashboard for the cyberia-server
// metrics API.
//
// The runtime contract is:
//   - Polls GET /api/v1/metrics every POLL_INTERVAL_MS.
//   - Derives per-second rates locally by diffing successive snapshots
//     (the server only publishes monotonic counters).
//   - Renders to a static HTML/CSS shell — no SPA framework, no build
//     step. Every value is text in a single-page console.
//
// Visual contract:
//   - Retro pixel-art RPG aesthetic: 'Jersey 15' display font, hard 2 px
//     borders, terminal palette, no border-radius, no shadows.
//   - Dark/light themes via a persisted toggle (data-theme on <html>).
//   - Icons and the display font are self-hosted on cyberiaonline.com — no
//     third-party CDN. Icons are pixel-art PNGs; each is paired with a text
//     label, so a decorative glyph never carries information alone.
//   - Dense data layout suitable for operators monitoring a live server.

const POLL_INTERVAL_MS = 2000;

const s = (el) => document.querySelector(el);
const sa = (el) => document.querySelectorAll(el);

const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);

const setHTML = (el, html) => {
  const element = s(el);
  if (element) element.innerHTML = html;
};

// Instance sub-path instance variant handler
const basePath = () => {
  const seg = (window.location.pathname || '/').split('/').filter(Boolean)[0] || '';
  return seg ? `/${seg}` : '';
};

const apiUrl = (path) => `${basePath()}${path}`;

// ── Formatters ─────────────────────────────────────────────────────────────

const pad = (n, w = 2) => String(n).padStart(w, '0');

const formatUptime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--:--';
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
};

const formatNumber = (n) => {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
};

const formatRate = (n, unit) => {
  if (!Number.isFinite(n) || n <= 0) return `0 ${unit}`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} k${unit}`;
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${unit}`;
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};

// Health palette. Closed enum — any unknown value falls through to
// the worst known severity ("critical").
const HEALTH_TONE = {
  healthy: 'ok',
  degraded: 'warn',
  maintenance: 'info',
  critical: 'err',
};

const LOAD_TONE = {
  low: 'ok',
  moderate: 'warn',
  high: 'warn',
  critical: 'err',
};

const toneClass = (tone) => `tone-${tone || 'muted'}`;

// ── Rate tracker ────────────────────────────────────────────────────────────
// The server only exposes monotonically-increasing counters; the
// dashboard derives /s rates by diffing the prior snapshot. Implemented
// as a pair of free functions (rather than a class) so the inlined
// browser script can recreate the closure without method-shorthand
// surprises from Function.prototype.toString.
const rateState = { prev: null, prevTs: 0 };

const rateDiff = (curr, key) => {
  if (!rateState.prev) return 0;
  const dt = (curr._ts - rateState.prevTs) / 1000;
  if (dt <= 0) return 0;
  return (Number(curr[key] || 0) - Number(rateState.prev[key] || 0)) / dt;
};

const rateUpdate = (snapshot) => {
  rateState.prev = snapshot;
  rateState.prevTs = snapshot._ts;
};

// ── Assets (self-hosted on cyberiaonline.com; no third-party CDN) ────────────
// Icons and the display font are served from the project's own asset host. The
// dashboard runs on server.cyberiaonline.com, so these are absolute cross-origin
// URLs: <img> icons load without CORS; the @font-face degrades to a monospace
// stack if the asset host omits CORS headers for the font.
const ICON_BASE = 'https://www.cyberiaonline.com/assets/ui-icons/';

// Logical id -> pixel-art icon file. Every id is paired with a text label, so an
// icon is decorative and a missing glyph never hides information.
const ICONS = {
  pulse: 'server.png',
  cpu: 'engine.png',
  tick: 'reload.png',
  load: 'stats.png',
  plug: 'cloud.png',
  users: 'character.png',
  map: 'map.png',
  cube: 'polyhedron.png',
  stack: 'stack.png',
  alert: 'skull.png',
  down: 'arrow-down.png',
  up: 'arrow-up.png',
  doc: 'doc.png',
  clock: 'clock.png',
};

const icon = (id) => `<img class="icon" src="${ICON_BASE}${ICONS[id] || ICONS.cube}" alt="" />`;

// ── Theme ────────────────────────────────────────────────────────────────────
// Dark is the default console look; the toggle flips to a warm parchment light
// theme and persists the choice. First load with no stored choice follows the OS
// preference. The palette lives in CSS custom properties keyed off
// documentElement[data-theme]; these helpers only flip that attribute.
const THEME_KEY = 'cyberia-metrics-theme';

const currentTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  const label = s('.theme-toggle-label');
  if (label) label.textContent = currentTheme().toUpperCase();
};

const initTheme = () => {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch (_) {}
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(stored === 'light' || stored === 'dark' ? stored : prefersLight ? 'light' : 'dark');
};

const toggleTheme = () => {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (_) {}
};

const themeToggle = () => `
  <button type="button" class="theme-toggle" title="Toggle light / dark theme" aria-label="Toggle theme">
    <img class="icon" src="${ICON_BASE}pallet-colors.png" alt="" />
    <span class="theme-toggle-label">${currentTheme().toUpperCase()}</span>
  </button>
`;

// ── Atoms ──────────────────────────────────────────────────────────────────

const kv = (label, value, tone) => html`
  <div class="kv">
    <span class="kv-label">${label}</span>
    <span class="kv-value ${toneClass(tone)}">${value}</span>
  </div>
`;

const meter = (label, current, max, hint) => {
  const denom = Number(max) || 1;
  const pct = Math.min(100, Math.max(0, (Number(current) / denom) * 100));
  const tone = pct >= 90 ? 'err' : pct >= 70 ? 'warn' : 'ok';
  return html`
    <div class="meter">
      <div class="meter-head">
        <span class="meter-label">${label}</span>
        <span class="meter-value ${toneClass(tone)}">${formatNumber(current)} / ${formatNumber(max)}</span>
      </div>
      <div class="meter-bar">
        <div class="meter-fill ${toneClass(tone)}" style="width: ${pct.toFixed(1)}%"></div>
      </div>
      <div class="meter-foot">
        <span>${pct.toFixed(1)} %</span>
        <span>${hint || ''}</span>
      </div>
    </div>
  `;
};

const panel = (titleIcon, title, body, meta) => html`
  <section class="panel">
    <header class="panel-head">
      <h2 class="panel-title">${icon(titleIcon)}<span>${title}</span></h2>
      ${meta ? `<span class="panel-meta">${meta}</span>` : ''}
    </header>
    <div class="panel-body">${body}</div>
  </section>
`;

// ── Renderers ──────────────────────────────────────────────────────────────

const renderHealthPanel = (m) => {
  const tone = HEALTH_TONE[m.health] || 'err';
  return panel(
    'pulse',
    'Health',
    html`
      <div class="health-block">
        <span class="health-dot ${toneClass(tone)}"></span>
        <div>
          <div class="health-status ${toneClass(tone)}">${(m.health || 'unknown').toUpperCase()}</div>
          <div class="health-desc">${m.health_description || '—'}</div>
        </div>
      </div>
      <div class="grid-2">
        ${kv('Instance', m.instance_code || '—')} ${kv('Uptime', formatUptime(m.server_uptime_sec))}
      </div>
    `,
    new Date(m.timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
  );
};

const renderRuntimePanel = (m) => {
  const r = m.runtime || {};
  return panel(
    'tick',
    'Simulation',
    html`
      <div class="grid-2">
        ${kv('Tick rate', `${r.tick_rate_hz || 0} Hz`)} ${kv('Snapshot rate', `${r.snapshot_rate_hz || 0} Hz`)}
        ${kv('Tick #', formatNumber(r.current_tick))}
        ${kv('Tick duration', `${(r.tick_duration_ms || 0).toFixed(2)} ms`)}
        ${kv('AOI radius', `${(r.aoi_radius || 0).toFixed(1)}`)} ${kv('GOMAXPROCS', r.gomaxprocs || r.num_cpu || 0)}
      </div>
    `,
  );
};

const renderProcessPanel = (m) => {
  const r = m.runtime || {};
  return panel(
    'cpu',
    'Process',
    html`
      <div class="grid-2">
        ${kv('Go version', r.go_version || '—')} ${kv('Goroutines', formatNumber(r.num_goroutine))}
        ${kv('Heap alloc', `${formatNumber(r.heap_alloc_mb)} MiB`)}
        ${kv('Heap sys', `${formatNumber(r.heap_sys_mb)} MiB`)} ${kv('GC cycles', formatNumber(r.num_gc))}
        ${kv('CPU cores', r.num_cpu || 0)}
      </div>
    `,
  );
};

const renderWorkloadPanel = (m) => {
  const w = m.workload || {};
  const tone = LOAD_TONE[w.current_load] || 'err';
  return panel(
    'load',
    'Workload',
    html`
      <div class="load-readout">
        <div class="load-pct ${toneClass(tone)}">${formatPercent(w.load_percentage)}%</div>
        <div class="load-tag ${toneClass(tone)}">${(w.current_load || 'unknown').toUpperCase()}</div>
      </div>
      ${meter('Entity capacity', m.entities?.total_entities || 0, w.max_entity_capacity || 0, 'entities')}
      ${meter('Object layers', m.entities?.total_object_layers || 0, w.max_object_layers || 0, 'layers')}
    `,
  );
};

const renderWebsocketPanel = (m, snap) => {
  const w = m.websocket || {};
  const inRate = rateDiff(snap, '_msgIn');
  const outRate = rateDiff(snap, '_msgOut');
  const bInRate = rateDiff(snap, '_byIn');
  const bOutRate = rateDiff(snap, '_byOut');
  const errRate = rateDiff(snap, '_errTotal');
  const errTone = errRate > 0.1 ? 'err' : (w.read_errors_total || 0) + (w.write_errors_total || 0) > 0 ? 'warn' : 'ok';

  return panel(
    'plug',
    'WebSocket',
    html`
      <div class="grid-3">
        ${kv('Status', (w.status || '—').toUpperCase(), w.status === 'running' ? 'ok' : 'warn')}
        ${kv('Active', formatNumber(w.active_connections))} ${kv('Uptime', formatUptime(w.uptime_sec))}
      </div>
      <table class="grid-table">
        <thead>
          <tr>
            <th></th>
            <th>RATE / s</th>
            <th>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>${icon('down')} Messages in</th>
            <td>${formatRate(inRate, 'msg/s')}</td>
            <td>${formatNumber(w.messages_in_total)}</td>
          </tr>
          <tr>
            <th>${icon('up')} Messages out</th>
            <td>${formatRate(outRate, 'msg/s')}</td>
            <td>${formatNumber(w.messages_out_total)}</td>
          </tr>
          <tr>
            <th>${icon('down')} Bytes in</th>
            <td>${formatBytes(bInRate)}/s</td>
            <td>${formatBytes(w.bytes_in_total)}</td>
          </tr>
          <tr>
            <th>${icon('up')} Bytes out</th>
            <td>${formatBytes(bOutRate)}/s</td>
            <td>${formatBytes(w.bytes_out_total)}</td>
          </tr>
          <tr class="${toneClass(errTone)}">
            <th>${icon('alert')} Errors</th>
            <td>${formatRate(errRate, 'err/s')}</td>
            <td>${formatNumber((w.read_errors_total || 0) + (w.write_errors_total || 0))}</td>
          </tr>
          <tr>
            <th>${icon('users')} Connects</th>
            <td>—</td>
            <td>${formatNumber(w.connects_total)}</td>
          </tr>
          <tr>
            <th>${icon('users')} Disconnects</th>
            <td>—</td>
            <td>${formatNumber(w.disconnects_total)}</td>
          </tr>
        </tbody>
      </table>
    `,
  );
};

const renderEntitiesPanel = (m) => {
  const e = m.entities || {};
  // Stable type → icon mapping. Keys mirror the closed enum the API
  // emits in entities_by_type; an unknown key falls back to the
  // generic cube glyph.
  const typeIcon = {
    player: 'users',
    bot: 'cpu',
    floor: 'map',
    obstacle: 'cube',
    foreground: 'stack',
    portal: 'plug',
    resource: 'stack',
  };
  const rows = (e.entities_by_type || [])
    .map(
      (et) => html`
        <tr class="${et.count === 0 ? 'muted' : ''}">
          <th>${icon(typeIcon[et.type] || 'cube')} ${et.type}</th>
          <td>${formatNumber(et.count)}</td>
          <td>${formatNumber(et.active_object_layers)}</td>
          <td>${formatNumber(et.total_object_layers)}</td>
        </tr>
      `,
    )
    .join('');
  return panel(
    'cube',
    'Entities',
    html`
      <div class="grid-3">
        ${kv('Total', formatNumber(e.total_entities))} ${kv('Active layers', formatNumber(e.active_object_layers))}
        ${kv('Avg layers/entity', formatPercent(e.avg_object_layers_per_entity))}
      </div>
      <table class="grid-table">
        <thead>
          <tr>
            <th>TYPE</th>
            <th>COUNT</th>
            <th>ACTIVE</th>
            <th>LAYERS</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" class="muted">no entities loaded</td></tr>`}
        </tbody>
      </table>
    `,
  );
};

const renderMapsPanel = (m) => {
  const maps = m.maps || [];
  if (maps.length === 0) {
    return panel('map', 'Maps', `<div class="muted center">no maps loaded</div>`);
  }
  const rows = maps
    .map(
      (mp) => html`
        <tr>
          <th>${icon('map')} ${mp.map_code}</th>
          <td>${mp.grid_w}×${mp.grid_h}</td>
          <td class="${mp.players > 0 ? 'tone-ok' : ''}">${formatNumber(mp.players)}</td>
          <td>${formatNumber(mp.bots)}</td>
          <td>${formatNumber(mp.floors)}</td>
          <td>${formatNumber(mp.obstacles)}</td>
          <td>${formatNumber(mp.foregrounds)}</td>
          <td>${formatNumber(mp.portals)}</td>
          <td>${formatNumber(mp.resources)}</td>
          <td><strong>${formatNumber(mp.total_entities)}</strong></td>
        </tr>
      `,
    )
    .join('');
  return panel(
    'map',
    'Maps',
    html`
      <table class="grid-table dense">
        <thead>
          <tr>
            <th>CODE</th>
            <th>GRID</th>
            <th>PLY</th>
            <th>BOT</th>
            <th>FLR</th>
            <th>OBS</th>
            <th>FG</th>
            <th>PRT</th>
            <th>RES</th>
            <th>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `,
    `${maps.length} map${maps.length === 1 ? '' : 's'}`,
  );
};

const renderDashboard = (m) => {
  // Snapshot the throughput counters into rate-tracker shape so the
  // rate diffs are stable across panel re-renders.
  const snap = {
    _ts: Date.now(),
    _msgIn: m.websocket?.messages_in_total || 0,
    _msgOut: m.websocket?.messages_out_total || 0,
    _byIn: m.websocket?.bytes_in_total || 0,
    _byOut: m.websocket?.bytes_out_total || 0,
    _errTotal: (m.websocket?.read_errors_total || 0) + (m.websocket?.write_errors_total || 0),
  };

  const body = html`
    <main class="dash">
      <header class="dash-head">
        <div class="brand">
          <span class="brand-emblem"><img class="brand-logo" src="${ICON_BASE}cyberia-white.png" alt="Cyberia" /></span>
          <span class="brand-text">CYBERIA SERVER</span>
        </div>
        <nav class="dash-nav">
          <a href="${apiUrl('/api/v1/docs')}">${icon('doc')}<span>API docs</span></a>
          <a href="${apiUrl('/api/v1/openapi.json')}">${icon('doc')}<span>openapi.json</span></a>
          <a href="${apiUrl('/api/v1/postman.json')}" download>${icon('doc')}<span>postman</span></a>
          ${themeToggle()}
        </nav>
      </header>
      <section class="grid-12">
        <div class="col-4">${renderHealthPanel(m)}</div>
        <div class="col-4">${renderRuntimePanel(m)}</div>
        <div class="col-4">${renderProcessPanel(m)}</div>
        <div class="col-4">${renderWorkloadPanel(m)}</div>
        <div class="col-8">${renderWebsocketPanel(m, snap)}</div>
        <div class="col-6">${renderEntitiesPanel(m)}</div>
        <div class="col-6">${renderMapsPanel(m)}</div>
      </section>
      <footer class="dash-foot">
        <span>POLL ${POLL_INTERVAL_MS} ms</span>
        <span>RFC 9457 problem+json on error</span>
        <span>v${(window.renderPayload && window.renderPayload.version) || '0.0.0'}</span>
      </footer>
    </main>
  `;

  setHTML('.dashboard-content', body);
  rateUpdate(snap);
};

// ── Fetch loop ─────────────────────────────────────────────────────────────

const renderError = (status, detail) => {
  setHTML(
    '.dashboard-content',
    html`
      <div class="dash-error">
        <div class="dash-error-tag">${icon('alert')} HTTP ${status}</div>
        <div class="dash-error-body">${detail}</div>
        <div class="dash-error-foot">retrying in ${POLL_INTERVAL_MS / 1000}s</div>
      </div>
    `,
  );
};

const fetchMetrics = async () => {
  try {
    const res = await fetch(apiUrl('/api/v1/metrics'), { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      // RFC 9457: server returns problem+json with a stable `title`/`detail`.
      let detail = res.statusText;
      try {
        const problem = await res.json();
        detail = problem.detail || problem.title || detail;
      } catch (_) {
        // body wasn't JSON; ignore.
      }
      renderError(res.status, detail);
      return;
    }
    const metrics = await res.json();
    renderDashboard(metrics);
  } catch (err) {
    renderError('NET', String((err && err.message) || err));
  }
};

const main = () => {
  initTheme();
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest && event.target.closest('.theme-toggle');
    if (toggle) {
      event.preventDefault();
      toggleTheme();
    }
  });
  append(
    'body',
    html`
      <style>
        @font-face {
          font-family: 'Jersey 15';
          font-style: normal;
          font-weight: 400;
          font-display: swap;
          src: url('https://www.cyberiaonline.com/assets/fonts/Jersey15-Regular.ttf') format('truetype');
        }
        /* Dark is the default (no-JS and OS-dark). initTheme() may switch to
           light before first paint; the toggle persists the choice. */
        :root {
          --bg: #0a0d12;
          --bg-2: #11161e;
          --bg-3: #161c25;
          --fg: #d8dee9;
          --fg-dim: #8a93a3;
          --fg-muted: #5b6473;
          --line: #2a3140;
          --line-2: #1a1f2a;
          --ok: #7ee787;
          --warn: #f0b429;
          --err: #ff6b6b;
          --info: #c084fc;
          --accent: #7dd3fc;
          --scanline: rgba(255, 255, 255, 0.03);
          --logo-tile: #ffffff00;
          --brand-text: #f0b429;
        }
        :root[data-theme='light'] {
          --bg: #e7e3d7;
          --bg-2: #f3f0e7;
          --bg-3: #e2ded0;
          --fg: #20242c;
          --fg-dim: #5a6270;
          --fg-muted: #857f6f;
          --line: #c3bca8;
          --line-2: #d8d2c1;
          --ok: #2f8f3e;
          --warn: #a9710a;
          --err: #c73838;
          --info: #7c3aed;
          --accent: #0e6f95;
          --scanline: rgba(0, 0, 0, 0.045);
          --logo-tile: #ffffff00;
          --brand-text: #b68719;
        }
        * {
          box-sizing: border-box;
        }
        .brand-text {
          color: var(--brand-text);
        }
        html,
        body {
          margin: 0;
          padding: 0;
          background: var(--bg);
          color: var(--fg);
          font-family: 'Jersey 15', ui-monospace, 'IBM Plex Mono', Menlo, monospace;
          font-size: 20px;
          line-height: 1.3;
          letter-spacing: 0.4px;
          min-height: 100vh;
          font-variant-numeric: tabular-nums;
          transition:
            background 0.15s ease,
            color 0.15s ease;
        }
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image: repeating-linear-gradient(
            to bottom,
            var(--scanline) 0,
            var(--scanline) 1px,
            transparent 1px,
            transparent 3px
          );
          z-index: 1;
        }
        .icon {
          width: 15px;
          height: 15px;
          vertical-align: -2px;
          margin-right: 6px;
        }
        a {
          color: var(--accent);
          text-decoration: none;
        }
        a:hover {
          color: var(--fg);
        }
        .dash {
          position: relative;
          z-index: 2;
          max-width: 1440px;
          margin: 0 auto;
          padding: 16px 20px 32px;
        }
        .dash-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border: 2px solid var(--line);
          background: var(--bg-2);
          padding: 10px 16px;
          margin-bottom: 16px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: 'Jersey 15', ui-monospace, monospace;
          font-size: 24px;
          letter-spacing: 3px;
          color: var(--accent);
        }
        .brand-emblem {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          background: var(--logo-tile);
          border: 2px solid var(--line);
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
        }
        .brand-logo {
          width: 24px;
          height: 24px;
          display: block;
        }
        .dash-nav {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dash-nav a {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border: 2px solid var(--line);
          background: var(--bg-3);
          color: var(--fg);
          font-size: 16px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .dash-nav a:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .theme-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border: 2px solid var(--line);
          background: var(--bg-3);
          color: var(--fg);
          font-family: 'Jersey 15', ui-monospace, monospace;
          font-size: 16px;
          letter-spacing: 1px;
          text-transform: uppercase;
          cursor: pointer;
        }
        .theme-toggle:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .theme-toggle .icon {
          width: 16px;
          height: 16px;
          margin-right: 0;
        }
        .theme-toggle-label {
          min-width: 42px;
          text-align: left;
        }
        .grid-12 {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 12px;
        }
        .col-4 {
          grid-column: span 4;
        }
        .col-6 {
          grid-column: span 6;
        }
        .col-8 {
          grid-column: span 8;
        }
        @media (max-width: 1100px) {
          .col-4,
          .col-6,
          .col-8 {
            grid-column: span 12;
          }
        }
        .panel {
          border: 2px solid var(--line);
          background: var(--bg-2);
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }
        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 2px solid var(--line);
          background: var(--bg-3);
        }
        .panel-title {
          margin: 0;
          font-family: 'Jersey 15', ui-monospace, monospace;
          font-size: 15px;
          letter-spacing: 2px;
          color: var(--fg);
          text-transform: uppercase;
          display: flex;
          align-items: center;
        }
        .panel-meta {
          font-size: 13px;
          color: var(--fg-muted);
          letter-spacing: 1px;
        }
        .panel-body {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }
        .kv {
          display: flex;
          justify-content: space-between;
          padding: 4px 6px;
          background: var(--bg-3);
          border: 1px solid var(--line-2);
        }
        .kv-label {
          color: var(--fg-dim);
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .kv-value {
          color: var(--fg);
          font-weight: 700;
          font-size: 16px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
        }
        .meter {
          background: var(--bg-3);
          border: 1px solid var(--line-2);
          padding: 6px 8px;
        }
        .meter-head,
        .meter-foot {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }
        .meter-label {
          color: var(--fg-dim);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .meter-value {
          font-weight: 700;
        }
        .meter-bar {
          height: 10px;
          margin: 4px 0;
          background: var(--bg);
          border: 1px solid var(--line);
          position: relative;
          overflow: hidden;
        }
        .meter-fill {
          height: 100%;
          background-image: repeating-linear-gradient(
            45deg,
            currentColor 0,
            currentColor 4px,
            rgba(0, 0, 0, 0.25) 4px,
            rgba(0, 0, 0, 0.25) 8px
          );
        }
        .meter-foot {
          color: var(--fg-muted);
          font-size: 13px;
        }
        .grid-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 15px;
        }
        .grid-table th,
        .grid-table td {
          padding: 4px 6px;
          text-align: right;
          border-bottom: 1px solid var(--line-2);
        }
        .grid-table thead th {
          color: var(--fg-muted);
          text-align: right;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-size: 12px;
          border-bottom: 2px solid var(--line);
        }
        .grid-table tbody th {
          text-align: left;
          color: var(--fg-dim);
          font-weight: 400;
          text-transform: capitalize;
        }
        .grid-table.dense th,
        .grid-table.dense td {
          padding: 3px 6px;
          font-size: 14px;
        }
        .health-block {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 8px 4px;
        }
        .health-dot {
          width: 16px;
          height: 16px;
          border: 2px solid currentColor;
          background: currentColor;
          flex: 0 0 16px;
          animation: blink 1.6s steps(2, end) infinite;
        }
        @keyframes blink {
          0%,
          60% {
            opacity: 1;
          }
          70%,
          100% {
            opacity: 0.35;
          }
        }
        .health-status {
          font-family: 'Jersey 15', ui-monospace, monospace;
          font-size: 20px;
          letter-spacing: 2px;
        }
        .health-desc {
          font-size: 14px;
          color: var(--fg-dim);
          margin-top: 4px;
        }
        .load-readout {
          display: flex;
          align-items: baseline;
          gap: 12px;
          padding: 4px 6px;
          background: var(--bg-3);
          border: 1px solid var(--line-2);
        }
        .load-pct {
          font-family: 'Jersey 15', ui-monospace, monospace;
          font-size: 32px;
          letter-spacing: 1px;
        }
        .load-tag {
          font-family: 'Jersey 15', ui-monospace, monospace;
          font-size: 14px;
          letter-spacing: 2px;
          padding: 2px 8px;
          border: 2px solid currentColor;
        }
        .dash-foot {
          margin-top: 16px;
          padding: 8px 16px;
          border: 2px solid var(--line);
          background: var(--bg-2);
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: var(--fg-muted);
          letter-spacing: 1px;
        }
        .dash-error {
          margin: 80px auto;
          max-width: 520px;
          border: 2px solid var(--err);
          background: var(--bg-2);
          color: var(--err);
          padding: 24px;
          text-align: center;
        }
        .dash-error-tag {
          font-family: 'Jersey 15', ui-monospace, monospace;
          font-size: 18px;
          letter-spacing: 2px;
          margin-bottom: 12px;
        }
        .dash-error-body {
          color: var(--fg);
          font-size: 16px;
        }
        .dash-error-foot {
          color: var(--fg-muted);
          font-size: 13px;
          margin-top: 12px;
        }
        .muted {
          color: var(--fg-muted);
        }
        .center {
          text-align: center;
        }
        .tone-ok {
          color: var(--ok);
        }
        .tone-warn {
          color: var(--warn);
        }
        .tone-err {
          color: var(--err);
        }
        .tone-info {
          color: var(--info);
        }
        .tone-muted {
          color: var(--fg-muted);
        }
      </style>
      <div class="dashboard-content"></div>
    `,
  );

  fetchMetrics();
  setInterval(fetchMetrics, POLL_INTERVAL_MS);
};

SrrComponent = () =>
  html`<script>
    {
      const POLL_INTERVAL_MS = ${POLL_INTERVAL_MS};
      const s = ${s};
      const sa = ${sa};
      const append = ${append};
      const setHTML = ${setHTML};
      const basePath = ${basePath};
      const apiUrl = ${apiUrl};
      const pad = ${pad};
      const formatUptime = ${formatUptime};
      const formatNumber = ${formatNumber};
      const formatBytes = ${formatBytes};
      const formatRate = ${formatRate};
      const formatPercent = ${formatPercent};
      const HEALTH_TONE = ${JSON.stringify(HEALTH_TONE)};
      const LOAD_TONE = ${JSON.stringify(LOAD_TONE)};
      const toneClass = ${toneClass};
      const rateState = { prev: null, prevTs: 0 };
      const rateDiff = ${rateDiff};
      const rateUpdate = ${rateUpdate};
      const ICON_BASE = ${JSON.stringify(ICON_BASE)};
      const ICONS = ${JSON.stringify(ICONS)};
      const icon = ${icon};
      const THEME_KEY = ${JSON.stringify(THEME_KEY)};
      const currentTheme = ${currentTheme};
      const applyTheme = ${applyTheme};
      const initTheme = ${initTheme};
      const toggleTheme = ${toggleTheme};
      const themeToggle = ${themeToggle};
      const kv = ${kv};
      const meter = ${meter};
      const panel = ${panel};
      const renderHealthPanel = ${renderHealthPanel};
      const renderRuntimePanel = ${renderRuntimePanel};
      const renderProcessPanel = ${renderProcessPanel};
      const renderWorkloadPanel = ${renderWorkloadPanel};
      const renderWebsocketPanel = ${renderWebsocketPanel};
      const renderEntitiesPanel = ${renderEntitiesPanel};
      const renderMapsPanel = ${renderMapsPanel};
      const renderDashboard = ${renderDashboard};
      const renderError = ${renderError};
      const fetchMetrics = ${fetchMetrics};
      const main = ${main};
      window.onload = main;
    }
  </script>`;
