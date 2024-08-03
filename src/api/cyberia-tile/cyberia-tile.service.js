import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { Downloader } from '../../server/downloader.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

const select = {
  'all-name': { _id: 1, name: 1, fileId: 1 },
};

const CyberiaTileService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-tile.model.js').CyberiaTileModel} */
    const CyberiaTile = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaTile;

    switch (req.params.id) {
      case 'hex-matrix-from-png':
        {
          const imageFilePath = await Downloader(req.body.src, `./tmp/${req.body.src.split(`/`).pop()}`);

          logger.info({ imageFilePath });

          fs.remove(imageFilePath);

          return { imageFilePath };
        }
        break;

      default:
        break;
    }

    const { _id } = CyberiaTile(req.body).save();
    const [result] = await CyberiaTile.find({
      _id,
    }).select(select['all-name']);
    return result;
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-tile.model.js').CyberiaTileModel} */
    const CyberiaTile = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaTile;
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await CyberiaTile.find();
        break;
      case 'all-name':
        result = await CyberiaTile.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        result = await CyberiaTile.find({
          _id: req.params.id,
        });
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-tile.model.js').CyberiaTileModel} */
    const CyberiaTile = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaTile;
    let result = {};
    switch (req.params.id) {
      case 'all':
        break;

      default:
        result = await CyberiaTile.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { CyberiaTileService };
