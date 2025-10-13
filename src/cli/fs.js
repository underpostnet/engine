/**
 * File storage module for managing file operations using Cloudinary.
 * @module src/cli/fs.js
 * @namespace UnderpostFileStorage
 */

import { v2 as cloudinary } from 'cloudinary';
import { loggerFactory } from '../server/logger.js';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import * as dir from 'path';
import fs from 'fs-extra';
import { Downloader } from '../server/downloader.js';
import UnderpostRepository from './repository.js';
import { shellExec } from '../server/process.js';
dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostFileStorage
 * @description Manages file storage operations using Cloudinary.
 * This class provides a set of static methods to upload, pull, and delete files
 * from Cloudinary, as well as manage a local storage configuration file.
 */
class UnderpostFileStorage {
  static API = {
    /**
     * @method cloudinaryConfig
     * @description Configures the Cloudinary client with environment variables.
     * @memberof UnderpostFileStorage
     */
    cloudinaryConfig() {
      // https://console.cloudinary.com/
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    },
    /**
     * @method getStorageConf
     * @description Retrieves the storage configuration for a specific deployment.
     * @param {object} options - An object containing deployment-specific options.
     * @param {string} options.deployId - The identifier for the deployment.
     * @param {string} [options.storageFilePath] - The path to the storage configuration file.
     * @returns {object} An object containing the storage configuration and storage file path.
     * @memberof UnderpostFileStorage
     */
    getStorageConf(options) {
      let storage, storageConf;
      if (options.deployId && typeof options.deployId === 'string') {
        storageConf = options.storageFilePath ?? `./engine-private/conf/${options.deployId}/storage.json`;
        if (!fs.existsSync(storageConf)) fs.writeFileSync(storageConf, JSON.stringify({}), 'utf8');
        storage = JSON.parse(fs.readFileSync(storageConf, 'utf8'));
      }
      return { storage, storageConf };
    },
    /**
     * @method writeStorageConf
     * @description Writes the storage configuration to a file.
     * @param {object} storage - The storage configuration object.
     * @param {string} storageConf - The path to the storage configuration file.
     * @memberof UnderpostFileStorage
     */
    writeStorageConf(storage, storageConf) {
      if (storage) fs.writeFileSync(storageConf, JSON.stringify(storage, null, 4), 'utf8');
    },
    /**
     * @method recursiveCallback
     * @description Recursively processes files and directories based on the provided options.
     * @param {string} path - The path to the directory to process.
     * @param {object} [options] - An object containing options for the recursive callback.
     * @param {boolean} [options.rm=false] - Flag to remove files and directories.
     * @param {boolean} [options.recursive=false] - Flag to process directories recursively.
     * @param {string} [options.deployId=''] - The identifier for the deployment.
     * @param {boolean} [options.force=false] - Flag to force file operations.
     * @param {boolean} [options.pull=false] - Flag to pull files from storage.
     * @param {boolean} [options.git=false] - Flag to use Git for file operations.
     * @param {string} [options.storageFilePath=''] - The path to the storage configuration file.
     * @returns {Promise<void>} A promise that resolves when the recursive callback is complete.
     * @memberof UnderpostFileStorage
     */
    async recursiveCallback(
      path,
      options = {
        rm: false,
        recursive: false,
        deployId: '',
        force: false,
        pull: false,
        git: false,
        storageFilePath: '',
      },
    ) {
      const { storage, storageConf } = UnderpostFileStorage.API.getStorageConf(options);
      const deleteFiles = options.pull === true ? [] : UnderpostRepository.API.getDeleteFiles(path);
      for (const relativePath of deleteFiles) {
        const _path = path + '/' + relativePath;
        if (_path in storage) {
          await UnderpostFileStorage.API.delete(_path);
          delete storage[_path];
        }
      }
      if (options.pull === true) {
        for (const _path of Object.keys(storage)) {
          if (!fs.existsSync(_path) || options.force === true) {
            if (options.force === true && fs.existsSync(_path)) fs.removeSync(_path);
            await UnderpostFileStorage.API.pull(_path, options);
          } else logger.warn(`Pull path already exists`, _path);
        }
        shellExec(`cd ${path} && git init && git add . && git commit -m "Base pull state"`);
      } else {
        const files =
          options.git === true
            ? UnderpostRepository.API.getChangedFiles(path)
            : await fs.readdir(path, { recursive: true });
        for (const relativePath of files) {
          const _path = path + '/' + relativePath;
          if (fs.statSync(_path).isDirectory()) {
            if (options.pull === true && !fs.existsSync(_path)) fs.mkdirSync(_path, { recursive: true });
            continue;
          } else if (!(_path in storage) || options.force === true) {
            await UnderpostFileStorage.API.upload(_path, options);
            if (storage) storage[_path] = {};
          } else logger.warn('File already exists', _path);
        }
      }
      UnderpostFileStorage.API.writeStorageConf(storage, storageConf);
      if (options.git === true) {
        shellExec(`cd ${path} && git add .`);
        shellExec(`underpost cmt ${path} feat`);
      }
    },
    /**
     * @method callback
     * @description Orchestrates file storage operations based on the provided options.
     * This method handles file uploads, deletions, and recursive processing of directories.
     * @param {string} path - The path to the file or directory to process.
     * @param {object} [options] - An object containing options for the callback.
     * @param {boolean} [options.rm=false] - Flag to remove files and directories.
     * @param {boolean} [options.recursive=false] - Flag to process directories recursively.
     * @param {string} [options.deployId=''] - The identifier for the deployment.
     * @param {boolean} [options.force=false] - Flag to force file operations.
     * @param {boolean} [options.pull=false] - Flag to pull files from storage.
     * @param {boolean} [options.git=false] - Flag to use Git for file operations.
     * @returns {Promise<void>} A promise that resolves when the callback is complete.
     * @memberof UnderpostFileStorage
     */
    async callback(
      path,
      options = { rm: false, recursive: false, deployId: '', force: false, pull: false, git: false },
    ) {
      if (options.recursive === true || options.git === true)
        return await UnderpostFileStorage.API.recursiveCallback(path, options);
      if (options.pull === true) return await UnderpostFileStorage.API.pull(path, options);
      if (options.rm === true) return await UnderpostFileStorage.API.delete(path, options);
      return await UnderpostFileStorage.API.upload(path, options);
    },
    /**
     * @method upload
     * @description Uploads a file to Cloudinary.
     * @param {string} path - The path to the file to upload.
     * @param {object} [options] - An object containing options for the upload.
     * @param {boolean} [options.force=false] - Flag to force file operations.
     * @param {string} [options.storageFilePath=''] - The path to the storage configuration file.
     * @returns {Promise<object>} A promise that resolves to the upload result.
     * @memberof UnderpostFileStorage
     */
    async upload(
      path,
      options = { rm: false, recursive: false, deployId: '', force: false, pull: false, storageFilePath: '' },
    ) {
      UnderpostFileStorage.API.cloudinaryConfig();
      const { storage, storageConf } = UnderpostFileStorage.API.getStorageConf(options);
      // path = UnderpostFileStorage.API.file2Zip(path);
      const uploadResult = await cloudinary.uploader
        .upload(path, {
          public_id: path,
          resource_type: 'raw',
          overwrite: options.force === true ? true : false,
        })
        .catch((error) => {
          logger.error(error, { path, stack: error.stack });
        });
      logger.info('upload result', uploadResult);
      if (storage) storage[path] = {};
      UnderpostFileStorage.API.writeStorageConf(storage, storageConf);
      return uploadResult;
    },
    /**
     * @method pull
     * @description Pulls a file from Cloudinary.
     * @param {string} path - The path to the file to pull.
     * @returns {Promise<void>} A promise that resolves when the file is pulled.
     * @memberof UnderpostFileStorage
     */
    async pull(path) {
      UnderpostFileStorage.API.cloudinaryConfig();
      const folder = dir.dirname(path);
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      const downloadResult = await cloudinary.utils.download_archive_url({
        public_ids: [path],
        resource_type: 'raw',
      });
      logger.info('download result', downloadResult);
      await Downloader(downloadResult, path + '.zip');
      path = UnderpostFileStorage.API.zip2File(path + '.zip');
      fs.removeSync(path + '.zip');
    },
    async delete(path) {
      UnderpostFileStorage.API.cloudinaryConfig();
      const deleteResult = await cloudinary.api
        .delete_resources([path], { type: 'upload', resource_type: 'raw' })
        .catch((error) => {
          logger.error(error, { path, stack: error.stack });
        });
      logger.info('delete result', deleteResult);
      return deleteResult;
    },
    /**
     * @method file2Zip
     * @description Converts a file to a zip file.
     * @param {string} path - The path to the file to convert.
     * @returns {string} The path to the zip file.
     * @memberof UnderpostFileStorage
     */
    file2Zip(path) {
      const zip = new AdmZip();
      zip.addLocalFile(path, '/');
      path = path + '.zip';
      zip.writeZip(path);
      return path;
    },
    /**
     * @method zip2File
     * @description Converts a zip file to a file.
     * @param {string} path - The path to the zip file to convert.
     * @returns {string} The path to the file.
     * @memberof UnderpostFileStorage
     */
    zip2File(path) {
      const zip = new AdmZip(path);
      path = path.replaceAll('.zip', '');
      zip.extractEntryTo(
        /*entry name*/ path.split('/').pop(),
        /*target path*/ dir.dirname(path),
        /*maintainEntryPath*/ false,
        /*overwrite*/ true,
      );
      return path;
    },
  };
}

export default UnderpostFileStorage;
