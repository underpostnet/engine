import { newInstance, random, range, round10 } from '../core/CommonJs.js';
import { BiomeCyberiaParamsScope, getCurrentTransportData } from '../cyberia-admin/BiomeCyberiaAdmin.js';

const CityCyberiaBiome = {
  id: 'city',
  render: async function () {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;
    const buildingStyles = [
      {
        name: 'blue',
        body: ['#000c2d', '#001a5e'],
        window: ['#ccce41', '#ffff4a', '#ffff99'],
      },
      {
        name: 'purple',
        body: ['#4f004f', '#620062'],
        window: ['#b83e0a', '#e44d0c', '#f47239'],
      },
    ];
    const pavementStyle = ['#373737', '#282828', '#1d1d1d', 'black'];

    const transportsTargets = [
      {
        path: 'interior32',
        dim: 1,
        type: 'width',
      },
    ];

    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      topLevelColor: {},
      transports: [],
    };
    let colorCell;
    let defaultColor;
    // seeds
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (
          x % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
          y % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
          random(0, 700) < 10
        ) {
          colorCell = buildingStyles[random(0, buildingStyles.length - 1)].body[0];
        } else {
          const probPavement = random(0, 700);
          if (probPavement < 10) {
            colorCell = pavementStyle[pavementStyle.length - 1];
          } else if (probPavement < 100) {
            colorCell = pavementStyle[pavementStyle.length - 2];
          } else if (probPavement < 300) {
            colorCell = pavementStyle[pavementStyle.length - 3];
          } else {
            colorCell = pavementStyle[pavementStyle.length - 4];
          }
          if (!defaultColor) defaultColor = pavementStyle[pavementStyle.length - 4];
        }
        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};
        if (!BiomeCyberiaMatrixCyberia.topLevelColor[y]) BiomeCyberiaMatrixCyberia.topLevelColor[y] = {};
        BiomeCyberiaMatrixCyberia.color[y][x] = `${colorCell}`;
        BiomeCyberiaMatrixCyberia.topLevelColor[y][x] =
          (y === 0 && x === 0) || (x === dim - 1 && y === dim - 1) ? `${defaultColor}` : '';
        BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
      });
    });
    const seedMatrixCyberia = newInstance(BiomeCyberiaMatrixCyberia.color);
    const baseCordValidator = (x, y, maxLimitX, maxLimitY) => x >= 0 && y >= 0 && x <= maxLimitX && y <= maxLimitY;

    const buildLimitStorage = {};
    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        buildingStyles.map((buildStyle) => {
          // builging
          if (seedMatrixCyberia[y][x] === buildStyle.body[0]) {
            // body
            const xFactor = random(4, 8);
            const yFactor = random(3, 10);
            const buildLimitX = BiomeCyberiaParamsScope.dimPaintByCell * xFactor - 1;
            const buildLimitY = BiomeCyberiaParamsScope.dimPaintByCell * yFactor - 1;
            const topLevelColor = {
              y: round10(buildLimitY * 0.4),
            };

            if (!buildLimitStorage[x]) buildLimitStorage[x] = {};
            buildLimitStorage[x][y] = {
              buildLimitX,
              buildLimitY,
            };

            range(0, buildLimitX).map((sumX) =>
              range(0, buildLimitY).map((sumY) => {
                if (baseCordValidator(x + sumX, y + sumY, dim - 1, dim - 1)) {
                  colorCell = buildStyle.body[random(0, 500) < 100 || x + sumX <= x + random(3, 7) ? 0 : 1];
                  const topLevelColorEnabled = sumY <= topLevelColor.y;
                  BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = topLevelColorEnabled ? 0 : 1;
                  if (topLevelColorEnabled) {
                    BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = `${colorCell}`;
                    if (sumX === 0 && sumY === 0)
                      BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${defaultColor}`;
                  } else BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
                }
              }),
            );
            // window
            range(0, buildLimitX).map((sumX) =>
              range(0, buildLimitY).map((sumY) => {
                if (random(0, 1) === 0) return;
                if (
                  baseCordValidator(x + sumX, y + sumY, dim - 1, dim - 1) &&
                  (x + sumX) % 4 === 0 &&
                  (y + sumY) % 4 === 0
                ) {
                  // single window area
                  const xFactorWindow = random(1, 2);
                  const yFactorWindow = random(1, 2);
                  range(0, xFactorWindow).map((sumX0) =>
                    range(0, yFactorWindow).map((sumY0) => {
                      if (
                        baseCordValidator(x + sumX + sumX0, y + sumY + sumY0, x + buildLimitX, y + buildLimitY) &&
                        y + sumY + sumY0 < y + buildLimitY - 4 &&
                        y + sumY + sumY0 > y
                      ) {
                        colorCell = buildStyle.window[random(0, 2)];
                        const topLevelColorEnabled = sumY + sumY0 <= topLevelColor.y;
                        if (topLevelColorEnabled) {
                          BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY + sumY0][x + sumX + sumX0] = `${colorCell}`;
                          if (sumX0 === 0 && sumY0 === 0)
                            BiomeCyberiaMatrixCyberia.color[y + sumY + sumY0][x + sumX + sumX0] = `${defaultColor}`;
                        } else BiomeCyberiaMatrixCyberia.color[y + sumY + sumY0][x + sumX + sumX0] = `${colorCell}`;
                      }
                    }),
                  );
                }
              }),
            );
          }
        });
      });
    });

    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        buildingStyles.map((buildStyle) => {
          // builging
          if (seedMatrixCyberia[y][x] === buildStyle.body[0]) {
            const { buildLimitX, buildLimitY } = buildLimitStorage[x][y];
            // door
            const dimDoor = 2;
            const xDoorPadding = 2;
            const xDoorCords = range(x + xDoorPadding, x + buildLimitX - xDoorPadding - dimDoor).filter(
              (n) => n % BiomeCyberiaParamsScope.dimPaintByCell === 0,
            );
            const xDoor = xDoorCords[random(0, xDoorCords.length - 1)];
            const yDoor = y + buildLimitY;
            let validDoor = true;
            // colorCell = 'red';
            range(0, dimDoor).map((deltaX) =>
              range(1, dimDoor + 1).map((deltaY) => {
                if (
                  !baseCordValidator(xDoor + deltaX, yDoor + deltaY, dim - 1, dim - 1) ||
                  !baseCordValidator(xDoor + deltaX, yDoor + deltaY, x + buildLimitX, y + buildLimitY + dimDoor + 1)
                ) {
                  validDoor = false;
                }

                if (
                  BiomeCyberiaMatrixCyberia.color[yDoor + deltaY] &&
                  BiomeCyberiaMatrixCyberia.color[yDoor + deltaY][xDoor + deltaX] &&
                  !pavementStyle.includes(BiomeCyberiaMatrixCyberia.color[yDoor + deltaY][xDoor + deltaX])
                ) {
                  validDoor = false;
                }
              }),
            );
            if (!validDoor) return;
            colorCell = 'black';
            BiomeCyberiaMatrixCyberia.transports.push({
              x1: xDoor,
              y1: yDoor - dimDoor,
              ...getCurrentTransportData('city', transportsTargets),
            });
            range(0, dimDoor).map((deltaX) =>
              range(0, dimDoor).map((deltaY) => {
                if (
                  baseCordValidator(xDoor + deltaX, yDoor - deltaY, dim - 1, dim - 1) &&
                  baseCordValidator(xDoor + deltaX, yDoor - deltaY, x + buildLimitX, y + buildLimitY)
                ) {
                  BiomeCyberiaMatrixCyberia.color[yDoor - deltaY][xDoor + deltaX] = `${colorCell}`;
                  BiomeCyberiaMatrixCyberia.solid[yDoor - deltaY][xDoor + deltaX] = 0;
                }
              }),
            );
          }
        });
      });
    });

    return BiomeCyberiaMatrixCyberia;
  },
};

export { CityCyberiaBiome };
