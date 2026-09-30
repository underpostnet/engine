/**
 * The CRUD surface of a studio editor: a bar of New, Save, Clone, Reset and Delete over the
 * document the form holds, and the requests behind those buttons.
 *
 * `bind` reads a state function after every action and on `refresh`: the subject, the loaded
 * document and one handler per action. The bar hides an action without a handler; Clone, Reset and
 * Delete need a loaded document. New starts a blank document and Reset reloads the stored one:
 * both drop unsaved changes, so both ask first, as Delete does. A clone takes a fresh code. The bar
 * pins at `--editor-tools-top` while the tools scroll, and keeps its height in
 * `--editor-crud-height` on its parent, where the tab list below it pins.
 *
 * @module src/client/components/core/EditorCrud.js
 */
import { Modal } from './Modal.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { escapeHtml } from './VanillaJs.js';

const ACTIONS = Object.freeze([
  {
    id: 'new',
    icon: 'fa-solid fa-file',
    label: 'New',
    question: ({ subject }) => `Start a new ${subject}? Unsaved changes are lost.`,
  },
  { id: 'save', icon: 'fa-solid fa-floppy-disk', label: 'Save' },
  { id: 'clone', icon: 'fa-solid fa-clone', label: 'Clone', loaded: true },
  {
    id: 'reset',
    icon: 'fa-solid fa-rotate-left',
    label: 'Reset',
    loaded: true,
    question: ({ subject, name }) => `Reset the ${subject} "${name}" to its saved state? Unsaved changes are lost.`,
  },
  { id: 'delete', icon: 'fa-solid fa-trash', label: 'Delete', loaded: true },
]);

class EditorCrud {
  static style = css`
    .editor-crud {
      position: sticky;
      top: var(--editor-tools-top, var(--editor-stage-top, 0px));
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      padding: 6px 8px;
      margin-bottom: 10px;
      border: 1px solid var(--studio-border, #8885);
      border-radius: 8px;
      background: var(--editor-stage-background);
    }
    .editor-crud-status {
      flex: 1 1 10rem;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    }
    .editor-crud-subject {
      opacity: 0.7;
    }
    .editor-crud-name {
      font-family: monospace;
      font-weight: bold;
    }
    .editor-crud-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .editor-crud-actions > button {
      appearance: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      margin: 0;
      border: 1px solid var(--studio-border, #8885);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .editor-crud-actions > button[hidden] {
      display: none;
    }
    .editor-crud-actions > button:hover:not(:disabled) {
      background: #8882;
    }
    .editor-crud-actions > button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    .editor-crud-actions > button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .editor-crud-actions > button[data-crud='save'] {
      border-color: var(--studio-positive, #2196f3);
    }
    .editor-crud-actions > button[data-crud='delete']:hover:not(:disabled) {
      border-color: #e53935;
      color: #e53935;
    }
  `;

  /**
   * The bar, with every action hidden until `bind` shows the ones the editor handles.
   * @param {{id: string, label: string, slot?: string}} params - `slot` places the bar in a named
   *   slot of the element that holds it.
   */
  static render({ id, label, slot }) {
    return html`<style>
        ${EditorCrud.style}
      </style>
      <div
        class="editor-crud ${escapeHtml(id)}"
        role="toolbar"
        aria-label="${escapeHtml(label)}"
        ${slot ? `slot="${escapeHtml(slot)}"` : ''}
      >
        <div class="editor-crud-status" aria-live="polite"></div>
        <div class="editor-crud-actions">
          ${ACTIONS.map(
            (action) =>
              html`<button type="button" data-crud="${action.id}" hidden>
                <i class="${action.icon}" aria-hidden="true"></i>${action.label}
              </button>`,
          ).join('')}
        </div>
      </div>`;
  }

  /**
   * Wires the bar under `root`. A running action locks the bar, so a double click never saves twice.
   * @param {Element} root - The element that `render` produced.
   * @param {() => {subject: string, id?: string, name?: string, new?: Function, save?: Function,
   *   clone?: Function, reset?: Function, delete?: Function}} state - The loaded document (`id`,
   *   and the `name` to show) and the handler of each action the editor offers now.
   * @returns {{refresh: () => void}}
   */
  static bind(root, state) {
    new ResizeObserver(() =>
      root.parentElement.style.setProperty('--editor-crud-height', `${root.offsetHeight}px`),
    ).observe(root);
    const status = root.querySelector('.editor-crud-status');
    const buttons = [...root.querySelectorAll('[data-crud]')].map((button) => ({
      button,
      action: ACTIONS.find(({ id }) => id === button.dataset.crud),
    }));
    let busy = false;
    const refresh = () => {
      const current = state();
      status.innerHTML = current.id
        ? html`<span class="editor-crud-subject">${escapeHtml(current.subject)}</span>
            <span class="editor-crud-name">${escapeHtml(current.name || '—')}</span>`
        : html`<span class="editor-crud-subject">New ${escapeHtml(current.subject)}</span>`;
      for (const { button, action } of buttons) {
        button.hidden = typeof current[action.id] !== 'function';
        button.disabled = busy || (!!action.loaded && !current.id);
      }
    };
    for (const { button, action } of buttons)
      button.onclick = async () => {
        const current = state();
        busy = true;
        refresh();
        try {
          if (!action.question || (await EditorCrud.confirm(action.id, action.question(current))))
            await current[action.id]();
        } finally {
          busy = false;
          refresh();
        }
      };
    refresh();
    return { refresh };
  }

  /** Asks the author `question`. Resolves to true on a confirmation. */
  static async confirm(action, question) {
    const answer = await Modal.RenderConfirm({
      id: `editor-crud-${action}-confirm`,
      html: async () => html`<div class="in section-mp" style="text-align: center">${escapeHtml(question)}</div>`,
    });
    return answer.status === 'confirm';
  }

  /** Says how a request went: its error, else the message of `successKey`. */
  static notify(result, successKey) {
    NotificationManager.Push({
      html: result.status === 'success' ? Translate.instance(successKey) : result.message,
      status: result.status,
    });
  }

  /** Puts the loaded document `id`, else posts `body` as a new one. */
  static async save(service, { id, body }) {
    const result = id ? await service.put({ id, body }) : await service.post({ body });
    EditorCrud.notify(result, id ? 'success-update-item' : 'success-create-item');
    return result;
  }

  /**
   * Posts a copy of `body`. With `codeKey`, the copy takes the code `<code>-clone`.
   * @returns {Promise<{result: object, body: object}>} The result and the copy it posted.
   */
  static async clone(service, body, codeKey) {
    const copy = codeKey ? { ...body, [codeKey]: `${body[codeKey]}-clone` } : body;
    const result = await service.post({ body: copy });
    EditorCrud.notify(result, 'success-create-item');
    return { result, body: copy };
  }

  /** Deletes the document `id` once the author confirms. Resolves to null without an id or a confirmation. */
  static async remove(service, { id, subject, name }) {
    if (!id || !(await EditorCrud.confirm('delete', `Delete the ${subject} "${name || id}"?`))) return null;
    const result = await service.delete({ id });
    EditorCrud.notify(result, 'item-success-delete');
    return result;
  }
}

export { EditorCrud };
