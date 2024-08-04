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
        console.log(image);
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

        // if (image.bitmap.width !== pixelDim || image.bitmap.height !== pixelDim) {
        //   image.resize(pixelDim, pixelDim);
        //   // image.cover(pixelDim, pixelDim, Jimp.RESIZE_BICUBIC);
        //   // image.scaleToFit(pixelDim, pixelDim, Jimp.RESIZE_BICUBIC);

        //   await image.writeAsync(imageFilePath);
        //   return resolve(await getHexMatrix({ imageFilePath }));
        // }

        // console.log({ fixX, fixY });

        for (const y of range(0, image.bitmap.height - 1)) {
          let row;
          for (const x of range(0, image.bitmap.width - 1)) {
            if (y !== 0 && x !== 0 && x % cellPixelDim === 0 && y % cellPixelDim === 0) {
              if (!row) row = [];
              const rgba = Jimp.intToRGBA(image.getPixelColor(x, y));
              // { r: 146, g: 146, b: 146, a: 255 }
              row.push(rgba2Hexa(rgba));
            }
          }
          if (row) {
            // if (row.length < 16 * 3) row.unshift(`#282828`);
            hexMatrix.push(row);
          }
        }
        // hexMatrix.push(new Array(hexMatrix[0].length).fill().map(() => `#282828`));
        // console.log(hexMatrix.length, hexMatrix[0].length);

        if (fixX) hexMatrix = hexMatrix.map((a) => [a[0]].concat(a));
        if (fixY) hexMatrix.unshift(hexMatrix[0]);
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
