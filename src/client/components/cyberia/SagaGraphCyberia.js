/**
 * The relationship graphs of the Saga Engine: the narrative graph and the content and world graph a
 * completeness report holds. The server derives every node and edge from validated content and
 * stored documents; this view lays them out in columns, shows the neighbours of the node a moderator
 * picks, and opens the editor of a node. A table of the same edges is the accessible alternative.
 *
 * @module src/client/components/cyberia/SagaGraphCyberia.js
 */
import { escapeHtml } from '../core/VanillaJs.js';

/** The projections a report holds, in the order the view offers them. */
const PROJECTIONS = Object.freeze([
  { id: 'narrative', label: 'Narrative', icon: 'fa-solid fa-scroll' },
  { id: 'composition', label: 'Content and worlds', icon: 'fa-solid fa-map' },
]);

/** The visual class of each edge type; a type not named here draws as a dependency. */
const EDGE_CLASSES = Object.freeze({
  starts: 'flow',
  offers: 'flow',
  provides: 'flow',
  unlocks: 'flow',
  talk: 'flow',
  greets: 'flow',
  owns: 'world',
  place: 'shared',
  shares: 'shared',
  'in world': 'world',
});

const NODE = Object.freeze({ width: 176, height: 36, column: 236, row: 50, margin: 16 });
const ZOOMS = Object.freeze([0.5, 0.65, 0.8, 1, 1.25, 1.5]);
/** The smallest zoom a graph opens at: below it the labels do not read, so the canvas scrolls. */
const READABLE_ZOOM = ZOOMS.indexOf(0.8);

/** The label of the editor a node link opens. */
const linkLabel = ({ view }) =>
  ({
    package: 'Open in the package',
    'action-engine': 'Open in the Action Engine',
    'instance-engine': 'Open in the Instance Studio',
  })[view] ?? 'Open';

/**
 * The column of each node: the longest path to it from a node no edge reaches. An edge that closes a
 * cycle does not count, so every graph has columns.
 */
function columnsOf({ nodes, edges }) {
  const incoming = new Map(nodes.map(({ id }) => [id, []]));
  for (const edge of edges) incoming.get(edge.to)?.push(edge.from);
  const column = new Map();
  const visiting = new Set();
  const depth = (id) => {
    if (column.has(id)) return column.get(id);
    visiting.add(id);
    const sources = incoming.get(id).filter((from) => !visiting.has(from));
    const value = sources.length === 0 ? 0 : 1 + Math.max(...sources.map(depth));
    visiting.delete(id);
    column.set(id, value);
    return value;
  };
  for (const { id } of nodes) depth(id);
  return column;
}

/** Node positions: one column per depth, each column ordered by the mean row of its sources. */
function layout(graph) {
  const column = columnsOf(graph);
  const row = new Map();
  const columns = Map.groupBy(graph.nodes, ({ id }) => column.get(id));
  for (const index of [...columns.keys()].sort((a, b) => a - b)) {
    const rank = (node) => {
      const rows = graph.edges
        .filter(({ from, to }) => to === node.id && row.has(from))
        .map(({ from }) => row.get(from));
      return rows.length > 0 ? rows.reduce((sum, value) => sum + value, 0) / rows.length : Infinity;
    };
    const ordered = columns
      .get(index)
      .map((node) => ({ node, rank: rank(node) }))
      .sort((a, b) => a.rank - b.rank || a.node.label.localeCompare(b.node.label));
    ordered.forEach(({ node }, position) => row.set(node.id, position));
  }
  const point = (id) => ({
    x: NODE.margin + column.get(id) * NODE.column,
    y: NODE.margin + row.get(id) * NODE.row,
  });
  const width = NODE.margin * 2 + Math.max(0, ...column.values()) * NODE.column + NODE.width;
  const height =
    NODE.margin * 2 + Math.max(0, ...[...columns.values()].map((list) => list.length - 1)) * NODE.row + NODE.height;
  return { point, width, height };
}

/** The path of an edge: from the right side of its source to the left side of its target. */
function edgePath(from, to) {
  const start = { x: from.x + NODE.width, y: from.y + NODE.height / 2 };
  const end = { x: to.x, y: to.y + NODE.height / 2 };
  if (end.x > start.x) {
    const bend = (end.x - start.x) / 2;
    return `M${start.x},${start.y} C${start.x + bend},${start.y} ${end.x - bend},${end.y} ${end.x},${end.y}`;
  }
  // An edge back to an earlier column loops below both nodes.
  const below = Math.max(start.y, end.y) + NODE.row * 0.6;
  return `M${start.x},${start.y} C${start.x + 60},${below} ${end.x - 60},${below} ${end.x},${end.y}`;
}

const nodeName = (node) => `${node.kind} ${node.label}`;

class SagaGraph {
  /** The shown state of each graph view, by id: projection, mode, zoom and the picked node. */
  static views = {};

  static style = css`
    .saga-graph-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-bottom: 8px;
    }
    .saga-graph-bar [aria-pressed='true'] {
      background: var(--studio-tag, #8883);
      font-weight: 600;
    }
    .saga-graph-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
      gap: 10px;
    }
    @media (max-width: 860px) {
      .saga-graph-body {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .saga-graph-canvas {
      max-height: 70vh;
      overflow: auto;
      border: 1px solid var(--studio-subtle-border, #8884);
      border-radius: 6px;
      touch-action: pan-x pan-y;
    }
    .saga-graph-canvas svg {
      display: block;
    }
    .saga-graph-node rect {
      fill: var(--studio-surface, #fff1);
      stroke: currentColor;
      stroke-opacity: 0.45;
      stroke-width: 1.2;
    }
    .saga-graph-node[data-status='defined'] rect {
      stroke: #2e7dd7;
      stroke-opacity: 1;
      stroke-width: 2;
    }
    .saga-graph-node[data-status='shared'] rect {
      stroke: #8e5bd3;
      stroke-opacity: 1;
      stroke-dasharray: 5 3;
    }
    .saga-graph-node[data-kind='saga'] rect {
      fill: #2e7dd722;
    }
    .saga-graph-node[data-kind='instance'] rect {
      fill: #2e9d5722;
      stroke: #2e9d57;
      stroke-opacity: 1;
    }
    .saga-graph-node text {
      fill: currentColor;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      pointer-events: none;
    }
    .saga-graph-node .saga-graph-kind {
      font-size: 9px;
      opacity: 0.7;
      text-transform: uppercase;
    }
    .saga-graph-node {
      cursor: pointer;
      outline: none;
    }
    .saga-graph-node:focus-visible rect,
    .saga-graph-node[data-picked='true'] rect {
      stroke: #d49a00;
      stroke-opacity: 1;
      stroke-width: 3;
    }
    .saga-graph-edge {
      fill: none;
      stroke: currentColor;
      stroke-opacity: 0.35;
      stroke-width: 1.4;
    }
    .saga-graph-edge[data-class='flow'] {
      stroke: #2e7dd7;
      stroke-opacity: 0.7;
    }
    .saga-graph-edge[data-class='shared'] {
      stroke: #8e5bd3;
      stroke-dasharray: 6 4;
      stroke-opacity: 0.8;
    }
    .saga-graph-edge[data-class='world'] {
      stroke: #2e9d57;
      stroke-opacity: 0.7;
    }
    .saga-graph[data-picking='true'] .saga-graph-node:not([data-near='true']),
    .saga-graph[data-picking='true'] .saga-graph-edge:not([data-near='true']) {
      opacity: 0.18;
    }
    .saga-graph[data-picking='true'] .saga-graph-edge[data-near='true'] {
      stroke-opacity: 1;
      stroke-width: 2.2;
    }
    .saga-graph-details {
      padding: 8px;
      border: 1px solid var(--studio-subtle-border, #8884);
      border-radius: 6px;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .saga-graph-details ul {
      margin: 4px 0;
      padding-left: 18px;
    }
    .saga-graph-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 12px;
      opacity: 0.85;
    }
    .saga-graph-legend span::before {
      display: inline-block;
      width: 18px;
      margin-right: 4px;
      vertical-align: middle;
      border-top: 2px solid currentColor;
      content: '';
    }
    .saga-graph-legend [data-class='flow']::before {
      border-top-color: #2e7dd7;
    }
    .saga-graph-legend [data-class='shared']::before {
      border-top: 2px dashed #8e5bd3;
    }
    .saga-graph-legend [data-class='world']::before {
      border-top-color: #2e9d57;
    }
    .saga-graph .saga-graph-link {
      appearance: none;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      text-decoration: underline dotted;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .saga-graph table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .saga-graph th,
    .saga-graph td {
      padding: 4px 6px;
      border-bottom: 1px solid var(--studio-subtle-border, #8884);
      text-align: left;
      overflow-wrap: anywhere;
    }
  `;

  /**
   * Shows the graphs of a report in a root element.
   * @param {HTMLElement} root
   * @param {Object} params
   * @param {string} params.id - The view id; the projection, mode and zoom stay per id.
   * @param {{narrative:{nodes:Object[],edges:Object[]}, composition:{nodes:Object[],edges:Object[]}}} params.graphs
   * @param {(link:Object)=>void} params.onLink - Opens the editor of a node.
   */
  static paint(root, { id, graphs, onLink }) {
    const view = (SagaGraph.views[id] ??= { projection: 'narrative', mode: 'graph', zoom: null, picked: '' });
    const graph = graphs[view.projection] ?? { nodes: [], edges: [] };
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    if (!byId.has(view.picked)) view.picked = '';
    const toggle = (name, value, label, icon = '') =>
      html`<button
        type="button"
        class="studio-form-button saga-graph-toggle"
        data-name="${name}"
        data-value="${value}"
        aria-pressed="${view[name] === value}"
      >
        ${icon ? html`<i class="${icon}" aria-hidden="true"></i>` : ''} ${label}
      </button>`;
    const placed = layout(graph);
    const canvas =
      graph.nodes.length === 0
        ? html`<p class="studio-form-hint" style="padding: 12px;">This graph has no relationship yet.</p>`
        : view.mode === 'list'
          ? SagaGraph.tableHtml(graph, byId)
          : SagaGraph.svgHtml(graph, placed, ZOOMS[view.zoom ?? ZOOMS.indexOf(1)]);
    root.innerHTML = html`<style>
        ${SagaGraph.style}
      </style>
      <div class="saga-graph" data-picking="${Boolean(view.picked) && view.mode === 'graph'}">
        <div class="saga-graph-bar" role="toolbar" aria-label="Graph view">
          ${PROJECTIONS.map((projection) => toggle('projection', projection.id, projection.label, projection.icon)).join('')}
          <span style="flex: 1 1 1rem;"></span>
          ${toggle('mode', 'graph', 'Graph', 'fa-solid fa-diagram-project')}
          ${toggle('mode', 'list', 'Table', 'fa-solid fa-table-list')}
          ${
            view.mode === 'graph'
              ? html`<button
                    type="button"
                    class="studio-form-button saga-graph-zoom"
                    data-step="-1"
                    aria-label="Zoom out"
                  >
                    <i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="studio-form-button saga-graph-zoom" data-step="1" aria-label="Zoom in">
                    <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
                  </button>`
              : ''
          }
        </div>
        <div class="saga-graph-legend" aria-hidden="true">
          <span data-class="flow">Narrative flow</span><span>Dependency</span
          ><span data-class="shared">Shared or a place</span><span data-class="world">Owned map or world</span>
        </div>
        <p class="studio-form-hint">
          ${graph.nodes.length} nodes, ${graph.edges.length} relationships. Select a node to show its neighbours.
        </p>
        <div class="saga-graph-body">
          <div class="saga-graph-canvas">${canvas}</div>
          <div class="saga-graph-details" aria-live="polite">
            ${SagaGraph.detailsHtml(byId.get(view.picked), graph, byId)}
          </div>
        </div>
      </div>`;
    const svg = root.querySelector('.saga-graph-canvas svg');
    if (svg && view.zoom === null) {
      // A graph opens at the largest zoom that fits the width of its canvas, and stays readable.
      const width = root.querySelector('.saga-graph-canvas').clientWidth - 2;
      view.zoom = Math.max(
        READABLE_ZOOM,
        ZOOMS.findLastIndex((zoom) => placed.width * zoom <= width),
      );
      svg.setAttribute('width', Math.round(placed.width * ZOOMS[view.zoom]));
      svg.setAttribute('height', Math.round(placed.height * ZOOMS[view.zoom]));
    }
    const repaint = () => SagaGraph.paint(root, { id, graphs, onLink });
    const pick = (nodeId) => {
      view.picked = view.picked === nodeId ? '' : nodeId;
      repaint();
      root.querySelector(`[data-node="${CSS.escape(nodeId)}"]`)?.focus();
    };
    for (const button of root.querySelectorAll('.saga-graph-toggle'))
      button.onclick = () => {
        view[button.dataset.name] = button.dataset.value;
        if (button.dataset.name === 'projection') Object.assign(view, { picked: '', zoom: null });
        repaint();
      };
    for (const button of root.querySelectorAll('.saga-graph-zoom'))
      button.onclick = () => {
        view.zoom = Math.min(ZOOMS.length - 1, Math.max(0, (view.zoom ?? 0) + Number(button.dataset.step)));
        repaint();
      };
    for (const element of root.querySelectorAll('[data-node]')) {
      element.onclick = () => pick(element.dataset.node);
      element.onkeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        pick(element.dataset.node);
      };
    }
    for (const button of root.querySelectorAll('.saga-graph-neighbour'))
      button.onclick = () => pick(button.dataset.target);
    const open = root.querySelector('.saga-graph-open');
    if (open) open.onclick = () => onLink(byId.get(view.picked).link);
    if (view.picked && view.mode === 'graph') {
      const near = new Set([view.picked]);
      for (const edge of graph.edges)
        if (edge.from === view.picked || edge.to === view.picked) near.add(edge.from).add(edge.to);
      for (const element of root.querySelectorAll('[data-node]')) {
        element.dataset.near = String(near.has(element.dataset.node));
        element.dataset.picked = String(element.dataset.node === view.picked);
      }
      for (const element of root.querySelectorAll('.saga-graph-edge'))
        element.dataset.near = String(element.dataset.from === view.picked || element.dataset.to === view.picked);
    }
  }

  static svgHtml(graph, { point, width, height }, zoom) {
    const edges = graph.edges
      .map(
        (edge) =>
          html`<path
            class="saga-graph-edge"
            data-class="${EDGE_CLASSES[edge.type] ?? 'need'}"
            data-from="${escapeHtml(edge.from)}"
            data-to="${escapeHtml(edge.to)}"
            d="${edgePath(point(edge.from), point(edge.to))}"
            ><title>
              ${escapeHtml(`${edge.from} ${edge.type}${edge.count ? ` ×${edge.count}` : ''} ${edge.to}`)}
            </title></path
          >`,
      )
      .join('');
    const clip = (text, size) => (text.length > size ? `${text.slice(0, size - 1)}…` : text);
    const nodes = graph.nodes
      .map((node) => {
        const { x, y } = point(node.id);
        return html`<g
          class="saga-graph-node"
          data-node="${escapeHtml(node.id)}"
          data-kind="${escapeHtml(node.kind)}"
          data-status="${escapeHtml(node.status)}"
          transform="translate(${x},${y})"
          tabindex="0"
          role="button"
          aria-label="${escapeHtml(`${nodeName(node)}, ${node.status}`)}"
        >
          <title>${escapeHtml(`${node.id} (${node.status})`)}</title>
          <rect width="${NODE.width}" height="${NODE.height}" rx="6"></rect>
          <text class="saga-graph-kind" x="8" y="12">${escapeHtml(node.kind)}</text>
          <text x="8" y="28">${escapeHtml(clip(node.label, 24))}</text>
        </g>`;
      })
      .join('');
    return html`<svg
      width="${Math.round(width * zoom)}"
      height="${Math.round(height * zoom)}"
      viewBox="0 0 ${width} ${height}"
      role="group"
      aria-label="Relationship graph"
    >
      ${edges}${nodes}
    </svg>`;
  }

  static tableHtml(graph, byId) {
    const cell = (id) => {
      const node = byId.get(id);
      return html`<button type="button" class="saga-graph-link saga-graph-neighbour" data-target="${escapeHtml(id)}">
          ${escapeHtml(node.label)}</button
        ><br /><span class="studio-form-hint">${escapeHtml(node.kind)} · ${escapeHtml(node.status)}</span>`;
    };
    return html`<table>
      <caption class="studio-form-hint" style="text-align: left;">
        Every relationship of the graph, by source
      </caption>
      <thead>
        <tr>
          <th scope="col">From</th>
          <th scope="col">Relationship</th>
          <th scope="col">To</th>
        </tr>
      </thead>
      <tbody>
        ${[...graph.edges]
          .sort((a, b) => a.from.localeCompare(b.from) || a.type.localeCompare(b.type))
          .map(
            (edge) =>
              html`<tr>
                <td>${cell(edge.from)}</td>
                <td>${escapeHtml(edge.type)}${edge.count ? ` ×${edge.count}` : ''}</td>
                <td>${cell(edge.to)}</td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
  }

  static detailsHtml(node, graph, byId) {
    if (!node) return html`<span class="studio-form-hint">No node selected.</span>`;
    const neighbours = (edges, end) =>
      edges.length === 0
        ? html`<span class="studio-form-hint">None</span>`
        : html`<ul>
            ${edges
              .map(
                (edge) =>
                  html`<li>
                    ${escapeHtml(edge.type)}${edge.count ? ` ×${edge.count}` : ''}:
                    <button
                      type="button"
                      class="saga-graph-link saga-graph-neighbour"
                      data-target="${escapeHtml(edge[end])}"
                    >
                      ${escapeHtml(nodeName(byId.get(edge[end])))}
                    </button>
                  </li>`,
              )
              .join('')}
          </ul>`;
    return html`<strong>${escapeHtml(node.label)}</strong>
      <div class="studio-form-mono">${escapeHtml(node.id)}</div>
      <div class="studio-form-hint">
        ${escapeHtml(node.kind)} · ${escapeHtml(node.status)}${node.source ? ` · from ${escapeHtml(node.source)}` : ''}
      </div>
      ${
        node.link
          ? html`<button type="button" class="studio-form-button saga-graph-open" style="margin: 6px 0;">
              <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> ${linkLabel(node.link)}
            </button>`
          : ''
      }
      <div>
        <strong>Leads to</strong>${neighbours(
          graph.edges.filter(({ from }) => from === node.id),
          'to',
        )}
      </div>
      <div>
        <strong>Comes from</strong>${neighbours(
          graph.edges.filter(({ to }) => to === node.id),
          'from',
        )}
      </div>`;
  }
}

export { SagaGraph };
