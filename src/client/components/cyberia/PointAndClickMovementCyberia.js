import { JSONmatrix, insertTransitionCoordinates, newInstance, round10, s4, timer } from '../core/CommonJs.js';
import { Responsive } from '../core/Responsive.js';
import { append, s } from '../core/VanillaJs.js';
import { BiomeCyberiaScope } from './BiomeCyberia.js';
import { CyberiaParams, isElementCollision } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';

const PointAndClickMovementCyberia = {
  TargetEvent: {},
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

      {
        const botCollision = Object.keys(ElementsCyberia.Data['bot']).find((botId) =>
          isElementCollision({
            A: {
              x,
              y,
              dim: 1,
            },
            B: ElementsCyberia.Data['bot'][botId],
            dimPaintByCell: MatrixCyberia.Data.dimPaintByCell,
          }),
        );
        if (botCollision) {
          ElementsCyberia.LocalDataScope['user']['main']['skill'][0]();
        }
      }
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
          if (
            currentIdPath === idPath &&
            !PixiCyberia.transportBlock &&
            !ElementsCyberia.LocalDataScope['user']['main'].immunityQuestModalDialog
          ) {
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
    this.Event['main-user'] = async ({ x, y }) => {
      let mainUserPanel = false;
      for (const type of ['user', 'bot']) {
        for (const elementId of Object.keys(ElementsCyberia.Data[type])) {
          if (
            isElementCollision({
              A: { x, y, dim: 1 },
              B: ElementsCyberia.Data[type][elementId],
              dimPaintByCell: MatrixCyberia.Data.dimPaintByCell,
            })
          ) {
            if (type === 'user' && elementId === 'main') mainUserPanel = true;
            else {
              this.TriggerTargetEvents({ type, id: elementId });
              return;
            }
          }
        }
      }
      if (mainUserPanel) this.TriggerTargetEvents({ type: 'user', id: 'main' });
    };
  },
  TriggerTargetEvents: async function ({ type, id }) {
    for (const eventKey of Object.keys(this.TargetEvent)) this.TargetEvent[eventKey]({ type, id });
  },
};

export { PointAndClickMovementCyberia };
