import { CyberiaBiomeModel } from '../../../api/cyberia-biome/cyberia-biome.model.js';
import { CyberiaWorldModel } from '../../../api/cyberia-world/cyberia-world.model.js';
import { getId, random, range } from '../../../client/components/core/CommonJs.js';
import {
  BaseElement,
  CyberiaParams,
  WorldType,
  getRandomAvailablePosition,
  isCollision,
} from '../../../client/components/cyberia/CommonCyberia.js';
import pathfinding from 'pathfinding';

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
          initPosition: { x, y },
          cellRadiusMovement: 3,
          movementPath: [],
          movementInterval: setInterval(() => {
            if (this.localElementScope[wsManagementId][id].movementPath.length === 0) {
              let x;
              let y;
              while (
                !x ||
                !y ||
                isCollision({ biomeData: biome, element: bot, x, y })
                // ||
                // (this.element[wsManagementId][id].x === x && this.element[wsManagementId][id].y === y)
              ) {
                x =
                  this.element[wsManagementId][id].x +
                  random(
                    -1 * this.localElementScope[wsManagementId][id].cellRadiusMovement,
                    this.localElementScope[wsManagementId][id].cellRadiusMovement,
                  );
                y =
                  this.element[wsManagementId][id].y +
                  random(
                    -1 * this.localElementScope[wsManagementId][id].cellRadiusMovement,
                    this.localElementScope[wsManagementId][id].cellRadiusMovement,
                  );
              }
              this.localElementScope[wsManagementId][id].movementPath = this.pathfinding.findPath(
                this.element[wsManagementId][id].x,
                this.element[wsManagementId][id].y,
                x,
                y,
                new pathfinding.Grid(biome.solid.map((y) => y.map((x) => (x === 0 ? 0 : 1)))),
              );
            }
          }, CyberiaParams.CYBERIA_EVENT_CALLBACK_TIME),
        };
        this.element[wsManagementId][id] = bot;
      }
    })();
  },
};

export { CyberiaWsBotManagement };
