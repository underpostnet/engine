import { BtnIcon } from '../core/BtnIcon.js';
import { JSONmatrix, newInstance, random, range } from '../core/CommonJs.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { Matrix } from './Matrix.js';
import { Pixi } from './Pixi.js';

const Biome = {
  city: function () {
    const dim = Matrix.Data.dim * Matrix.Data.dimPaintByCell;
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
    const BiomeMatrix = {
      color: {},
      solid: {},
    };
    let colorCell;
    // seeds
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (x % Matrix.Data.dimPaintByCell === 0 && y % Matrix.Data.dimPaintByCell === 0 && random(0, 700) < 10) {
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
        }
        if (!BiomeMatrix.color[y]) BiomeMatrix.color[y] = {};
        if (!BiomeMatrix.solid[y]) BiomeMatrix.solid[y] = {};
        BiomeMatrix.color[y][x] = `${colorCell}`;
        BiomeMatrix.solid[y][x] = 0;
      });
    });
    const seedMatrix = newInstance(BiomeMatrix.color);
    const baseCordValidator = (x, y, maxLimitX, maxLimitY) => x >= 0 && y >= 0 && x <= maxLimitX && y <= maxLimitY;

    const buildLimitStorage = {};
    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        buildingStyles.map((buildStyle) => {
          // builging
          if (seedMatrix[y][x] === buildStyle.body[0]) {
            // body
            const xFactor = random(4, 8);
            const yFactor = random(3, 10);
            const buildLimitX = Matrix.Data.dimPaintByCell * xFactor - 1;
            const buildLimitY = Matrix.Data.dimPaintByCell * yFactor - 1;

            if (!buildLimitStorage[x]) buildLimitStorage[x] = {};
            buildLimitStorage[x][y] = {
              buildLimitX,
              buildLimitY,
            };

            range(0, buildLimitX).map((sumX) =>
              range(0, buildLimitY).map((sumY) => {
                if (baseCordValidator(x + sumX, y + sumY, dim - 1, dim - 1)) {
                  colorCell = buildStyle.body[random(0, 500) < 100 || x + sumX <= x + random(3, 7) ? 0 : 1];
                  BiomeMatrix.solid[y + sumY][x + sumX] = 1;
                  BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
                }
              })
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
                        BiomeMatrix.color[y + sumY + sumY0][x + sumX + sumX0] = `${colorCell}`;
                      }
                    })
                  );
                }
              })
            );
          }
        });
      });
    });

    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        buildingStyles.map((buildStyle) => {
          // builging
          if (seedMatrix[y][x] === buildStyle.body[0]) {
            const { buildLimitX, buildLimitY } = buildLimitStorage[x][y];
            // door
            const dimDoor = 2;
            const xDoorPadding = 2;
            const xDoorCords = range(x + xDoorPadding, x + buildLimitX - xDoorPadding - dimDoor).filter(
              (n) => n % Matrix.Data.dimPaintByCell === 0
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
                  BiomeMatrix.color[yDoor + deltaY] &&
                  BiomeMatrix.color[yDoor + deltaY][xDoor + deltaX] &&
                  !pavementStyle.includes(BiomeMatrix.color[yDoor + deltaY][xDoor + deltaX])
                ) {
                  validDoor = false;
                } else if (
                  BiomeMatrix.color[yDoor + deltaY] &&
                  BiomeMatrix.color[yDoor + deltaY][xDoor + deltaX] &&
                  !pavementStyle.includes(BiomeMatrix.color[yDoor + deltaY][xDoor + deltaX])
                ) {
                  validDoor = false;
                }
              })
            );
            if (!validDoor) return;
            colorCell = 'black';
            range(0, dimDoor).map((deltaX) =>
              range(0, dimDoor).map((deltaY) => {
                if (
                  baseCordValidator(xDoor + deltaX, yDoor - deltaY, dim - 1, dim - 1) &&
                  baseCordValidator(xDoor + deltaX, yDoor - deltaY, x + buildLimitX, y + buildLimitY)
                ) {
                  BiomeMatrix.color[yDoor - deltaY][xDoor + deltaX] = `${colorCell}`;
                  BiomeMatrix.solid[yDoor - deltaY][xDoor + deltaX] = 0;
                }
              })
            );
          }
        });
      });
    });

    htmls(
      `.biome-solid-matrix-preview`,
      JSONmatrix(BiomeMatrix.solid).replaceAll('1', html`<span style="color: yellow">1</span>`)
    );
    Pixi.RenderBiome(BiomeMatrix);
  },
};

const BiomeEngine = {
  Render: async function () {
    setTimeout(() =>
      Object.keys(Biome).map((biome) => (s(`.btn-biome-engine-${biome}`).onclick = () => Biome[biome]()))
    );
    let render = '';
    for (const biome of Object.keys(Biome))
      render += await BtnIcon.Render({ class: `btn-biome-engine-${biome}`, label: Translate.Render(biome) });
    return html`
      <style>
        ${css`
          .biome-solid-matrix-preview {
            font-size: 8px;
          }
        `}
      </style>
      ${render}
      <pre class="in biome-solid-matrix-preview"></pre>
    `;
  },
};

export { Biome, BiomeEngine };
