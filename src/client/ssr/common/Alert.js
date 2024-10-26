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

const noInternet = async ({ Translate }) => {
  const icon = html`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 20 20">
    <path
      fill="currentColor"
      d="M10 18q.128 0 .254-.004a5.5 5.5 0 0 1-.698-1.083c-.536-.207-1.098-.793-1.578-1.821A9.3 9.3 0 0 1 7.42 13.5h1.672q.096-.52.284-1h-2.17A15 15 0 0 1 7 10c0-.883.073-1.725.206-2.5h5.588c.092.541.156 1.115.186 1.713q.48-.138.992-.188a16 16 0 0 0-.165-1.525h2.733c.251.656.406 1.36.448 2.094q.543.276 1.008.66A8 8 0 1 0 10 18m0-15c.657 0 1.407.59 2.022 1.908c.217.466.406 1.002.559 1.592H7.419c.153-.59.342-1.126.56-1.592C8.592 3.59 9.342 3 10 3M7.072 4.485A10.5 10.5 0 0 0 6.389 6.5H3.936a7.02 7.02 0 0 1 3.778-3.118c-.241.33-.456.704-.642 1.103M6.192 7.5A16 16 0 0 0 6 10c0 .87.067 1.712.193 2.5H3.46A7 7 0 0 1 3 10c0-.88.163-1.724.46-2.5zm.197 6c.176.743.407 1.422.683 2.015c.186.399.401.773.642 1.103A7.02 7.02 0 0 1 3.936 13.5zm5.897-10.118A7.02 7.02 0 0 1 16.064 6.5H13.61a10.5 10.5 0 0 0-.683-2.015a6.6 6.6 0 0 0-.642-1.103M19 14.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0M14.5 12a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0v-2a.5.5 0 0 0-.5-.5m0 5.125a.625.625 0 1 0 0-1.25a.625.625 0 0 0 0 1.25"
    />
  </svg>`;
  return html` <div class="abs center" style="top: 45%">
    ${icon}
    <br />
    <br />${Translate('no-internet-connection')}
  </div>`;
};

const e404 = async ({ Translate }) => {
  const icon = html`
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M15.097 5.904A6.5 6.5 0 0 0 4 10.504l.001 1h-2v-1a8.5 8.5 0 1 1 15.176 5.258l5.344 5.345l-1.414 1.414l-5.344-5.345A8.48 8.48 0 0 1 10.5 19h-1v-2h1a6.5 6.5 0 0 0 4.596-11.096M1.672 13.257L4.5 16.086l2.829-2.829l1.414 1.415L5.915 17.5l2.828 2.828l-1.414 1.415L4.5 18.914l-2.828 2.829l-1.414-1.415L3.086 17.5L.258 14.672z"
      />
    </svg>
  `;
  return html` <div class="abs center" style="top: 45%">
    ${icon}
    <br />
    <br />
    <span class="bold">404</span>
    <br />
    <br />${Translate('page-not-found')} <br />
    <br />
    <a href="${location.origin}">${Translate('back')}</a>
  </div>`;
};

const e500 = async ({ Translate }) => {
  const icon = html`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 20 20">
    <path
      fill="currentColor"
      d="M6 2a2 2 0 0 0-2 2v5.207a5.5 5.5 0 0 1 1-.185V4a1 1 0 0 1 1-1h4v3.5A1.5 1.5 0 0 0 11.5 8H15v8a1 1 0 0 1-1 1h-3.6a5.5 5.5 0 0 1-.657 1H14a2 2 0 0 0 2-2V7.414a1.5 1.5 0 0 0-.44-1.06l-3.914-3.915A1.5 1.5 0 0 0 10.586 2zm8.793 5H11.5a.5.5 0 0 1-.5-.5V3.207zM10 14.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0M5.5 12a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0v-2a.5.5 0 0 0-.5-.5m0 5.125a.625.625 0 1 0 0-1.25a.625.625 0 0 0 0 1.25"
    />
  </svg>`;
  return html` <div class="abs center" style="top: 45%">
    ${icon}
    <br />
    <br />
    <span class="bold">500</span>
    <br />
    <br />${Translate('page-broken')} <br />
    <br />
    <a href="${location.origin}">${Translate('back')}</a>
  </div>`;
};

const Alert = { maintenance, noInternet, e404, e500 };

export { Alert, e404 };
