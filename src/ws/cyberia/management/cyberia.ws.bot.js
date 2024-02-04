import { CyberiaBiomeModel } from '../../../api/cyberia-biome/cyberia-biome.model.js';
import { CyberiaWorldModel } from '../../../api/cyberia-world/cyberia-world.model.js';
import {
  getId,
  insertTransitionCoordinates,
  objectEquals,
  random,
  range,
  round10,
  timer,
} from '../../../client/components/core/CommonJs.js';
import {
  BaseElement,
  CyberiaParams,
  WorldType,
  getRandomAvailablePosition,
  isCollision,
} from '../../../client/components/cyberia/CommonCyberia.js';
import pathfinding from 'pathfinding';
import { CyberiaWsBotChannel } from '../channels/cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './cyberia.ws.user.js';

const CyberiaWsBotManagement = {
  element: {},
  localElementScope: {},
  pathfinding: new pathfinding.AStarFinder(),
  worlds: [],
  biomes: [],
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this.localElementScope[wsManagementId] = {};
    this.pathfinding = new pathfinding.AStarFinder({
      allowDiagonal: true, // enable diagonal
      dontCrossCorners: true, // corner of a solid
      heuristic: pathfinding.Heuristic.chebyshev,
    });
    (async () => {
      this.worlds = await CyberiaWorldModel.find();
      this.biomes = await CyberiaBiomeModel.find();
      for (const indexBot of range(0, 12)) {
        const bot = BaseElement().bot.main;
        const world = this.worlds.find((world) => world._id.toString() === bot.model.world._id);
        bot.model.world.face = WorldType[world.type].worldFaces[random(0, WorldType[world.type].worldFaces.length - 1)];
        const biome = this.biomes.find(
          (biome) => biome._id.toString() === world.face[bot.model.world.face - 1].toString(),
        );
        const { x, y } = getRandomAvailablePosition({ biomeData: biome, element: bot });
        bot.x = x;
        bot.y = y;
        const id = getId(this.element[wsManagementId], 'bot-');
        this.localElementScope[wsManagementId][id] = {
          movement: {
            InitPosition: { x, y },
            CellRadius: 3,
            Path: [],
            Callback: async () => {
              let x;
              let y;
              while (
                !x ||
                !y ||
                isCollision({ biomeData: biome, element: this.element[wsManagementId][id], x, y })
                // ||
                // (this.element[wsManagementId][id].x === x && this.element[wsManagementId][id].y === y)
              ) {
                x =
                  this.localElementScope[wsManagementId][id].movement.InitPosition.x +
                  random(
                    -1 * this.localElementScope[wsManagementId][id].movement.CellRadius,
                    this.localElementScope[wsManagementId][id].movement.CellRadius,
                  );
                y =
                  this.localElementScope[wsManagementId][id].movement.InitPosition.y +
                  random(
                    -1 * this.localElementScope[wsManagementId][id].movement.CellRadius,
                    this.localElementScope[wsManagementId][id].movement.CellRadius,
                  );
              }
              this.localElementScope[wsManagementId][id].movement.Path = this.pathfinding.findPath(
                round10(this.element[wsManagementId][id].x),
                round10(this.element[wsManagementId][id].y),
                x,
                y,
                new pathfinding.Grid(biome.solid.map((y) => y.map((x) => (x === 0 ? 0 : 1)))),
              );

              const transitionFactor = 4;
              this.localElementScope[wsManagementId][id].movement.Path = insertTransitionCoordinates(
                this.localElementScope[wsManagementId][id].movement.Path,
                transitionFactor,
              );

              for (const point of this.localElementScope[wsManagementId][id].movement.Path) {
                this.element[wsManagementId][id].x = point[0];
                this.element[wsManagementId][id].y = point[1];

                for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
                  if (
                    objectEquals(
                      CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
                      this.element[wsManagementId][id].model.world,
                    )
                  ) {
                    CyberiaWsBotChannel.client[clientId].emit(
                      CyberiaWsBotChannel.channel,
                      JSON.stringify({
                        status: 'update-position',
                        id,
                        element: { x: this.element[wsManagementId][id].x, y: this.element[wsManagementId][id].y },
                      }),
                    );
                  }
                }

                await timer(CyberiaParams.CYBERIA_EVENT_CALLBACK_TIME);
              }
              this.localElementScope[wsManagementId][id].movement.Callback();
            },
          },
        };

        this.element[wsManagementId][id] = bot;
        this.localElementScope[wsManagementId][id].movement.Callback();
      }
    })();
  },
};

export { CyberiaWsBotManagement };
