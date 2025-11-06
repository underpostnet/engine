import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { FileFactory } from '../file/file.service.js';
import fs from 'fs-extra';
import crypto from 'crypto';
import { ObjectLayerDto } from './object-layer.model.js';
import { ObjectLayerEngine } from '../../server/object-layer.js';
const logger = loggerFactory(import.meta);

const ObjectLayerService = {
  post: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */

    if (req.path.startsWith('/frame-image')) {
      for (const basePath of ['./src/client/public/cyberia/', `./public/${options.host}${options.path}`]) {
        const folder = `${basePath}assets/${req.params.itemType}/${req.params.itemId}/${req.params.directionCode}`;
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        const files = FileFactory.filesExtract(req);
        for (const file of files) {
          fs.writeFileSync(`${folder}/${file.name}`, file.data);
        }
      }
      return;
    }

    if (req.path.startsWith('/metadata')) {
      const folder = `./src/client/public/cyberia/assets/${req.params.itemType}/${req.params.itemId}`;
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(`${folder}/metadata.json`, JSON.stringify(req.body));

      // Create object layer from PNG saved and metadata
      const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;

      const objectLayerData = {
        data: {
          render: {
            frame_duration: req.body.data.render.frame_duration,
            is_stateless: req.body.data.render.is_stateless,
          },
          item: req.body.data.item,
          stats: req.body.data.stats,
        },
      };

      // Process all PNG files to generate frames and colors
      const directionFolders = await fs.readdir(folder);
      for (const directionCode of directionFolders) {
        const directionPath = `${folder}/${directionCode}`;
        if (!fs.statSync(directionPath).isDirectory()) continue;

        const frameFiles = await fs.readdir(directionPath);
        // Sort frame files numerically
        frameFiles.sort((a, b) => {
          const numA = parseInt(a.split('.')[0]);
          const numB = parseInt(b.split('.')[0]);
          return numA - numB;
        });

        for (const frameFile of frameFiles) {
          if (!frameFile.endsWith('.png')) continue;

          const framePath = `${directionPath}/${frameFile}`;

          // Process image and push frame to render data with color palette management
          await ObjectLayerEngine.processAndPushFrame(objectLayerData.data.render, framePath, directionCode);
        }
      }

      // Generate SHA256 hash
      objectLayerData.sha256 = crypto.createHash('sha256').update(JSON.stringify(objectLayerData.data)).digest('hex');

      // Save to MongoDB
      try {
        const existingObjectLayer = await ObjectLayer.findOne({ sha256: objectLayerData.sha256 });
        if (existingObjectLayer) {
          logger.info(`ObjectLayer with sha256 ${objectLayerData.sha256} already exists, updating...`);
          return await ObjectLayer.findByIdAndUpdate(existingObjectLayer._id, objectLayerData, { new: true });
        }
        const newObjectLayer = await ObjectLayer.create(objectLayerData);
        logger.info(`ObjectLayer created successfully with id: ${newObjectLayer._id}`);
        return newObjectLayer;
      } catch (error) {
        logger.error('Error creating ObjectLayer:', error);
        throw error;
      }
    }

    // create object layer from body
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    return await new ObjectLayer(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./object-layer.model.js').ObjectLayerModel} */
    const ObjectLayer = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayer;
    const { page = 1, limit = 10, sort = { updatedAt: -1 } } = req.query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      ObjectLayer.find() // { userId: req.auth.user._id }
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .select(ObjectLayerDto.select.get()),
      ObjectLayer.countDocuments(), // { userId: req.auth.user._id }
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
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
