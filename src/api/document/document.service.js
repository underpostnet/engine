import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { DocumentDto } from './document.model.js';
import { uniqueArray } from '../../client/components/core/CommonJs.js';
import { getBearerToken, verifyJWT } from '../../server/auth.js';

const logger = loggerFactory(import.meta);

const DocumentService = {
  post: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Document;

    switch (req.params.id) {
      default:
        req.body.userId = req.auth.user._id;
        return await new Document(req.body).save();
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Document;
    /** @type {import('../user/user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    if (req.path.startsWith('/public') && req.query['tags']) {
      const publisherUser = await User.findOne({ email: 'admin@underpost.net' });

      const token = getBearerToken(req);
      let user;
      if (token) user = verifyJWT(token).user;

      const queryPayload = {
        userId: {
          $in: (publisherUser ? [publisherUser._id.toString()] : []).concat(user ? [user._id] : []),
        },
        tags: {
          // $in: uniqueArray(['public'].concat(req.query['tags'].split(','))),
          $all: uniqueArray(['public'].concat(req.query['tags'].split(','))),
        },
      };
      logger.info('queryPayload', queryPayload);
      return await Document.find(queryPayload)
        .populate(DocumentDto.populate.file())
        .populate(DocumentDto.populate.user());
    }

    switch (req.params.id) {
      default:
        return await Document.find({
          userId: req.auth.user._id,
        }).populate(DocumentDto.populate.file());
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Document;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.File;

    switch (req.params.id) {
      default: {
        const document = await Document.findOne({ _id: req.params.id });
        if (!document) throw new Error('document not found');

        if (document.userId.toString() !== req.auth.user._id) throw new Error('invalid user');

        if (document.imageFileId) {
          const file = await File.findOne({ _id: document.imageFileId });
          if (file) await File.findByIdAndDelete(document.imageFileId);
        }

        if (document.fileId) {
          const file = await File.findOne({ _id: document.fileId });
          if (file) await File.findByIdAndDelete(document.fileId);
        }

        return await Document.findByIdAndDelete(req.params.id);
      }
    }
  },
  put: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Document;

    switch (req.params.id) {
      default:
    }
  },
};

export { DocumentService };
