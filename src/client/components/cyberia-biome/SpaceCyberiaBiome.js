import { newInstance, random, range } from '../core/CommonJs.js';
import { BiomeCyberiaParamsScope, getCurrentTransportData } from '../cyberia-admin/BiomeCyberiaAdmin.js';

const SpaceCyberiaBiome = {
  id: 'space',
  render: async function () {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;

    const validateMatrixCyberiaLimit = (x, y) => x >= 0 && y >= 0 && x <= dim - 1 && y <= dim - 1;
    const transportsTargets = [
      {
        path: 'seed-city',
        dim: 1,
        type: 'width',
      },
    ];

    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      transports: [],
    };
    let colorCell;

    // biome seeds
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        const probColor = random(0, 700);
        if (probColor <= 3) {
          colorCell = '#cfcf05';
        } else if (probColor <= 22) {
          colorCell = '#212121';
        } else if (probColor <= 30) {
          colorCell = '#29166e';
        } else {
          colorCell = '#080808';
        }

        if (random(0, 700 * 4) <= 3)
          BiomeCyberiaMatrixCyberia.transports.push({
            x1: x,
            y1: y,
            ...getCurrentTransportData('space', transportsTargets),
          });

        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};
        BiomeCyberiaMatrixCyberia.color[y][x] = `${colorCell}`;
        BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
      });
    });
    const seedMatrixCyberia = newInstance(BiomeCyberiaMatrixCyberia.color);

    return BiomeCyberiaMatrixCyberia;
  },
};

export { SpaceCyberiaBiome };
