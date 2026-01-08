/**
 * File service module for handling file uploads, retrieval, and deletion.
 * Provides REST API handlers for file operations with MongoDB storage.
 *
 * @module src/api/file/file.service.js
 * @namespace FileServiceServer
 */

import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import crypto from 'crypto';

/**
 * Logger instance for this module.
 * @type {Function}
 * @memberof FileServiceServer
 * @private
 */
const logger = loggerFactory(import.meta);

/**
 * File Data Transfer Object (DTO) for the service layer.
 * Provides API-specific transformation methods for file documents including
 * metadata selection queries and response formatting for REST endpoints.
 * @namespace FileServiceServer.FileServiceDto
 * @memberof FileServiceServer
 */
const FileServiceDto = {
  /**
   * Returns file metadata only (no buffer data).
   * Used for list responses and API integration.
   * @function toMetadata
   * @memberof FileServiceServer.FileServiceDto
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
   * Transforms array of files to metadata only.
   * @function toMetadataArray
   * @memberof FileServiceServer.FileServiceDto
   * @param {Array} files - Array of file documents.
   * @returns {Array} Array of file metadata objects.
   */
  toMetadataArray: (files) => {
    if (!Array.isArray(files)) return [];
    return files.map((file) => FileServiceDto.toMetadata(file));
  },

  /**
   * Ensures UTF-8 encoding for filenames.
   * Fixes issues with special characters (e.g., ñ, é, ü).
   * @function normalizeFilename
   * @memberof FileServiceServer.FileServiceDto
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

  /**
   * Get select fields for metadata-only queries.
   * Excludes the 'data' buffer field.
   * @function metadataSelect
   * @memberof FileServiceServer.FileServiceDto
   * @returns {string} Space-separated list of field names for metadata selection.
   */
  metadataSelect: () => {
    return '_id name mimetype size encoding md5 cid createdAt updatedAt';
  },
};

/**
 * File Factory for file extraction, upload, and creation utilities.
 * @namespace FileServiceServer.FileFactory
 * @memberof FileServiceServer
 */
const FileFactory = {
  /**
   * Extract files from request.
   * Handles both standard 'file' field and custom fields.
   * @function filesExtract
   * @memberof FileServiceServer.FileFactory
   * @param {Object} req - Express request object with files.
   * @returns {Array} Array of extracted file objects.
   */
  filesExtract: (req) => {
    const files = [];
    if (!req.files || Object.keys(req.files).length === 0) {
      return files;
    }

    // Handle standard 'file' field
    if (Array.isArray(req.files.file)) {
      for (const file of req.files.file) {
        files.push(file);
      }
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

  /**
   * Upload files to database with UTF-8 encoding.
   * @async
   * @function upload
   * @memberof FileServiceServer.FileFactory
   * @param {Object} req - Express request object with files.
   * @param {import('mongoose').Model} File - Mongoose File model.
   * @returns {Promise<Array>} Array of uploaded file metadata objects.
   */
  upload: async function (req, File) {
    const results = FileFactory.filesExtract(req);
    let index = -1;

    for (let file of results) {
      // Normalize filename to ensure UTF-8 encoding
      file.name = FileServiceDto.normalizeFilename(file.name);
      file.encoding = 'utf-8';

      // Save file to database
      file = await new File(file).save();
      index++;

      // Retrieve metadata-only response
      const [result] = await File.find({
        _id: file._id,
      }).select(FileServiceDto.metadataSelect());

      results[index] = result;
    }

    return results;
  },

  /**
   * Convert string to hexadecimal.
   * @function hex
   * @memberof FileServiceServer.FileFactory
   * @param {string} [raw=''] - Raw string to convert.
   * @returns {string} Hexadecimal representation of the string.
   */
  hex: (raw = '') => {
    return Buffer.from(raw, 'utf8').toString('hex');
  },

  /**
   * Get MIME type from file path based on extension.
   * @function getMymeTypeFromPath
   * @memberof FileServiceServer.FileFactory
   * @param {string} path - File path or filename with extension.
   * @returns {string} MIME type string.
   */
  getMymeTypeFromPath: (path) => {
    const ext = String(path || '')
      .toLowerCase()
      .split('.')
      .pop();
    const mimeTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      pdf: 'application/pdf',
      md: 'text/markdown',
      txt: 'text/plain',
      json: 'application/json',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  },

  /**
   * Create file object with proper encoding.
   * @function create
   * @memberof FileServiceServer.FileFactory
   * @param {Buffer} [data=Buffer.from([])] - File data buffer.
   * @param {string} [name=''] - File name.
   * @returns {Object} File object with name, data, size, encoding, mimetype, and md5.
   */
  create: (data = Buffer.from([]), name = '') => {
    const normalizedName = FileServiceDto.normalizeFilename(name);

    return {
      name: normalizedName,
      data: data,
      size: data.length,
      encoding: 'utf-8',
      tempFilePath: '',
      truncated: false,
      mimetype: FileFactory.getMymeTypeFromPath(normalizedName),
      md5: crypto.createHash('md5').update(data).digest('hex'),
      cid: undefined,
    };
  },
};

/**
 * File Service for handling REST API file operations.
 * @namespace FileServiceServer.FileService
 * @memberof FileServiceServer
 */
const FileService = {
  /**
   * POST - Upload files.
   * Returns metadata-only response (no buffer data).
   * @async
   * @function post
   * @memberof FileServiceServer.FileService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Request options containing host and path.
   * @returns {Promise<Array>} Array of uploaded file metadata objects.
   */
  post: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    const uploadedFiles = await FileFactory.upload(req, File);
    return FileServiceDto.toMetadataArray(uploadedFiles);
  },

  /**
   * GET - Retrieve files.
   * Returns metadata-only for regular GET.
   * Returns buffer data for /blob endpoint.
   * @async
   * @function get
   * @memberof FileServiceServer.FileService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Request options containing host and path.
   * @returns {Promise<Array|Buffer>} Array of file metadata objects or Buffer for blob endpoint.
   * @throws {Error} If file not found for blob endpoint.
   */
  get: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    // Handle blob endpoint - return raw buffer data
    if (req.path.startsWith('/blob') && req.params.id) {
      const file = await File.findOne({ _id: req.params.id });

      if (!file) {
        throw new Error('File not found');
      }

      // Set proper content type and return buffer
      res.set('Content-Type', file.mimetype || 'application/octet-stream');
      res.set('Content-Length', file.size || 0);
      res.set('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);

      // Return Buffer directly (not JSON)
      return Buffer.from(file.data);
    }

    // Handle regular GET - return metadata only
    switch (req.params.id) {
      case 'all': {
        const files = await File.find().select(FileServiceDto.metadataSelect());
        return FileServiceDto.toMetadataArray(files);
      }

      default: {
        const files = await File.find({
          _id: req.params.id,
        }).select(FileServiceDto.metadataSelect());

        return FileServiceDto.toMetadataArray(files);
      }
    }
  },

  /**
   * DELETE - Remove files.
   * @async
   * @function delete
   * @memberof FileServiceServer.FileService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Request options containing host and path.
   * @returns {Promise<Object>} Deleted file metadata object.
   * @throws {Error} If file not found.
   */
  delete: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    const result = await File.findByIdAndDelete(req.params.id);

    if (!result) {
      throw new Error('File not found');
    }

    return FileServiceDto.toMetadata(result);
  },
};

export { FileService, FileFactory, FileServiceDto };
