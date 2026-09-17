import { Schema, model } from 'mongoose';
import { STABLE_SLUG_MAX_LENGTH, STABLE_SLUG_PATTERN } from '../../client/components/core/CommonJs.js';

const STABLE_SLUG_FALLBACK = 'untitled';

// Letters NFKD leaves whole, so stripping combining marks alone would drop them.
const SLUG_TRANSLITERATIONS = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', ł: 'l', þ: 'th' };

const truncateSlug = (slug, maxLength) => slug.slice(0, maxLength).replace(/-+$/, '');

/**
 * The URL-safe base slug for a title. The server owns slug assignment: uniqueness is resolved
 * against the database, never from this value alone.
 * @param {string} title
 * @returns {string} A slug matching `STABLE_SLUG_PATTERN`; `untitled` when nothing URL-safe remains.
 */
const stableSlugFactory = (title) => {
  const slug = `${title ?? ''}`
    .toLowerCase()
    .replace(/[ßæœøđðłþ]/g, (letter) => SLUG_TRANSLITERATIONS[letter])
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return truncateSlug(slug, STABLE_SLUG_MAX_LENGTH) || STABLE_SLUG_FALLBACK;
};

/**
 * The n-th deterministic candidate for a base slug: `base`, `base-2`, `base-3`, … with the base
 * shortened so the suffix always fits.
 * @param {string} baseSlug
 * @param {number} [attempt=1]
 * @returns {string}
 */
const stableSlugCandidate = (baseSlug, attempt = 1) => {
  if (attempt <= 1) return baseSlug;
  const suffix = `-${attempt}`;
  return `${truncateSlug(baseSlug, STABLE_SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
};

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html
const DocumentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    location: { type: String },
    title: { type: String },
    // External URL identity (`/entry/:stableSlug`, `/content/:stableSlug`); `_id` stays internal and
    // `title` stays freely editable. Assigned once on create and immutable afterwards. Required only
    // on create, so a document from before the field existed stays writable until it is migrated.
    stableSlug: {
      type: String,
      required: function () {
        return this.isNew;
      },
      immutable: true,
      maxlength: STABLE_SLUG_MAX_LENGTH,
      match: STABLE_SLUG_PATTERN,
    },
    tags: [{ type: String }],
    isPublic: { type: Boolean, default: false },
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },
    mdFileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },
    share: {
      copyShareLinkEvent: [
        {
          year: { type: Number },
          month: { type: Number },
          day: { type: Number },
          count: { type: Number, default: 0 },
        },
      ],
    },
  },
  {
    timestamps: true,
  },
);

const STABLE_SLUG_INDEX_NAME = 'stableSlug_1';
// Both public namespaces resolve a slug without an owner, so it is unique across the collection.
// Partial so the index builds on a collection still holding documents from before the field existed.
const STABLE_SLUG_INDEX_OPTIONS = {
  name: STABLE_SLUG_INDEX_NAME,
  unique: true,
  partialFilterExpression: { stableSlug: { $type: 'string' } },
};
DocumentSchema.index({ stableSlug: 1 }, STABLE_SLUG_INDEX_OPTIONS);

// Every retry re-reads the taken slugs, and a conflict means another writer landed, so attempts
// are bounded by the writers competing for one title; the cap only stops a defect from spinning.
const STABLE_SLUG_WRITE_ATTEMPTS = 100;
// A suffix is at most `-99999`, so every candidate for a base starts with the base cut to this.
const STABLE_SLUG_CANDIDATE_PREFIX_LENGTH = STABLE_SLUG_MAX_LENGTH - 6;
const MISSING_STABLE_SLUG = { stableSlug: { $in: [null, ''] } };

const isStableSlugConflict = (error) => error?.code === 11000 && /stableSlug/.test(error.message);

// Every Mongoose create path (`save`, `create`, `insertMany`) gets a slug; explicit ones (an import
// preserving published URLs) are kept.
DocumentSchema.pre('validate', async function () {
  if (this.isNew && !this.stableSlug) this.stableSlug = await this.constructor.nextStableSlug(this.title);
});

/**
 * Lowest free deterministic candidate for a title, from one index-backed read of the slugs the
 * title's candidates can collide with. A read is only a hint under concurrency: the unique index
 * decides, and writers retry on a conflict.
 * @param {string} title
 * @returns {Promise<string>}
 */
DocumentSchema.statics.nextStableSlug = async function (title) {
  const baseSlug = stableSlugFactory(title);
  // Slugs hold no regex metacharacters, so they are used verbatim.
  const prefix = truncateSlug(baseSlug, STABLE_SLUG_CANDIDATE_PREFIX_LENGTH);
  const pattern = prefix === baseSlug ? `^${baseSlug}(-\\d+)?$` : `^${prefix}`;
  const taken = new Set(
    (await this.find({ stableSlug: { $regex: pattern } }, 'stableSlug').lean()).map((doc) => doc.stableSlug),
  );
  for (let attempt = 1; ; attempt++) {
    const candidate = stableSlugCandidate(baseSlug, attempt);
    if (!taken.has(candidate)) return candidate;
  }
};

/**
 * Creates a document under a server-assigned slug, re-resolving when a concurrent insert claimed
 * the same slug first.
 * @param {object} data - Document fields; a client-supplied `stableSlug` is ignored.
 * @returns {Promise<import('mongoose').Document>}
 */
DocumentSchema.statics.createWithStableSlug = async function ({ stableSlug, ...data }) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await this.create(data);
    } catch (error) {
      if (!isStableSlugConflict(error) || attempt >= STABLE_SLUG_WRITE_ATTEMPTS) throw error;
    }
  }
};

/**
 * One-shot, idempotent migration to a unique `stableSlug` on every document (`underpost db
 * --migrate-stable-slugs`). Documents that share a slug — only possible if they were written
 * before the unique index existed — keep it on the oldest and are reassigned otherwise; the index is
 * then built, and every document without a slug receives one, oldest first so the earliest document
 * of a title keeps the unsuffixed slug. A write only lands while the document still has no slug, so
 * repeated or concurrent runs never rewrite one.
 * @returns {Promise<{ reassigned: number, assigned: number, remaining: number }>} Duplicates released,
 *   slugs written (released duplicates included) and documents still without one.
 */
DocumentSchema.statics.ensureStableSlugs = async function () {
  let reassigned = 0;
  const duplicates = this.collection.aggregate([
    { $match: { stableSlug: { $type: 'string', $ne: '' } } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $group: { _id: '$stableSlug', ids: { $push: '$_id' } } },
    { $match: { 'ids.1': { $exists: true } } },
  ]);
  for await (const { ids } of duplicates) {
    const { modifiedCount } = await this.collection.updateMany(
      { _id: { $in: ids.slice(1) } },
      { $unset: { stableSlug: '' } },
    );
    reassigned += modifiedCount;
  }

  const indexes = await this.collection.indexes().catch(() => []);
  const current = indexes.find((index) => index.name === STABLE_SLUG_INDEX_NAME);
  if (!current?.unique || !current.partialFilterExpression) {
    if (current) await this.collection.dropIndex(STABLE_SLUG_INDEX_NAME);
    await this.collection.createIndex({ stableSlug: 1 }, STABLE_SLUG_INDEX_OPTIONS);
  }

  let assigned = 0;
  const legacyDocuments = this.find(MISSING_STABLE_SLUG, 'title').sort({ createdAt: 1, _id: 1 }).lean().cursor();
  for await (const document of legacyDocuments) {
    for (let attempt = 1; ; attempt++) {
      const stableSlug = await this.nextStableSlug(document.title);
      try {
        const { modifiedCount } = await this.collection.updateOne(
          { _id: document._id, ...MISSING_STABLE_SLUG },
          { $set: { stableSlug } },
        );
        assigned += modifiedCount;
        break;
      } catch (error) {
        if (!isStableSlugConflict(error) || attempt >= STABLE_SLUG_WRITE_ATTEMPTS) throw error;
      }
    }
  }

  return { reassigned, assigned, remaining: await this.countDocuments(MISSING_STABLE_SLUG) };
};

const DocumentModel = model('Document', DocumentSchema);
const ProviderSchema = DocumentSchema;
class DocumentDto {
  static populate = {
    file: () => {
      return {
        path: 'fileId',
        model: 'File',
        select: '_id name mimetype',
      };
    },
    mdFile: () => {
      return {
        path: 'mdFileId',
        model: 'File',
        select: '_id name mimetype',
      };
    },
    user: () => {
      return {
        path: 'userId',
        model: 'User',
        select: '_id role username profileImageId briefDescription',
        populate: {
          path: 'profileImageId',
          model: 'File',
          select: '_id name mimetype',
        },
      };
    },
  };
  static getTotalCopyShareLinkCount = (document) => {
    if (!document.share || !document.share.copyShareLinkEvent) return 0;
    return document.share.copyShareLinkEvent.reduce((total, event) => total + (event.count || 0), 0);
  };
  /**
   * Single-document read rule, the same one file blobs are served under: public documents are
   * readable by anyone, private ones only by their owner.
   * @param {{ isPublic?: boolean, userId?: object|string }} document
   * @param {{ _id: string } | null} user - Verified requester, `null` when anonymous.
   * @returns {boolean}
   */
  static isReadableBy = (document, user) =>
    document.isPublic === true || (!!user && `${document.userId?._id ?? document.userId}` === `${user._id}`);
  /**
   * Public shape of a populated document: creator info only for the owner or a public document
   * from a publisher, and never the creator's role or email.
   * @param {import('mongoose').Document|object} doc - Document with `userId` populated.
   * @param {{ _id: string } | null} user - Verified requester, `null` when anonymous.
   * @returns {object}
   */
  static toPublic = (doc, user) => {
    const docObj = doc.toObject ? doc.toObject() : doc;
    let userInfo = docObj.userId;
    const isPublisher = userInfo && (userInfo.role === 'admin' || userInfo.role === 'moderator');
    const isOwnDoc = !!user && `${user._id}` === `${docObj.userId?._id}`;
    if ((!docObj.isPublic || !isPublisher) && !isOwnDoc) userInfo = undefined;
    return {
      ...docObj,
      userId: {
        ...userInfo,
        role: undefined,
        email: undefined,
      },
      tags: DocumentDto.filterPublicTag(docObj.tags),
      totalCopyShareLinkCount: DocumentDto.getTotalCopyShareLinkCount(docObj),
    };
  };
  /**
   * Filter 'public' tag from tags array
   * The 'public' tag is internal and should not be rendered to users
   * @param {string[]} tags - Array of tags
   * @returns {string[]} - Filtered tags without 'public'
   */
  static filterPublicTag = (tags) => {
    if (!tags || !Array.isArray(tags)) return [];
    return tags.filter((tag) => tag !== 'public');
  };
  /**
   * Extract isPublic boolean from tags array and return cleaned tags
   * @param {string[]} tags - Array of tags potentially containing 'public'
   * @returns {{ isPublic: boolean, tags: string[] }} - Object with isPublic flag and cleaned tags
   */
  static extractPublicFromTags = (tags) => {
    if (!tags || !Array.isArray(tags)) {
      return { isPublic: false, tags: [] };
    }
    const hasPublicTag = tags.includes('public');
    const cleanedTags = tags.filter((tag) => tag !== 'public');
    return { isPublic: hasPublicTag, tags: cleanedTags };
  };
}
export { DocumentSchema, DocumentModel, ProviderSchema, DocumentDto, stableSlugFactory, stableSlugCandidate };
