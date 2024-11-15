import fs from 'fs-extra';
import Jimp from 'jimp';
import Color from 'color';
import dotenv from 'dotenv';
import sharp from 'sharp';

import { ceil10, range } from '../../client/components/core/CommonJs.js';
import { CyberiaTileDto } from './cyberia-tile.model.js';
import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { Downloader } from '../../server/downloader.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const rgba2Hexa = (rgba) => {
  const a = rgba.a;
  delete rgba.a;
  return Color(rgba).alpha(a).hexa();
};

const hexa2Rgba = (hexCode, opacity = 1) => {
  let hex = hexCode.replace('#', '');

  if (hex.length === 3) {
    hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  /* Backward compatibility for whole number based opacity values. */
  if (opacity > 1 && opacity <= 100) {
    opacity = opacity / 100;
  }

  // return `rgba(${r},${g},${b},${opacity})`;
  return [r, g, b, opacity];
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
          case 'orange-over-purple.png':
          case 'orange-over-purple0.png':
            break;
          case 'yupark.png':
          case 'zax-shop.png':
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

const buildImgFromTile = async (
  options = { tile: {}, imagePath: '', cellPixelDim: 20, opacityFilter: (x, y, color) => 255 },
) => {
  const { tile, imagePath, cellPixelDim, opacityFilter } = options;
  let image = await sharp({
    create: {
      width: cellPixelDim * tile.color.length,
      height: cellPixelDim * tile.color.length,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }, // white
    },
  })
    .png()
    .toBuffer();

  fs.writeFileSync(imagePath, image);

  image = await Jimp.read(imagePath);

  let y_paint = 0;
  for (const y of range(0, tile.color.length - 1)) {
    let x_paint = 0;
    for (const x of range(0, tile.color.length - 1)) {
      for (const _y of range(0, cellPixelDim - 1)) {
        for (const _x of range(0, cellPixelDim - 1)) {
          image.setPixelColor(
            Jimp.rgbaToInt(...hexa2Rgba(tile.color[y][x], opacityFilter ? opacityFilter(x, y, tile.color[y][x]) : 255)),
            x_paint + _y,
            y_paint + _x,
          );
        }
      }
      x_paint += cellPixelDim;
    }
    y_paint += cellPixelDim;
  }

  await image.write(imagePath);
};

const CyberiaTileService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-tile.model.js').CyberiaTileModel} */
    const CyberiaTile = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaTile;

    switch (req.params.id) {
      case 'hex-matrix-from-png': {
        logger.info('download', req.body.src);
        const imageFilePath = await Downloader(
          process.env.NODE_ENV === 'production' ? `https://www.cyberiaonline.com${req.body.src}` : req.body.src,
          `./tmp/${req.body.src.split(`/`).pop()}`,
        );

        // logger.info('imageFilePath', { imageFilePath });

        const hexMatrix = await getHexMatrix({ imageFilePath });

        fs.remove(imageFilePath);

        return { imageFilePath, hexMatrix };
      }

      default: {
        const { _id } = await new CyberiaTile(req.body).save();
        return await CyberiaTile.findOne({
          _id,
        }).select(CyberiaTileDto.select.get());
      }
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-tile.model.js').CyberiaTileModel} */
    const CyberiaTile = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaTile;

    switch (req.params.id) {
      default:
        switch (req.auth.user.role) {
          case 'admin':
            if (req.params.id) return await CyberiaTile.findById(req.params.id);
            return await CyberiaTile.find();

          default:
            return await CyberiaTile.find({
              _id: req.params.id,
            });
        }
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-tile.model.js').CyberiaTileModel} */
    const CyberiaTile = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaTile;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    const tile = await CyberiaTile.findOne({ _id: req.params.id });

    await File.findByIdAndDelete(tile.fileId);

    switch (req.params.id) {
      default:
        return await CyberiaTile.findByIdAndDelete(req.params.id);
    }
  },
};

export { CyberiaTileService, rgba2Hexa, hexa2Rgba, buildImgFromTile };
