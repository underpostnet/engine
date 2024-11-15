import Jimp from 'jimp';
import { loggerFactory } from '../src/server/logger.js';
import sharp from 'sharp';
import fs from 'fs-extra';
import { range } from '../src/client/components/core/CommonJs.js';
import { hexa2Rgba } from '../src/api/cyberia-tile/cyberia-tile.service.js';

const logger = loggerFactory(import.meta);

// https://jimp-dev.github.io/jimp/api/jimp/classes/jimp/
// https://sharp.pixelplumbing.com/api-constructor

await logger.setUpInfo();

switch (process.argv[2]) {
  case 'build-item-skin':
    {
      const imagePath = `./test.png`;
      const width = 400;
      const height = 400;

      let image = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }, // white
        },
      })
        .png()
        .toBuffer();

      fs.writeFileSync(imagePath, image);

      image = await Jimp.read(imagePath);

      for (const y of range(0, height)) {
        for (const x of range(0, width)) {
          const hex = hexa2Rgba(`#ff0000`);
          const opacity = 255;

          image.setPixelColor(Jimp.rgbaToInt(hex[0], hex[1], hex[2], opacity), x, y);
        }
      }

      await image.write(imagePath);
    }

    break;

  default:
    break;
}
