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
    const typingAnimationTransitionStyle = [
      `1s linear`,
      `${seconds}s steps(${html.split(' ').length * 6}, end)`,
      `1s forwards`,
    ];
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
    const minSeconds = s(`.${container}`).offsetWidth * 0.01;
    for (const index of range(...rangeArraySectionIndex)) {
      const subIdSalt = s4() + s4() + s4();
      const seconds = phraseArray[index].trim().length * 0.05;
      // (1 / (s(`.${container}`).offsetWidth * 0.05))
      append(`.${container}`, html` <div class="${container}-${subIdSalt}"></div> `);
      setTimeout(async () => {
        if (s(`.${container}-${subIdSalt}`)) {
          append(`.${container}-${subIdSalt}`, html` <div class="render-typeWriter-${container}-${subIdSalt}"></div> `);
          // console.error('time delta line text', minSeconds - seconds);

          await typeWriter({
            id: `typeWriter-${index}-${container}`,
            html: phraseArray[index].trim(),
            endHideBlink: index < rangeArraySectionIndex[1],
            seconds: seconds,
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

const LoreScreen = async () => {
  const translate = {
    en: html`Year 2120. Earth, once a vibrant blue marble, now hangs in a precarious balance. Despite monumental strides
    in sustainable technologies and the promise of a prosperous future, a single cataclysmic event irrevocably altered
    the course of humanity. In 2045, a devastating nuclear disaster rocked the Eastern People's Republic, contaminating
    the sprawling industrial districts of Being and triggering a chain reaction of genetic mutations. Clandestine
    biological experiments, conducted in the shadows, amplified the devastation, birthing a plague that transformed much
    of terrestrial life into grotesque and hostile creatures. A third of the planet was rendered uninhabitable, a
    desolate wasteland irradiated beyond recognition. Yet, within the depths of these barren lands, new and terrifying
    life forms emerged. Abominations born of radiation and genetic manipulation posed a constant threat to the dwindling
    human population. Forced from their ancestral home, humanity scattered across the cosmos in search of a new
    beginning. The survivors, now known as neo-humans, embarked on a perilous journey into the unknown, seeking refuge
    among the stars.`,

    // The fate of the universe rests in your hands. Choose your path

    // `Colonists Descendants of humanity's early space pioneers, the Colonists are genetically and
    // cybernetically enhanced to thrive in the harsh realities of extraterrestrial environments. Pragmatic,
    // technologically adept, and driven by the relentless pursuit of survival, they seek to expand neo-human dominion
    // across the cosmos. Renegades Born from the ashes of the nuclear apocalypse, the Renegades are a testament to
    // humanity's adaptability and resilience. Exposed to radiation and mutagenic substances, they possess extraordinary
    // abilities, but their existence is marked by genetic instability and a limited lifespan. Some seek coexistence with
    // other factions, while others harbor a deep-seated desire for vengeance. Synthesized A fascinating blend of organic
    // and artificial, the Synthesized are divided into two primary groups: The Cyborgs, former humans augmented with
    // biomechanical enhancements, and the Androids, fully synthetic beings crafted by advanced AI. Both possess immense
    // intelligence and adaptability but are vulnerable to system failures.`,

    es: html` Año 2120. La Tierra, que alguna vez fue una vibrante esfera azul, ahora pende de un precario equilibrio. A
    pesar de los avances monumentales en tecnologías sustentables y la promesa de un futuro próspero, un único evento
    cataclísmico alteró irrevocablemente el curso de la humanidad. En 2045, un desastre nuclear devastador sacudió la
    República Popular del Este, contaminando los distritos industriales en expansión de Being, desencadenando una
    reacción en cadena de mutaciones genéticas. ademas Experimentos biológicos clandestinos, amplificaron la
    devastación, dando origen a una plaga que transformó gran parte de la vida terrestre en criaturas grotescas y
    hostiles. Un tercio del planeta se volvió inhabitable, un páramo desolado irradiado más allá del reconocimiento. Sin
    embargo, en las profundidades de estas tierras estériles, surgieron nuevas y aterradoras formas de vida. Las
    abominaciones nacidas de la radiación y la manipulación genética planteaban una amenaza constante para la menguante
    población humana. Obligada a abandonar la tierra, la humanidad se dispersó por el cosmos en busca de un nuevo
    comienzo. Los supervivientes, ahora conocidos como neohumanos, se embarcaron en un peligroso viaje hacia lo
    desconocido, buscando refugio entre las estrellas.`,

    // El destino de la universo está en tus manos. Elige tu camino.

    // `Colonos Descendientes de los primeros pioneros espaciales de la
    // humanidad, los Colonos están genéticamente y cibernéticamente mejorados para prosperar en las duras realidades de
    // los entornos extraterrestres. Pragmáticos, tecnológicamente hábiles e impulsados ​​por la incesante búsqueda de la
    // supervivencia, buscan expandir el dominio neohumano por todo el cosmos. Renegados Nacidos de las cenizas del
    // apocalipsis nuclear, los Renegados son un testimonio de la adaptabilidad y la resiliencia de la humanidad. Expuestos
    // a la radiación y a sustancias mutagénicas, poseen habilidades extraordinarias, pero su existencia está marcada por
    // la inestabilidad genética y una esperanza de vida limitada. Algunos buscan coexistir con otras facciones, mientras
    // que otros albergan un profundo deseo de venganza. Sintetizados Una fascinante mezcla de lo orgánico y lo artificial,
    // los Sintetizados se dividen en dos grupos principales: los Ciborgs, antiguos humanos aumentados con mejoras
    // biomecánicas, y los Androides, seres totalmente sintéticos creados por una IA avanzada. Ambos poseen una inmensa
    // inteligencia y adaptabilidad, pero son vulnerables a las fallas del sistema.`
  };
  await renderSsrDialog({
    text: translate[getLang()] || translate.en,
    container: 'ssr-lore-container',
  });
};

SrrComponent = ({ host, path, storage }) => html`
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
        color: #ffcc00;
      }
      .clean-cache-container {
        /* background: #1a1a1a !important; */
        background: #000000 !important;
      }
    </style>
    ${borderChar(1, '#171717', ['.ssr-lore-container'])}
    <!--   space-container -->

    <style>
      .space-container {
        margin: 0;
        height: 100vh;
        background-color: #000000;
        position: absolute;
        width: 100%;
        top: 0px;
        left: 0px;
        /* overflow: hidden; */
      }

      .space-background {
        font-family: sans-serif;
        font-size: 1.5em;
        text-shadow: 1px 1px 7px #ccccccd1;
        color: #ffffff;
        font-weight: bold;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: 100%;
        background-image: url('${storage['space-background']}');
        background-size: 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
      }
    </style>
    <div class="space-container">
      <div class="space-background"></div>
    </div>

    <!-- end space-container -->

    <div class="ssr-center ssr-lore-container"></div>

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
