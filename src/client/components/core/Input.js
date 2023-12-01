const Input = {
  JumpingText: async function (options) {
    const { id } = options;
    const inputComponentId = 'jumping-text-input';
    return html`
      <div class="${inputComponentId}-container ${inputComponentId}-container-${id}">
        <div class="in">
          <input type="text" class="${inputComponentId} ${inputComponentId}-${id}" placeholder />
          <label class="${inputComponentId}-label ${inputComponentId}-label-${id}">${options.label}</label>
        </div>
        <div class="in ${inputComponentId}-info ${inputComponentId}-info-${id}"></div>
      </div>
    `;
  },
};

export { Input };
