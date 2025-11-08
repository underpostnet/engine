import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import crypto from 'crypto';

const logger = loggerFactory(import.meta);

const FileFactory = {
  filesExtract: (req) => {
    const files = [];
    if (!req.files || Object.keys(req.files).length === 0) {
      return files;
    }

    // Handle standard 'file' field
    if (Array.isArray(req.files.file)) {
      for (const file of req.files.file) files.push(file);
    } else if (req.files.file) {
      files.push(req.files.file);
    }

    // Handle all other fields (like direction codes)
    for (const keyFile of Object.keys(req.files)) {
      if (keyFile === 'file') continue; // Already handled above

      const fileOrFiles = req.files[keyFile];
      if (Array.isArray(fileOrFiles)) {
        // Multiple files with same field name
        for (const file of fileOrFiles) {
          if (file && file.data) {
            files.push(file);
          }
        }
      } else if (fileOrFiles && fileOrFiles.data) {
        // Single file
        files.push(fileOrFiles);
      }
    }

    return files;
  },
  upload: async function (req, File) {
    const results = FileFactory.filesExtract(req);
    let index = -1;
    for (let file of results) {
      file = await new File(file).save();
      index++;
      const [result] = await File.find({
        _id: file._id,
      }).select({ _id: 1, name: 1, mimetype: 1 });
      results[index] = result;
    }
    return results;
  },
  hex: (raw = '') => {
    return Buffer.from(raw, 'utf8').toString('hex');
    // reverse hexValue.toString()
  },
  getMymeTypeFromPath: (path) => {
    switch (path.split('.').pop()) {
      case 'png':
        return 'image/png';
      case 'jpg':
        return 'image/jpeg';
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      default:
        return 'application/octet-stream';
    }
  },
  create: (data = Buffer.from([]), name = '') => {
    return {
      name: name,
      data: data,
      size: data.length,
      encoding: '7bit',
      tempFilePath: '',
      truncated: false,
      mimetype: FileFactory.getMymeTypeFromPath(name),
      md5: crypto.createHash('md5').update(data).digest('hex'),
      cid: undefined,
    };
  },
};

const FileService = {
  post: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;
    return await FileFactory.upload(req, File);
  },
  get: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    if (req.path.startsWith('/blob') && req.params.id) {
      const file = await File.findOne({ _id: req.params.id });
      res.set('Content-Type', file.mimetype);
      return Buffer.from(file.data, 'base64');
    }

    switch (req.params.id) {
      case 'all':
        return await File.find();

      default:
        return await File.find({
          _id: req.params.id,
        });
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    switch (req.params.id) {
      default:
        return await File.findByIdAndDelete(req.params.id);
    }
  },
};

export { FileService, FileFactory };
