import { escapeHtml } from './VanillaJs.js';

/** Tabs of editor tools. The tab list pins under the CRUD bar while its panel scrolls. */
class Tabs {
  static style = css`
    .editor-tabs {
      min-width: 0;
      width: 100%;
    }
    .editor-tab-list {
      position: sticky;
      top: calc(var(--editor-tools-top, var(--editor-stage-top, 0px)) + var(--editor-crud-height, 0px));
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--studio-border, #8885);
      background: var(--editor-stage-background);
    }
    .editor-tab-list > button {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 10px;
      margin: 0;
      border: 0;
      border-bottom: 3px solid transparent;
      border-radius: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      opacity: 0.7;
    }
    .editor-tab-list > button > img {
      width: 1.25em;
      height: 1.25em;
      image-rendering: pixelated;
    }
    .editor-tab-list > button[aria-selected='true'] {
      border-bottom-color: var(--studio-positive, #2196f3);
      font-weight: bold;
      opacity: 1;
    }
    .editor-tab-list > button:hover {
      background: #8882;
      opacity: 1;
    }
    .editor-tab-list > button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }
    .editor-tab-panel {
      min-width: 0;
      display: flow-root;
    }
    .editor-tab-panel[hidden] {
      display: none;
    }
  `;

  /**
   * @param {Object} params
   * @param {string} params.id
   * @param {string} params.label - What the tab list is for.
   * @param {Array<{id: string, label: string, icon?: string, image?: string, content: string}>} params.tabs -
   *   `icon` is a Font Awesome class; `image` is the URL of an icon image.
   * @param {string} [params.selected] - The tab open first.
   */
  static render({ id, label, tabs, selected = tabs[0]?.id }) {
    const active = tabs.some((tab) => tab.id === selected) ? selected : tabs[0]?.id;
    return html`<style>
        ${Tabs.style}
      </style>
      <div class="editor-tabs ${escapeHtml(id)}" data-active-tab="${escapeHtml(active || '')}">
        <div class="editor-tab-list" role="tablist" aria-label="${escapeHtml(label)}">
          ${tabs
            .map(
              (tab) =>
                html`<button
                  type="button"
                  role="tab"
                  id="${escapeHtml(id)}-tab-${escapeHtml(tab.id)}"
                  data-tab="${escapeHtml(tab.id)}"
                  aria-controls="${escapeHtml(id)}-panel-${escapeHtml(tab.id)}"
                  aria-selected="${tab.id === active}"
                  tabindex="${tab.id === active ? 0 : -1}"
                >
                  ${tab.icon ? html`<i class="${escapeHtml(tab.icon)}" aria-hidden="true"></i>` : ''}${
                    tab.image ? html`<img src="${escapeHtml(tab.image)}" alt="" />` : ''
                  }${escapeHtml(tab.label)}
                </button>`,
            )
            .join('')}
        </div>
        ${tabs
          .map(
            (tab) =>
              html`<div
                class="editor-tab-panel"
                role="tabpanel"
                id="${escapeHtml(id)}-panel-${escapeHtml(tab.id)}"
                data-panel="${escapeHtml(tab.id)}"
                aria-labelledby="${escapeHtml(id)}-tab-${escapeHtml(tab.id)}"
                tabindex="0"
                ${tab.id === active ? '' : 'hidden'}
              >
                ${tab.content}
              </div>`,
          )
          .join('')}
      </div>`;
  }

  static buttons(root) {
    return [...(root?.querySelectorAll(':scope > .editor-tab-list > [role="tab"]') || [])];
  }

  static select(root, id) {
    const buttons = Tabs.buttons(root);
    if (!buttons.some((button) => button.dataset.tab === id)) return false;
    for (const button of buttons) {
      const selected = button.dataset.tab === id;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const panel of root.querySelectorAll(':scope > [role="tabpanel"]')) panel.hidden = panel.dataset.panel !== id;
    root.dataset.activeTab = id;
    return true;
  }

  static bind(root, { onChange = () => {} } = {}) {
    const buttons = Tabs.buttons(root);
    const activate = (button) => {
      const id = button.dataset.tab;
      const changed = root.dataset.activeTab !== id;
      if (Tabs.select(root, id) && changed) onChange(id);
    };
    buttons.forEach((button, index) => {
      button.onclick = () => activate(button);
      button.onkeydown = (event) => {
        let next;
        switch (event.key) {
          case 'ArrowRight':
            next = (index + 1) % buttons.length;
            break;
          case 'ArrowLeft':
            next = (index + buttons.length - 1) % buttons.length;
            break;
          case 'Home':
            next = 0;
            break;
          case 'End':
            next = buttons.length - 1;
            break;
          default:
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        buttons[next].focus();
        activate(buttons[next]);
      };
    });
  }
}

export { Tabs };
