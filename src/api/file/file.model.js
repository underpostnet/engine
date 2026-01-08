import { Schema, model } from 'mongoose';

const FileSchema = new Schema({
  name: { type: String, required: true },
  data: { type: Buffer, required: true },
  size: { type: Number },
  encoding: { type: String, default: 'utf-8' },
  tempFilePath: { type: String },
  truncated: { type: Boolean },
  mimetype: { type: String },
  md5: { type: String },
  cid: { type: String },
});

const FileModel = model('File', FileSchema);

const ProviderSchema = FileSchema;

/**
 * File Data Transfer Object (DTO)
 * Provides methods for transforming file documents for API responses
 */
const FileDto = {
  /**
   * Returns file metadata only (no buffer data)
   * Used for list responses and API integration
   * @param {Object} file - File document from database
   * @returns {Object} - File metadata object
   */
  toMetadata: (file) => {
    if (!file) return null;
    return {
      _id: file._id,
      name: file.name || '',
      mimetype: file.mimetype || 'application/octet-stream',
      size: file.size || 0,
      md5: file.md5 || '',
      cid: file.cid || '',
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  },

  /**
   * Returns file with complete data
   * Used only when explicitly requested (e.g., file/blob endpoint)
   * @param {Object} file - File document from database
   * @returns {Object} - Complete file object with buffer data
   */
  toFull: (file) => {
    if (!file) return null;
    return {
      _id: file._id,
      name: file.name || '',
      mimetype: file.mimetype || 'application/octet-stream',
      size: file.size || 0,
      md5: file.md5 || '',
      cid: file.cid || '',
      data: file.data,
      encoding: file.encoding || 'utf-8',
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  },

  /**
   * Transforms array of files to metadata only
   * @param {Array} files - Array of file documents
   * @returns {Array} - Array of file metadata objects
   */
  toMetadataArray: (files) => {
    if (!Array.isArray(files)) return [];
    return files.map((file) => FileDto.toMetadata(file));
  },

  /**
   * Ensures UTF-8 encoding for filenames
   * Fixes issues with special characters (e.g., ñ, é, ü)
   * @param {string} filename - Raw filename from upload
   * @returns {string} - UTF-8 encoded filename
   */
  normalizeFilename: (filename) => {
    if (!filename) return '';
    // Ensure string and normalize to UTF-8
    let normalized = String(filename);
    // Replace any incorrectly encoded sequences
    normalized = Buffer.from(normalized, 'utf8').toString('utf8');
    return normalized;
  },
};

export { FileSchema, FileModel, ProviderSchema, FileDto };
