import { FileService } from '../../services/file/service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { JSONmatrix, newInstance, random, range, s4 } from '../core/CommonJs.js';
import { Translate } from '../core/Translate.js';
import { downloadFile, htmls, s } from '../core/VanillaJs.js';
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
                        BiomeMatrix.color[y + sumY + sumY0][x + sumX + sumX0] = `${colorCell}`;
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
              (n) => n % Matrix.Data.dimPaintByCell === 0,
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
              }),
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
              }),
            );
          }
        });
      });
    });

    return BiomeMatrix;
  },
  forest: function () {
    const dim = Matrix.Data.dim * Matrix.Data.dimPaintByCell;

    // phenotypes
    const treePhenotype = [
      ['#c41919', '#810202'],
      ['#aaf93e', '#e7ef46'],
    ];

    const validateMatrixLimit = (x, y) => x >= 0 && y >= 0 && x <= dim - 1 && y <= dim - 1;

    const BiomeMatrix = {
      color: {},
      solid: {},
    };
    let colorCell;

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

        if (!BiomeMatrix.color[y]) BiomeMatrix.color[y] = {};
        if (!BiomeMatrix.solid[y]) BiomeMatrix.solid[y] = {};
        BiomeMatrix.color[y][x] = `${colorCell}`;
        BiomeMatrix.solid[y][x] = 0;
      });
    });
    const seedMatrix = newInstance(BiomeMatrix.color);

    // dark lawn
    colorCell = '#29714c';
    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        if (seedMatrix[y][x] === colorCell) {
          range(-3, 3).map((sumX) =>
            range(-1, 1).map((sumY) => {
              if (random(0, 8) > 2) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#349a67';
          range(-5, 5).map((sumX) =>
            range(-3, 3).map((sumY) => {
              if (random(0, 10) > 2) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#29714c';
        }
      });
    });

    // flowers
    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        treePhenotype.map((phenoType) => {
          if (seedMatrix[y][x] === phenoType[0]) {
            range(-2, 2).map((sumX) =>
              range(1, 1).map((sumY) => {
                if (random(0, 1) === 0) return;
                if (validateMatrixLimit(x + sumX, y + sumY))
                  BiomeMatrix.color[y + sumY][x + sumX] = `${phenoType[random(0, phenoType.length - 1)]}`;
              }),
            );
          }
        });
      });
    });

    colorCell = '#AF5E06';
    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        if (seedMatrix[y][x] === colorCell) {
          // shadow
          colorCell = '#29714c';
          range(-2, 2).map((sumX) =>
            range(4, 5).map((sumY) => {
              // if (random(0, 1) === 0) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          range(-3, 3).map((sumX) =>
            range(3, 6).map((sumY) => {
              if (random(0, 1) === 0) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#349a67';
          range(-4, 4).map((sumX) =>
            range(2, 7).map((sumY) => {
              if (random(0, 10) > 1) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          // tree leaves
          const selectPhenotype = treePhenotype[random(0, treePhenotype.length - 1)];
          range(-4, 4).map((sumX) =>
            range(-6, -1).map((sumY) => {
              if (random(1, 0) === 1 && (sumX > 3 || sumX < -3) && (sumY > -3 || sumY < -4)) return;
              colorCell = selectPhenotype[0];
              if (validateMatrixLimit(x + sumX, y + sumY)) {
                BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
                BiomeMatrix.solid[y + sumY][x + sumX] = 1;
              }
            }),
          );
          range(-5, 5).map((sumX) =>
            range(-5, 0).map((sumY) => {
              if (random(1, 4) === 4) return;
              colorCell = selectPhenotype[1];
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          // rhizome
          colorCell = '#AF5E06';
          range(0, 0).map((sumX) =>
            range(-1, 3).map((sumY) => {
              if (random(0, 1) === 0) colorCell = '#975206';
              if (validateMatrixLimit(x + sumX, y + sumY)) {
                BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
                BiomeMatrix.solid[y + sumY][x + sumX] = 1;
              }
              colorCell = '#AF5E06';
            }),
          );
          // roots
          [-1, 1].map((sumX) =>
            range(-1, 3).map((sumY) => {
              if (random(0, 1) === 0) return;
              if (random(0, 1) === 0) colorCell = '#975206';
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
              colorCell = '#AF5E06';
            }),
          );
        }
      });
    });

    return BiomeMatrix;
  },
};

const BiomeEngine = {
  Render: async function () {
    let render = '';
    for (const biome of Object.keys(Biome)) {
      render += html`
        <div class="in section-row">
          ${await BtnIcon.Render({ class: `btn-biome-engine-${biome}`, label: Translate.Render(biome) })}
          ${await BtnIcon.Render({ class: `btn-download-biome-${biome}-png`, label: `Download ${biome} png` })}
          ${await BtnIcon.Render({ class: `btn-upload-biome-${biome}`, label: `Upload ${biome} png` })}
        </div>
      `;
    }

    setTimeout(() =>
      Object.keys(Biome).map((biome) => {
        s(`.btn-biome-engine-${biome}`).onclick = async () => {
          const BiomeMatrix = Biome[biome]();
          htmls(
            `.biome-solid-matrix-preview`,
            JSONmatrix(BiomeMatrix.solid).replaceAll('1', html`<span style="color: yellow">1</span>`),
          );
          Pixi.RenderBiome(BiomeMatrix);
          const biomeImg = await Pixi.App.renderer.extract.image(Pixi.Data.biome.container);
          htmls(`.biome-img-matrix-preview`, html`<img src="${biomeImg.currentSrc}" />`);

          const res = await fetch(biomeImg.currentSrc);
          const blob = await res.blob();
          const file = new File([blob], { type: 'image/png' }); // open window save name
        };
        s(`.btn-download-biome-${biome}-png`).onclick = async () => {
          const biomeImg = await Pixi.App.renderer.extract.image(Pixi.Data.biome.container);
          const res = await fetch(biomeImg.currentSrc);
          const blob = await res.blob();
          downloadFile(blob, `${biome}.png`);
        };
        s(`.btn-upload-biome-${biome}`).onclick = async () => {
          const biomeImg = await Pixi.App.renderer.extract.image(Pixi.Data.biome.container);
          const res = await fetch(biomeImg.currentSrc);
          const blob = await res.blob();
          const body = new FormData();
          body.append(s4(), new File([blob], `${biome}.png`));
          const result = await FileService.post(body);
          console.log(result);
        };
      }),
    );
    return html`
      <style>
        ${css`
          .biome-solid-matrix-preview {
            font-size: 8px;
          }
        `}
      </style>
      ${render}
      <div class="in biome-img-matrix-preview"></div>
      <pre class="in biome-solid-matrix-preview"></pre>
    `;
  },
};

export { Biome, BiomeEngine };
