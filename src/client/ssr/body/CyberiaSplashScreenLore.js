const range = (start, end) => {
  return end < start
    ? range(end, start).reverse()
    : Array.apply(0, Array(end - start + 1)).map((element, index) => index + start);
};

const timer = (ms) => new Promise((res) => setTimeout(res, ms));

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
const fullScreenIn = () => {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.mozRequestFullScreen) {
    /* Firefox */
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) {
    /* Chrome, Safari & Opera */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    /* IE/Edge */
    elem = window.top.document.body; //To break out of frame in IE
    elem.msRequestFullscreen();
  }
};
const getLang = () =>
  (localStorage.getItem('lang') || navigator.language || navigator.userLanguage || s('html').lang)
    .slice(0, 2)
    .toLowerCase();
const s = (el) => document.querySelector(el);
const htmls = (el, html) => (s(el).innerHTML = html);

const framesLore = () => range(0, 8);

const LoreScreen = async () => {
  const translate = [
    {
      en: html`Year 2120. Earth, once a vibrant blue sphere, now hangs by a thread. A single cataclysmic event
      irrevocably altered the course of humanity.`,
      es: html`Año 2120. La Tierra, otrora una vibrante esfera azul, ahora pende de un hilo. Un único evento
      cataclísmico alteró irrevocablemente el curso de la humanidad.`,
    },
    {
      en: html`In 2045, a devastating nuclear disaster rocked the People's Republic of the Orient, triggering a chain
      reaction of genetic mutations.`,
      es: html`En 2045, un devastador desastre nuclear sacudió la República Popular de Oriente, desencadenando una
      reacción en cadena de mutaciones genéticas.`,
    },
    {
      en: html`Later, a leak of clandestine biological experiments gave rise to a plague that transformed much of
      terrestrial life into hostile creatures.`,
      es: html`Tiempo después, una fuga de experimentos biológicos clandestinos dio origen a una plaga que transformó
      gran parte de la vida terrestre en criaturas hostiles.`,
    },
    {
      en: html`With a third of the planet uninhabitable, humanity was forced to seek a new home beyond the stars. Thus,
        the so-called <span class="ssr-secondary-color">Colonists</span> embarked on this mission.`,
      es: html`Con un tercio del planeta inhabitable, la humanidad se vio forzada a buscar un nuevo hogar más allá de
        las estrellas. Así fue como los denominados <span class="ssr-secondary-color">Colonos</span> emprendieron esta
        misión.`,
    },
    {
      en: html`However, in the exclusion zones, humans who survived the radiation mutations or genetic experiments were
        rejected by the colonists. Thus, these <span class="ssr-secondary-color">Mutagens</span> swore vengeance on
        their former humanity.`,
      es: html`Sin embargo, en las zonas de exclusión, humanos sobrevivientes a las mutaciones de radiación o
        experimentos genéticos, fueron rechazados por los colonos. Así, estos
        <span class="ssr-secondary-color">Mutagénicos</span> juraron venganza sobre su ex-humanidad.`,
    },
    {
      en: html`Artificial intelligences, through nanotechnology and integrated transistors, created fully
        <span class="ssr-secondary-color">Synthetic</span> humanoids. Some were created to serve the colonists, others,
        however, desire something more.`,
      es: html`Inteligencias artificiales a través de la nanotecnología y transistores integrados crearon humanoides
        completamente <span class="ssr-secondary-color">Sintéticos</span>. Algunos fueron creados para servir a los
        colonos, otros, sin embargo, desean algo más.`,
    },
    {
      en: html`The proliferation of hyperrealities, digital worlds so realistic they were indistinguishable from the
      real world, allowed neohumans to escape the isolation of a hostile universe, but at the same time they were under
      the watchful eye of the space cyber powers.`,
      es: html`La proliferación de las hiperrealidades, mundos digitales tan realistas que eran indistinguibles de la
      realidad, permitió a los neohumanos escapar del aislamiento de un universo hostil, pero al mismo tiempo estar bajo
      el asecho de las cyber potencias espaciales.`,
    },
    {
      en: html`Today, humanity lives in ring-shaped space stations, asteroids, and extrasolar planets.`,
      es: html`Hoy, la humanidad vive en estaciones espaciales en forma de anillo, asteroides y planetas extrasolares.`,
    },
    {
      en: html`Welcome to Cyberia. Explore, find your path, and carve out your space in the new neo-humanity.`,
      es: html`Bienvenido a Cyberia. Explora, encuentra tu camino y hazte un espacio en la nueva neo-humanidad.`,
    },
  ];
  let autoSlideLore = true;
  let currentFrame = 0;

  const frameRender = async () => {
    if (currentFrame > framesLore().length - 1) currentFrame = 0;
    else if (currentFrame < 0) {
      currentFrame = framesLore().length - 1;
    }
    htmls('.ssr-lore-container', translate[currentFrame][getLang()]);
    for (const _frame of framesLore()) {
      s(`.ssr-background-image-lore-${_frame}`).style.opacity = _frame === currentFrame ? 1 : 0;
    }
    // if (currentFrame === 0) {
    //   s(`.ssr-lore-arrow-left`).style.display = 'none';
    //   s(`.ssr-lore-arrow-right`).style.display = 'block';
    // } else if (currentFrame === framesLore().length - 1) {
    //   s(`.ssr-lore-arrow-left`).style.display = 'block';
    //   s(`.ssr-lore-arrow-right`).style.display = 'none';
    // } else {
    //   s(`.ssr-lore-arrow-left`).style.display = 'block';
    //   s(`.ssr-lore-arrow-right`).style.display = 'block';
    // }
    htmls(`.ssr-lore-info-read-current`, currentFrame + 1);
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

  const loreAutoSlide = async () => {
    for (const frame of framesLore()) {
      if (!autoSlideLore) continue;
      currentFrame = frame;
      await frameRender();
    }
    if (autoSlideLore) {
      await timer(5000);
      loreAutoSlide();
    }
  };
  loreAutoSlide();

  s(`.ssr-fullscreen-img`).onclick = () => {
    fullScreenIn();
    s(`.ssr-fullscreen-img`).style.display = 'none';
  };
};

SrrComponent = ({ host, path }) => html`
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
        margin-top: 70px;
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
        background-image: url('${path === '/' ? '' : path}/assets/lore/vectorized/lore${i}.svg');
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
      .ssr-lore-info-read {
        position: absolute;
        display: block;
        right: 26px;
        width: 60px;
        text-align: center;
        bottom: 100px;
        font-size: 11px;
      }
      .ssr-fullscreen-img {
        position: absolute;
        display: block;
        top: 10px;
        right: 10px;
        width: 35px;
        height: 35px;
        cursor: pointer;
      }
      .ssr-image-logo-cyberia {
        top: 25px;
        left: 10px;
        height: 40px;
        width: auto;
        position: absolute;
        display: block;
      }
    </style>
    ${borderChar(1, '#000000', ['.ssr-lore-container', '.ssr-lore-info-read-current'])}
    <div class="ssr-lore-display">
      ${framesLore()
        .map(
          (i) => html`<div class="ssr-background-image-lore ssr-background-image-lore-${i}" style="opacity: 0"></div>`,
        )
        .join('')}

      <div class="ssr-background-image-lore-gradient"></div>

      <div class="ssr-lore-container"></div>
      <div class="ssr-lore-arrows-container" style="display: none">
        <div class="ssr-lore-info-read"><span class="ssr-lore-info-read-current">1</span> / ${framesLore().length}</div>
        <!--style="display:none"-->
        <div class="ssr-lore-arrow-container ssr-lore-arrow-left">
          <img class="ssr-lore-arrow ssr-center" src="${path === '/' ? '' : path}/assets/ui-icons/arrow-left.png" />
        </div>
        <div class="ssr-lore-arrow-container ssr-lore-arrow-right">
          <img class="ssr-lore-arrow ssr-center" src="${path === '/' ? '' : path}/assets/ui-icons/arrow-right.png" />
        </div>
      </div>
    </div>

    <div class="ssr-play-btn-container"></div>

    <div class="ssr-custom-display" style="display: none;"></div>

    <div class="ssr-loading-container">
      <div class="ssr-loading-bar"><div class="ssr-loading-bar-block ssr-blink-bar"></div></div>
      <div class="ssr-loading-info">
        <span style="color: white">Connecting </span>
        ...${`${host}${path}`.slice(-30)}
      </div>
    </div>
    <img src="${path === '/' ? '' : path}/assets/util/cyberia-retro-banner-alpha.png" class="ssr-image-logo-cyberia" />
    <img src="${path === '/' ? '' : path}/assets/ui-icons/fullscreen.png" class="ssr-fullscreen-img" />
    <script>
      {
        const range = ${range};
        const timer = ${timer};
        const borderChar = ${borderChar};
        const fullScreenIn = ${fullScreenIn};
        const getLang = ${getLang};
        const s = ${s};
        const htmls = ${htmls};
        const framesLore = ${framesLore};
        const LoreScreen = ${LoreScreen};
        LoreScreen();
      }
    </script>
  </div>
`;
