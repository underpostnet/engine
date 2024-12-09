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
  PositionsComponent,
  WorldCyberiaType,
  getCollisionMatrixCyberia,
  getRandomAvailablePositionCyberia,
  isBiomeCyberiaCollision,
  Stat,
  updateMovementDirection,
  QuestComponent,
  DisplayComponent,
  ResourcesComponentCyberia,
} from '../../../client/components/cyberia/CommonCyberia.js';
import pathfinding from 'pathfinding';
import { CyberiaWsBotChannel } from '../channels/cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './cyberia.ws.user.js';
import { loggerFactory } from '../../../server/logger.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsSkillManagement } from './cyberia.ws.skill.js';
import fs from 'fs-extra';
import { DataBaseProvider } from '../../../db/DataBaseProvider.js';
import dotenv from 'dotenv';
import { CyberiaWsInstanceScope } from '../cyberia.ws.server.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const CyberiaWsBotManagement = {
  element: {},
  localElementScope: {},
  botFactory: function ({ biome, instanceIndex, wsManagementId, displayBotMetaData }) {
    const skinId = displayBotMetaData.id;

    let bot = BaseElement({ worldId: CyberiaWsInstanceScope[wsManagementId].world.instance._id.toString() }).bot.main;

    bot.components.skin = bot.components.skin.map((skinData) => {
      skinData.current = false;
      skinData.enabled = false;
      return skinData;
    });

    const questItemData = QuestComponent.components.find((c) => c.displayId === skinId);
    if (questItemData) {
      bot.components.skin.push({ ...questItemData, current: true, enabled: true });
    } else
      bot.components.skin.push({
        current: true,
        enabled: true,
        ...DisplayComponent.get[skinId](),
      });

    bot.model.world.face = instanceIndex + 1;

    const getRandomPosition = () => getRandomAvailablePositionCyberia({ biomeData: biome, element: bot });
    let x, y;
    const behavior = displayBotMetaData.behavior;
    switch (behavior) {
      case 'resource': {
        x = displayBotMetaData.x;
        y = displayBotMetaData.y;
        break;
      }
      case 'pet': {
        const parentBotId = Object.keys(CyberiaWsBotManagement.element[wsManagementId]).find((botId) => {
          const dataSkin = CyberiaWsBotManagement.element[wsManagementId][botId].components.skin.find((s) => s.current);
          return dataSkin && dataSkin.displayId === displayBotMetaData.parentId;
        });
        x = newInstance(CyberiaWsBotManagement.element[wsManagementId][parentBotId].x);
        y = newInstance(CyberiaWsBotManagement.element[wsManagementId][parentBotId].y);
        break;
      }

      default: {
        const displayData = displayBotMetaData.displayData
          ? displayBotMetaData.displayData.find((c) => c.id === skinId)
          : undefined;
        if (displayData) {
          x = displayData.x / biome.dimPaintByCell;
          y = displayData.y / biome.dimPaintByCell;
          if (displayData.positionId) {
            bot = updateMovementDirection({
              direction: displayData.positionId,
              element: bot,
              suffix: displayData.positionId[0],
            });
          }
        } else {
          const positionData = getRandomPosition();
          x = positionData.x;
          y = positionData.y;
        }
      }
    }
    bot.x = x;
    bot.y = y;
    const id = getId(this.element[wsManagementId], 'bot-');

    if (!fs.existsSync(`./tmp/${skinId}-${biome._id.toString()}.json`))
      fs.writeFileSync(
        `./tmp/${skinId}-${biome._id.toString()}.json`,
        JSONmatrix(getCollisionMatrixCyberia(biome, bot)),
        'utf8',
      );

    if (Stat.get[skinId]) bot = Stat.set('bot', bot);
    bot.life = newInstance(bot.maxLife);

    const collisionMatrixCyberia = JSON.parse(fs.readFileSync(`./tmp/${skinId}-${biome._id.toString()}.json`, 'utf8'));

    this.localElementScope[wsManagementId][id] = {
      api: { getRandomPosition },
      displayBotMetaData,
      disabled: false,
      respawn: 5000,
      drop: {
        coin: {
          range: [5, 40],
        },
      },
      target: {
        Interval: 8, // detector target check time (ms)
        Radius: 3,
        Active: false,
        IndexPoint: -1,
        Direction: 'n',
        Element: {
          type: '',
          id: '',
        },
      },
      lifeRegeneration: {
        Callback: async () => {
          if (this.element[wsManagementId][id].life > 0)
            this.updateLife({
              wsManagementId,
              id,
              life: this.element[wsManagementId][id].life + bot.lifeRegeneration,
            });
          await timer(bot.lifeRegenerationVel);
          this.localElementScope[wsManagementId][id].lifeRegeneration.Callback();
        },
      },
      movement: {
        Direction: undefined,
        InitPosition: { x, y },
        CellRadius: 3,
        Path: [],
        TransitionFactor: CyberiaParams.MOVEMENT_TRANSITION_FACTOR * (1 / bot.vel),
        Callback: async () => {
          try {
            let x;
            let y;
            if (!this.localElementScope[wsManagementId][id].target.Active) {
              while (
                !x ||
                !y ||
                isBiomeCyberiaCollision({ biomeData: biome, element: this.element[wsManagementId][id], x, y })
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
                  new pathfinding.Grid(collisionMatrixCyberia),
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
                  if (!['generic-people'].includes(behavior))
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
                                new pathfinding.Grid(collisionMatrixCyberia),
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
                                Path[Path.length - 1] ? ([0] ? Path[Path.length - 1][0] : undefined) : undefined,
                                Path[Path.length - 1] ? ([1] ? Path[Path.length - 1][1] : undefined) : undefined,
                              ) > 1.5 &&
                              !Object.keys(CyberiaWsBotManagement.element[wsManagementId]).find(
                                (botId) =>
                                  objectEquals(
                                    this.element[wsManagementId][id].model.world,
                                    CyberiaWsBotManagement.element[wsManagementId][botId].model.world,
                                  ) &&
                                  ['quest-passive'].includes(
                                    CyberiaWsBotManagement.element[wsManagementId][botId].behavior,
                                  ) &&
                                  getDistance(
                                    CyberiaWsBotManagement.element[wsManagementId][botId].x,
                                    CyberiaWsBotManagement.element[wsManagementId][botId].y,
                                    Path[Path.length - 1][0],
                                    Path[Path.length - 1][1],
                                  ) < 4,
                              )
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
              if (foundNewTargetPath) {
                if (this.localElementScope[wsManagementId][id].target.Element.type === 'user') {
                  const direction = getDirection({
                    x1: this.element[wsManagementId][id].x,
                    y1: this.element[wsManagementId][id].y,
                    x2: CyberiaWsUserManagement.element[wsManagementId][
                      this.localElementScope[wsManagementId][id].target.Element.id
                    ].x,
                    y2: CyberiaWsUserManagement.element[wsManagementId][
                      this.localElementScope[wsManagementId][id].target.Element.id
                    ].y,
                  });

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
                        element: {
                          components: { skin: this.element[wsManagementId][id].components.skin },
                        },
                      });
                    }
                  }
                }
                break;
              }

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
                    element: {
                      x: this.element[wsManagementId][id].x,
                      y: this.element[wsManagementId][id].y,
                    },
                  });
                  if (newDirection)
                    CyberiaWsEmit(CyberiaWsBotChannel.channel, CyberiaWsBotChannel.client[clientId], {
                      status: 'update-skin-position',
                      id,
                      element: { components: { skin: this.element[wsManagementId][id].components.skin } },
                    });
                }
              }

              await timer(CyberiaParams.EVENT_CALLBACK_TIME);
              const clientId = this.localElementScope[wsManagementId][id].target.Element.id;
              if (
                CyberiaWsUserManagement.element[wsManagementId][clientId] &&
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
                        element: {
                          components: { skin: this.element[wsManagementId][id].components.skin },
                        },
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
    bot.behavior = displayBotMetaData.behavior;
    bot.name = displayBotMetaData.name;
    bot.parentId = displayBotMetaData.parentId;
    bot.title = displayBotMetaData.title;
    this.element[wsManagementId][id] = bot;

    switch (displayBotMetaData.behavior) {
      case 'generic-people':
      case 'pet':
        {
          this.localElementScope[wsManagementId][id].movement.Callback();
        }
        break;
      case 'quest-passive':
        break;
      case 'user-hostile':
        {
          this.localElementScope[wsManagementId][id].movement.Callback();
          this.localElementScope[wsManagementId][id].lifeRegeneration.Callback();
          const skillDataStat = Stat.get[this.element[wsManagementId][id].skill.keys.basic]();

          this.localElementScope[wsManagementId][id].skill = {
            Callback: setInterval(() => {
              if (this.localElementScope[wsManagementId][id].target.Active)
                CyberiaWsSkillManagement.createSkill(wsManagementId, { id, type: 'bot' }, undefined, biome);
            }, skillDataStat.cooldown),
          };
        }
        break;
      default:
        break;
    }

    return { id, bot, skinId, collisionMatrixCyberia };
  },
  pathfinding: new pathfinding.AStarFinder(),
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this.localElementScope[wsManagementId] = {};
    this.pathfinding = new pathfinding.AStarFinder({
      allowDiagonal: true, // enable diagonal
      dontCrossCorners: true, // corner of a solid
      heuristic: pathfinding.Heuristic.chebyshev,
    });
    /** @type {import('../../../api/cyberia-biome/cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${wsManagementId}`].mongoose.models.CyberiaBiome;
    /** @type {import('../../../api/cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${wsManagementId}`].mongoose.models.CyberiaWorld;
    (async () => {
      const world = CyberiaWsInstanceScope[wsManagementId].world.instance;

      if (!world) return;

      let instanceIndex = -1;
      for (const instance of world.instance) {
        instanceIndex++;
        if (!WorldCyberiaType[world.type].worldFaces.includes(instanceIndex + 1)) continue;

        const biome = await CyberiaBiome.findById(world.face[instanceIndex].toString());

        if (!biome) continue;

        for (const metaDataBot of instance.bots) {
          const displayBots = [];

          for (const displayBotMetaData of metaDataBot.displayIds) {
            if (displayBotMetaData.quantity[0] !== undefined && displayBotMetaData.quantity[1] !== undefined) {
              for (const _ of range(
                0,
                random(displayBotMetaData.quantity[0] - 1, displayBotMetaData.quantity[1] - 1),
              )) {
                displayBots.push({ ...displayBotMetaData._doc, behavior: metaDataBot.behavior });
              }
            } else if (displayBotMetaData.quantity[0] !== undefined) {
              for (const _ of range(0, displayBotMetaData.quantity[0] - 1)) {
                displayBots.push({ ...displayBotMetaData._doc, behavior: metaDataBot.behavior });
              }
            }
          }

          for (const displayBotMetaData of displayBots) {
            const { id, bot, skinId, collisionMatrixCyberia } = this.botFactory({
              biome,
              instanceIndex,
              wsManagementId,
              displayBotMetaData,
            });
          }
          if (biome.resources)
            for (const resource of biome.resources) {
              if (random(1, 10) === 1) {
                const { id, bot, skinId, collisionMatrixCyberia } = this.botFactory({
                  biome,
                  instanceIndex,
                  wsManagementId,
                  displayBotMetaData: {
                    id: resource.id,
                    behavior: 'resource',
                    title: `${ResourcesComponentCyberia[resource.id].type} resource`,
                    name: ResourcesComponentCyberia[resource.id].name,
                    x: resource.x / biome.dimPaintByCell,
                    y: resource.y / biome.dimPaintByCell,
                  },
                });
              }
            }
        }
      }
    })();
  },
  updateLife: function (args = { wsManagementId: '', id: '', life: 1 }) {
    const { wsManagementId, id, life } = args;
    if (!this.element[wsManagementId][id]) return;
    this.element[wsManagementId][id].life =
      life < 0
        ? 0
        : life > this.element[wsManagementId][id].maxLife
        ? newInstance(this.element[wsManagementId][id].maxLife)
        : life;
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
        switch (this.element[wsManagementId][id].behavior) {
          case 'resource':
            {
              s.enabled = false;
            }

            break;

          default:
            {
              s.enabled = s.displayId === 'ghost';
            }
            break;
        }
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
