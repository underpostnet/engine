import { BiomeCyberiaEngine, cut } from '../cyberia-admin/BiomeCyberiaAdmin.js';
import { CoreService } from '../../services/core/core.service.js';
import { CyberiaTileService } from '../../services/cyberia-tile/cyberia-tile.service.js';
import { amplifyMatrix, getMostFrequentValue, mergeMatrices, newInstance, range } from '../core/CommonJs.js';
import { s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';

const SeedCityCyberiaBiome = {
  id: 'seed-city',
  render: async function () {
    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      topLevelColor: [],
      setBiomeCyberia: [],
      container: 'seed-city',
      timeOut: 1000,
      dim: 16 * 7,
      dimPaintByCell: 3,
      dimAmplitude: 3,
    };
    const mapData = [
      {
        name_map: '3hnp',
        position: [4, 3],
      },
      {
        name_map: '74fp9',
        position: [2, 3],
      },
      {
        name_map: 'a225',
        position: [3, 0],
      },
      {
        name_map: 'b43de',
        position: [1, 3],
      },
      {
        name_map: 'b4db',
        position: [-1, 1],
      },
      {
        name_map: 'buro',
        position: [0, 0],
      },
      {
        name_map: 'bx-park',
        position: [0, 3],
      },
      {
        name_map: 'cd89',
        position: [2, -1],
      },
      {
        name_map: 'cxfr',
        position: [-1, -1],
      },
      {
        name_map: 'cy-stadium',
        position: [3, -1],
      },
      {
        name_map: 'cy03-station',
        position: [1, 0],
      },
      {
        name_map: 'df23',
        position: [4, 2],
      },
      {
        name_map: 'ecc0',
        position: [-1, 0],
      },
      {
        name_map: 'fe17',
        position: [-1, 2],
      },
      {
        name_map: 'gyr8',
        position: [3, 2],
      },
      {
        name_map: 'hu6r',
        position: [1, -1],
      },
      {
        name_map: 'jf2b',
        position: [0, -1],
      },
      {
        name_map: 'lim01',
        position: [3, 4],
      },
      {
        name_map: 'mont',
        position: [2, 1],
      },
      {
        name_map: 'or56m',
        position: [5, 3],
      },
      {
        name_map: 'or865',
        position: [-1, 3],
      },
      {
        name_map: 'orange-over-purple',
        // src: 'orange-over-purple0',
        position: [0, 1],
      },
      {
        name_map: 'redpark',
        position: [2, 2],
      },
      {
        name_map: 'til42',
        position: [4, 4],
      },
      {
        name_map: 'todarp',
        position: [0, 2],
      },
      {
        name_map: 'trvc',
        position: [3, 1],
      },
      {
        name_map: 'ubrig',
        position: [2, 0],
      },
      {
        name_map: 'vlit6',
        position: [5, 4],
      },
      {
        name_map: 'wen6x',
        position: [3, 3],
      },
      {
        name_map: 'yupark',
        position: [1, 2],
      },
      {
        name_map: 'zax-shop',
        position: [1, 1],
      },
    ];
    // 7x6 (16*3)

    const dim = BiomeCyberiaEngine.PixiCyberiaBiomeCyberiaDim / (cut.enable ? cut.x2 - cut.x1 + 1 : 7); // 16 * 3 * 10; // this.MetaData.dim * 0.17;
    const sumFactor = 1; // center
    const solid = {};
    const color = {};

    if (cut.enable) {
      BiomeCyberiaMatrixCyberia.dim = 16 * (cut.x2 - cut.x1 + 1);
    }

    for (const y of range(-1 + sumFactor, 5 + sumFactor)) {
      if (cut.enable && (y < cut.y1 || y > cut.y2)) continue;
      solid[y] = {};
      color[y] = {};
      for (const x of range(-1 + sumFactor, 5 + sumFactor)) {
        if (cut.enable && (x < cut.x1 || x > cut.x2)) continue;
        const dataSection = mapData.find(
          (d) => d.position && d.position[0] + sumFactor === x && d.position[1] + sumFactor === y,
        );
        // #282828
        let src;
        let sectionColorMatrixCyberia;
        if (dataSection) {
          src = `${getProxyPath()}assets/custom-biome/seed-city/${
            dataSection.src ? dataSection.src : dataSection.name_map
          }.png`;
          if (cut.enable) {
            const result = await CyberiaTileService.post({ id: 'hex-matrix-from-png', body: { src } });

            sectionColorMatrixCyberia = result.data.hexMatrix;
          }

          // get hex color matrix
        } else src = `${getProxyPath()}assets/custom-biome/seed-city/void.png`;

        let sectionSolidMatrixCyberia;
        if (dataSection) {
          const allData = JSON.parse(
            await CoreService.getRaw({
              url: `${getProxyPath()}assets/custom-biome/seed-city/${dataSection.name_map}.metadata.json`,
            }),
          );

          sectionSolidMatrixCyberia = allData.matrix.map((row) => row.map((value) => (value === 1 ? 1 : 0)));
        } else {
          // new Array(48) -> [empty x 48]
          sectionSolidMatrixCyberia = new Array(16).fill().map(() => new Array(16).fill().map(() => 0));
          sectionColorMatrixCyberia = new Array(48).fill().map(() => new Array(48).fill().map(() => ''));
        }

        color[y][x] = sectionColorMatrixCyberia;

        solid[y][x] = amplifyMatrix(sectionSolidMatrixCyberia, 3);

        BiomeCyberiaMatrixCyberia.setBiomeCyberia.push({
          src,
          dim,
          // camera
          x: cut.enable ? x - sumFactor + (1 - cut.x1) : x,
          y: cut.enable ? y - sumFactor + (1 - cut.y1) : y,
        });
      }
    }

    if (cut.enable) delete BiomeCyberiaMatrixCyberia.setBiomeCyberia;
    console.warn('seed-city generator matrix', { solid });
    BiomeCyberiaMatrixCyberia.solid = mergeMatrices(solid);

    // slice force length
    // const newColor = {};
    // for (const key of Object.keys(color)) {
    //   newColor[key] = {};
    //   for (const key0 of Object.keys(color[key])) {
    //     newColor[key][key0] = color[key][key0]
    //       .slice(0, color[key][key0].length > 16 * 3 ? -1 * (color[key][key0].length - 16 * 3) : undefined)
    //       .map((y) => y.slice(0, y.length > 16 * 3 ? -1 * (y.length - 16 * 3) : undefined));
    //   }
    // }
    // console.error({ newColor });
    // if (cut.enable) BiomeCyberiaMatrixCyberia.color = mergeMatrices(newColor);
    console.warn('seed-city generator matrix', { color });
    if (cut.enable) BiomeCyberiaMatrixCyberia.color = mergeMatrices(color);

    // top level solid
    if (cut.enable) {
      const defaultMatrixColor = getMostFrequentValue(BiomeCyberiaMatrixCyberia.color.flat());
      {
        const dimPixel = (cut.x2 - cut.x1 + 1) * 16 * BiomeCyberiaMatrixCyberia.dimPaintByCell;

        for (const y of range(0, dimPixel - 1)) {
          if (BiomeCyberiaMatrixCyberia.solid[y] === undefined)
            BiomeCyberiaMatrixCyberia.solid[y] = new Array(dimPixel).fill().map(() => 0);
          else
            for (const x of range(0, dimPixel - 1))
              if (BiomeCyberiaMatrixCyberia.solid[y][x] === undefined) BiomeCyberiaMatrixCyberia.solid[y][x] = 0;

          if (BiomeCyberiaMatrixCyberia.color[y] === undefined)
            BiomeCyberiaMatrixCyberia.color[y] = new Array(dimPixel).fill().map(() => '');
          else
            for (const x of range(0, dimPixel - 1))
              if (BiomeCyberiaMatrixCyberia.color[y][x] === undefined) BiomeCyberiaMatrixCyberia.color[y][x] = '';

          BiomeCyberiaMatrixCyberia.topLevelColor[y] = new Array(dimPixel).fill().map(() => '');
        }

        BiomeCyberiaMatrixCyberia.color[dimPixel - 1][dimPixel - 1] = defaultMatrixColor;
      }
      {
        const originColor = newInstance(BiomeCyberiaMatrixCyberia.color);
        let newSolid = newInstance(BiomeCyberiaMatrixCyberia.solid);

        let y = -1;
        for (const row of BiomeCyberiaMatrixCyberia.solid) {
          y++;
          let x = -1;
          for (const value of row) {
            x++;

            const target = BiomeCyberiaMatrixCyberia.solid[y][x] === 1;

            {
              const botLimit =
                BiomeCyberiaMatrixCyberia.solid[y + 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y + 1][x] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y + 1][x] === 1 &&
                BiomeCyberiaMatrixCyberia.solid[y] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y][x + 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y][x + 1] === 1 &&
                BiomeCyberiaMatrixCyberia.solid[y + 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y + 1][x + 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y + 1][x + 1] === 1;

              const supLimit =
                BiomeCyberiaMatrixCyberia.solid[y - 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y - 1][x] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y - 1][x] === 0 &&
                BiomeCyberiaMatrixCyberia.solid[y] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y][x - 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y][x - 1] === 0 &&
                BiomeCyberiaMatrixCyberia.solid[y - 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y - 1][x - 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y - 1][x - 1] === 0;

              if (target && supLimit && botLimit) {
                BiomeCyberiaMatrixCyberia.solid[y][x] = 2;
                let y0AbsIndex = 0;
                let y0 = newInstance(y) + 1;
                while (BiomeCyberiaMatrixCyberia.solid[y0][x] === 1) {
                  y0AbsIndex++;
                  y0++;
                  if (BiomeCyberiaMatrixCyberia.solid[y0] === undefined) BiomeCyberiaMatrixCyberia.solid[y0] = [];
                }
                BiomeCyberiaMatrixCyberia.solid[y0 - parseInt(y0AbsIndex / 2) - 2][x] = 3;

                let x0AbsIndex = 0;
                let x0 = newInstance(x) + 1;
                while (BiomeCyberiaMatrixCyberia.solid[y0 - parseInt(y0AbsIndex / 2) - 2][x0] === 1) {
                  x0AbsIndex++;
                  x0++;
                }
                BiomeCyberiaMatrixCyberia.solid[y0 - parseInt(y0AbsIndex / 2) - 2][x0 - 1] = 4;

                const topLevelX1 = newInstance(x);
                const topLevelY1 = newInstance(y);
                const topLevelX2 = newInstance(x0 - 1);
                const topLevelY2 = newInstance(y0 - parseInt(y0AbsIndex / 2) - 2);

                for (const yt of range(topLevelY1, topLevelY2)) {
                  for (const xt of range(topLevelX1, topLevelX2)) {
                    newSolid[yt][xt] = 0;
                    BiomeCyberiaMatrixCyberia.topLevelColor[yt][xt] = newInstance(originColor[yt][xt]);
                    BiomeCyberiaMatrixCyberia.color[yt][xt] = defaultMatrixColor;
                  }
                }
              }
            }
          }
        }

        if (BiomeCyberiaMatrixCyberia.topLevelColor[0] === undefined) BiomeCyberiaMatrixCyberia.topLevelColor[0] = {};
        BiomeCyberiaMatrixCyberia.topLevelColor[0][0] = defaultMatrixColor;

        if (BiomeCyberiaMatrixCyberia.topLevelColor[newSolid[0].length - 1] === undefined)
          BiomeCyberiaMatrixCyberia.topLevelColor[newSolid[0].length - 1] = [];
        BiomeCyberiaMatrixCyberia.topLevelColor[newSolid[0].length - 1][newSolid[0].length - 1] = defaultMatrixColor;

        BiomeCyberiaMatrixCyberia.solid = newSolid;
      }
    }

    s(`.biome-dim`).value = BiomeCyberiaMatrixCyberia.dim;
    s(`.biome-dimPaintByCell`).value = BiomeCyberiaMatrixCyberia.dimPaintByCell;

    return BiomeCyberiaMatrixCyberia;
  },
};

export { SeedCityCyberiaBiome };
