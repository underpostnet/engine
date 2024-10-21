const getLang = () => navigator.language || navigator.userLanguage;
const s = (el) => document.querySelector(el);
const htmls = (el, html) => (s(el).innerHTML = html);
const typeWriter = async function ({ id, html, seconds, endHideBlink, container }) {
  if (!seconds) seconds = 2;
  return new Promise((resolve) => {
    // https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timing-function
    // https://www.w3schools.com/cssref/css3_pr_animation-fill-mode.php
    const typingAnimationTransitionStyle = [`1s linear`, `${seconds}s steps(30, end)`, `1s forwards`];
    const render = html`
      <style class="style-${id}">
        .tw-${id}-typed-out {
          overflow: hidden;
          border-right: 0.15em solid orange;
          white-space: nowrap;
          animation: typing-${id} ${typingAnimationTransitionStyle[1]}, blink-caret-${id} 0.5s step-end infinite;
          animation-fill-mode: forwards;
          width: 0;
        }
      </style>
      <style>
        .tw-${id}-container {
        }
        @keyframes typing-${id} {
          from {
            width: 0;
          }
          to {
            width: 100%;
          }
        }

        @keyframes blink-caret-${id} {
          from,
          to {
            border-color: transparent;
          }
          50% {
            border-color: orange;
          }
        }
      </style>
      <div class="inl tw-${id}-container">
        <div class="tw-${id}-typed-out">${html}</div>
      </div>
    `;
    htmls(`.${container}`, render);
    setTimeout(() => {
      if (endHideBlink && s(`.style-${id}`)) s(`.style-${id}`).remove();
      resolve(render);
    }, seconds * 1000);
  });
};

const LoreScreen = async () => {
  const translate = {
    en: html` <br />One Conflict <br /><br />
      <div class="ssr-lore-text">
        In a galaxy scarred by catastrophe, three factions vie for dominance. <br />
        <br /><strong class="ssr-secondary-color">The Colonists</strong>, descendants of Earth's pioneers, seek to
        expand their dominion across the stars. <br /><br /><strong class="ssr-secondary-color">The Renegades</strong>,
        mutants born from the ashes of disaster, fight for survival and retribution. <br /><br />
        <strong class="ssr-secondary-color">The Synthetics</strong>, a fusion of flesh and machine, strive for a future
        beyond human limitations
      </div>
      <br />
      <br />`,
    es: html` <br />
      Un Conflicto <br /><br />
      <div class="ssr-lore-text">
        En una galaxia marcada por la catástrofe, tres facciones compiten por el dominio. <br />
        <br /><strong class="ssr-secondary-color">Los colonos</strong>, descendientes de los pioneros de la Tierra,
        buscan expandir su dominio a través de las estrellas. <br />
        <br /><strong class="ssr-secondary-color">Los renegados</strong>, mutantes nacidos de las cenizas del desastre,
        luchan por la supervivencia y la venganza.
        <br />
        <br />
        <strong class="ssr-secondary-color">Los sintéticos</strong>, una fusión de carne y máquina, luchan por un futuro
        más allá de las limitaciones humanas
      </div>`,
  };
  await typeWriter({ id: 'ssr-lore', html: translate[getLang()] || translate.en, container: 'ssr-lore-container' });
};

SrrComponent = ({ host, path }) => html`
  <div class="ssr-background" style="opacity: 1">
    <style>
      .ssr-background {
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
        min-width: 280px;
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
      .ssr-lore-container {
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
    </style>

    <div class="ssr-lore-container"></div>

    <div class="ssr-loading-container">
      <div class="ssr-loading-bar"><div class="ssr-loading-bar-block ssr-blink-bar"></div></div>
      <div class="ssr-loading-info">
        <span style="color: white">connecting </span>
        ...${`${host}${path}`.slice(-30)}
      </div>
    </div>
    <script>
      {
        const s = ${s};
        const htmls = ${htmls};
        const typeWriter = ${typeWriter};
        const getLang = ${getLang};
        const LoreScreen = ${LoreScreen};

        LoreScreen();
      }
    </script>
  </div>
`;
