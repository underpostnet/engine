import { newInstance, random, range } from '../core/CommonJs.js';
import { BiomeCyberiaParamsScope } from '../cyberia-admin/BiomeCyberiaAdmin.js';
const GridBaseCyberiaBiome = {
  id: 'grid-base',
  render: async function (options = { type: '' }) {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;
    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      topLevelColor: {},
    };
    range(0, 5).map((layer) => {
      BiomeCyberiaMatrixCyberia[`${'layer'}${layer}`] = {};
      BiomeCyberiaMatrixCyberia[`${'topLayer'}${layer}`] = {};
    });
    const cellLimitAreaFactor = 2;
    const getLimitAreaRestriction = (x, y) =>
      x < dim - 1 - cellLimitAreaFactor &&
      x > cellLimitAreaFactor &&
      y < dim - 1 - cellLimitAreaFactor &&
      y > cellLimitAreaFactor;

    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};
        if (!BiomeCyberiaMatrixCyberia.topLevelColor[y]) BiomeCyberiaMatrixCyberia.topLevelColor[y] = {};

        range(0, 5).map((layer) => {
          if (!BiomeCyberiaMatrixCyberia[`${'layer'}${layer}`][y]) {
            BiomeCyberiaMatrixCyberia[`${'layer'}${layer}`][y] = {};
            BiomeCyberiaMatrixCyberia[`${'topLayer'}${layer}`][y] = {};
          }
        });
        const limitAreaRestriction = getLimitAreaRestriction(x, y);

        const cellDim = 5;

        BiomeCyberiaMatrixCyberia.solid[y][x] = limitAreaRestriction ? 0 : 1;

        if ((x === 0 && y === 0) || (x === dim - 1 && y === dim - 1)) {
          BiomeCyberiaMatrixCyberia.topLevelColor[y][x] = `#282828`;
        }

        if (
          y % (BiomeCyberiaParamsScope.dimPaintByCell * cellDim) === 0 &&
          x % (BiomeCyberiaParamsScope.dimPaintByCell * cellDim) === 0
        ) {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#bd09ce`;
        } else if (
          (x % (BiomeCyberiaParamsScope.dimPaintByCell * cellDim) === 0 && !limitAreaRestriction) ||
          (y % (BiomeCyberiaParamsScope.dimPaintByCell * cellDim) === 0 && !limitAreaRestriction)
        ) {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#ffff03`;
        } else if (y % (BiomeCyberiaParamsScope.dimPaintByCell * cellDim) === 0) {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#ee0e0e`;
        } else if (x % (BiomeCyberiaParamsScope.dimPaintByCell * cellDim) === 0) {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#0e12ee`;
        } else if (limitAreaRestriction) {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#7885c7`;
        } else {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#282828`;
        }
      });
    });

    switch (options.type) {
      case 'shop':
        {
          range(0, dim - 1).map((y) => {
            range(0, dim - 1).map((x) => {
              if (BiomeCyberiaMatrixCyberia.color[y][x] === `#ee0e0e`) {
                const limitBuild = BiomeCyberiaParamsScope.dimPaintByCell * 2 - 1;
                if (
                  (!BiomeCyberiaMatrixCyberia.color[y][x - 1] ||
                    BiomeCyberiaMatrixCyberia.color[y][x - 1] !== '#00ff00') &&
                  random(0, 2) === 0
                )
                  try {
                    range(0, limitBuild).map((sumY) => {
                      range(0, limitBuild).map((sumX) => {
                        if (
                          BiomeCyberiaMatrixCyberia.color[y + sumY] &&
                          (BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] === `#ffff03` ||
                            BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] === `#282828` ||
                            BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] === `#bd09ce`)
                        ) {
                          throw new Error('');
                        }
                      });
                    });
                    range(0, limitBuild).map((sumY) => {
                      range(0, limitBuild).map((sumX) => {
                        if (
                          x % (cellLimitAreaFactor + 1) === 0 &&
                          y % (cellLimitAreaFactor + 1) === 0 &&
                          BiomeCyberiaMatrixCyberia.color[y + sumY] &&
                          BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX]
                        ) {
                          if (sumY > BiomeCyberiaParamsScope.dimPaintByCell - 1) {
                            BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = '#006300';
                            BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = 1;
                            if (sumY === BiomeCyberiaParamsScope.dimPaintByCell && sumX === 0) {
                              BiomeCyberiaMatrixCyberia[`topLayer${0}`][y][x] = {
                                src: 'assets/furnies/wood-products-shelf/08/top.png',
                                width: cellLimitAreaFactor * 2 + 1,
                                height: cellLimitAreaFactor + 1,
                              };
                              BiomeCyberiaMatrixCyberia[`layer${2}`][y + sumY][x] = {
                                src: 'assets/furnies/wood-products-shelf/08/bottom.png',
                                width: cellLimitAreaFactor * 2 + 1,
                                height: cellLimitAreaFactor + 1,
                              };
                            }
                          } else {
                            BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = '#4d4d4d';
                            BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = '#00ff00';
                          }
                        }
                      });
                    });
                  } catch (error) {}
              }
            });
          });

          range(0, dim - 1).map((y) => {
            range(0, dim - 1).map((x) => {
              const limitAreaRestriction = getLimitAreaRestriction(x, y);
              if (!limitAreaRestriction && x % (cellLimitAreaFactor + 1) === 0 && y % (cellLimitAreaFactor + 1) === 0) {
                if (y === (cellLimitAreaFactor + 1) * 4)
                  range(0, cellLimitAreaFactor).map((sumY) => {
                    range(0, cellLimitAreaFactor).map((sumX) => {
                      if (
                        BiomeCyberiaMatrixCyberia.color[y + sumY] &&
                        BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX]
                      ) {
                        BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ffffff`;
                        BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = 0;
                      }
                    });
                  });
                else if (
                  random(1, 10) === 1 &&
                  BiomeCyberiaMatrixCyberia.color[y][x] !== `#ffffff` &&
                  BiomeCyberiaMatrixCyberia.color[y][x] === `#ffff03`
                ) {
                  let validA = true,
                    validB = true,
                    validC = true,
                    validD = true;

                  range(0, cellLimitAreaFactor).map((sum) => {
                    if (
                      !BiomeCyberiaMatrixCyberia.color[y + sum] ||
                      BiomeCyberiaMatrixCyberia.color[y + sum][x - 1] !== `#7885c7`
                    )
                      validA = false;
                  });

                  range(0, cellLimitAreaFactor).map((sum) => {
                    if (
                      !BiomeCyberiaMatrixCyberia.color[y + sum] ||
                      BiomeCyberiaMatrixCyberia.color[y + sum][x + cellLimitAreaFactor + 1] !== `#7885c7`
                    )
                      validB = false;
                  });

                  range(0, cellLimitAreaFactor).map((sum) => {
                    if (
                      !BiomeCyberiaMatrixCyberia.color[y - 1] ||
                      BiomeCyberiaMatrixCyberia.color[y - 1][x + sum] !== `#7885c7`
                    )
                      validC = false;
                  });

                  range(0, cellLimitAreaFactor).map((sum) => {
                    if (
                      !BiomeCyberiaMatrixCyberia.color[y + cellLimitAreaFactor + 1] ||
                      BiomeCyberiaMatrixCyberia.color[y + cellLimitAreaFactor + 1][x + sum] !== `#7885c7`
                    )
                      validD = false;
                  });

                  if (validA || validB || validC || validD)
                    range(0, cellLimitAreaFactor).map((sumY) => {
                      range(0, cellLimitAreaFactor).map((sumX) => {
                        if (
                          BiomeCyberiaMatrixCyberia.color[y + sumY] &&
                          BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX]
                        ) {
                          BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ffffff`;
                          BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = 0;
                        }
                      });
                    });
                }
              }
            });
          });

          {
            const typeLayer = 'layer';
            const layer = 0;
            range(0, dim - 1).map((y) => {
              range(0, dim - 1).map((x) => {
                if (x % (cellLimitAreaFactor + 1) === 0 && y % (cellLimitAreaFactor + 1) === 0) {
                  if (y === 0 && BiomeCyberiaMatrixCyberia.color[y][x] !== `#ffffff`) {
                    BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x] = {
                      src: 'assets/furnies/wood-wall-window/08/0.png',
                      dim: cellLimitAreaFactor + 1,
                    };
                  }
                  if (x === 0 && BiomeCyberiaMatrixCyberia.color[y][x] !== `#ffffff`) {
                    BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x] = {
                      src: 'assets/furnies/wood-wall/08/0.png',
                      dim: cellLimitAreaFactor + 1,
                    };
                  }
                  if (x === dim - cellLimitAreaFactor - 1 && BiomeCyberiaMatrixCyberia.color[y][x] !== `#ffffff`) {
                    BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x] = {
                      src: 'assets/furnies/wood-wall/08/0.png',
                      dim: cellLimitAreaFactor + 1,
                    };
                  }
                  if (y === dim - cellLimitAreaFactor - 1 && BiomeCyberiaMatrixCyberia.color[y][x] !== `#ffffff`) {
                    BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x] = {
                      src: 'assets/furnies/wood-wall/08/0.png',
                      dim: cellLimitAreaFactor + 1,
                      params: {
                        rotation: Math.PI / 2,
                      },
                    };
                  }
                  if (!BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x]) {
                    BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x] = {
                      src: 'assets/furnies/wood-floor/08/0.png',
                      dim: cellLimitAreaFactor + 1,
                    };
                  }
                }
              });
            });
          }
        }

        {
          // wood tables
          // const y1 = random(0, parseInt((dim - 1) / 2));
          const y1 = BiomeCyberiaParamsScope.dimPaintByCell * random(0, 4);
          const y2 = BiomeCyberiaParamsScope.dimPaintByCell * random(4, 6);
          const x1 = BiomeCyberiaParamsScope.dimPaintByCell * random(2, 3);
          const conClose = random(0, 1);

          range(0, dim - 1).map((y) => {
            range(0, dim - 1).map((x) => {
              if ((conClose === 0 && x === x1 && y === y1) || (conClose === 1 && x === x1 && y === y1 + y2)) {
                range(cellLimitAreaFactor + 1, x1).map((_x1) => {
                  range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1).map((sumY) => {
                    range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1).map((sumX) => {
                      if (BiomeCyberiaMatrixCyberia.color[y + sumY]) {
                        BiomeCyberiaMatrixCyberia.color[y + sumY][_x1 + sumX] = '#000000';
                        BiomeCyberiaMatrixCyberia.solid[y + sumY][_x1 + sumX] = 1;
                        if (
                          (y + sumY) % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
                          (_x1 + sumX) % BiomeCyberiaParamsScope.dimPaintByCell === 0
                        )
                          BiomeCyberiaMatrixCyberia[`layer${1}`][y + sumY][_x1 + sumX] = {
                            src: 'assets/furnies/wood-table-front/08/0.png',
                            dim: cellLimitAreaFactor + 1,
                            // params: {
                            //   rotation: Math.PI / 2,
                            // },
                          };
                      }
                    });
                  });
                });
              }
            });
          });

          range(0, dim - 1).map((y) => {
            range(0, dim - 1).map((x) => {
              if (
                x % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
                y % BiomeCyberiaParamsScope.dimPaintByCell === 0
              ) {
                if (x === x1 && y >= y1 && y <= y1 + y2) {
                  range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1).map((sumY) => {
                    range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1).map((sumX) => {
                      if (BiomeCyberiaMatrixCyberia.color[y + sumY]) {
                        BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = '#ffffff';
                        BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = 1;
                      }
                    });
                  });

                  BiomeCyberiaMatrixCyberia[`layer${1}`][y][x] = {
                    src: `assets/furnies/wood-table${y === y1 + y2 && x === x1 ? '-front' : ''}/08/0.png`,
                    dim: cellLimitAreaFactor + 1,
                    // params: {
                    //   rotation: Math.PI / 2,
                    // },
                  };
                }
              }
            });
          });
        }

        break;

      default:
        {
          // wood tables
          // const y1 = random(0, parseInt((dim - 1) / 2));
          const y1 = BiomeCyberiaParamsScope.dimPaintByCell * random(0, 4);
          const y2 = BiomeCyberiaParamsScope.dimPaintByCell * random(4, 6);
          const x1 = BiomeCyberiaParamsScope.dimPaintByCell * random(2, 3);
          range(0, dim - 1).map((y) => {
            range(0, dim - 1).map((x) => {
              if (
                x % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
                y % BiomeCyberiaParamsScope.dimPaintByCell === 0
              ) {
                if (x === x1 && y >= y1 && y <= y1 + y2) {
                  range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1).map((sumY) => {
                    range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1).map((sumX) => {
                      if (BiomeCyberiaMatrixCyberia.color[y + sumY]) {
                        BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = '#ffffff';
                      }
                    });
                  });
                }
              }
            });
          });

          const conClose = random(0, 1);
          range(0, dim - 1).map((y) => {
            range(0, dim - 1).map((x) => {
              if ((conClose === 0 && x === x1 && y === y1) || (conClose === 1 && x === x1 && y === y1 + y2)) {
                range(cellLimitAreaFactor + 1, x1).map((_x1) => {
                  range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1).map((sumY) => {
                    range(0, BiomeCyberiaParamsScope.dimPaintByCell - 1).map((sumX) => {
                      if (BiomeCyberiaMatrixCyberia.color[y + sumY]) {
                        BiomeCyberiaMatrixCyberia.color[y + sumY][_x1 + sumX] = '#000000';
                      }
                    });
                  });
                });
              }
            });
          });
        }
        break;
    }

    return BiomeCyberiaMatrixCyberia;
  },
};

export { GridBaseCyberiaBiome };
