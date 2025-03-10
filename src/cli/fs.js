import { v2 as cloudinary } from 'cloudinary';
import { loggerFactory } from '../server/logger.js';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import * as dir from 'path';
dotenv.config();

const logger = loggerFactory(import.meta);

class UnderpostFileStorage {
  static API = {
    cloudinaryConfig() {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    },
    async callback(path, options = { rm: false }) {
      if (options.rm === true) return await UnderpostFileStorage.API.delete(path);
      return await UnderpostFileStorage.API.upload(path);
    },
    async upload(path) {
      UnderpostFileStorage.API.cloudinaryConfig();
      // path = UnderpostFileStorage.API.file2Zip(path);
      const uploadResult = await cloudinary.uploader
        .upload(path, {
          public_id: path,
          resource_type: 'raw',
        })
        .catch((error) => {
          logger.error(error, { path, stack: error.stack });
        });
      logger.info('upload result', uploadResult);
      return uploadResult;
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
