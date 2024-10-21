const getLang = () => navigator.language || navigator.userLanguage;
const s = (el) => document.querySelector(el);
const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);
const s4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
function splitEveryXChar(originalString, everyXChar = 30, nextCharSplit) {
  let modifiedString = '';
  const arrayString = [];
  let i = -1;
  let charSplit = false;
  for (let char of originalString) {
    i++;
    modifiedString += char;
    if (i !== 0 && i % everyXChar === 0) charSplit = true;
    if (modifiedString.length >= everyXChar && charSplit && (!nextCharSplit || nextCharSplit.includes(char))) {
      arrayString.push(newInstance(modifiedString));
      modifiedString = '';
      charSplit = false;
    }
  }
  if (modifiedString) arrayString.push(modifiedString);
  return arrayString;
}
const range = (start, end) => {
  return end < start
    ? range(end, start).reverse()
    : Array.apply(0, Array(end - start + 1)).map((element, index) => index + start);
};
const timer = (ms) => new Promise((res) => setTimeout(res, ms));
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
const newInstance = (obj) => {
  // structuredClone() 2022 ES6 feature
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    return { error: error.message };
  }
};
const getSectionsStringData = (offsetWidth, text) => {
  const sectionsIndex = [];
  const everyXChar = parseInt(offsetWidth / 4);
  const phraseArray = text
    .split('.')
    .map((t) => splitEveryXChar(t + '.', everyXChar, ['.', ' ']))
    .flat()
    .filter((p) => p !== '.' && p.trim());

  let currentIndex = [0];
  let pi = -1;
  for (const p of phraseArray) {
    pi++;
    if (p.indexOf('.') !== -1) {
      currentIndex.push(newInstance(pi));
      sectionsIndex.push(newInstance(currentIndex));
      if (phraseArray[pi + 1]) currentIndex = [newInstance(pi + 1)];
      else currentIndex = [];
    }
  }
  if (currentIndex[0] && !currentIndex[1]) {
    currentIndex[1] = phraseArray.length - 1;
    sectionsIndex.push(newInstance(currentIndex));
  }
  return { phraseArray, sectionsIndex };
};
const typeWriteSectionsString = ({ container, phraseArray, rangeArraySectionIndex }) =>
  new Promise((resolve) => {
    let cumulativeSeconds = 0;
    for (const index of range(...rangeArraySectionIndex)) {
      const subIdSalt = s4() + s4() + s4();
      const seconds = phraseArray[index].trim().length * 0.1;
      append(`.${container}`, html` <div class="${container}-${subIdSalt}"></div> `);
      setTimeout(async () => {
        if (s(`.${container}-${subIdSalt}`)) {
          append(`.${container}-${subIdSalt}`, html` <div class="render-typeWriter-${container}-${subIdSalt}"></div> `);
          await typeWriter({
            id: `typeWriter-${index}-${container}`,
            html: phraseArray[index].trim(),
            endHideBlink: index < rangeArraySectionIndex[1],
            seconds,
            container: `render-typeWriter-${container}-${subIdSalt}`,
          });
        }
        if (index === rangeArraySectionIndex[1]) resolve();
      }, cumulativeSeconds * 1000);
      cumulativeSeconds += seconds;
    }
  });

const renderSsrDialog = async ({ container, text }) => {
  let currentDialogIndex = -1;

  const renderTalkingDialog = async () => {
    currentDialogIndex++;
    const offsetWidth = s(`body`).offsetWidth;
    const { phraseArray, sectionsIndex } = getSectionsStringData(offsetWidth * 0.3, text);

    let currentPhraseArrayIndex = -1;
    const renderPhrase = async () => {
      if (!s(`.${container}`)) return;
      currentPhraseArrayIndex++;
      htmls(`.${container}`, '');
      await typeWriteSectionsString({
        container,
        phraseArray,
        rangeArraySectionIndex: sectionsIndex[currentPhraseArrayIndex],
      });
      await timer(1500);
      if (currentPhraseArrayIndex + 1 < sectionsIndex.length) await renderPhrase();
    };
    await renderPhrase();
  };
  await renderTalkingDialog();
};
// <strong class="ssr-secondary-color ssr-lore-text"

const LoreScreen = async () => {
  const translate = {
    en: `In a galaxy scarred by catastrophe, three factions vie for dominance. The Colonists, descendants of Earth's pioneers, seek to expand their dominion across the stars. The Renegades, mutants born from the ashes of disaster, fight for survival and retribution. And the Synthetics, a fusion of flesh and machine, strive for a future beyond human limitations.`,
    es: `En una galaxia marcada por la catástrofe, tres facciones compiten por el dominio. Los colonos, descendientes de los pioneros de la Tierra, buscan expandir su dominio a través de las estrellas. Los renegados, mutantes nacidos de las cenizas del desastre, luchan por la supervivencia y la venganza. Y los sintéticos, una fusión de carne y máquina, luchan por un futuro más allá de las limitaciones humanas.`,
  };
  await renderSsrDialog({ text: translate[getLang()] || translate.en, container: 'ssr-lore-container' });
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
      .ssr-lore-container,
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
        const newInstance = ${newInstance};
        const range = ${range};
        const s4 = ${s4};
        const append = ${append};
        const timer = ${timer};
        ${splitEveryXChar};
        const getSectionsStringData = ${getSectionsStringData};
        const typeWriteSectionsString = ${typeWriteSectionsString};
        const renderSsrDialog = ${renderSsrDialog};
        const typeWriter = ${typeWriter};
        const getLang = ${getLang};
        const LoreScreen = ${LoreScreen};

        LoreScreen();
      }
    </script>
  </div>
`;
