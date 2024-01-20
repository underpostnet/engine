import { s } from './VanillaJs.js';

const Input = {
  Render: async function (options) {
    const { id } = options;
    options?.placeholder ? (options.placeholder === true ? (options.placeholder = ' . . .') : null) : null;
    setTimeout(() => {
      s(`.input-container-${id}`).onclick = () =>
        ['color'].includes(options.type) ? s(`.${id}`).click() : s(`.${id}`).focus();
    });
    return html` <div class="inl input-container-${id} ${options?.containerClass ? options.containerClass : ''}">
      <div class="in">
        <div class="in input-label input-label-${id}">${options?.label ? options.label : ''}</div>
        <input
          type="${options?.type ? options.type : 'text'}"
          class="in ${id}"
          ${options?.min !== undefined ? `min="${options.min}"` : ''}
          placeholder${options?.placeholder ? `="${options.placeholder}"` : ''}
          ${options?.value !== undefined ? `value="${options.value}"` : ''}
          ${options?.autocomplete ? `autocomplete="${options.autocomplete}"` : ''}
        />
        <div class="in input-info input-info-${id}">&nbsp</div>
      </div>
    </div>`;
  },
  parseJsonEval: (selector) => {
    try {
      return JSON.parse(s(selector).value);
    } catch (error) {
      return s(selector).value;
    }
  },
};

export { Input };
