import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { DocumentDto } from './document.model.js';
import { uniqueArray } from '../../client/components/core/CommonJs.js';
import { getBearerToken, verifyJWT } from '../../server/auth.js';
import { isValidObjectId } from 'mongoose';

const logger = loggerFactory(import.meta);

const DocumentService = {
  post: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Document;

    switch (req.params.id) {
      default:
        req.body.userId = req.auth.user._id;
        return await new Document(req.body).save();
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Document;
    /** @type {import('../user/user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.User;

    if (req.path.startsWith('/public') && req.query['tags']) {
      const publisherUsers = await User.find({ $or: [{ role: 'admin' }, { role: 'moderator' }] });

      const token = getBearerToken(req);
      let user;
      if (token) user = verifyJWT(token, options);

      const queryPayload = {
        userId: {
          $in: publisherUsers.map((p) => p._id).concat(user?.role && user.role !== 'guest' ? [user._id] : []),
        },
        tags: {
          // $in: uniqueArray(['public'].concat(req.query['tags'].split(','))),
          $all: uniqueArray(['public'].concat(req.query['tags'].split(','))),
        },
        ...(req.query.cid
          ? {
              _id: {
                $in: req.query.cid.split(',').filter((cid) => isValidObjectId(cid)),
              },
            }
          : undefined),
      };
      logger.info('queryPayload', queryPayload);
      // sort in descending (-1) order by length
      const sort = { createdAt: -1 };
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 6;
      const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;

      const data = await Document.find(queryPayload)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .populate(DocumentDto.populate.file())
        .populate(DocumentDto.populate.mdFile())
        .populate(user && user.role !== 'guest' ? DocumentDto.populate.user() : null);

      const lastDoc = await Document.findOne(queryPayload, '_id').sort({ createdAt: 1 });
      const lastId = lastDoc ? lastDoc._id : null;

      // Add totalCopyShareLinkCount to each document
      const dataWithCounts = data.map((doc) => {
        const docObj = doc.toObject ? doc.toObject() : doc;
        return {
          ...docObj,
          totalCopyShareLinkCount: DocumentDto.getTotalCopyShareLinkCount(doc),
        };
      });

      return {
        data: dataWithCounts,
        lastId,
      };
    }

    switch (req.params.id) {
      default: {
        const data = await Document.find({
          userId: req.auth.user._id,
          ...(req.params.id ? { _id: req.params.id } : undefined),
        })
          .populate(DocumentDto.populate.file())
          .populate(DocumentDto.populate.mdFile());

        // Add totalCopyShareLinkCount to each document
        return data.map((doc) => {
          const docObj = doc.toObject ? doc.toObject() : doc;
          return {
            ...docObj,
            totalCopyShareLinkCount: DocumentDto.getTotalCopyShareLinkCount(doc),
          };
        });
      }
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Document;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    switch (req.params.id) {
      default: {
        const document = await Document.findOne({ _id: req.params.id });
        if (!document) throw new Error('document not found');

        if (document.userId.toString() !== req.auth.user._id) throw new Error('invalid user');

        if (document.mdFileId) {
          const file = await File.findOne({ _id: document.mdFileId });
          if (file) await File.findByIdAndDelete(document.mdFileId);
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
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Document;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    switch (req.params.id) {
      default: {
        const document = await Document.findOne({ _id: req.params.id });
        if (!document) throw new Error(`Document not found`);

        if (document.mdFileId) {
          const file = await File.findOne({ _id: document.mdFileId });
          if (file) await File.findByIdAndDelete(document.mdFileId);
        }

        if (document.fileId) {
          const file = await File.findOne({ _id: document.fileId });
          if (file) await File.findByIdAndDelete(document.fileId);
        }
        return await Document.findByIdAndUpdate(req.params.id, req.body);
      }
    }
  },
  patch: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Document;

    if (req.path.includes('/copy-share-link')) {
      const document = await Document.findById(req.params.id);
      if (!document) throw new Error('Document not found');

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // 0-indexed
      const day = now.getDate();

      // Find existing entry for this year/month/day
      const existingEventIndex = document.share?.copyShareLinkEvent?.findIndex(
        (event) => event.year === year && event.month === month && event.day === day,
      );

      if (existingEventIndex !== undefined && existingEventIndex >= 0) {
        // Increment existing count
        document.share.copyShareLinkEvent[existingEventIndex].count += 1;
      } else {
        // Create new entry
        if (!document.share) document.share = {};
        if (!document.share.copyShareLinkEvent) document.share.copyShareLinkEvent = [];
        document.share.copyShareLinkEvent.push({
          year,
          month,
          day,
          count: 1,
        });
      }

      await document.save();
      return document;
    }

    throw new Error('Invalid patch endpoint');
  },
};

export { DocumentService };
