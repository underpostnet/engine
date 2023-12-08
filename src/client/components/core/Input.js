import { s } from './VanillaJs.js';

const Input = {
  Render: async function (options) {
    const { id } = options;
    options?.placeholder ? (options.placeholder === true ? (options.placeholder = ' . . .') : null) : null;
    setTimeout(() => {
      s(`.input-container-${id}`).onclick = () => s(`.${id}`).focus();
    });
    return html` <div class="inl input-container-${id} ${options?.containerClass ? options.containerClass : ''}">
      <div class="in">
        <div class="in input-label input-label-${id}">${options?.label ? options.label : ''}</div>
        <input type="text" class="in ${id}" placeholder${options?.placeholder ? `="${options.placeholder}"` : ''} />
        <div class="in input-info input-info-${id}">&nbsp</div>
      </div>
    </div>`;
  },
};

export { Input };
