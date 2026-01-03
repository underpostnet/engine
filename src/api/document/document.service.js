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

    // High-query endpoint for typeahead search
    // Security Model:
    // - Unauthenticated users: CAN see public-tagged documents from publishers (admin/moderator)
    // - Authenticated users: CAN see public-tagged documents from publishers + ALL their own documents (any tags)
    // - No user can see private documents from other users
    if (req.path.startsWith('/public/high') && req.query['q']) {
      // Input validation
      const rawQuery = req.query['q'];
      if (!rawQuery || typeof rawQuery !== 'string') {
        throw new Error('Invalid search query');
      }

      // Sanitize and validate search query
      const searchQuery = rawQuery.trim();
      if (searchQuery.length < 1) {
        throw new Error('Search query too short');
      }
      if (searchQuery.length > 100) {
        throw new Error('Search query too long (max 100 characters)');
      }

      // Escape regex special characters to prevent ReDoS attacks
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const publisherUsers = await User.find({ $or: [{ role: 'admin' }, { role: 'moderator' }] });

      const token = getBearerToken(req);
      let user;
      if (token) {
        try {
          user = verifyJWT(token, options);
        } catch (error) {
          logger.warn('Invalid token for high-query search', error.message);
          user = null;
        }
      }

      // Validate and sanitize limit parameter
      let limit = 10;
      if (req.query.limit) {
        const parsedLimit = parseInt(req.query.limit, 10);
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
          throw new Error('Invalid limit parameter (must be between 1 and 50)');
        }
        limit = parsedLimit;
      }

      // Build query based on authentication status
      let queryPayload;

      if (user && user.role && user.role !== 'guest') {
        // Authenticated user can see:
        // 1. ALL their own documents (public AND private - no tag restriction)
        // 2. Public-tagged documents from publishers (admin/moderator only)
        // This correctly implements: user sees everything they own + public content from trusted sources
        queryPayload = {
          $or: [
            {
              // Public documents from publishers (admin/moderator)
              userId: { $in: publisherUsers.map((p) => p._id) },
              tags: { $in: ['public'] },
              title: { $regex: escapedQuery, $options: 'i' },
            },
            {
              // User's OWN documents - NO TAG RESTRICTION
              // This means ALL documents (public, private, any tags)
              userId: user._id,
              title: { $regex: escapedQuery, $options: 'i' },
            },
          ],
        };
      } else {
        // Public/unauthenticated user: ONLY public-tagged documents from publishers (admin/moderator)
        // This is correct: anonymous users CAN see content from trusted publishers
        queryPayload = {
          userId: { $in: publisherUsers.map((p) => p._id) },
          tags: { $in: ['public'] },
          title: { $regex: escapedQuery, $options: 'i' },
        };
      }

      // Edge case: no publishers and no authenticated user = no results
      if (publisherUsers.length === 0 && (!user || user.role === 'guest')) {
        logger.warn('No publishers found and user not authenticated - returning empty results');
        return { data: [] };
      }

      // Security audit logging
      logger.info('High-query search', {
        query: searchQuery.substring(0, 50), // Log only first 50 chars for privacy
        authenticated: !!user,
        userId: user?._id?.toString(),
        role: user?.role,
        limit,
        publishersCount: publisherUsers.length,
        timestamp: new Date().toISOString(),
      });

      const data = await Document.find(queryPayload)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('_id title tags createdAt userId')
        .lean();

      // Sanitize response - remove userId for public users
      const sanitizedData = data.map((doc) => {
        if (!user || user.role === 'guest') {
          // Remove userId from response for unauthenticated users
          const { userId, ...rest } = doc;
          return rest;
        }
        return doc;
      });

      return { data: sanitizedData };
    }

    // Standard public endpoint with tag filtering
    // Security Model:
    // - Unauthenticated users: CAN see public-tagged documents from publishers (admin/moderator)
    // - Authenticated users: CAN see public-tagged documents from publishers + their own public-tagged documents
    if (req.path.startsWith('/public') && req.query['tags']) {
      const publisherUsers = await User.find({ $or: [{ role: 'admin' }, { role: 'moderator' }] });

      // Security check: Validate publishers exist
      if (publisherUsers.length === 0) {
        logger.warn('No publishers (admin/moderator) found for public tag search');
      }

      const token = getBearerToken(req);
      let user;
      if (token) {
        try {
          user = verifyJWT(token, options);
        } catch (error) {
          logger.warn('Invalid token for public search', error.message);
          user = null;
        }
      }

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
