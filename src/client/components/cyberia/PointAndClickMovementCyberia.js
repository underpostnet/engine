import { JSONmatrix, insertTransitionCoordinates, newInstance, round10, s4, timer } from '../core/CommonJs.js';
import { Responsive } from '../core/Responsive.js';
import { append, s } from '../core/VanillaJs.js';
import { BiomeCyberiaScope } from './BiomeCyberia.js';
import { CyberiaParams } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';

const PointAndClickMovementCyberia = {
  Event: {},
  callback: null,
  Render: async function () {
    const id = `PointAndClickMovementCyberia`;
    append('body', html` <div class="abs ${id}-container"></div> `);
    this[`callback`] = () => {
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({
        dimAmplitude: MatrixCyberia.Data.dimAmplitude,
      });
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

    let idPath;
    s(`.${id}-container`).onclick = async (e = new PointerEvent()) => {
      console.log(e);
      if (e.target.className.match('action-panel') || e.srcElement.className.match('action-panel')) return;
      idPath = s4() + s4();
      const currentIdPath = idPath;

      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({
        dimAmplitude: MatrixCyberia.Data.dimAmplitude,
      });

      const matrixDim = MatrixCyberia.Data.dim * 1; // MatrixCyberia.Data.dimPaintByCell;

      const x = (matrixDim * e.offsetX) / ResponsiveDataAmplitude.minValue;
      const y = (matrixDim * e.offsetY) / ResponsiveDataAmplitude.minValue;

      for (const eventKey of Object.keys(this.Event)) this.Event[eventKey]({ x, y });

      // console.log({ x, y, e: ElementsCyberia.Data.user.main });

      const collisionMatrixCyberia =
        BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId].mainUserCollisionMatrixCyberia;

      // console.log(JSONmatrix(collisionMatrixCyberia));

      const Path = insertTransitionCoordinates(
        this.pathfinding.findPath(
          round10(ElementsCyberia.Data.user.main.x),
          round10(ElementsCyberia.Data.user.main.y),
          round10(x),
          round10(y),
          new pathfinding.Grid(collisionMatrixCyberia.length, collisionMatrixCyberia.length, collisionMatrixCyberia),
        ),
        CyberiaParams.MOVEMENT_TRANSITION_FACTOR * (0.3 / ElementsCyberia.Data.user.main.vel),
      );

      console.log(Path);

      ElementsCyberia.LocalDataScope['user']['main'].path = Path;
      PixiCyberia.renderMarker({ x, y });

      if (ElementsCyberia.LocalDataScope['user']['main'].path[0])
        for (const point of newInstance(ElementsCyberia.LocalDataScope['user']['main'].path)) {
          await timer(CyberiaParams.EVENT_CALLBACK_TIME);
          if (currentIdPath === idPath) {
            ElementsCyberia.Data.user.main.x = point[0];
            ElementsCyberia.Data.user.main.y = point[1];
            PixiCyberia.updatePosition({ type: 'user', id: 'main' });
            ElementsCyberia.LocalDataScope['user']['main'].path.shift();
          }
        }
      return;

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

export { PointAndClickMovementCyberia };
