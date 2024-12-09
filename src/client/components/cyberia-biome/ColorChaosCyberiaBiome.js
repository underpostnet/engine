import { newInstance, random, randomHexColor, range } from '../core/CommonJs.js';
import { BiomeCyberiaParamsScope } from '../cyberia-admin/BiomeCyberiaAdmin.js';

const ColorChaosCyberiaBiome = {
  id: 'color-chaos',
  render: async function () {
    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      // container: 'container',
      // setBiomeCyberia: [],
      // timeOut: 1000,
    };
    for (const y of range(0, BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell - 1)) {
      BiomeCyberiaMatrixCyberia.color[y] = {};
      BiomeCyberiaMatrixCyberia.solid[y] = {};
      for (const x of range(0, BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell - 1)) {
        BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
        BiomeCyberiaMatrixCyberia.color[y][x] = randomHexColor();
      }
    }
    return BiomeCyberiaMatrixCyberia;
  },
};

export { ColorChaosCyberiaBiome };
