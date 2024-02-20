import { JSONmatrix, insertTransitionCoordinates, round10 } from '../core/CommonJs.js';
import { Responsive } from '../core/Responsive.js';
import { append, s } from '../core/VanillaJs.js';
import { BiomeScope } from './Biome.js';
import { CyberiaParams } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { Matrix } from './Matrix.js';

const PointAndClickMovement = {
  callback: null,
  Render: async function () {
    const id = `PointAndClickMovement`;
    append('body', html` <div class="abs ${id}-container"></div> `);
    this[`callback`] = () => {
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: Matrix.Data.dimAmplitude });
      // const ResponsiveData = Responsive.getResponsiveData();
      s(`.${id}-container`).style.width = `${ResponsiveDataAmplitude.minValue}px`;
      s(`.${id}-container`).style.height = `${ResponsiveDataAmplitude.minValue}px`;
    };
    this[`callback`]();
    Responsive.Event[id] = this[`callback`];

    window.pathfinding = PF;

    this.pathfinding = new pathfinding.AStarFinder({
      allowDiagonal: true, // enable diagonal
      dontCrossCorners: true, // corner of a solid
      heuristic: pathfinding.Heuristic.chebyshev,
    });

    s(`.${id}-container`).onclick = (e = new PointerEvent()) => {
      console.log(e);

      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: Matrix.Data.dimAmplitude });

      const matrixDim = Matrix.Data.dim * 1; // Matrix.Data.dimPaintByCell;

      const x = (matrixDim * e.offsetX) / ResponsiveDataAmplitude.minValue;
      const y = (matrixDim * e.offsetY) / ResponsiveDataAmplitude.minValue;

      console.log({ x, y, e: Elements.Data.user.main });

      const collisionMatrix = BiomeScope.Data[Matrix.Data.biomeDataId].mainUserCollisionMatrix;

      console.log(JSONmatrix(collisionMatrix));

      const Path = insertTransitionCoordinates(
        this.pathfinding.findPath(
          round10(Elements.Data.user.main.x),
          round10(Elements.Data.user.main.y),
          round10(x),
          round10(y),
          new pathfinding.Grid(collisionMatrix.length, collisionMatrix.length, collisionMatrix),
        ),
        CyberiaParams.MOVEMENT_TRANSITION_FACTOR,
      );

      console.log(Path);

      append(
        `.${id}-container`,
        html`
          <div
            class="abs marker"
            style="background: red; width: 20px; height: 20px; top: ${e.offsetY}px; left: ${e.offsetX}px"
          ></div>
        `,
      );
    };
  },
};

export { PointAndClickMovement };
