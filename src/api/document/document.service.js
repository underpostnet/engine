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

        // Extract 'public' from tags and set isPublic field
        // Filter 'public' tag to keep it out of the tags array
        const { isPublic, tags } = DocumentDto.extractPublicFromTags(req.body.tags);
        req.body.isPublic = isPublic;
        req.body.tags = tags;

        return await new Document(req.body).save();
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Document;
    /** @type {import('../user/user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.User;

    // High-query endpoint for typeahead search
    //
    // Security Model:
    // - Unauthenticated users: CAN see public documents (isPublic=true) from publishers (admin/moderator)
    // - Authenticated users: CAN see public documents from publishers + ALL their own documents (public or private)
    // - No user can see private documents from other users
    //
    // Search Optimization Strategy:
    // 1. Case-insensitive matching ($options: 'i') - maximizes matches across case variations
    // 2. Multi-term search - splits "hello world" into ["hello", "world"] and matches ANY term
    // 3. Multi-field search - searches BOTH title AND tags array
    // 4. OR logic - ANY term matching ANY field counts as a match
    // 5. Minimum length: 1 character - allows maximum user flexibility
    //
    // Example: Query "javascript tutorial"
    //   - Matches documents with title "JavaScript Guide" (term 1, case-insensitive)
    //   - Matches documents with tag "tutorial" (term 2, tag match)
    //   - Matches documents with both terms in different fields
    //
    if (req.path.startsWith('/public/high') && req.query['q']) {
      // Input validation
      const rawQuery = req.query['q'];
      if (!rawQuery || typeof rawQuery !== 'string') {
        throw new Error('Invalid search query');
      }

      // Sanitize and validate search query
      const searchQuery = rawQuery.trim();
      // Minimum match requirement: allow 1 character for maximum results
      if (searchQuery.length < 1) {
        throw new Error('Search query too short');
      }
      if (searchQuery.length > 100) {
        throw new Error('Search query too long (max 100 characters)');
      }

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

      // SPECIAL CASE: If user searches for exactly "public" (case-insensitive)
      // Return only documents where isPublic === true (exact match behavior)
      if (searchQuery.toLowerCase() === 'public') {
        const queryPayload = {
          isPublic: true,
          userId: { $in: publisherUsers.map((p) => p._id) },
        };

        logger.info('Special "public" search query', {
          authenticated: !!user,
          userId: user?._id?.toString(),
          role: user?.role,
          limit,
        });

        const data = await Document.find(queryPayload)
          .sort({ createdAt: -1 })
          .limit(limit)
          .select('_id title tags createdAt userId isPublic')
          .populate(DocumentDto.populate.user())
          .lean();

        const sanitizedData = data.map((doc) => {
          const filteredDoc = {
            ...doc,
            tags: DocumentDto.filterPublicTag(doc.tags),
          };
          // For unauthenticated users, only include user data if document is public AND creator is publisher
          if (!user || user.role === 'guest') {
            const isPublisher = doc.userId && (doc.userId.role === 'admin' || doc.userId.role === 'moderator');
            if (!doc.isPublic || !isPublisher) {
              const { userId, ...rest } = filteredDoc;
              return rest;
            }
            // Remove role field from userId before sending to client
            if (filteredDoc.userId && filteredDoc.userId.role) {
              const { role, ...userWithoutRole } = filteredDoc.userId;
              filteredDoc.userId = userWithoutRole;
            }
          }
          // Remove role field from userId before sending to client (authenticated users)
          if (filteredDoc.userId && filteredDoc.userId.role) {
            const { role, ...userWithoutRole } = filteredDoc.userId;
            filteredDoc.userId = userWithoutRole;
          }
          return filteredDoc;
        });

        return { data: sanitizedData };
      }

      // OPTIMIZATION: Split search query into individual terms for multi-term matching
      // This maximizes results by matching ANY term in ANY field
      // Example: "react hooks" becomes ["react", "hooks"]
      const searchTerms = searchQuery
        .split(/\s+/)
        .filter((term) => term.length > 0)
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape each term for regex safety

      // Build query based on authentication status
      // ============================================
      // OPTIMIZED FOR MAXIMUM RESULTS:
      // - Multi-term search: matches ANY term
      // - Case-insensitive: $options: 'i' flag
      // - Multi-field: searches title AND tags
      // - Minimum match: ANY term in ANY field = result
      //
      // Example Query: "javascript react"
      // Matches:
      //   ✓ Document with title "JavaScript Tutorial" (term 1 in title)
      //   ✓ Document with tag "react" (term 2 in tags)
      //   ✓ Document with title "Learn React JS" (term 2 in title, case-insensitive)
      //   ✓ Document with tags ["javascript", "tutorial"] (term 1 in tags)

      // Build search conditions for maximum permissiveness
      const buildSearchConditions = () => {
        const conditions = [];

        // For EACH search term, create conditions that match title OR tags
        // This creates an OR chain: (title:term1 OR tags:term1 OR title:term2 OR tags:term2 ...)
        searchTerms.forEach((term) => {
          conditions.push({ title: { $regex: term, $options: 'i' } }); // Case-insensitive title match
          conditions.push({ tags: { $in: [new RegExp(term, 'i')] } }); // Case-insensitive tag match
        });

        return conditions;
      };

      let queryPayload;

      if (user && user.role && user.role !== 'guest') {
        // Authenticated user can see:
        // 1. ALL their own documents (public AND private - no tag restriction)
        // 2. Public-tagged documents from publishers (admin/moderator only)
        //
        // MAXIMUM RESULTS STRATEGY:
        // - Search by: ANY term matches title OR ANY tag
        // - Case-insensitive matching
        // - No minimum match threshold beyond 1 character
        const searchConditions = buildSearchConditions();

        queryPayload = {
          $or: [
            {
              // Public documents from publishers (admin/moderator)
              userId: { $in: publisherUsers.map((p) => p._id) },
              isPublic: true,
              $or: searchConditions, // ANY term in title OR tags
            },
            {
              // User's OWN documents - NO TAG RESTRICTION
              // User sees ALL their own content matching search
              userId: user._id,
              $or: searchConditions, // ANY term in title OR tags
            },
          ],
        };
      } else {
        // Public/unauthenticated user: ONLY public-tagged documents from publishers (admin/moderator)
        //
        // MAXIMUM RESULTS STRATEGY for public users:
        // - Search by: ANY term matches title OR ANY tag
        // - Case-insensitive matching
        // - Still respects security: only public docs from trusted publishers
        const searchConditions = buildSearchConditions();

        queryPayload = {
          userId: { $in: publisherUsers.map((p) => p._id) },
          isPublic: true,
          $or: searchConditions, // ANY term in title OR tags
        };
      }

      // Edge case: no publishers and no authenticated user = no results
      if (publisherUsers.length === 0 && (!user || user.role === 'guest')) {
        logger.warn('No publishers found and user not authenticated - returning empty results');
        return { data: [] };
      }

      // Security audit logging
      logger.info('High-query search (OPTIMIZED FOR MAX RESULTS)', {
        query: searchQuery.substring(0, 50), // Log only first 50 chars for privacy
        terms: searchTerms.length, // Number of search terms
        searchStrategy: 'multi-term OR matching, case-insensitive, title+tags',
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
        .select('_id title tags createdAt userId isPublic')
        .populate(DocumentDto.populate.user())
        .lean();

      // Sanitize response - include userId for public documents from publishers, filter 'public' from tags
      const sanitizedData = data.map((doc) => {
        const filteredDoc = {
          ...doc,
          tags: DocumentDto.filterPublicTag(doc.tags),
        };
        // For unauthenticated users, only include user data if document is public AND creator is publisher
        if (!user || user.role === 'guest') {
          const isPublisher = doc.userId && (doc.userId.role === 'admin' || doc.userId.role === 'moderator');
          if (!doc.isPublic || !isPublisher) {
            const { userId, ...rest } = filteredDoc;
            return rest;
          }
        }
        // Remove role field from userId before sending to client (all users)
        if (filteredDoc.userId && filteredDoc.userId.role) {
          const { role, ...userWithoutRole } = filteredDoc.userId;
          filteredDoc.userId = userWithoutRole;
        }
        return filteredDoc;
      });

      return { data: sanitizedData };
    }

    // Standard public endpoint with tag filtering
    // Security Model (consistent with high-query search):
    // - Unauthenticated users: CAN see public documents (isPublic=true) from publishers (admin/moderator)
    // - Authenticated users: CAN see public documents from publishers + ALL their own documents (public AND private)
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

      // Parse requested tags
      const requestedTagsRaw = req.query['tags']
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag);

      // SPECIAL CASE: If 'public' is in the requested tags (exact match)
      // Filter to ONLY documents where isPublic === true
      const hasPublicTag = requestedTagsRaw.some((tag) => tag.toLowerCase() === 'public');

      // Remove 'public' from content tags (it's handled by isPublic field)
      const requestedTags = requestedTagsRaw.filter((tag) => tag.toLowerCase() !== 'public');

      // Parse pagination parameters
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 6;
      const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;

      // Build query based on authentication status
      // Authenticated users see ALL their own documents + public documents from publishers
      // Unauthenticated users see only public documents from publishers
      let queryPayload;

      if (user && user.role && user.role !== 'guest') {
        // Authenticated user can see:
        // 1. Public documents from publishers (admin/moderator)
        // 2. ALL their own documents (public AND private - matching tag filter)
        const orConditions = [
          {
            // Public documents from publishers
            userId: { $in: publisherUsers.map((p) => p._id) },
            isPublic: true,
            ...(requestedTags.length > 0 ? { tags: { $all: requestedTags } } : {}),
          },
          {
            // User's OWN documents - public OR private (matching tag filter)
            // UNLESS 'public' tag was explicitly requested (then only show isPublic: true)
            userId: user._id,
            ...(hasPublicTag ? { isPublic: true } : {}),
            ...(requestedTags.length > 0 ? { tags: { $all: requestedTags } } : {}),
          },
        ];

        queryPayload = {
          $or: orConditions,
        };

        // Add cid filter outside $or block if present
        if (req.query.cid) {
          queryPayload._id = {
            $in: req.query.cid.split(',').filter((cid) => isValidObjectId(cid)),
          };
        }
      } else {
        // Unauthenticated user: only public documents from publishers
        // If 'public' tag requested, it's redundant but handled by isPublic: true
        // When cid is provided, we relax the publisher filter and check in post-processing
        const cidList = req.query.cid ? req.query.cid.split(',').filter((cid) => isValidObjectId(cid)) : null;

        if (cidList && cidList.length > 0) {
          // For cid queries, just filter by public and tags, check publisher in post-processing
          queryPayload = {
            _id: { $in: cidList },
            isPublic: true,
            ...(requestedTags.length > 0 ? { tags: { $all: requestedTags } } : {}),
          };
        } else {
          // For non-cid queries, filter by publisher at query level
          queryPayload = {
            userId: { $in: publisherUsers.map((p) => p._id) },
            isPublic: true,
            ...(requestedTags.length > 0 ? { tags: { $all: requestedTags } } : {}),
          };
        }
      }
      // Security audit logging
      logger.info('Public tag search', {
        authenticated: !!user,
        userId: user?._id?.toString(),
        role: user?.role,
        requestedTags,
        hasPublicTag,
        hasCidFilter: !!req.query.cid,
        limit,
        skip,
        publishersCount: publisherUsers.length,
      });
      // sort in descending (-1) order by length
      const sort = { createdAt: -1 };

      // Populate user data for authenticated users OR for public documents from publishers
      // This allows unauthenticated users to see creator profiles on public content
      const shouldPopulateUser = user && user.role !== 'guest';
      // Check if query contains public documents (either in $or array or flat query)
      const hasPublicDocuments =
        queryPayload.isPublic === true ||
        queryPayload.$or?.some(
          (condition) => condition.isPublic === true || (condition.userId && condition.isPublic === true),
        );

      const data = await Document.find(queryPayload)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .populate(DocumentDto.populate.file())
        .populate(DocumentDto.populate.mdFile())
        .populate(shouldPopulateUser || hasPublicDocuments ? DocumentDto.populate.user() : null);

      const lastDoc = await Document.findOne(queryPayload, '_id').sort({ createdAt: 1 });
      const lastId = lastDoc ? lastDoc._id : null;

      return {
        data: data.map((doc) => {
          const docObj = doc.toObject ? doc.toObject() : doc;
          let userInfo = docObj.userId;
          const isPublisher = userInfo && (userInfo.role === 'admin' || userInfo.role === 'moderator');
          const isOwnDoc = user && user._id.toString() === docObj.userId._id.toString();
          if ((!docObj.isPublic || !isPublisher) && !isOwnDoc) userInfo = undefined;
          return {
            ...docObj,
            role: undefined,
            email: undefined,
            userId: userInfo,
            tags: DocumentDto.filterPublicTag(docObj.tags),
            totalCopyShareLinkCount: DocumentDto.getTotalCopyShareLinkCount(doc),
          };
        }),
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
          .populate(DocumentDto.populate.mdFile())
          .populate(DocumentDto.populate.user());

        // Add totalCopyShareLinkCount to each document and filter 'public' from tags
        return data.map((doc) => {
          const docObj = doc.toObject ? doc.toObject() : doc;

          // Remove role field from userId before sending to client
          let userInfo = docObj.userId;
          if (userInfo && userInfo.role) {
            const { role, ...userWithoutRole } = userInfo;
            userInfo = userWithoutRole;
          }

          return {
            ...docObj,
            userId: userInfo,
            tags: DocumentDto.filterPublicTag(docObj.tags),
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

        // Extract 'public' from tags and set isPublic field on update
        const { isPublic, tags } = DocumentDto.extractPublicFromTags(req.body.tags);
        req.body.isPublic = isPublic;
        req.body.tags = tags;

        return await Document.findByIdAndUpdate(req.params.id, req.body, { new: true });
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
