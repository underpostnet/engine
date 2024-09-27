import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import crypto from 'crypto';

const logger = loggerFactory(import.meta);

const FileFactory = {
  upload: async function (req, File) {
    const results = [];
    if (!req.files) throw { message: 'not file found' };
    if (Array.isArray(req.files.file)) for (const file of req.files.file) results.push(await new File(file).save());
    else if (Object.keys(req.files).length > 0)
      for (const keyFile of Object.keys(req.files)) results.push(await new File(req.files[keyFile]).save());
    let index = -1;
    for (const file of results) {
      index++;
      const [result] = await File.find({
        _id: file._id,
      }).select({ _id: 1, name: 1, mimetype: 1 });
      results[index] = result;
    }
    return results;
  },
  svg: (data = new Buffer(), name = '') => {
    return {
      name: name,
      data: data,
      size: data.length,
      encoding: '7bit',
      tempFilePath: '',
      truncated: false,
      mimetype: 'image/svg+xml',
      md5: crypto.createHash('md5').update(data).digest('hex'),
      cid: undefined,
    };
  },
};

const FileService = {
  post: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.File;
    return await FileFactory.upload(req, File);
  },
  get: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.File;

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
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.File;

    switch (req.params.id) {
      default:
        return await File.findByIdAndDelete(req.params.id);
    }
  },
};

export { FileService, FileFactory };
