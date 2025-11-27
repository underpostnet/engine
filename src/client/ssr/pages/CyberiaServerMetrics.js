const s = (el) => document.querySelector(el);
const sa = (el) => document.querySelectorAll(el);

const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);

const setHTML = (el, html) => {
  const element = s(el);
  if (element) element.innerHTML = html;
};

const getLang = () =>
  (localStorage.getItem('lang') || navigator.language || navigator.userLanguage || s('html').lang)
    .slice(0, 2)
    .toLowerCase();

const formatUptime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}h ${minutes}m ${secs}s`;
};

const getHealthColor = (health) => {
  const colors = {
    healthy: '#10b981',
    degraded: '#f59e0b',
    critical: '#ef4444',
    maintenance: '#8b5cf6',
  };
  return colors[health] || '#6b7280';
};

const getLoadColor = (load) => {
  const colors = {
    low: '#10b981',
    moderate: '#f59e0b',
    high: '#ef4444',
  };
  return colors[load] || '#6b7280';
};

const formatPercent = (value) => {
  return Math.round(value * 100) / 100;
};

const createProgressBar = (current, max, label) => {
  const percent = (current / max) * 100;
  const color = percent > 80 ? '#ef4444' : percent > 50 ? '#f59e0b' : '#10b981';
  return html`
    <div style="margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
        <span>${label}</span>
        <span style="font-weight: bold;">${current} / ${max}</span>
      </div>
      <div style="width: 100%; height: 8px; background-color: #e5e7eb; border-radius: 4px; overflow: hidden;">
        <div style="width: ${percent}%; height: 100%; background-color: ${color}; transition: width 0.3s ease;"></div>
      </div>
    </div>
  `;
};

const createEntityCard = (entityType) => {
  const icons = {
    player: '👤',
    bot: '🤖',
    floor: '🏢',
    obstacle: '🚧',
    foreground: '🎨',
    portal: '🌀',
  };
  const icon = icons[entityType.type] || '🔷';
  return html`
    <div
      style="background: linear-gradient(135deg, #f3f4f6 0%, #ffffff 100%); padding: 12px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 8px;"
    >
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 20px; margin-right: 8px;">${icon}</span>
        <div>
          <div style="font-weight: bold; font-size: 14px; text-transform: capitalize;">${entityType.type}</div>
          <div style="font-size: 12px; color: #6b7280;">Count: ${entityType.count}</div>
        </div>
      </div>
      ${entityType.total_object_layers > 0
        ? `
        <div style="font-size: 11px; color: #666; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb;">
          <div>Layers: ${entityType.active_object_layers}/${entityType.total_object_layers}</div>
        </div>
      `
        : ''}
    </div>
  `;
};

const fetchMetrics = async () => {
  try {
    const response = await fetch('http://localhost:8080/api/v1/metrics');
    if (!response.ok) throw new Error('Failed to fetch metrics');
    return await response.json();
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return null;
  }
};

const renderDashboardContent = (metrics) => {
  const timestamp = new Date(metrics.timestamp);
  const timeString = timestamp.toLocaleTimeString();

  const healthColor = getHealthColor(metrics.health);
  const loadColor = getLoadColor(metrics.workload.current_load);

  let entitiesHtml = '';
  if (metrics.entities.entities_by_type && Array.isArray(metrics.entities.entities_by_type)) {
    entitiesHtml = metrics.entities.entities_by_type.map((et) => createEntityCard(et)).join('');
  }

  return html`
    <div class="container">
      <div class="header">
        <h1>🖥️ Cyberia Server Metrics</h1>
        <p>Real-time MMO Server Status Dashboard</p>
      </div>

      <div class="grid">
        <!-- Server Health Card -->
        <div class="card">
          <div class="card-title">Server Health</div>
          <div style="margin-bottom: 12px;">
            <span class="health-indicator" style="background-color: ${healthColor};"></span>
            <span class="status-badge status-${metrics.health}">${metrics.health}</span>
          </div>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">${metrics.health_description}</p>
          <div class="timestamp">Updated: ${timeString}</div>
        </div>

        <!-- Uptime Card -->
        <div class="card">
          <div class="card-title">⏱️ Server Uptime</div>
          <div style="font-size: 24px; font-weight: 700; color: #667eea; margin: 12px 0;">
            ${formatUptime(metrics.server_uptime_sec)}
          </div>
          <div style="font-size: 12px; color: #6b7280;">WebSocket: ${formatUptime(metrics.websocket.uptime_sec)}</div>
        </div>

        <!-- Workload Card -->
        <div class="card">
          <div class="card-title">📊 Server Load</div>
          <div class="load-indicator" style="color: ${loadColor};">
            ${formatPercent(metrics.workload.load_percentage)}%
          </div>
          <div style="font-size: 12px; color: #6b7280; text-align: center;">
            Current: <strong>${metrics.workload.current_load}</strong>
          </div>
          ${createProgressBar(metrics.workload.load_percentage, 100, 'Load Percentage')}
        </div>

        <!-- WebSocket Card -->
        <div class="card">
          <div class="card-title">🔌 WebSocket Status</div>
          <div class="metric-item">
            <span class="metric-label">Status</span>
            <span class="metric-value" style="color: #10b981;">${metrics.websocket.status}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Active Connections</span>
            <span class="metric-value">${metrics.websocket.active_connections}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Uptime</span>
            <span class="metric-value">${formatUptime(metrics.websocket.uptime_sec)}</span>
          </div>
        </div>

        <!-- Entity Summary Card -->
        <div class="card">
          <div class="card-title">🎮 Entities Summary</div>
          <div class="metric-item">
            <span class="metric-label">Total Entities</span>
            <span class="metric-value">${metrics.entities.total_entities}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Active Layers</span>
            <span class="metric-value">${metrics.entities.active_object_layers}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Avg Layers/Entity</span>
            <span class="metric-value">${formatPercent(metrics.entities.avg_object_layers_per_entity)}</span>
          </div>
        </div>

        <!-- Capacity Card -->
        <div class="card">
          <div class="card-title">📈 Capacity Usage</div>
          ${createProgressBar(metrics.entities.total_entities, metrics.workload.max_entity_capacity, 'Entity Capacity')}
          ${createProgressBar(
            metrics.entities.total_object_layers,
            metrics.workload.max_object_layers,
            'Object Layers',
          )}
        </div>

        <!-- Entities Breakdown Full Width -->
        <div class="card full-width">
          <div class="card-title">🎪 Entities Breakdown</div>
          <div class="entities-grid">${entitiesHtml}</div>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${location.origin}" class="back-link">← Back to Homepage</a>
      </div>
    </div>
  `;
};

const updateDashboard = async () => {
  const metrics = await fetchMetrics();
  if (!metrics) {
    setHTML(
      '.dashboard-content',
      '<div style="text-align: center; padding: 20px; color: #ef4444;">Unable to load server metrics</div>',
    );
    return;
  }

  const content = renderDashboardContent(metrics);
  setHTML('.dashboard-content', content);
};

const main = () => {
  // Initial setup with styles and container
  const initialHTML = html`
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #1f2937;
        margin: 0;
        padding: 0;
        min-height: 100vh;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }

      .header {
        text-align: center;
        color: white;
        margin-bottom: 30px;
      }

      .header h1 {
        margin: 0;
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 8px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      .header p {
        margin: 0;
        font-size: 14px;
        opacity: 0.9;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-bottom: 20px;
      }

      .card {
        background: white;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        transition:
          transform 0.3s ease,
          box-shadow 0.3s ease;
      }

      .card:hover {
        transform: translateY(-5px);
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
      }

      .card-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #1f2937;
      }

      .status-badge {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .status-healthy {
        background-color: #d1fae5;
        color: #065f46;
      }

      .status-degraded {
        background-color: #fef3c7;
        color: #92400e;
      }

      .status-critical {
        background-color: #fee2e2;
        color: #991b1b;
      }

      .status-maintenance {
        background-color: #ede9fe;
        color: #5b21b6;
      }

      .metric-item {
        display: flex;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid #e5e7eb;
      }

      .metric-item:last-child {
        border-bottom: none;
      }

      .metric-label {
        color: #6b7280;
        font-size: 13px;
      }

      .metric-value {
        font-weight: 600;
        color: #1f2937;
        font-size: 14px;
      }

      .health-indicator {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 6px;
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      .entities-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
      }

      .back-link {
        display: inline-block;
        margin-top: 20px;
        padding: 10px 20px;
        background-color: rgba(255, 255, 255, 0.2);
        color: white;
        text-decoration: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        transition: background-color 0.3s ease;
      }

      .back-link:hover {
        background-color: rgba(255, 255, 255, 0.3);
      }

      .full-width {
        grid-column: 1 / -1;
      }

      .load-indicator {
        font-size: 48px;
        text-align: center;
        margin: 20px 0;
        font-weight: 700;
      }

      .timestamp {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
      }

      .dashboard-content {
        animation: fadeIn 0.3s ease-in-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    </style>

    <div class="dashboard-content"></div>
  `;

  append('body', initialHTML);

  // Initial load
  updateDashboard();

  // Auto-refresh every 5 seconds
  setInterval(updateDashboard, 5000);
};

SrrComponent = () =>
  html`<script>
    {
      const s = ${s};
      const sa = ${sa};
      const append = ${append};
      const setHTML = ${setHTML};
      const getLang = ${getLang};
      const formatUptime = ${formatUptime};
      const getHealthColor = ${getHealthColor};
      const getLoadColor = ${getLoadColor};
      const formatPercent = ${formatPercent};
      const createProgressBar = ${createProgressBar};
      const createEntityCard = ${createEntityCard};
      const fetchMetrics = ${fetchMetrics};
      const renderDashboardContent = ${renderDashboardContent};
      const updateDashboard = ${updateDashboard};
      const main = ${main};
      window.onload = main;
    }
  </script>`;
