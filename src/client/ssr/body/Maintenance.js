const s = (el) => document.querySelector(el);

const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);

const getLang = () =>
  (localStorage.getItem('lang') || navigator.language || navigator.userLanguage || s('html').lang)
    .slice(0, 2)
    .toLowerCase();

const main = () => {
  const Translate = {
    Data: {
      ['server-maintenance']: {
        en: "The server is under maintenance <br> we'll be back soon.",
        es: 'El servidor está en mantenimiento <br> volveremos pronto.',
      },
    },
    Render: function (id) {
      return this.Data[id][getLang()] ? this.Data[id][getLang()] : this.Data[id]['en'];
    },
  };
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

  append(
    'body',
    html` <style>
        body {
          font-family: arial;
          font-size: 20px;
          background-color: #d8d8d8;
          color: #333;
        }
        a {
          color: black;
        }
      </style>

      <div class="abs center" style="top: 45%">
        ${icon}
        <br />
        <br />${Translate.Render('server-maintenance')}
      </div>`,
  );
};

SrrComponent = () => html`<script>
  {
    const s = ${s};
    const append = ${append};
    const getLang = ${getLang};
    const main = ${main};
    window.onload = main;
  }
</script>`;
