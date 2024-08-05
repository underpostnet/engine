import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { Downloader } from '../../server/downloader.js';
import fs from 'fs-extra';
import Jimp from 'jimp';
import Color from 'color';

import { ceil10, range } from '../../client/components/core/CommonJs.js';

const logger = loggerFactory(import.meta);

const select = {
  'all-name': { _id: 1, name: 1, fileId: 1 },
};

const rgba2Hexa = (rgba) => {
  const a = rgba.a;
  delete rgba.a;
  return Color(rgba).alpha(a).hexa();
};

const getHexMatrix = ({ imageFilePath }) =>
  new Promise((resolve) => {
    let hexMatrix = [];
    Jimp.read(imageFilePath)
      .then(async (image) => {
        // console.log(imageFilePath, image);
        // bitmap: {
        //   width: 575,
        //   height: 574,
        // }

        // 16 * 36 = 576
        // 576 / (16 * 3) = 12
        // const cellPixelDim = parseInt(image.bitmap.width / (16 * 3));

        const cellPixelDim = 12;
        const pixelDim = 576;

        const fixX = ceil10((pixelDim - image.bitmap.width) / 3);
        const fixY = ceil10((pixelDim - image.bitmap.height) / 3);

        const fileId = imageFilePath.split('/').pop();
        console.log(imageFilePath, { fileId, fixX, fixY });

        image.resize(pixelDim + 1, pixelDim + 1);
        // image.posterize(20);

        for (const y of range(0, image.bitmap.height - 1)) {
          let row;
          for (const x of range(0, image.bitmap.width - 1)) {
            if (y !== 0 && x !== 0 && x % cellPixelDim === 0 && y % cellPixelDim === 0) {
              if (!row) row = [];
              let rgba;
              if (x < image.bitmap.width / 2) rgba = Jimp.intToRGBA(image.getPixelColor(x + 1, y + 1));
              else rgba = Jimp.intToRGBA(image.getPixelColor(x - 1, y - 1));
              // { r: 146, g: 146, b: 146, a: 255 }
              row.push(rgba2Hexa(rgba));
            }
          }
          if (row) hexMatrix.push(row);
        }
        // hexMatrix.push(new Array(hexMatrix[0].length).fill().map(() => `#282828`));

        // hexMatrix.shift();
        // hexMatrix.unshift();

        // hexMatrix.pop();
        // hexMatrix.pop();

        // range(1, 2).map(() => {});

        switch (fileId) {
          case 'orange-over-purple.PNG':
          case 'orange-over-purple0.PNG':
            break;
          case 'yupark.PNG':
          case 'zax-shop.PNG':
            break;

          default:
        }
        resolve(hexMatrix);
      })
      .catch((error) => {
        logger.error(error, { message: error.message, error: error.stack });
        resolve();
      });
  });

const CyberiaTileService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-tile.model.js').CyberiaTileModel} */
    const CyberiaTile = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaTile;

    switch (req.params.id) {
      case 'hex-matrix-from-png':
        {
          logger.info('download', req.body.src);
          const imageFilePath = await Downloader(req.body.src, `./tmp/${req.body.src.split(`/`).pop()}`);

          // logger.info('imageFilePath', { imageFilePath });

          const hexMatrix = await getHexMatrix({ imageFilePath });

          fs.remove(imageFilePath);

          return { imageFilePath, hexMatrix };
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
