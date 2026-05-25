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
//   - Retro pixel-art aesthetic: VT323 fixed-width font, hard 2 px
//     borders, terminal palette, no border-radius, no shadows.
//   - No emojis; every glyph in the UI is an SVG resolved through the
//     `<svg><use href="#icon-..."/></svg>` sprite defined in main().
//   - Dense data layout suitable for operators monitoring a live server.

const POLL_INTERVAL_MS = 2000;

const s = (el) => document.querySelector(el);
const sa = (el) => document.querySelectorAll(el);

const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);

const setHTML = (el, html) => {
  const element = s(el);
  if (element) element.innerHTML = html;
};

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

// ── Icon sprite ────────────────────────────────────────────────────────────
// Every glyph in the UI is rendered through this single sprite via
// <svg class="icon"><use href="#icon-..."/></svg>. Icons are designed
// on a 12 × 12 grid so they stay crisp at the dashboard's pixel scale.
const iconSprite = html`
  <svg width="0" height="0" style="position: absolute; overflow: hidden;" aria-hidden="true">
    <defs>
      <!-- Pulse / liveness dot -->
      <symbol id="icon-pulse" viewBox="0 0 12 12">
        <path d="M0 6h2l1-3 2 6 2-4 1 2h4v2H7l-1-1-2 4-2-6-1 1H0z" fill="currentColor" />
      </symbol>
      <!-- Server / chip -->
      <symbol id="icon-cpu" viewBox="0 0 12 12">
        <path d="M3 1h6v2h1v6H9v2H3V9H1V3h2zM3 3v6h6V3z M4 4h4v4H4z" fill="currentColor" />
      </symbol>
      <!-- Clock -->
      <symbol id="icon-clock" viewBox="0 0 12 12">
        <path d="M2 2h8v8H2zM4 4v4h4V7H5V4z" fill="currentColor" />
      </symbol>
      <!-- Bar chart / load -->
      <symbol id="icon-load" viewBox="0 0 12 12">
        <path d="M1 9h2v2H1zm3-3h2v5H4zm3-3h2v8H7zm3-2h2v10h-2z" fill="currentColor" />
      </symbol>
      <!-- Plug / websocket -->
      <symbol id="icon-plug" viewBox="0 0 12 12">
        <path d="M3 1h2v3H3zm4 0h2v3H7zM2 4h8v3a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3zM5 10h2v2H5z" fill="currentColor" />
      </symbol>
      <!-- Players / users -->
      <symbol id="icon-users" viewBox="0 0 12 12">
        <path d="M4 1h2v2H4zM3 4h4v2H3zM2 6h6v1H2zM1 7h8v3H1z" fill="currentColor" />
      </symbol>
      <!-- Map / grid -->
      <symbol id="icon-map" viewBox="0 0 12 12">
        <path d="M1 1h3v3H1zm4 0h3v3H5zm4 0h2v3H9zM1 5h3v3H1zm4 0h3v3H5zm4 0h2v3H9zM1 9h3v2H1zm4 0h3v2H5zm4 0h2v2H9z" fill="currentColor" />
      </symbol>
      <!-- Entity / square -->
      <symbol id="icon-cube" viewBox="0 0 12 12">
        <path d="M2 2h8v8H2zM4 4v4h4V4z" fill="currentColor" />
      </symbol>
      <!-- Layer / stack -->
      <symbol id="icon-stack" viewBox="0 0 12 12">
        <path d="M1 3l5-2 5 2-5 2zm0 3l5 2 5-2-2-1-3 1.2L4 5zm0 3l5 2 5-2-2-1-3 1.2L4 8z" fill="currentColor" />
      </symbol>
      <!-- Tick / cadence -->
      <symbol id="icon-tick" viewBox="0 0 12 12">
        <path d="M6 1l1 4h4l-3 2 1 4-3-2-3 2 1-4-3-2h4z" fill="currentColor" />
      </symbol>
      <!-- Alert / error -->
      <symbol id="icon-alert" viewBox="0 0 12 12">
        <path d="M5 1h2v6H5zm0 8h2v2H5z" fill="currentColor" />
      </symbol>
      <!-- Down arrow / inbound -->
      <symbol id="icon-down" viewBox="0 0 12 12">
        <path d="M5 1h2v6h2L6 11 3 7h2z" fill="currentColor" />
      </symbol>
      <!-- Up arrow / outbound -->
      <symbol id="icon-up" viewBox="0 0 12 12">
        <path d="M5 11h2V5h2L6 1 3 5h2z" fill="currentColor" />
      </symbol>
      <!-- Doc / api -->
      <symbol id="icon-doc" viewBox="0 0 12 12">
        <path d="M2 1h6l2 2v8H2zM4 4h4v1H4zm0 2h4v1H4zm0 2h3v1H4z" fill="currentColor" />
      </symbol>
    </defs>
  </svg>
`;

const icon = (id) => `<svg class="icon" aria-hidden="true"><use href="#icon-${id}"/></svg>`;

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
        ${kv('Tick #', formatNumber(r.current_tick))} ${kv('Tick duration', `${(r.tick_duration_ms || 0).toFixed(2)} ms`)}
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
          <span class="brand-glyph">${icon('cpu')}</span>
          <span class="brand-text">CYBERIA SERVER</span>
        </div>
        <nav class="dash-nav">
          <a href="/api/v1/docs">${icon('doc')}<span>API docs</span></a>
          <a href="/api/v1/openapi.json">${icon('doc')}<span>openapi.json</span></a>
          <a href="/api/v1/postman.json" download>${icon('doc')}<span>postman</span></a>
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
    const res = await fetch('/api/v1/metrics', { headers: { Accept: 'application/json' } });
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
  append('body', iconSprite);
  append(
    'body',
    html`
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=VT323&family=Press+Start+2P&display=swap" rel="stylesheet" />
    `,
  );
  append(
    'body',
    html`
      <style>
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
        }
        * {
          box-sizing: border-box;
        }
        html,
        body {
          margin: 0;
          padding: 0;
          background: var(--bg);
          color: var(--fg);
          font-family: 'VT323', 'IBM Plex Mono', ui-monospace, Menlo, monospace;
          font-size: 18px;
          line-height: 1.35;
          letter-spacing: 0.5px;
          min-height: 100vh;
          image-rendering: pixelated;
          -webkit-font-smoothing: none;
        }
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image: repeating-linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.03) 0,
            rgba(255, 255, 255, 0.03) 1px,
            transparent 1px,
            transparent 3px
          );
          z-index: 1;
        }
        .icon {
          width: 12px;
          height: 12px;
          fill: currentColor;
          shape-rendering: crispEdges;
          vertical-align: -1px;
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
          gap: 10px;
          font-family: 'Press Start 2P', 'VT323', monospace;
          font-size: 11px;
          letter-spacing: 2px;
          color: var(--accent);
        }
        .brand-glyph .icon {
          width: 18px;
          height: 18px;
          margin: 0;
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
          font-size: 14px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .dash-nav a:hover {
          border-color: var(--accent);
          color: var(--accent);
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
          font-family: 'Press Start 2P', 'VT323', monospace;
          font-size: 9px;
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
          font-family: 'Press Start 2P', 'VT323', monospace;
          font-size: 14px;
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
          font-family: 'Press Start 2P', 'VT323', monospace;
          font-size: 22px;
          letter-spacing: 1px;
        }
        .load-tag {
          font-family: 'Press Start 2P', 'VT323', monospace;
          font-size: 9px;
          letter-spacing: 2px;
          padding: 2px 6px;
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
          font-family: 'Press Start 2P', 'VT323', monospace;
          font-size: 12px;
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
      const iconSprite = ${JSON.stringify(iconSprite)};
      const icon = ${icon};
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
