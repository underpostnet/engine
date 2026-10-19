/**
 * The graph canvas of the Cyberia Studio: nodes on the integer cells of a graph layout (see
 * `LAYOUT_CELL_LIMIT` in SharedDefaultsCyberia.js) and the edges between them. A node moves to a
 * free cell by drag, or by the arrow keys once selected; the canvas pans by drag and zooms by wheel,
 * pinch or its buttons. Moving a node changes its cell only: the caller owns the layout and the edges.
 * Read-only, the canvas drops the empty rows and columns of the layout; the cells stay as authored.
 *
 * @module src/client/components/cyberia/GraphLayoutCyberia.js
 */
import { LAYOUT_CELL_LIMIT } from './SharedDefaultsCyberia.js';
import { escapeHtml } from '../core/VanillaJs.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL = 200;
const NODE = 168;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 1.2;
const DRAG_SLOP = 4;
const STATUS_LABELS = Object.freeze({ available: 'Online', draining: 'Closing', offline: 'Offline' });

const cellKey = (x, y) => `${x},${y}`;

/** Text cut with an ellipsis to `max` characters; the node keeps it whole in its tooltip and label. */
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const svg = (tag, attributes = {}, text = '') => {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text) element.textContent = text;
  return element;
};

class GraphLayoutCyberia {
  static style = css`
    .graph-layout {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .graph-layout-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .graph-layout-toolbar > button {
      appearance: none;
      min-width: 40px;
      min-height: 40px;
      border: 1px solid var(--studio-border, #8885);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .graph-layout-toolbar > button:hover {
      background: #8882;
    }
    .graph-layout-toolbar > button:focus-visible,
    .graph-layout-node:focus-visible {
      outline: 2px solid var(--studio-accent, #2196f3);
      outline-offset: 2px;
    }
    .graph-layout-hint {
      flex: 1 1 12rem;
      font-size: 12px;
      opacity: 0.7;
    }
    .graph-layout-canvas {
      width: 100%;
      height: clamp(320px, 60vh, 720px);
      border: 1px solid var(--studio-border, #8885);
      border-radius: 8px;
      background: var(--studio-card, transparent);
      touch-action: none;
      user-select: none;
      cursor: grab;
    }
    .graph-layout-canvas.panning {
      cursor: grabbing;
    }
    .graph-layout-grid-line {
      stroke: var(--studio-subtle-border, #8883);
      stroke-width: 1;
    }
    .graph-layout-edge {
      stroke: var(--studio-accent, #2196f3);
      stroke-width: 3;
      fill: none;
    }
    .graph-layout-edge-label {
      font: 12px monospace;
      fill: currentColor;
      paint-order: stroke;
      stroke: var(--studio-card, #fff);
      stroke-width: 4px;
    }
    .graph-layout-arrow {
      fill: var(--studio-accent, #2196f3);
    }
    .graph-layout-node {
      cursor: pointer;
    }
    .graph-layout-node.editable {
      cursor: move;
    }
    .graph-layout-node-surface {
      fill: var(--studio-subtle-border, #8883);
    }
    .graph-layout-node-box {
      fill: none;
      stroke: transparent;
      stroke-width: 2;
    }
    .graph-layout-node.selected .graph-layout-node-box {
      stroke: var(--studio-accent-warm, #f80);
      stroke-width: 4;
    }
    .graph-layout-node.current .graph-layout-node-box {
      stroke: var(--studio-positive, #393);
    }
    .graph-layout-node.muted {
      opacity: 0.5;
    }
    .graph-layout-node.blocked .graph-layout-node-box {
      stroke: #e53935;
      stroke-dasharray: 6 4;
    }
    .graph-layout-node-label {
      font: bold 13px sans-serif;
      fill: currentColor;
    }
    .graph-layout-node-sublabel,
    .graph-layout-node-note {
      font: 11px monospace;
      fill: currentColor;
      opacity: 0.75;
    }
    .graph-layout-node-strip {
      fill: var(--studio-card, #fff);
      opacity: 0.85;
    }
    .graph-layout-status-available {
      fill: #2e7d32;
    }
    .graph-layout-status-draining {
      fill: #f9a825;
    }
    .graph-layout-status-offline {
      fill: #9e9e9e;
    }
    .graph-layout-empty {
      padding: 12px;
      font-size: 13px;
      opacity: 0.8;
    }
    .graph-layout-live {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `;

  /**
   * The canvas markup. Call {@link GraphLayoutCyberia.bind} once it is in the page.
   * @param {{id: string, label: string}} params - `label` names the graph for assistive technology.
   */
  static render({ id, label }) {
    return html`<style>
        ${GraphLayoutCyberia.style}
      </style>
      <div class="graph-layout ${escapeHtml(id)}">
        <div class="graph-layout-toolbar" role="toolbar" aria-label="${escapeHtml(label)} view">
          <button type="button" data-graph="zoom-in" title="Zoom in" aria-label="Zoom in">
            <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
          </button>
          <button type="button" data-graph="zoom-out" title="Zoom out" aria-label="Zoom out">
            <i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i>
          </button>
          <button type="button" data-graph="fit" title="Fit the graph" aria-label="Fit the graph">
            <i class="fa-solid fa-expand" aria-hidden="true"></i>
          </button>
          <span class="graph-layout-hint"></span>
        </div>
        <svg class="graph-layout-canvas" role="group" aria-label="${escapeHtml(label)}">
          <defs>
            <pattern id="${escapeHtml(id)}-grid" width="${CELL}" height="${CELL}" patternUnits="userSpaceOnUse">
              <path class="graph-layout-grid-line" d="M ${CELL} 0 L 0 0 0 ${CELL}" fill="none" />
            </pattern>
            <marker
              id="${escapeHtml(id)}-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path class="graph-layout-arrow" d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          <g class="graph-layout-viewport">
            <rect
              x="${-(LAYOUT_CELL_LIMIT + 0.5) * CELL}"
              y="${-(LAYOUT_CELL_LIMIT + 0.5) * CELL}"
              width="${(LAYOUT_CELL_LIMIT * 2 + 1) * CELL}"
              height="${(LAYOUT_CELL_LIMIT * 2 + 1) * CELL}"
              fill="url(#${escapeHtml(id)}-grid)"
              transform="translate(${CELL / 2} ${CELL / 2})"
            />
            <g class="graph-layout-edges"></g>
            <g class="graph-layout-nodes"></g>
            <g class="graph-layout-labels"></g>
          </g>
        </svg>
        <div class="graph-layout-empty" hidden></div>
        <div class="graph-layout-live" aria-live="polite"></div>
      </div>`;
  }

  /**
   * Wires the canvas under `root`.
   * @param {Element} root - The element `render` produced.
   * @param {Object} handlers
   * @param {() => boolean} [handlers.editable] - Whether nodes move now.
   * @param {(code: string, x: number, y: number) => void} [handlers.onMove] - A node took a free cell.
   * @param {(code: string|null) => void} [handlers.onSelect] - A node was selected, or none.
   * @returns {{update: (graph: {nodes: Object[], edges: Object[], selected?: string|null, empty?: string, hint?: string}) => void, fit: () => void}}
   *   Each node is `{code, label, sublabel?, note?, x, y, image?, status?, current?, muted?, loops?}`; each edge
   *   `{source, target, bidirectional?, label?}`.
   */
  static bind(root, { editable = () => true, onMove = () => {}, onSelect = () => {}, onDestroy = () => {} } = {}) {
    const events = new AbortController();
    const canvas = root.querySelector('.graph-layout-canvas');
    const edgeLayer = root.querySelector('.graph-layout-edges');
    const labelLayer = root.querySelector('.graph-layout-labels');
    const nodeLayer = root.querySelector('.graph-layout-nodes');
    const empty = root.querySelector('.graph-layout-empty');
    const hint = root.querySelector('.graph-layout-hint');
    const live = root.querySelector('[aria-live]');
    const marker = `url(#${root.querySelector('marker').id})`;
    const graph = { nodes: [], edges: [], selected: null, byCode: new Map() };
    const view = { x: 0, y: 0, scale: 1 };
    let positions = new Map();
    let editing = editable();
    const pointers = new Map();
    let gesture = null;

    const size = () => canvas.getBoundingClientRect();
    const apply = () => {
      const { width, height } = size();
      canvas.setAttribute('viewBox', `${view.x} ${view.y} ${width / view.scale} ${height / view.scale}`);
    };
    const toWorld = (clientX, clientY) => {
      const rect = size();
      return { x: view.x + (clientX - rect.left) / view.scale, y: view.y + (clientY - rect.top) / view.scale };
    };
    const zoomAt = (factor, clientX, clientY) => {
      const before = toWorld(clientX, clientY);
      view.scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.scale * factor));
      const rect = size();
      view.x = before.x - (clientX - rect.left) / view.scale;
      view.y = before.y - (clientY - rect.top) / view.scale;
      apply();
    };
    const zoomCenter = (factor) => {
      const rect = size();
      zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };
    const fit = () => {
      const { width, height } = size();
      if (!width || !height) return;
      if (graph.nodes.length === 0) {
        Object.assign(view, { scale: 1, x: -width / 2, y: -height / 2 });
        return apply();
      }
      const xs = graph.nodes.map((node) => positions.get(node.code).x);
      const ys = graph.nodes.map((node) => positions.get(node.code).y);
      const padding = NODE / 2 + 24;
      const left = Math.min(...xs) - padding;
      const top = Math.min(...ys) - padding;
      const spanX = Math.max(...xs) + padding - left;
      const spanY = Math.max(...ys) + padding - top;
      view.scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(width / spanX, height / spanY)));
      view.x = left - (width / view.scale - spanX) / 2;
      view.y = top - (height / view.scale - spanY) / 2;
      apply();
    };

    const occupied = (code) =>
      new Set(graph.nodes.filter((node) => node.code !== code).map((node) => cellKey(node.x, node.y)));
    const cellAt = ({ x, y }) => ({
      x: Math.max(-LAYOUT_CELL_LIMIT, Math.min(LAYOUT_CELL_LIMIT, Math.round(x / CELL))),
      y: Math.max(-LAYOUT_CELL_LIMIT, Math.min(LAYOUT_CELL_LIMIT, Math.round(y / CELL))),
    });
    const nodeOf = (code) => graph.byCode.get(code);
    const select = (code) => {
      graph.selected = code;
      for (const element of nodeLayer.children) {
        element.classList.toggle('selected', element.dataset.code === code);
        element.setAttribute('aria-pressed', String(element.dataset.code === code));
      }
      onSelect(code);
    };
    const move = (node, cell) => {
      if (occupied(node.code).has(cellKey(cell.x, cell.y))) {
        live.textContent = `Cell ${cell.x}, ${cell.y} holds another node`;
        return false;
      }
      if (cell.x === node.x && cell.y === node.y) return false;
      live.textContent = `${node.label} moved to cell ${cell.x}, ${cell.y}`;
      onMove(node.code, cell.x, cell.y);
      return true;
    };

    const drawEdges = () => {
      edgeLayer.replaceChildren();
      labelLayer.replaceChildren();
      const half = NODE / 2;
      for (const edge of graph.edges) {
        const a = nodeOf(edge.source);
        const b = nodeOf(edge.target);
        if (!a || !b || a === b) continue;
        const ax = positions.get(a.code).x,
          ay = positions.get(a.code).y,
          bx = positions.get(b.code).x,
          by = positions.get(b.code).y;
        const length = Math.hypot(bx - ax, by - ay);
        if (!length) continue;
        const ux = (bx - ax) / length,
          uy = (by - ay) / length;
        // An edge leaves a square node at its border.
        const reach = half / Math.max(Math.abs(ux), Math.abs(uy));
        const line = svg('line', {
          class: 'graph-layout-edge',
          x1: ax + ux * reach,
          y1: ay + uy * reach,
          x2: bx - ux * reach,
          y2: by - uy * reach,
          'marker-end': marker,
        });
        if (edge.bidirectional) line.setAttribute('marker-start', marker);
        edgeLayer.append(line);
        if (edge.label)
          labelLayer.append(
            svg(
              'text',
              { class: 'graph-layout-edge-label', x: (ax + bx) / 2, y: (ay + by) / 2 - 6, 'text-anchor': 'middle' },
              edge.label,
            ),
          );
      }
    };

    const nodeElement = (node) => {
      const group = svg('g', {
        class: [
          'graph-layout-node',
          editable() ? 'editable' : '',
          node.code === graph.selected ? 'selected' : '',
          node.current ? 'current' : '',
          node.muted ? 'muted' : '',
        ]
          .filter(Boolean)
          .join(' '),
        transform: `translate(${positions.get(node.code).x} ${positions.get(node.code).y})`,
        tabindex: 0,
        role: 'button',
        'data-code': node.code,
        'aria-pressed': node.code === graph.selected,
        'aria-label': [
          node.label,
          node.sublabel,
          node.status ? STATUS_LABELS[node.status] : '',
          node.note,
          `cell ${node.x}, ${node.y}`,
        ]
          .filter(Boolean)
          .join(', '),
      });
      const h = NODE / 2;
      group.append(svg('rect', { class: 'graph-layout-node-surface', x: -h, y: -h, width: NODE, height: NODE }));
      if (node.image) {
        const image = svg('image', {
          href: node.image,
          x: -h,
          y: -h,
          width: NODE,
          height: NODE,
          preserveAspectRatio: 'xMidYMid meet',
        });
        image.addEventListener('error', () => image.remove(), { once: true });
        group.append(image);
      }
      group.append(
        svg('rect', { class: 'graph-layout-node-strip', x: -h + 2, y: h - 34, width: NODE - 4, height: 32, rx: 4 }),
      );
      group.append(
        svg(
          'text',
          { class: 'graph-layout-node-label', x: 0, y: h - 20, 'text-anchor': 'middle' },
          clip(node.label, 19),
        ),
      );
      if (node.sublabel)
        group.append(
          svg(
            'text',
            { class: 'graph-layout-node-sublabel', x: 0, y: h - 7, 'text-anchor': 'middle' },
            clip(node.sublabel, 15),
          ),
        );
      if (node.status) {
        group.append(svg('circle', { class: `graph-layout-status-${node.status}`, cx: -h + 12, cy: -h + 12, r: 6 }));
        group.append(
          svg('text', { class: 'graph-layout-node-note', x: -h + 22, y: -h + 16 }, STATUS_LABELS[node.status]),
        );
      }
      if (node.note)
        group.append(svg('text', { class: 'graph-layout-node-note', x: -h + 6, y: -h + 32 }, clip(node.note, 16)));
      if (node.loops)
        group.append(
          svg(
            'text',
            { class: 'graph-layout-node-note', x: h - 6, y: -h + 16, 'text-anchor': 'end' },
            `↻ ${node.loops}`,
          ),
        );
      group.append(svg('rect', { class: 'graph-layout-node-box', x: -h, y: -h, width: NODE, height: NODE }));
      group.append(svg('title', {}, group.getAttribute('aria-label')));
      return group;
    };

    const update = ({ nodes, edges, selected = graph.selected, empty: message = '', hint: text = '' }) => {
      const first = graph.nodes.length === 0 || editing !== editable();
      editing = editable();
      const xs = [...new Set(nodes.map(({ x }) => x))].sort((a, b) => a - b);
      const ys = [...new Set(nodes.map(({ y }) => y))].sort((a, b) => a - b);
      positions = new Map(
        nodes.map((node) => [
          node.code,
          {
            x: (editing ? node.x : xs.indexOf(node.x)) * CELL,
            y: (editing ? node.y : ys.indexOf(node.y)) * CELL,
          },
        ]),
      );
      const focused = nodeLayer.contains(document.activeElement) ? document.activeElement.dataset.code : null;
      Object.assign(graph, { nodes, edges, selected, byCode: new Map(nodes.map((node) => [node.code, node])) });
      nodeLayer.replaceChildren(...nodes.map(nodeElement));
      drawEdges();
      empty.hidden = nodes.length > 0 || !message;
      empty.textContent = message;
      hint.textContent = text;
      if (focused) nodeLayer.querySelector(`[data-code="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
      if (first && nodes.length > 0) fit();
    };

    const listen = (type, handler, options = {}) =>
      canvas.addEventListener(type, handler, { ...options, signal: events.signal });
    listen('pointerdown', (event) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        gesture = { kind: 'pinch', distance: Math.hypot(p.x - q.x, p.y - q.y) };
        return;
      }
      const target = event.target.closest('.graph-layout-node');
      target?.focus({ preventScroll: true });
      gesture =
        target && editable()
          ? { kind: 'node', code: target.dataset.code, element: target, start: event, moved: false }
          : { kind: 'pan', code: target?.dataset.code, start: event, last: event, moved: false };
      if (!target || !editable()) canvas.classList.add('panning');
    });
    listen('pointermove', (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture.kind === 'pinch' && pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        const distance = Math.hypot(p.x - q.x, p.y - q.y);
        if (gesture.distance > 0) zoomAt(distance / gesture.distance, (p.x + q.x) / 2, (p.y + q.y) / 2);
        gesture.distance = distance;
        return;
      }
      const dx = event.clientX - gesture.start.clientX,
        dy = event.clientY - gesture.start.clientY;
      if (!gesture.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      gesture.moved = true;
      if (gesture.kind === 'pan') {
        view.x -= (event.clientX - gesture.last.clientX) / view.scale;
        view.y -= (event.clientY - gesture.last.clientY) / view.scale;
        gesture.last = event;
        return apply();
      }
      if (!editable()) return;
      const world = toWorld(event.clientX, event.clientY);
      const cell = cellAt(world);
      gesture.cell = cell;
      gesture.element.setAttribute('transform', `translate(${world.x} ${world.y})`);
      gesture.element.classList.toggle('blocked', occupied(gesture.code).has(cellKey(cell.x, cell.y)));
    });
    const release = (event) => {
      pointers.delete(event.pointerId);
      if (!gesture || pointers.size > 0) return;
      const done = gesture;
      gesture = null;
      canvas.classList.remove('panning');
      if (done.kind === 'pan' && !done.moved) return select(done.code ?? null);
      if (done.kind !== 'node') return;
      const node = nodeOf(done.code);
      if (!node) return;
      if (!done.moved) return select(done.code);
      if (!done.cell || !move(node, done.cell)) update({ ...graph });
    };
    listen('pointerup', release);
    listen('pointercancel', (event) => {
      pointers.delete(event.pointerId);
      gesture = null;
      canvas.classList.remove('panning');
      update({ ...graph });
    });
    listen(
      'wheel',
      (event) => {
        event.preventDefault();
        zoomAt(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX, event.clientY);
      },
      { passive: false },
    );
    listen('keydown', (event) => {
      const target = event.target.closest?.('.graph-layout-node');
      if (!target) return;
      const node = nodeOf(target.dataset.code);
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        return select(node.code);
      }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!step || !editable() || node.code !== graph.selected) return;
      event.preventDefault();
      move(node, cellAt({ x: (node.x + step[0]) * CELL, y: (node.y + step[1]) * CELL }));
      root.querySelector(`.graph-layout-node[data-code="${CSS.escape(node.code)}"]`)?.focus();
    });
    root.querySelector('[data-graph="zoom-in"]').onclick = () => zoomCenter(ZOOM_STEP);
    root.querySelector('[data-graph="zoom-out"]').onclick = () => zoomCenter(1 / ZOOM_STEP);
    root.querySelector('[data-graph="fit"]').onclick = fit;
    const resize = new ResizeObserver(fit);
    const removal = new MutationObserver(() => {
      if (!root.isConnected) destroy();
    });
    const destroy = () => {
      if (events.signal.aborted) return;
      events.abort();
      resize.disconnect();
      removal.disconnect();
      for (const button of root.querySelectorAll('[data-graph]')) button.onclick = null;
      pointers.clear();
      onDestroy();
    };
    resize.observe(canvas);
    removal.observe(root.getRootNode(), { childList: true, subtree: true });
    fit();
    return { update, fit, destroy };
  }
}

export { GraphLayoutCyberia };
