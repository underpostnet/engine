const s = (el) => document.querySelector(el);

const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);

const getLang = () =>
  (localStorage.getItem('lang') || navigator.language || navigator.userLanguage || s('html').lang)
    .slice(0, 2)
    .toLowerCase();

const main = () => {
  const Translate = {
    Data: {
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
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 32 32">
      <g fill="none">
        <g filter="url(#f2465id5)">
          <path fill="#A5D9FF" d="m21.066 4.43l6.992 6.992l-16.926 16.926a4.944 4.944 0 1 1-6.992-6.992z" />
        </g>
        <g filter="url(#f2465id6)"><path fill="#C6EFFF" d="m23.37 7.524l1.653 1.653L17 17.199l-1.653-1.652z" /></g>
        <g filter="url(#f2465id7)">
          <path fill="#D1F884" d="m26.112 13.368l-14.98 14.98a4.944 4.944 0 1 1-6.992-6.992l7.988-7.988z" />
          <path fill="url(#f2465id0)" d="m26.112 13.368l-14.98 14.98a4.944 4.944 0 1 1-6.992-6.992l7.988-7.988z" />
        </g>
        <path fill="url(#f2465id1)" d="M14.761 10.735L13.6 11.897l2.093 2.092a.822.822 0 0 0 1.162-1.162z" />
        <path fill="url(#f2465id2)" d="m9.097 16.398l1.162-1.162l2.085 2.085a.822.822 0 1 1-1.162 1.162z" />
        <path fill="url(#f2465id3)" d="m4.589 20.907l1.162-1.162l2.084 2.084a.822.822 0 0 1-1.163 1.162z" />
        <g filter="url(#f2465id8)">
          <path
            fill="#A9D8FF"
            d="M19.55 2.617a1.47 1.47 0 0 0 0 2.079l8.242 8.242a1.47 1.47 0 0 0 2.078-2.079l-8.242-8.242a1.47 1.47 0 0 0-2.078 0"
          />
          <path
            fill="url(#f2465id4)"
            d="M19.55 2.617a1.47 1.47 0 0 0 0 2.079l8.242 8.242a1.47 1.47 0 0 0 2.078-2.079l-8.242-8.242a1.47 1.47 0 0 0-2.078 0"
          />
        </g>
        <g filter="url(#f2465id9)"><path fill="#C4ECFF" d="m19.916 4.001l1.11-1.11l8.376 8.374l-1.111 1.111z" /></g>
        <defs>
          <linearGradient id="f2465id0" x1="25.761" x2="17.074" y1="13.875" y2="16.875" gradientUnits="userSpaceOnUse">
            <stop offset=".203" stop-color="#E9EB7E" />
            <stop offset="1" stop-color="#E9EB7E" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="f2465id1" x1="16.761" x2="14.011" y1="14.063" y2="11.469" gradientUnits="userSpaceOnUse">
            <stop stop-color="#138979" />
            <stop offset="1" stop-color="#2E7B65" />
          </linearGradient>
          <linearGradient id="f2465id2" x1="12.252" x2="9.508" y1="18.557" y2="15.969" gradientUnits="userSpaceOnUse">
            <stop stop-color="#138979" />
            <stop offset="1" stop-color="#2E7B65" />
          </linearGradient>
          <linearGradient id="f2465id3" x1="7.743" x2="5" y1="23.065" y2="20.477" gradientUnits="userSpaceOnUse">
            <stop stop-color="#138979" />
            <stop offset="1" stop-color="#2E7B65" />
          </linearGradient>
          <linearGradient id="f2465id4" x1="28.786" x2="28.656" y1="13.521" y2="11.86" gradientUnits="userSpaceOnUse">
            <stop stop-color="#A8C3FF" />
            <stop offset="1" stop-color="#A8C3FF" stop-opacity="0" />
          </linearGradient>
          <filter
            id="f2465id5"
            width="25.366"
            height="25.366"
            x="2.692"
            y="4.43"
            color-interpolation-filters="sRGB"
            filterUnits="userSpaceOnUse"
          >
            <feFlood flood-opacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
            <feOffset />
            <feGaussianBlur stdDeviation="1" />
            <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
            <feColorMatrix values="0 0 0 0 0.745098 0 0 0 0 0.85098 0 0 0 0 0.964706 0 0 0 1 0" />
            <feBlend in2="shape" result="effect1_innerShadow_18_24902" />
          </filter>
          <filter
            id="f2465id6"
            width="13.675"
            height="13.675"
            x="13.347"
            y="5.524"
            color-interpolation-filters="sRGB"
            filterUnits="userSpaceOnUse"
          >
            <feFlood flood-opacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feGaussianBlur result="effect1_foregroundBlur_18_24902" stdDeviation="1" />
          </filter>
          <filter
            id="f2465id7"
            width="26.42"
            height="17.178"
            x="2.692"
            y="12.618"
            color-interpolation-filters="sRGB"
            filterUnits="userSpaceOnUse"
          >
            <feFlood flood-opacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
            <feOffset dx="4" dy="-.75" />
            <feGaussianBlur stdDeviation="1.5" />
            <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
            <feColorMatrix values="0 0 0 0 0.505882 0 0 0 0 0.811765 0 0 0 0 0.34902 0 0 0 1 0" />
            <feBlend in2="shape" result="effect1_innerShadow_18_24902" />
            <feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
            <feOffset dy="-.4" />
            <feGaussianBlur stdDeviation=".5" />
            <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
            <feColorMatrix values="0 0 0 0 0.788235 0 0 0 0 0.843137 0 0 0 0 0.898039 0 0 0 1 0" />
            <feBlend in2="effect1_innerShadow_18_24902" result="effect2_innerShadow_18_24902" />
            <feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
            <feOffset dx=".4" dy="-.4" />
            <feGaussianBlur stdDeviation=".5" />
            <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
            <feColorMatrix values="0 0 0 0 0.67451 0 0 0 0 0.839216 0 0 0 0 0.623529 0 0 0 1 0" />
            <feBlend in2="effect2_innerShadow_18_24902" result="effect3_innerShadow_18_24902" />
          </filter>
          <filter
            id="f2465id8"
            width="11.181"
            height="11.181"
            x="19.12"
            y="2.187"
            color-interpolation-filters="sRGB"
            filterUnits="userSpaceOnUse"
          >
            <feFlood flood-opacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
            <feOffset />
            <feGaussianBlur stdDeviation=".5" />
            <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
            <feColorMatrix values="0 0 0 0 0.658824 0 0 0 0 0.776471 0 0 0 0 0.937255 0 0 0 1 0" />
            <feBlend in2="shape" result="effect1_innerShadow_18_24902" />
          </filter>
          <filter
            id="f2465id9"
            width="10.986"
            height="10.986"
            x="19.166"
            y="2.14"
            color-interpolation-filters="sRGB"
            filterUnits="userSpaceOnUse"
          >
            <feFlood flood-opacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feGaussianBlur result="effect1_foregroundBlur_18_24902" stdDeviation=".375" />
          </filter>
        </defs>
      </g>
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
        <span class="bold">Test Page</span>
        <br />
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
