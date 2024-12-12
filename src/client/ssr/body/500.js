const s = (el) => document.querySelector(el);

const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);

const getLang = () =>
  (localStorage.getItem('lang') || navigator.language || navigator.userLanguage || s('html').lang)
    .slice(0, 2)
    .toLowerCase();

const main = () => {
  const Translate = {
    Data: {
      ['page-not-found']: {
        en: 'Page not found',
        es: 'Página no encontrada',
      },
      ['page-broken']: {
        es: 'Algo salio mal',
        en: 'Something went wrong',
      },
      ['back']: {
        en: 'Back to <br>  homepage',
        es: 'Volver a  <br> la pagina principal',
      },
    },
    Render: function (id) {
      return this.Data[id][getLang()] ? this.Data[id][getLang()] : this.Data[id]['en'];
    },
  };
  const icon = html`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 20 20">
    <path
      fill="currentColor"
      d="M6 2a2 2 0 0 0-2 2v5.207a5.5 5.5 0 0 1 1-.185V4a1 1 0 0 1 1-1h4v3.5A1.5 1.5 0 0 0 11.5 8H15v8a1 1 0 0 1-1 1h-3.6a5.5 5.5 0 0 1-.657 1H14a2 2 0 0 0 2-2V7.414a1.5 1.5 0 0 0-.44-1.06l-3.914-3.915A1.5 1.5 0 0 0 10.586 2zm8.793 5H11.5a.5.5 0 0 1-.5-.5V3.207zM10 14.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0M5.5 12a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0v-2a.5.5 0 0 0-.5-.5m0 5.125a.625.625 0 1 0 0-1.25a.625.625 0 0 0 0 1.25"
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
        <br />
        <span class="bold">500</span>
        <br />
        <br />${Translate.Render('page-broken')} <br />
        <br />
        <a href="${location.origin}">${Translate.Render('back')}</a>
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
