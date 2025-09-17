import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { FileFactory } from '../file/file.service.js';
import fs from 'fs-extra';
const logger = loggerFactory(import.meta);

const ObjectLayerService = {
  post: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */

    if (req.path.startsWith('/frame-image')) {
      const folder = `./src/client/public/cyberia/assets/${req.params.itemType}/${req.params.itemId}/${req.params.directionCode}`;
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      const files = FileFactory.filesExtract(req);
      for (const file of files) {
        fs.writeFileSync(`${folder}/${file.name}`, file.data);
      }
      return;
    }

    if (req.path.startsWith('/metadata')) {
      const folder = `./src/client/public/cyberia/assets/${req.params.itemType}/${req.params.itemId}`;
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(`${folder}/metadata.json`, JSON.stringify(req.body));
      return;
    }

    return await new ObjectLayer(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    if (req.params.id) return await ObjectLayer.findById(req.params.id);
    return await ObjectLayer.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    return await ObjectLayer.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    if (req.params.id) return await ObjectLayer.findByIdAndDelete(req.params.id);
    else return await ObjectLayer.deleteMany();
  },
};

export { ObjectLayerService };
