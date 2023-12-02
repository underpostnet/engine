import { s } from './VanillaJs.js';

const Input = {
  JumpingText: async function (options) {
    const { id, inputComponentId = 'jumping-text-input' } = options;
    setTimeout(() => {
      s(`.${inputComponentId}-label-${id}`).onclick = () => s(`.${id}`).focus();
    });
    return html`
      <div class="in ${inputComponentId}-container ${inputComponentId}-container-${id}">
        <div class="in">
          <input type="text" class="${inputComponentId} ${id}" placeholder />
          <label class="${inputComponentId}-label ${inputComponentId}-label-${id}"
            >${options.label}
            <div class="inl ${inputComponentId}-info ${inputComponentId}-info-${id}"></div>
          </label>
        </div>
      </div>
    `;
  },
};

export { Input };
