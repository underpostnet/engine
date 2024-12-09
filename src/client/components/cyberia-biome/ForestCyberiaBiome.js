import { newInstance, random, range } from '../core/CommonJs.js';
import { BiomeCyberiaParamsScope } from '../cyberia-admin/BiomeCyberiaAdmin.js';

const ForestCyberiaBiome = {
  id: 'forest',
  render: async function () {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;

    // phenotypes
    const treePhenotype = [
      ['#c41919', '#810202'],
      ['#aaf93e', '#e7ef46'],
    ];

    const validateMatrixCyberiaLimit = (x, y) => x >= 0 && y >= 0 && x <= dim - 1 && y <= dim - 1;

    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      topLevelColor: {},
      resources: [],
    };
    let colorCell;
    let defaultColor;

    // biome seeds
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        const probColor = random(0, 700);
        if (probColor <= 3) {
          colorCell = '#AF5E06';
        } else if (probColor <= 22) {
          colorCell = '#29714c';
        } else if (probColor <= 30) {
          colorCell = treePhenotype[random(0, treePhenotype.length - 1)][0];
        } else {
          colorCell = '#3bb177';
        }
        if (!defaultColor) defaultColor = '#3bb177';

        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};
        if (!BiomeCyberiaMatrixCyberia.topLevelColor[y]) BiomeCyberiaMatrixCyberia.topLevelColor[y] = {};
        BiomeCyberiaMatrixCyberia.color[y][x] = `${colorCell}`;
        BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
        BiomeCyberiaMatrixCyberia.topLevelColor[y][x] =
          (y === 0 && x === 0) || (x === dim - 1 && y === dim - 1) ? `${defaultColor}` : '';
      });
    });
    const seedMatrixCyberia = newInstance(BiomeCyberiaMatrixCyberia.color);

    // dark lawn
    colorCell = '#29714c';
    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        if (seedMatrixCyberia[y][x] === colorCell) {
          range(-3, 3).map((sumX) =>
            range(-1, 1).map((sumY) => {
              if (random(0, 8) > 2) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#349a67';
          range(-5, 5).map((sumX) =>
            range(-3, 3).map((sumY) => {
              if (random(0, 10) > 2) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#29714c';
        }
      });
    });

    // flowers
    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        treePhenotype.map((phenoType) => {
          if (seedMatrixCyberia[y][x] === phenoType[0]) {
            range(-2, 2).map((sumX) =>
              range(1, 1).map((sumY) => {
                if (random(0, 1) === 0) return;
                if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                  BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${phenoType[random(0, phenoType.length - 1)]}`;
              }),
            );
          }
        });
      });
    });

    colorCell = '#AF5E06';
    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        if (seedMatrixCyberia[y][x] === colorCell) {
          // shadow
          colorCell = '#29714c';
          range(-2, 2).map((sumX) =>
            range(4, 5).map((sumY) => {
              // if (random(0, 1) === 0) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          range(-3, 3).map((sumX) =>
            range(3, 6).map((sumY) => {
              if (random(0, 1) === 0) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#349a67';
          range(-4, 4).map((sumX) =>
            range(2, 7).map((sumY) => {
              if (random(0, 10) > 1) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          // tree leaves
          const selectPhenotype = treePhenotype[random(0, treePhenotype.length - 1)];
          range(-4, 4).map((sumX) =>
            range(-6, -1).map((sumY) => {
              if (random(1, 0) === 1 && (sumX > 3 || sumX < -3) && (sumY > -3 || sumY < -4)) return;
              colorCell = selectPhenotype[0];
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY)) {
                if (sumX === 0 && sumY === 0) BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${defaultColor}`;
                BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = 0;
                BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = `${colorCell}`;
              }
            }),
          );
          range(-5, 5).map((sumX) =>
            range(-5, 0).map((sumY) => {
              if (random(1, 4) === 4) return;
              colorCell = selectPhenotype[1];
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY)) {
                if (sumX === 0 && sumY === 0) BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${defaultColor}`;
                BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = `${colorCell}`;
              }
            }),
          );
          // rhizome
          colorCell = '#AF5E06';
          range(0, 0).map((sumX) =>
            range(-1, 3).map((sumY) => {
              if (random(0, 1) === 0) colorCell = '#975206';
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY)) {
                const topLevelColorEnabled = sumY > 0;
                if (BiomeCyberiaMatrixCyberia.solid[y + sumY + 2])
                  BiomeCyberiaMatrixCyberia.solid[y + sumY + 2][x + sumX] = topLevelColorEnabled ? 0 : 1;
                if (topLevelColorEnabled) {
                  BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = `${colorCell}`;
                  if (random(0, 1) === 1)
                    BiomeCyberiaMatrixCyberia.resources.push({
                      x: x + sumX,
                      y: y + sumY,
                      id: 'generic-wood',
                    });
                }
              }
              colorCell = '#AF5E06';
            }),
          );
          // roots
          [-1, 1].map((sumX) =>
            range(-1, 3).map((sumY) => {
              if (random(0, 1) === 0) return;
              if (random(0, 1) === 0) colorCell = '#975206';
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
              colorCell = '#AF5E06';
            }),
          );
        }
      });
    });

    return BiomeCyberiaMatrixCyberia;
  },
};

export { ForestCyberiaBiome };
