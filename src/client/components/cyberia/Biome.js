import { BtnIcon } from '../core/BtnIcon.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';

const Biome = {
  city: function () {},
};

const BiomeEngine = {
  Render: async function () {
    setTimeout(() =>
      Object.keys(Biome).map((biome) => (s(`.btn-biome-engine-${biome}`).onclick = () => Biome[biome]()))
    );
    let render = '';
    for (const biome of Object.keys(Biome))
      render += await BtnIcon.Render({ class: `btn-biome-engine-${biome}`, label: Translate.Render(biome) });
    return render;
  },
};

export { Biome, BiomeEngine };
