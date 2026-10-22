/**
 * The form parts the Studio profile editors share: the field grid, the number and flag fields with
 * their bounds and defaults, the choice field, the toggle chips, the cards, rows and chips, and the
 * notice of unsaved changes. A field reports its value through `data-block` and `data-key`; a changed field shows it.
 *
 * @module src/client/components/cyberia/StudioFormCyberia.js
 */
import { escapeHtml } from '../core/VanillaJs.js';

/** "coinKillPercentVsBot" → "Coin Kill Percent Vs Bot". */
const labelOf = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const STUDIO_FORM_STYLE = css`
  .studio-form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 6px 12px;
    align-items: start;
  }
  .studio-form-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
    min-width: 0;
  }
  .studio-form-field input,
  .studio-form-field select,
  .studio-form-row input,
  .studio-form-row select {
    min-height: 32px;
    min-width: 0;
  }
  .studio-form-hint {
    font-size: 11px;
    opacity: 0.7;
  }
  .studio-form-changed > span:first-child {
    color: var(--studio-accent-warm, #f80);
  }
  .studio-form-card {
    padding: 8px;
    margin-bottom: 8px;
    border: 1px solid var(--studio-subtle-border, #8884);
    border-radius: 8px;
    font-size: 13px;
  }
  .studio-form-card h4 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  .studio-form-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .studio-form-row > input {
    flex: 1 1 10rem;
  }
  .studio-form button,
  .studio-form-button {
    min-height: 32px;
    padding: 4px 10px;
    border: 1px solid var(--studio-border, #8885);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .studio-form button:disabled,
  .studio-form-button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .studio-form-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--studio-tag, #8883);
    font-size: 12px;
  }
  .studio-form-chip.studio-form-bad {
    background: var(--studio-accent-warm, #f80);
    color: #000;
  }
  .studio-form-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--studio-border, #8885);
    border-radius: 16px;
    font-size: 13px;
    cursor: pointer;
  }
  .studio-form-toggle input[type='checkbox'] {
    flex: none;
    width: 16px;
    height: 16px;
    margin: 0;
  }
  .studio-form-toggle:has(input:checked) {
    background: var(--studio-tag, #8883);
  }
  .studio-form-toggle:has(input:disabled) {
    opacity: 0.5;
    cursor: default;
  }
  .studio-form-mono {
    font-family: monospace;
    overflow-wrap: anywhere;
  }
  .studio-form-dirty {
    padding: 4px 8px;
    border-left: 3px solid var(--studio-accent-warm, #f80);
    font-size: 12px;
  }
  .studio-form-split {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-start;
  }
  .studio-form-split > div {
    flex: 1 1 300px;
    min-width: 0;
  }
`;

/**
 * A number field with its bounds and default.
 * @param {{block?: string, key: string, value: number, bounds: number[], fallback: number, step?: number|string, disabled?: string}} field
 * @returns {string}
 */
const numberField = ({ block = '', key, value, bounds: [min, max], fallback, step = 1, disabled = '' }) =>
  html`<label class="studio-form-field ${value !== fallback ? 'studio-form-changed' : ''}">
    <span>${escapeHtml(labelOf(key))}</span>
    <input
      type="number"
      data-block="${block}"
      data-key="${key}"
      min="${min}"
      max="${max}"
      step="${step}"
      value="${escapeHtml(String(value))}"
      ${disabled}
    />
    <span class="studio-form-hint">${min}–${max}, default ${fallback}</span>
  </label>`;

/**
 * An allowed / refused field with its default.
 * @param {{block?: string, key: string, value: boolean, fallback: boolean, disabled?: string}} field
 * @returns {string}
 */
const flagField = ({ block = '', key, value, fallback, disabled = '' }) =>
  html`<label class="studio-form-field ${value !== fallback ? 'studio-form-changed' : ''}">
    <span>${escapeHtml(labelOf(key))}</span>
    <select data-block="${block}" data-key="${key}" data-flag="1" ${disabled}>
      <option value="true" ${value ? 'selected' : ''}>Allowed</option>
      <option value="false" ${value ? '' : 'selected'}>Refused</option>
    </select>
    <span class="studio-form-hint">default ${fallback ? 'allowed' : 'refused'}</span>
  </label>`;

/**
 * A choice among labelled values.
 * @param {{block?: string, key: string, label: string, value: string, options: Array<{value: string, label: string}>, hint?: string, disabled?: string}} field
 * @returns {string}
 */
const choiceField = ({ block = '', key, label, value, options, hint = '', disabled = '' }) =>
  html`<label class="studio-form-field">
    <span>${escapeHtml(label)}</span>
    <select data-block="${block}" data-key="${key}" ${disabled}>
      ${options
        .map(
          (option) =>
            html`<option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>
              ${escapeHtml(option.label)}
            </option>`,
        )
        .join('')}
    </select>
    ${hint ? html`<span class="studio-form-hint">${escapeHtml(hint)}</span>` : ''}
  </label>`;

/**
 * A toggle chip around a checkbox.
 * @param {{className?: string, block?: string, value: string, label: string, checked: boolean, disabled?: string}} toggle
 * @returns {string}
 */
const toggleField = ({ className = '', block = '', value, label, checked, disabled = '' }) =>
  html`<label class="studio-form-toggle"
    ><input
      type="checkbox"
      class="${className}"
      ${block ? `data-block="${block}"` : ''}
      value="${escapeHtml(value)}"
      ${checked ? 'checked' : ''}
      ${disabled}
    /><span>${escapeHtml(label)}</span></label
  >`;

/** The notice of unsaved changes, or nothing. */
const dirtyNotice = (dirty) =>
  dirty ? html`<div class="studio-form-dirty" role="status">Unsaved changes. Save to keep them.</div>` : '';

export { STUDIO_FORM_STYLE, choiceField, dirtyNotice, flagField, labelOf, numberField, toggleField };
