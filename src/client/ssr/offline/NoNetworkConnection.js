const s = (el) => document.querySelector(el);

const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);

const getLang = () =>
  (localStorage.getItem('lang') || navigator.language || navigator.userLanguage || s('html').lang)
    .slice(0, 2)
    .toLowerCase();

const main = () => {
  const Translate = {
    Data: {
      ['no-internet-connection']: {
        en: 'No internet connection <br> verify your network',
        es: 'Sin conexión a internet <br> verifica tu red',
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
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 20 20">
      <path
        fill="currentColor"
        d="M10 18q.128 0 .254-.004a5.5 5.5 0 0 1-.698-1.083c-.536-.207-1.098-.793-1.578-1.821A9.3 9.3 0 0 1 7.42 13.5h1.672q.096-.52.284-1h-2.17A15 15 0 0 1 7 10c0-.883.073-1.725.206-2.5h5.588c.092.541.156 1.115.186 1.713q.48-.138.992-.188a16 16 0 0 0-.165-1.525h2.733c.251.656.406 1.36.448 2.094q.543.276 1.008.66A8 8 0 1 0 10 18m0-15c.657 0 1.407.59 2.022 1.908c.217.466.406 1.002.559 1.592H7.419c.153-.59.342-1.126.56-1.592C8.592 3.59 9.342 3 10 3M7.072 4.485A10.5 10.5 0 0 0 6.389 6.5H3.936a7.02 7.02 0 0 1 3.778-3.118c-.241.33-.456.704-.642 1.103M6.192 7.5A16 16 0 0 0 6 10c0 .87.067 1.712.193 2.5H3.46A7 7 0 0 1 3 10c0-.88.163-1.724.46-2.5zm.197 6c.176.743.407 1.422.683 2.015c.186.399.401.773.642 1.103A7.02 7.02 0 0 1 3.936 13.5zm5.897-10.118A7.02 7.02 0 0 1 16.064 6.5H13.61a10.5 10.5 0 0 0-.683-2.015a6.6 6.6 0 0 0-.642-1.103M19 14.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0M14.5 12a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0v-2a.5.5 0 0 0-.5-.5m0 5.125a.625.625 0 1 0 0-1.25a.625.625 0 0 0 0 1.25"
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
        <br />${Translate.Render('no-internet-connection')} <br />
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