import { CyberiaBiomeModel } from '../../../api/cyberia-biome/cyberia-biome.model.js';
import { CyberiaWorldModel } from '../../../api/cyberia-world/cyberia-world.model.js';
import {
  JSONmatrix,
  getDirection,
  getDistance,
  getId,
  insertTransitionCoordinates,
  newInstance,
  objectEquals,
  random,
  range,
  round10,
  timer,
} from '../../../client/components/core/CommonJs.js';
import {
  BaseElement,
  CyberiaParams,
  SkillType,
  WorldType,
  getCollisionMatrix,
  getRandomAvailablePosition,
  isBiomeCollision,
  updateMovementDirection,
} from '../../../client/components/cyberia/CommonCyberia.js';
import pathfinding from 'pathfinding';
import { CyberiaWsBotChannel } from '../channels/cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './cyberia.ws.user.js';
import { loggerFactory } from '../../../server/logger.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsSkillManagement } from './cyberia.ws.skill.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

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
      for (const indexBot of range(0, 39)) {
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

        if (!fs.existsSync(`./tmp/${biome._id.toString()}.json`))
          fs.writeFileSync(`./tmp/${biome._id.toString()}.json`, JSONmatrix(getCollisionMatrix(biome, bot)), 'utf8');
        const collisionMatrix = JSON.parse(fs.readFileSync(`./tmp/${biome._id.toString()}.json`, 'utf8'));

        logger.info(`${wsManagementId} Load bot`, { index: indexBot, face: bot.model.world.face, x, y });

        this.localElementScope[wsManagementId][id] = {
          target: {
            Interval: 8, // detector target check time (ms)
            Radius: 4,
            Active: false,
            IndexPoint: -1,
            Direction: 'n',
            Element: {
              type: '',
              id: '',
            },
          },
          movement: {
            Direction: undefined,
            InitPosition: { x, y },
            CellRadius: 3,
            Path: [],
            TransitionFactor: CyberiaParams.MOVEMENT_TRANSITION_FACTOR,
            Callback: async () => {
              try {
                let x;
                let y;
                if (!this.localElementScope[wsManagementId][id].target.Active) {
                  while (
                    !x ||
                    !y ||
                    isBiomeCollision({ biomeData: biome, element: this.element[wsManagementId][id], x, y })
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
                  // TODO: rounding generates undefined index 0
                  const Path = insertTransitionCoordinates(
                    this.pathfinding.findPath(
                      round10(this.element[wsManagementId][id].x),
                      round10(this.element[wsManagementId][id].y),
                      x,
                      y,
                      new pathfinding.Grid(collisionMatrix),
                    ),
                    this.localElementScope[wsManagementId][id].movement.TransitionFactor,
                  );
                  this.localElementScope[wsManagementId][id].movement.Path = Path;
                }

                if (
                  this.localElementScope[wsManagementId][id].movement.Path.length === 0 ||
                  !this.localElementScope[wsManagementId][id].movement.Path[0]
                ) {
                  this.localElementScope[wsManagementId][id].target.Active = false;
                  this.localElementScope[wsManagementId][id].movement.Path = [
                    [this.element[wsManagementId][id].x, this.element[wsManagementId][id].y],
                  ];
                }
                for (const point of this.localElementScope[wsManagementId][id].movement.Path) {
                  let foundNewTargetPath = false;
                  this.localElementScope[wsManagementId][id].target.IndexPoint++;
                  if (
                    this.localElementScope[wsManagementId][id].target.IndexPoint ===
                    this.localElementScope[wsManagementId][id].target.Interval
                  ) {
                    this.localElementScope[wsManagementId][id].target.IndexPoint = -1;
                    foundNewTargetPath = (() => {
                      if (this.element[wsManagementId][id].life <= 0) return false;
                      const xBot = round10(this.element[wsManagementId][id].x);
                      const yBot = round10(this.element[wsManagementId][id].y);
                      for (const yTarget of range(
                        yBot - this.localElementScope[wsManagementId][id].target.Radius,
                        yBot + this.localElementScope[wsManagementId][id].target.Radius,
                      )) {
                        for (const xTarget of range(
                          xBot - this.localElementScope[wsManagementId][id].target.Radius,
                          xBot + this.localElementScope[wsManagementId][id].target.Radius,
                        )) {
                          for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
                            if (
                              CyberiaWsUserManagement.element[wsManagementId][clientId].life > 0 &&
                              objectEquals(
                                CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
                                this.element[wsManagementId][id].model.world,
                              ) &&
                              yTarget === round10(CyberiaWsUserManagement.element[wsManagementId][clientId].y) &&
                              xTarget === round10(CyberiaWsUserManagement.element[wsManagementId][clientId].x)
                            ) {
                              this.localElementScope[wsManagementId][id].target.Element.type = 'user';
                              this.localElementScope[wsManagementId][id].target.Element.id = clientId;

                              const Path = insertTransitionCoordinates(
                                this.pathfinding.findPath(
                                  xBot,
                                  yBot,
                                  round10(CyberiaWsUserManagement.element[wsManagementId][clientId].x),
                                  round10(CyberiaWsUserManagement.element[wsManagementId][clientId].y),
                                  new pathfinding.Grid(collisionMatrix),
                                ),
                                this.localElementScope[wsManagementId][id].movement.TransitionFactor,
                              );

                              if (
                                getDistance(
                                  this.localElementScope[wsManagementId][id].movement.Path[
                                    this.localElementScope[wsManagementId][id].movement.Path.length - 1
                                  ][0],
                                  this.localElementScope[wsManagementId][id].movement.Path[
                                    this.localElementScope[wsManagementId][id].movement.Path.length - 1
                                  ][1],
                                  Path[Path.length - 1][0],
                                  Path[Path.length - 1][1],
                                ) > 1.5
                              ) {
                                Path.pop();
                                Path.pop();
                                Path.pop();
                                this.localElementScope[wsManagementId][id].movement.Path = Path;
                                this.localElementScope[wsManagementId][id].target.Active = true;
                                return true;
                              }
                              return false;
                            }
                          }
                        }
                      }

                      this.localElementScope[wsManagementId][id].target.Active = false;
                      return false;
                    })();
                  }
                  if (foundNewTargetPath) break;

                  let newDirection = false;
                  const direction = getDirection({
                    x1: this.element[wsManagementId][id].x,
                    y1: this.element[wsManagementId][id].y,
                    x2: point[0],
                    y2: point[1],
                  });
                  if (
                    !this.localElementScope[wsManagementId][id].target.Active &&
                    direction !== this.localElementScope[wsManagementId][id].movement.Direction
                  ) {
                    this.localElementScope[wsManagementId][id].movement.Direction = direction;
                    this.element[wsManagementId][id] = updateMovementDirection({
                      direction,
                      element: this.element[wsManagementId][id],
                    });
                    newDirection = true;
                  }
                  this.element[wsManagementId][id].x = point[0];
                  this.element[wsManagementId][id].y = point[1];

                  for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
                    if (
                      objectEquals(
                        CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
                        this.element[wsManagementId][id].model.world,
                      )
                    ) {
                      CyberiaWsEmit(CyberiaWsBotChannel.channel, CyberiaWsBotChannel.client[clientId], {
                        status: 'update-position',
                        id,
                        element: { x: this.element[wsManagementId][id].x, y: this.element[wsManagementId][id].y },
                      });
                      if (newDirection)
                        CyberiaWsEmit(CyberiaWsBotChannel.channel, CyberiaWsBotChannel.client[clientId], {
                          status: 'update-skin-position',
                          id,
                          element: { components: { skin: this.element[wsManagementId][id].components.skin } },
                        });
                    }
                  }

                  await timer(CyberiaParams.CYBERIA_EVENT_CALLBACK_TIME);
                  if (
                    this.localElementScope[wsManagementId][id].target.Active &&
                    this.localElementScope[wsManagementId][id].target.Element.type === 'user' &&
                    objectEquals(
                      point,
                      this.localElementScope[wsManagementId][id].movement.Path[
                        this.localElementScope[wsManagementId][id].movement.Path.length - 1
                      ],
                    )
                  ) {
                    this.localElementScope[wsManagementId][id].movement.Path = [
                      [this.element[wsManagementId][id].x, this.element[wsManagementId][id].y],
                    ];
                    const clientId = this.localElementScope[wsManagementId][id].target.Element.id;
                    const direction = getDirection({
                      x1: this.element[wsManagementId][id].x,
                      y1: this.element[wsManagementId][id].y,
                      x2: CyberiaWsUserManagement.element[wsManagementId][clientId].x,
                      y2: CyberiaWsUserManagement.element[wsManagementId][clientId].y,
                    });
                    if (this.localElementScope[wsManagementId][id].target.Direction !== direction) {
                      this.localElementScope[wsManagementId][id].target.Direction = direction;
                      this.element[wsManagementId][id] = updateMovementDirection({
                        direction,
                        element: this.element[wsManagementId][id],
                      });
                      for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
                        if (
                          objectEquals(
                            CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
                            this.element[wsManagementId][id].model.world,
                          )
                        ) {
                          CyberiaWsEmit(CyberiaWsBotChannel.channel, CyberiaWsBotChannel.client[clientId], {
                            status: 'update-skin-position',
                            id,
                            element: { components: { skin: this.element[wsManagementId][id].components.skin } },
                          });
                        }
                      }
                    }
                  }
                }
              } catch (error) {
                logger.error(error, error.stack);
              }
              this.localElementScope[wsManagementId][id].movement.Callback();
            },
          },
        };

        this.element[wsManagementId][id] = bot;
        this.localElementScope[wsManagementId][id].movement.Callback();

        const basicSkillKey = this.element[wsManagementId][id].skill.basic;
        const skill = { keys: {} };
        for (const skillKey of Object.keys(this.element[wsManagementId][id].skill.keys)) {
          if (
            this.element[wsManagementId][id].skill.keys[skillKey] &&
            SkillType[this.element[wsManagementId][id].skill.keys[skillKey]]
          ) {
            skill.keys[skillKey] = SkillType[this.element[wsManagementId][id].skill.keys[skillKey]];
          }
        }
        skill.Callback = setInterval(() => {
          if (this.localElementScope[wsManagementId][id].target.Active)
            CyberiaWsSkillManagement.createSkill(wsManagementId, { id, type: 'bot' });
        }, skill.keys[basicSkillKey].cooldown);
        this.localElementScope[wsManagementId][id].skill = skill;
      }
    })();
  },
  updateLife: function (args = { wsManagementId: '', id: '', life: 1 }) {
    const { wsManagementId, id, life } = args;
    if (!this.element[wsManagementId][id]) return;
    this.element[wsManagementId][id].life = life < 0 ? 0 : life;
    for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
      if (
        objectEquals(
          this.element[wsManagementId][id].model.world,
          CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
        )
      )
        CyberiaWsEmit(CyberiaWsBotChannel.channel, CyberiaWsBotChannel.client[clientId], {
          status: 'update-life',
          id,
          element: { life: this.element[wsManagementId][id].life },
        });
    }
    if (life <= 0) {
      if (!this.element[wsManagementId][id]) return;
      this.localElementScope[wsManagementId][id].target.Active = false;

      this.element[wsManagementId][id].components.skin = this.element[wsManagementId][id].components.skin.map((s) => {
        s.enabled = s.displayId === 'ghost';
        return s;
      });

      for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
        if (
          objectEquals(
            this.element[wsManagementId][id].model.world,
            CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
          )
        )
          CyberiaWsEmit(CyberiaWsBotChannel.channel, CyberiaWsBotChannel.client[clientId], {
            status: 'update-skin-position',
            id,
            element: { components: { skin: this.element[wsManagementId][id].components.skin } },
          });
      }

      setTimeout(() => {
        this.updateLife({ ...args, life: newInstance(this.element[wsManagementId][id].maxLife) });
        this.element[wsManagementId][id].components.skin = this.element[wsManagementId][id].components.skin.map((s) => {
          s.enabled = s.current === true;
          return s;
        });
        for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            objectEquals(
              this.element[wsManagementId][id].model.world,
              CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
            )
          )
            CyberiaWsEmit(CyberiaWsBotChannel.channel, CyberiaWsBotChannel.client[clientId], {
              status: 'update-skin-position',
              id,
              element: { components: { skin: this.element[wsManagementId][id].components.skin } },
            });
        }
      }, this.element[wsManagementId][id].deadTime);
    }
  },
};

export { CyberiaWsBotManagement };
