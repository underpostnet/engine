const maintenance = async ({ Translate }) => {
  const icon = html`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24">
    <path
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zm9 13H6a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h10.5m-.5 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0m2-3.5V16m0 4v1.5m3.032-5.25l-1.299.75m-3.463 2l-1.3.75m0-3.5l1.3.75m3.463 2l1.3.75M7 8v.01M7 16v.01"
    />
  </svg>`;
  return html` <div class="abs center" style="top: 45%">
    ${icon}
    <br />
    <br />${Translate('server-maintenance')}
  </div>`;
};

const e404 = async () => {
  return html`<span style="color: black">e404</span>`;
};

const Alert = { maintenance, e404 };

export { Alert, e404 };
