import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const DocumentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    location: { type: String },
    title: { type: String },
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

const DocumentModel = model('Document', DocumentSchema);

const ProviderSchema = DocumentSchema;

const DocumentDto = {
  populate: {
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
  },
  getTotalCopyShareLinkCount: (document) => {
    if (!document.share || !document.share.copyShareLinkEvent) return 0;
    return document.share.copyShareLinkEvent.reduce((total, event) => total + (event.count || 0), 0);
  },
  /**
   * Filter 'public' tag from tags array
   * The 'public' tag is internal and should not be rendered to users
   * @param {string[]} tags - Array of tags
   * @returns {string[]} - Filtered tags without 'public'
   */
  filterPublicTag: (tags) => {
    if (!tags || !Array.isArray(tags)) return [];
    return tags.filter((tag) => tag !== 'public');
  },
  /**
   * Extract isPublic boolean from tags array and return cleaned tags
   * @param {string[]} tags - Array of tags potentially containing 'public'
   * @returns {{ isPublic: boolean, tags: string[] }} - Object with isPublic flag and cleaned tags
   */
  extractPublicFromTags: (tags) => {
    if (!tags || !Array.isArray(tags)) {
      return { isPublic: false, tags: [] };
    }
    const hasPublicTag = tags.includes('public');
    const cleanedTags = tags.filter((tag) => tag !== 'public');
    return { isPublic: hasPublicTag, tags: cleanedTags };
  },
};

export { DocumentSchema, DocumentModel, ProviderSchema, DocumentDto };
