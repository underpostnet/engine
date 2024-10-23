const getLang = () => 'es'; // navigator.language || navigator.userLanguage;
const s = (el) => document.querySelector(el);
const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);
const s4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);

const range = (start, end) => {
  return end < start
    ? range(end, start).reverse()
    : Array.apply(0, Array(end - start + 1)).map((element, index) => index + start);
};
const timer = (ms) => new Promise((res) => setTimeout(res, ms));
const htmls = (el, html) => (s(el).innerHTML = html);

const newInstance = (obj) => {
  // structuredClone() 2022 ES6 feature
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    return { error: error.message };
  }
};

// <strong class="ssr-secondary-color ssr-lore-text"

const borderChar = (px, color, selectors) => {
  if (selectors) {
    return selectors
      .map(
        (selector) => html`
          <style>
            ${selector} {
              text-shadow: ${px}px -${px}px ${px}px ${color}, -${px}px ${px}px ${px}px ${color},
                -${px}px -${px}px ${px}px ${color}, ${px}px ${px}px ${px}px ${color};
            }
          </style>
        `,
      )
      .join('');
  }
  return html`
    text-shadow: ${px}px -${px}px ${px}px ${color}, -${px}px ${px}px ${px}px ${color}, -${px}px -${px}px ${px}px
    ${color}, ${px}px ${px}px ${px}px ${color};
  `;
};

const framesLore = () => range(0, 2);

const LoreScreen = async () => {
  const translate = [
    {
      en: html``,

      es: html` Año 2120. La Tierra, la que alguna vez fue una vibrante esfera azul, ahora pende de un precario
      equilibrio. Un único evento cataclísmico alteró irrevocablemente el curso de la humanidad.`,
    },
    {
      en: html``,
      es: html`En 2045, un desastre nuclear devastador sacudió la República Popular del Este, desencadenando una
      reacción en cadena de mutaciones genéticas.`,
    },
    {
      en: html``,

      es: html`Sumado a eso experimentos biológicos clandestinos, amplificaron la devastación, dando origen a una plaga
      que transformó gran parte de la vida terrestre en criaturas grotescas y hostiles.`,
    },
  ];
  let autoSlideLore = true;
  let currentFrame = 0;

  const frameRender = async () => {
    if (currentFrame > framesLore().length - 1) currentFrame = framesLore().length - 1;
    else if (currentFrame < 0) {
      currentFrame = 0;
      return;
    }
    htmls('.ssr-lore-container', translate[currentFrame][getLang().match('es') ? 'es' : 'en']);
    for (const _frame of framesLore()) {
      s(`.ssr-background-image-lore-${_frame}`).style.opacity = _frame === currentFrame ? 1 : 0;
    }
    if (currentFrame === 0) {
      s(`.ssr-lore-arrow-left`).style.display = 'none';
      s(`.ssr-lore-arrow-right`).style.display = 'block';
    } else if (currentFrame === framesLore().length - 1) {
      s(`.ssr-lore-arrow-left`).style.display = 'block';
      s(`.ssr-lore-arrow-right`).style.display = 'none';
    } else {
      s(`.ssr-lore-arrow-left`).style.display = 'block';
      s(`.ssr-lore-arrow-right`).style.display = 'block';
    }
    await timer(10000);
  };

  s(`.ssr-lore-arrow-left`).onclick = () => {
    autoSlideLore = false;
    currentFrame--;
    frameRender();
  };
  s(`.ssr-lore-arrow-right`).onclick = () => {
    autoSlideLore = false;
    currentFrame++;
    frameRender();
  };

  for (const frame of framesLore()) {
    currentFrame = frame;
    if (!autoSlideLore) continue;
    await frameRender();
  }
};

SrrComponent = ({ host, path, storage }) => html`
  <div class="ssr-background-cyberia-lore" style="opacity: 1">
    <style>
      .ssr-background-cyberia-lore {
        position: absolute;
        display: block;
        background: #1a1a1a;
        color: #ffcc00;
        width: 100%;
        height: 100%;
        top: 0px;
        left: 0px;
        z-index: 10;
        transition: 0.3s;
        font-size: 18px;
        font-weight: bold;
        font-family: monospace;
        overflow: hidden;
      }
      .ssr-center {
        position: absolute;
        display: block;
        transform: translate(-50%, -50%);
        top: 50%;
        left: 50%;
        width: 100%;
        text-align: center;
      }
      .ssr-logo-cyberia {
        width: 50px;
        height: 50px;
        user-drag: none;
        -webkit-user-drag: none;
        user-select: none;
        -moz-user-select: none;
        -webkit-user-select: none;
        -ms-user-select: none;
      }

      .ssr-loading-bar {
        position: relative;
        display: flow-root;
        width: 100px;
        border: 2px solid #333333;
        border-radius: 5px;
        margin: 5px;
      }
      .ssr-loading-info {
        font-size: 10px;
        margin: 5px;
        float: left;
        position: relative;
        display: block;
        min-width: 500px;
      }

      .ssr-loading-bar-block {
        display: block;
        position: relative;
        border: 2px solid #333333;
        border-radius: 5px;
        margin: 2px;
        width: 12px;
        height: 12px;
        background: #ffcc00;
        float: left;
      }

      @keyframes ssr-blink-animation {
        50% {
          opacity: 0;
        }
      }
      .ssr-blink-bar {
        animation: ssr-blink-animation 1s linear infinite;
      }
      .ssr-loading-container {
        position: absolute;
        display: block;
        bottom: 0px;
      }
      .ssr-lore-text {
        display: block;
        position: relative;
        margin: 5px;
      }
      .ssr-lore-text {
        color: white;
        font-size: 13px;
        font-weight: normal;
      }
      .ssr-secondary-color {
        color: #ffcc00;
      }
      .ssr-lore-container {
        /* color: white; */
        /* color: #000000; */
        color: #dbdbdb;
        font-size: 17px;
        display: block;
        position: relative;
        padding: 13px;
        margin-top: 50px;
      }
      .clean-cache-container {
        /* background: #1a1a1a !important; */
        background: #000000 !important;
      }
      .ssr-background-image-lore {
        position: absolute;
        display: block;
      }
      .ssr-background-image-lore {
        background-size: cover;
        background-position: center;
        height: 100vh;
        width: 100vw;
        object-fit: cover;
        z-index: -1;
        top: 0px;
        left: 0px;
        pointer-events: none;
        transition: 0.3s;
      }
      ${framesLore()
          .map(
            (i) => `.ssr-background-image-lore-${i} {
        background-image: url('${storage[`lore${i}`]}');
      }`,
          )
          .join('')}
        .ssr-background-image-lore-gradient {
        position: absolute;
        display: block;
        top: 0px;
        left: 0px;
        width: 100vw;
        height: 100vh;
        background: linear-gradient(
          to bottom,
          #000000 0%,
          #000000df 24%,
          #000000ab 30%,
          #0000000f 46%,
          #00000024 59%,
          #00000032 71%,
          #00000098 84%,
          #000000e6 100%
        );
        /* opacity: 0.5; */
      }
      .ssr-lore-arrow-container {
        width: 35px;
        height: 35px;
        display: block;
        position: absolute;
        cursor: pointer;
      }
      .ssr-lore-arrow-right {
        bottom: 50px;
        right: 10px;
      }
      .ssr-lore-arrow-left {
        bottom: 50px;
        right: 70px;
      }
      .ssr-lore-arrow {
        width: 35px;
        height: 35px;
        display: block;
        position: relative;
      }
      .ssr-lore-arrow:hover {
        width: 40px;
        height: 40px;
      }
    </style>
    ${borderChar(1, '#000000', ['.ssr-lore-container'])}
    ${framesLore()
      .map((i) => html`<div class="ssr-background-image-lore ssr-background-image-lore-${i}" style="opacity: 0"></div>`)
      .join('')}

    <div class="ssr-background-image-lore-gradient"></div>

    <div class="ssr-lore-container"></div>

    <div class="ssr-lore-arrow-container ssr-lore-arrow-left" style="display:none">
      <img class="ssr-lore-arrow ssr-center" src="${storage['arrow-left']}" />
    </div>
    <div class="ssr-lore-arrow-container ssr-lore-arrow-right">
      <img class="ssr-lore-arrow ssr-center" src="${storage['arrow-right']}" />
    </div>

    <div class="ssr-loading-container">
      <div class="ssr-loading-bar"><div class="ssr-loading-bar-block ssr-blink-bar"></div></div>
      <div class="ssr-loading-info">
        <span style="color: white">Connecting </span>
        ...${`${host}${path}`.slice(-30)}
      </div>
    </div>
    <script>
      {
        const s = ${s};
        const htmls = ${htmls};
        const newInstance = ${newInstance};
        const range = ${range};
        const s4 = ${s4};
        const append = ${append};
        const timer = ${timer};
        const getLang = ${getLang};
        const LoreScreen = ${LoreScreen};
        const framesLore = ${framesLore};

        LoreScreen();
      }
    </script>
  </div>
`;
