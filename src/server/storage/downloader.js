/**
 * Provides a utility class for downloading files from a URL and saving them to the local filesystem.
 * @module src/server/storage/downloader.js
 * @namespace Downloader
 */

import axios from 'axios';
import fs from 'fs';
import { loggerFactory } from '../ops/logger.js';

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
    /**
     * Renders an error response body, whatever transport shape it arrived in, capped for a log
     * line. A stream request carries even its errors as a stream, so the body has to be read
     * before it can be reported.
     */
    const responseBody = async (data) => {
      if (!data) return undefined;
      try {
        if (Buffer.isBuffer(data)) return data.toString('utf8').slice(0, 500);
        if (typeof data === 'string') return data.slice(0, 500);
        if (typeof data.on === 'function') {
          let text = '';
          for await (const chunk of data) {
            text += chunk;
            if (text.length > 500) break;
          }
          return text.slice(0, 500) || undefined;
        }
        return JSON.stringify(data).slice(0, 500);
      } catch {
        return undefined;
      }
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        logger.error('Error downloading the file', { fullPath, error: error?.message });
        // A partial file is worse than none: the caller cannot tell it apart from a whole one.
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        return reject(error);
      };

      axios({
        url,
        ...options,
      })
        .then((response) => {
          const writer = fs.createWriteStream(fullPath);
          const expectedBytes = Number(response.headers?.['content-length'] ?? NaN);

          // A response stream that ends early still ends, so the writer emits `finish` and the
          // download reports success over a truncated file. The declared length is what proves
          // the transfer whole — without this check a short part reached the caller intact-looking
          // and only surfaced much later, as a corrupt archive assembled from it.
          writer.on('finish', () => {
            if (settled) return;
            const receivedBytes = writer.bytesWritten;
            if (Number.isFinite(expectedBytes) && receivedBytes !== expectedBytes)
              return fail(new Error(`Truncated download: expected ${expectedBytes} bytes, received ${receivedBytes}`));
            settled = true;
            logger.info('Download complete', { fullPath, bytes: receivedBytes });
            return resolve(fullPath);
          });
          writer.on('error', fail);
          response.data.on('error', fail);
          response.data.pipe(writer);
        })
        .catch(async (error) => {
          // The status alone names nothing. A storage service explains a refusal in the body —
          // which delivery type it looked under, which id it could not find — and without it a
          // caller sees `status code 400` and has to reproduce the request by hand to learn why.
          logger.error('Error in the request', {
            fullPath,
            error: error?.message,
            status: error?.response?.status,
            body: await responseBody(error?.response?.data),
          });
          return reject(error);
        });
    });
  }
}

export default Downloader;

/**
 * @function downloadFile
 * @description Backward compatibility export for `Downloader.downloadFile`.
 * @param {string} url The URL of the file to download.
 * @param {string} fullPath The full local path where the file should be saved.
 * @param {object} [options] Axios request configuration options.
 * @returns {Promise<string>} Resolves with the full path of the saved file on success.
 * @memberof Downloader
 */
export const downloadFile = Downloader.downloadFile;
