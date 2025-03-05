import axios from 'axios';
import fs from 'fs';
import { loggerFactory } from './logger.js';
import dotenv from 'dotenv';
dotenv.config();

const logger = loggerFactory(import.meta);

const Downloader = (url, fullPath, options = { method: 'get', responseType: 'stream' }) =>
  new Promise((resolve, reject) =>
    axios({
      url,
      ...options,
    })
      .then((response) => {
        // Create a write stream to save the file to the specified path
        const writer = fs.createWriteStream(fullPath);
        response.data.pipe(writer);
        writer.on('finish', () => {
          logger.info('Download complete. File saved at', fullPath);
          return resolve(fullPath);
        });
        writer.on('error', (error) => {
          logger.error(error, 'Error downloading the file');
          return reject(error);
        });
      })
      .catch((error) => {
        logger.error(error, 'Error in the request');
        return reject(error);
      }),
  );

export { Downloader };
