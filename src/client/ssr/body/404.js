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
  const icon = html`
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M15.097 5.904A6.5 6.5 0 0 0 4 10.504l.001 1h-2v-1a8.5 8.5 0 1 1 15.176 5.258l5.344 5.345l-1.414 1.414l-5.344-5.345A8.48 8.48 0 0 1 10.5 19h-1v-2h1a6.5 6.5 0 0 0 4.596-11.096M1.672 13.257L4.5 16.086l2.829-2.829l1.414 1.415L5.915 17.5l2.828 2.828l-1.414 1.415L4.5 18.914l-2.828 2.829l-1.414-1.415L3.086 17.5L.258 14.672z"
      />
    </svg>
  `;
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
        <span class="bold">404</span>
        <br />
        <br />${Translate.Render('page-not-found')} <br />
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
