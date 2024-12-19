import { newInstance, random, range, round10 } from '../core/CommonJs.js';
import { BiomeCyberiaParamsScope, getCurrentTransportData } from '../cyberia-admin/BiomeCyberiaAdmin.js';

const CityInteriorCyberiaBiome = {
  id: 'city-interior',
  render: async function (options = { type: '' }) {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;

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

    const squareSeedDimLimit = round10((dim - 1) * [0.2, 0.15, 0.1, 0.05][random(0, 3)]);
    const squareSeedDimLimitMax = round10(squareSeedDimLimit * (1 + [0.5, 0.6, 0.7, 0.8][random(0, 3)]));

    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};

        if (
          x >= squareSeedDimLimit &&
          x <= dim - 1 - squareSeedDimLimit &&
          y >= squareSeedDimLimit &&
          y <= dim - 1 - squareSeedDimLimit
        ) {
          switch (options.type) {
            case 'shop':
              {
                BiomeCyberiaMatrixCyberia.color[y][x] = `#7885c7`;
              }
              break;

            default:
              {
                BiomeCyberiaMatrixCyberia.color[y][x] = `#ffd900`;
              }
              break;
          }
          BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
        } else {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#000000`;
          BiomeCyberiaMatrixCyberia.solid[y][x] = 1;
        }
      });
    });

    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};

        if (
          x >= squareSeedDimLimit &&
          x <= dim - 1 - squareSeedDimLimit &&
          y >= squareSeedDimLimit &&
          y <= dim - 1 - squareSeedDimLimit
        ) {
          if (
            x % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
            y % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
            random(0, 700) < 30
          ) {
            if (
              !(
                x >= squareSeedDimLimitMax &&
                x <= dim - 1 - squareSeedDimLimitMax &&
                y >= squareSeedDimLimitMax &&
                y <= dim - 1 - squareSeedDimLimitMax
              )
            ) {
              BiomeCyberiaMatrixCyberia.color[y][x] = `#ff0a0a`;
            }
          }
        }
      });
    });

    const seedMatrixCyberia = newInstance(BiomeCyberiaMatrixCyberia.color);

    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (seedMatrixCyberia[y][x] === `#ff0a0a`) {
          const squareLimit = round10(((dim - 1) * [0.1, 0.2, 0.3, 0.4][random(0, 3)]) / 2);
          range(-1 * squareLimit, squareLimit).map((sumY) => {
            range(-1 * squareLimit, squareLimit).map((sumX) => {
              if (BiomeCyberiaMatrixCyberia.color[y + sumY] && BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX]) {
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#000000`;
                BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = 1;
              }
            });
          });
        }
      });
    });

    // doors
    const seedMatrixCyberiaDoor = newInstance(BiomeCyberiaMatrixCyberia.color);
    const _instanceValidDoor = (x, fromLimitX, toLimitX, y, fromLimitY, toLimitY) => {
      let validDoor = true;
      for (const sumY of range(fromLimitY, toLimitY)) {
        for (const sumX of range(fromLimitX, toLimitX)) {
          if (
            !seedMatrixCyberiaDoor[y + sumY] ||
            !seedMatrixCyberiaDoor[y + sumY][x + sumX] ||
            seedMatrixCyberiaDoor[y + sumY][x + sumX] !== `#ffd900`
          ) {
            validDoor = false;
          }
        }
      }
      if (validDoor)
        for (const sumY of range(fromLimitY, toLimitY)) {
          for (const sumX of range(fromLimitX, toLimitX)) {
            if (
              fromLimitX > 0 &&
              (sumX > 3 || sumY > 3) &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#790073`
            )
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ff00f2`;
            else if (
              fromLimitX < 0 &&
              (sumX < -3 || sumY < -3) &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#790073`
            )
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ff00f2`;
            else BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#790073`;
          }
        }
    };
    const instanceValidDoor = (x, fromLimitX, toLimitX, y, fromLimitY, toLimitY) => {
      let validDoor = true;
      for (const sumY of range(fromLimitY, toLimitY)) {
        for (const sumX of range(fromLimitX, toLimitX)) {
          if (
            !seedMatrixCyberiaDoor[y + sumY] ||
            !seedMatrixCyberiaDoor[y + sumY][x + sumX] ||
            seedMatrixCyberiaDoor[y + sumY][x + sumX] !== `#ffd900` ||
            BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] === `#790073` ||
            BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] === `#1fa92d`
          ) {
            validDoor = false;
          }
        }
      }
      if (validDoor) {
        const colorDoor = random(0, 20) <= 5 ? `#1fa92d` : `#790073`;
        for (const sumY of range(fromLimitY, toLimitY)) {
          for (const sumX of range(fromLimitX, toLimitX)) {
            if (
              fromLimitX > 0 &&
              (sumX > 3 || sumY > 3) &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#790073` &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#1fa92d`
            )
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ff00f2`;
            else if (
              fromLimitX < 0 &&
              (sumX < -3 || sumY < -3) &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#790073` &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#1fa92d`
            )
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ff00f2`;
            else BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = colorDoor;
          }
        }
      }
    };
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (BiomeCyberiaMatrixCyberia.color[y][x] === `#000000`) {
          instanceValidDoor(x, 1, 6, y, 1, 3);
          instanceValidDoor(x, -1, -6, y, -1, -3);
          instanceValidDoor(x, 1, 3, y, 1, 6);
          instanceValidDoor(x, -1, -3, y, -1, -6);
        }
      });
    });

    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (
          BiomeCyberiaMatrixCyberia.color[y] &&
          BiomeCyberiaMatrixCyberia.color[y][x] &&
          BiomeCyberiaMatrixCyberia.color[y][x] === `#1fa92d` &&
          !BiomeCyberiaMatrixCyberia.transports.find((to) => {
            for (const testY of range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1)) {
              for (const testX of range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1)) {
                if (to.x1 <= x && x <= to.x1 + testX && to.y1 <= y && y <= to.y1 + testY) return true;
              }
            }
            return false;
          })
        ) {
          BiomeCyberiaMatrixCyberia.transports.push({
            x1: x,
            y1: y,
            ...getCurrentTransportData('city-interior', transportsTargets),
          });
        }
      });
    });
    switch (options.type) {
      case 'shop':
        {
          range(0, dim - 1).map((y) => {
            range(0, dim - 1).map((x) => {
              if (BiomeCyberiaMatrixCyberia.color[y] && BiomeCyberiaMatrixCyberia.color[y][x] === `#7885c7`) {
                try {
                  range(0, BiomeCyberiaParamsScope.Data.dimPaintByCell * 2 - 1).map((y0) => {
                    range(0, BiomeCyberiaParamsScope.Data.dimPaintByCell * 2 - 1).map((x0) => {
                      if (
                        x0 <= BiomeCyberiaParamsScope.Data.dimPaintByCell * 1 - 1 &&
                        (!BiomeCyberiaMatrixCyberia.color[y + y0] ||
                          !BiomeCyberiaMatrixCyberia.color[y + y0][x + x0] ||
                          BiomeCyberiaMatrixCyberia.color[y + y0][x + x0] !== `#7885c7`)
                      ) {
                        throw null;
                      }
                      if (BiomeCyberiaMatrixCyberia.color[y + y0][x + x0] === `#000000`) throw null;
                    });
                  });
                  range(0, BiomeCyberiaParamsScope.Data.dimPaintByCell * 1 - 1).map((y0) => {
                    range(0, BiomeCyberiaParamsScope.Data.dimPaintByCell * 1 - 1).map((x0) => {
                      BiomeCyberiaMatrixCyberia.color[y + y0][x + x0] = `#000000`;
                    });
                  });
                } catch (error) {}
              }
            });
          });
        }
        break;

      default:
        break;
    }

    return BiomeCyberiaMatrixCyberia;
  },
};

export { CityInteriorCyberiaBiome };
