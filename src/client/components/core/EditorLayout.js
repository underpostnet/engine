/**
 * The layout of a studio editor: a stage (a canvas or a table, with its readout) pinned to the top
 * of the scroll container, and the tools beside it while both fit on one line, else under it. A
 * button in the stage bar hides and shows the stage view.
 *
 * `render` carries the styles, so the layout works in a shadow root too. `pin` sets the offset and
 * the background the stage reads: `--editor-stage-top` and `--editor-stage-background`. `bind`
 * keeps `--editor-tools-top`, where a bar of the tools pins: under the stage when the tools sit
 * under it.
 *
 * @module src/client/components/core/EditorLayout.js
 */
import { ThemeEvents } from './Css.js';

const EYE = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const eyeIcon = (visible) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${EYE}${visible ? '' : '<path d="M3 3l18 18"/>'}</svg>`;
const toggleLabel = (subject, visible) => `${visible ? 'Hide' : 'Show'} the ${subject}`;

class EditorLayout {
  static style = css`
    .editor-layout {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
    }
    .editor-stage {
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      position: sticky;
      top: var(--editor-stage-top, 0px);
      z-index: 2;
      background: var(--editor-stage-background);
    }
    .editor-stage-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .editor-stage-view {
      width: fit-content;
      max-width: 100%;
      max-height: 60vh;
      overflow: auto;
      scrollbar-gutter: stable;
    }
    .editor-tools {
      flex: 999 1 0;
      min-width: min(100%, 26rem);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .editor-stage-toggle {
      appearance: none;
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      margin: 0;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .editor-stage-toggle:hover {
      background: rgba(127, 127, 127, 0.2);
    }
    .editor-stage-toggle svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }
  `;

  /**
   * @param {Object} params
   * @param {string} params.subject - What the stage shows, for the toggle label: `canvas`, `table`.
   * @param {string} params.stage - The canvas or the table.
   * @param {string} params.tools - The tools and sections the editor operates with.
   * @param {string} [params.readout] - What the stage bar shows beside the toggle.
   */
  static render({ subject, stage, tools, readout = '' }) {
    const label = toggleLabel(subject, true);
    return html`<style>
        ${EditorLayout.style}
      </style>
      <div class="editor-layout">
        <div class="editor-stage">
          <div class="editor-stage-bar">
            <button
              type="button"
              class="editor-stage-toggle"
              data-subject="${subject}"
              title="${label}"
              aria-label="${label}"
            >
              ${eyeIcon(true)}
            </button>
            ${readout}
          </div>
          <div class="editor-stage-view">${stage}</div>
        </div>
        <div class="editor-tools">${tools}</div>
      </div>`;
  }

  /** Wires the stage toggles and the tools offset of the layouts under a root: an element or a shadow root. */
  static bind(root) {
    for (const toggle of root.querySelectorAll('.editor-stage-toggle'))
      toggle.onclick = () => {
        const view = toggle.closest('.editor-stage').querySelector('.editor-stage-view');
        view.hidden = !view.hidden;
        const label = toggleLabel(toggle.dataset.subject, !view.hidden);
        toggle.title = label;
        toggle.setAttribute('aria-label', label);
        toggle.innerHTML = eyeIcon(!view.hidden);
      };
    for (const layout of root.querySelectorAll('.editor-layout')) {
      const stage = layout.querySelector(':scope > .editor-stage');
      const tools = layout.querySelector(':scope > .editor-tools');
      const place = () =>
        layout.style.setProperty(
          '--editor-tools-top',
          tools.offsetLeft < stage.offsetLeft + stage.offsetWidth
            ? `calc(var(--editor-stage-top, 0px) + ${stage.offsetHeight}px)`
            : 'var(--editor-stage-top, 0px)',
        );
      const observer = new ResizeObserver(place);
      observer.observe(layout);
      observer.observe(stage);
    }
  }

  /**
   * Pins the stages and tool bars of the modal around a node under its bar, in its background, and
   * keeps both current across theme changes.
   * @param {Element} node - An element inside the modal.
   * @param {string} key - The theme event key of the editor.
   */
  static pin(node, key) {
    const modal = node.closest('.modal');
    if (!modal) return;
    const apply = () => {
      if (!modal.isConnected) return delete ThemeEvents[key];
      const bar = modal.querySelector('.bar-default-modal');
      modal.style.setProperty('--editor-stage-top', `${bar ? bar.offsetHeight : 0}px`);
      modal.style.setProperty('--editor-stage-background', getComputedStyle(modal).backgroundColor);
    };
    apply();
    ThemeEvents[key] = apply;
  }
}

export { EditorLayout };
