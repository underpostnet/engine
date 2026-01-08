/**
 * File model and schema definitions for MongoDB/Mongoose.
 * Provides the File schema, model, and Data Transfer Object (DTO) for file operations.
 *
 * @module src/api/file/file.model.js
 * @namespace FileModelServer
 */

import { Schema, model } from 'mongoose';

/**
 * Mongoose schema definition for File documents.
 * @type {Schema}
 * @memberof FileModelServer
 */
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

/**
 * Mongoose model for File documents.
 * @type {import('mongoose').Model}
 * @memberof FileModelServer
 */
const FileModel = model('File', FileSchema);

/**
 * Provider schema alias for File schema.
 * Used for database provider compatibility.
 * @type {Schema}
 * @memberof FileModelServer
 */
const ProviderSchema = FileSchema;

/**
 * File Data Transfer Object (DTO) for the model layer.
 * Provides core transformation methods for file documents including metadata extraction,
 * full document conversion, and filename normalization utilities.
 * @namespace FileModelServer.FileModelDto
 * @memberof FileModelServer
 */
const FileModelDto = {
  /**
   * Returns file metadata only (no buffer data).
   * Used for list responses and API integration.
   * @function toMetadata
   * @memberof FileModelServer.FileModelDto
   * @param {Object} file - File document from database.
   * @returns {Object|null} File metadata object, or null if file is falsy.
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
   * Returns file with complete data.
   * Used only when explicitly requested (e.g., file/blob endpoint).
   * @function toFull
   * @memberof FileModelServer.FileModelDto
   * @param {Object} file - File document from database.
   * @returns {Object|null} Complete file object with buffer data, or null if file is falsy.
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
   * Transforms array of files to metadata only.
   * @function toMetadataArray
   * @memberof FileModelServer.FileModelDto
   * @param {Array} files - Array of file documents.
   * @returns {Array} Array of file metadata objects.
   */
  toMetadataArray: (files) => {
    if (!Array.isArray(files)) return [];
    return files.map((file) => FileModelDto.toMetadata(file));
  },

  /**
   * Ensures UTF-8 encoding for filenames.
   * Fixes issues with special characters (e.g., ñ, é, ü).
   * @function normalizeFilename
   * @memberof FileModelServer.FileModelDto
   * @param {string} filename - Raw filename from upload.
   * @returns {string} UTF-8 encoded filename.
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

export { FileSchema, FileModel, ProviderSchema, FileModelDto };
