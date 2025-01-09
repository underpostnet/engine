import { DisplayComponent, isElementCollision, Stat } from '../../client/components/cyberia/CommonCyberia.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaWsInstanceScope } from '../../ws/cyberia/cyberia.ws.server.js';
import { CyberiaWsBotManagement } from '../../ws/cyberia/management/cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from '../../ws/cyberia/management/cyberia.ws.user.js';

const logger = loggerFactory(import.meta);

const CyberiaItemService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-item.model.js').CyberiaItemModel} */
    const CyberiaItem = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaItem;

    /** @type {import('../cyberia-user/cyberia-user.model.js').CyberiaUserModel} */
    const CyberiaUser = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaUser;

    /** @type {import('../cyberia-biome/cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBiome;

    const wsManagementId = `${options.host}${options.path}`;

    if (req.path.startsWith('/buy')) {
      const userCyberia = await CyberiaUser.findOne({
        'model.user._id': req.auth.user._id,
      });
      if (!userCyberia) throw new Error('User not found');
      const itemStat = Stat.get[req.params.id]();

      if (userCyberia._doc.coin < itemStat.basePrice) throw new Error('Insufficient balance');

      const providerBot = CyberiaWsBotManagement.element[wsManagementId][req.params.providerId];

      if (!providerBot) throw new Error('Provider bot not found');

      const world = CyberiaWsInstanceScope[wsManagementId].world.instance;

      if (providerBot.model.world.face !== userCyberia._doc.model.world.face) throw new Error('invalid provider face');

      const biome = await CyberiaBiome.findById(world.face[providerBot.model.world.face - 1].toString());

      if (
        !isElementCollision({
          dimPaintByCell: biome._doc.dimPaintByCell,
          A: userCyberia._doc,
          B: {
            x: providerBot.x - providerBot.dim * 2,
            y: providerBot.y - providerBot.dim * 2,
            dim: providerBot.dim * 5,
          },
        })
      )
        throw new Error('invalid provider distance');

      const socketId = CyberiaWsUserManagement.getCyberiaUserWsId(wsManagementId, userCyberia._id.toString());
      if (socketId) {
        CyberiaWsUserManagement.element[wsManagementId][socketId].coin -= itemStat.basePrice;
        CyberiaWsUserManagement.element[wsManagementId][socketId][req.params.itemType].tree.push({ id: req.params.id });

        if (
          !CyberiaWsUserManagement.element[wsManagementId][socketId].components[req.params.itemType].find(
            (c) => c.displayId === req.params.id,
          )
        ) {
          CyberiaWsUserManagement.element[wsManagementId][socketId].components[req.params.itemType].push(
            DisplayComponent.get[req.params.id](),
          );
        }
      } else throw new Error('no user socket found');

      return 'ok';
    }
    return await new CyberiaItem(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-item.model.js').CyberiaItemModel} */
    const CyberiaItem = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaItem;
    if (req.params.id) return await CyberiaItem.findById(req.params.id);
    return await CyberiaItem.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-item.model.js').CyberiaItemModel} */
    const CyberiaItem = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaItem;
    return await CyberiaItem.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-item.model.js').CyberiaItemModel} */
    const CyberiaItem = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaItem;
    if (req.params.id) return await CyberiaItem.findByIdAndDelete(req.params.id);
    else return await await CyberiaItem.deleteMany();
  },
};

export { CyberiaItemService };
