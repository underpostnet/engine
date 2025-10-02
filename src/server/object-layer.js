import dotenv from 'dotenv';

import fs from 'fs-extra';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import Jimp from 'jimp';

import { range } from '../client/components/core/CommonJs.js';
import { random } from '../client/components/core/CommonJs.js';

dotenv.config({ path: `./engine-private/conf/dd-cyberia/.env.production`, override: true });

const pngDirectoryIteratorByObjectLayerType = async (
  objectLayerType = 'skin',
  callback = ({ path, objectLayerType, objectLayerId, direction, frame }) => {},
) => {
  for (const objectLayerId of await fs.readdir(`./src/client/public/cyberia/assets/${objectLayerType}`)) {
    for (const direction of await fs.readdir(
      `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}`,
    )) {
      const dirFolder = `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/${direction}`;
      if (!fs.statSync(dirFolder).isDirectory()) continue;
      for (const frame of await fs.readdir(dirFolder)) {
        const imageFilePath = `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/${direction}/${frame}`;
        await callback({ path: imageFilePath, objectLayerType, objectLayerId, direction, frame });
      }
    }
  }
};

const readPngAsync = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on('parsed', function () {
        resolve({
          width: this.width,
          height: this.height,
          data: Buffer.from(this.data),
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
};

const frameFactory = async (path, colors = []) => {
  const frame = [];
  try {
    let image;

    if (path.endsWith('.gif')) {
      image = await Jimp.read(path);
      // remove gif file
      fs.removeSync(path);
      // save image replacing gif for png
      const pngPath = path.replace('.gif', '.png');
      await image.writeAsync(pngPath);
    } else {
      const png = await readPngAsync(path);
      image = new Jimp(png.width, png.height);
      image.bitmap = png;
    }

    const mazeFactor = parseInt(image.bitmap.height / 24);
    let _y = -1;
    for (const y of range(0, image.bitmap.height - 1)) {
      if (y % mazeFactor === 0) {
        _y++;
        if (!frame[_y]) frame[_y] = [];
      }
      let _x = -1;
      for (const x of range(0, image.bitmap.width - 1)) {
        const rgba = Object.values(Jimp.intToRGBA(image.getPixelColor(x, y)));
        if (y % mazeFactor === 0 && x % mazeFactor === 0) {
          _x++;
          const indexColor = colors.findIndex(
            (c) => c[0] === rgba[0] && c[1] === rgba[1] && c[2] === rgba[2] && c[3] === rgba[3],
          );
          if (indexColor === -1) {
            colors.push(rgba);
            frame[_y][_x] = colors.length - 1;
          } else {
            frame[_y][_x] = indexColor;
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Failed to process image ${path}:`, error);
  }
  return { frame, colors };
};

const getKeyFramesDirectionsFromNumberFolderDirection = (direction) => {
  let objectLayerFrameDirections = [];

  switch (direction) {
    case '08':
      objectLayerFrameDirections = ['down_idle', 'none_idle', 'default_idle'];
      break;
    case '18':
      objectLayerFrameDirections = ['down_walking'];
      break;
    case '02':
      objectLayerFrameDirections = ['up_idle'];
      break;
    case '12':
      objectLayerFrameDirections = ['up_walking'];
      break;
    case '04':
      objectLayerFrameDirections = ['left_idle', 'up_left_idle', 'down_left_idle'];
      break;
    case '14':
      objectLayerFrameDirections = ['left_walking', 'up_left_walking', 'down_left_walking'];
      break;
    case '06':
      objectLayerFrameDirections = ['right_idle', 'up_right_idle', 'down_right_idle'];
      break;
    case '16':
      objectLayerFrameDirections = ['right_walking', 'up_right_walking', 'down_right_walking'];
      break;
  }

  return objectLayerFrameDirections;
};

const buildImgFromTile = async (
  options = {
    tile: { map_color: null, frame_matrix: null },
    imagePath: '',
    cellPixelDim: 20,
    opacityFilter: (x, y, color) => 255,
  },
) => {
  const { tile, imagePath, cellPixelDim, opacityFilter } = options;
  const mainMatrix = tile.frame_matrix;
  const sharpOptions = {
    create: {
      width: cellPixelDim * mainMatrix[0].length,
      height: cellPixelDim * mainMatrix.length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent background
    },
  };

  let image = await sharp(sharpOptions).png().toBuffer();
  fs.writeFileSync(imagePath, image);
  image = await Jimp.read(imagePath);

  for (let y = 0; y < mainMatrix.length; y++) {
    for (let x = 0; x < mainMatrix[y].length; x++) {
      const colorIndex = mainMatrix[y][x];
      if (colorIndex === null || colorIndex === undefined) continue;

      const color = tile.map_color[colorIndex];
      if (!color) continue;

      const rgbaColor = color.length === 4 ? color : [...color, 255]; // Ensure alpha channel

      for (let dy = 0; dy < cellPixelDim; dy++) {
        for (let dx = 0; dx < cellPixelDim; dx++) {
          const pixelX = x * cellPixelDim + dx;
          const pixelY = y * cellPixelDim + dy;
          image.setPixelColor(Jimp.rgbaToInt(...rgbaColor), pixelX, pixelY);
        }
      }
    }
  }

  await image.writeAsync(imagePath);
};

const generateRandomStats = () => {
  return {
    effect: random(0, 10),
    resistance: random(0, 10),
    agility: random(0, 10),
    range: random(0, 10),
    intelligence: random(0, 10),
    utility: random(0, 10),
  };
};

const zIndexPriority = { floor: 0, skin: 1, weapon: 2, skill: 3, coin: 4 };

export {
  pngDirectoryIteratorByObjectLayerType,
  readPngAsync,
  frameFactory,
  getKeyFramesDirectionsFromNumberFolderDirection,
  buildImgFromTile,
  generateRandomStats,
  zIndexPriority,
};
