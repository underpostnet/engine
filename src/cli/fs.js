import { v2 as cloudinary } from 'cloudinary';
import { loggerFactory } from '../server/logger.js';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import * as dir from 'path';
import fs from 'fs-extra';
import { Downloader } from '../server/downloader.js';
dotenv.config();

const logger = loggerFactory(import.meta);

class UnderpostFileStorage {
  static API = {
    cloudinaryConfig() {
      // https://console.cloudinary.com/
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    },
    async recursiveCallback(path, options) {
      let storage, storageConf;
      if (options.deployId && typeof options.deployId === 'string') {
        storageConf = `./engine-private/conf/${options.deployId}/storage.json`;
        if (!fs.existsSync(storageConf)) fs.writeFileSync(storageConf, JSON.stringify({}), 'utf8');
        storage = JSON.parse(fs.readFileSync(storageConf, 'utf8'));
      }
      const files = await fs.readdir(path, { recursive: true });
      for (const relativePath of files) {
        const _path = path + '/' + relativePath;
        if (fs.statSync(_path).isDirectory()) {
          if (options.pull === true && !fs.existsSync(_path)) fs.mkdirSync(_path, { recursive: true });
          continue;
        }
        if (options.pull === true) {
          await UnderpostFileStorage.API.pull(_path, options);
        } else if (!(_path in storage) || options.force === true) {
          await UnderpostFileStorage.API.upload(_path, options);
          if (storage) storage[_path] = {};
        } else logger.warn('File already exists', _path);
      }
      if (storage) fs.writeFileSync(storageConf, JSON.stringify(storage, null, 4), 'utf8');
    },
    async callback(path, options = { rm: false, recursive: false, deployId: '', force: false, pull: false }) {
      if (options.recursive === true) return await UnderpostFileStorage.API.recursiveCallback(path, options);
      if (options.pull === true) return await UnderpostFileStorage.API.pull(path, options);
      if (options.rm === true) return await UnderpostFileStorage.API.delete(path, options);
      return await UnderpostFileStorage.API.upload(path);
    },
    async upload(path, options = { force: false }) {
      UnderpostFileStorage.API.cloudinaryConfig();
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
      return uploadResult;
    },
    async pull(path) {
      UnderpostFileStorage.API.cloudinaryConfig();
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
    file2Zip(path) {
      const zip = new AdmZip();
      zip.addLocalFile(path, '/');
      path = path + '.zip';
      zip.writeZip(path);
      return path;
    },
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
