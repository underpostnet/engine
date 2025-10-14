/**
 * Provides a utility class for downloading files from a URL and saving them to the local filesystem.
 * @module src/server/downloader.js
 * @namespace Downloader
 */

import axios from 'axios';
import fs from 'fs';
import { loggerFactory } from './logger.js';
import dotenv from 'dotenv';
dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Main class for handling file downloading operations.
 * All utility methods are implemented as static to serve as a namespace container.
 * @class Downloader
 * @augments Downloader
 * @memberof Downloader
 */
class Downloader {
  /**
   * Downloads a file from a given URL and pipes the stream to a local file path.
   * @static
   * @memberof Downloader
   * @param {string} url The URL of the file to download.
   * @param {string} fullPath The full local path where the file should be saved.
   * @param {object} [options] Axios request configuration options.
   * @param {string} [options.method='get'] HTTP method.
   * @param {string} [options.responseType='stream'] Expected response type.
   * @returns {Promise<string>} Resolves with the full path of the saved file on success.
   * @memberof Downloader
   */
  static downloadFile(url, fullPath, options = { method: 'get', responseType: 'stream' }) {
    return new Promise((resolve, reject) =>
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
            // Cleanup incomplete file if possible
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            return reject(error);
          });
        })
        .catch((error) => {
          logger.error(error, 'Error in the request');
          return reject(error);
        }),
    );
  }
}

/**
 * Backward compatibility export
 * @type {function(string, string, object): Promise<string>}
 * @memberof Downloader
 */

const downloadFile = Downloader.downloadFile;

export default Downloader;

export { Downloader, downloadFile };
