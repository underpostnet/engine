import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import crypto from 'crypto';

const logger = loggerFactory(import.meta);

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

  /**
   * Get select fields for metadata-only queries
   * Excludes the 'data' buffer field
   */
  metadataSelect: () => {
    return '_id name mimetype size encoding md5 cid createdAt updatedAt';
  },
};

const FileFactory = {
  /**
   * Extract files from request
   * Handles both standard 'file' field and custom fields
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
   * Upload files to database with UTF-8 encoding
   */
  upload: async function (req, File) {
    const results = FileFactory.filesExtract(req);
    let index = -1;

    for (let file of results) {
      // Normalize filename to ensure UTF-8 encoding
      file.name = FileDto.normalizeFilename(file.name);
      file.encoding = 'utf-8';

      // Save file to database
      file = await new File(file).save();
      index++;

      // Retrieve metadata-only response
      const [result] = await File.find({
        _id: file._id,
      }).select(FileDto.metadataSelect());

      results[index] = result;
    }

    return results;
  },

  /**
   * Convert string to hexadecimal
   */
  hex: (raw = '') => {
    return Buffer.from(raw, 'utf8').toString('hex');
  },

  /**
   * Get MIME type from file path
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
   * Create file object with proper encoding
   */
  create: (data = Buffer.from([]), name = '') => {
    const normalizedName = FileDto.normalizeFilename(name);

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

const FileService = {
  /**
   * POST - Upload files
   * Returns metadata-only response (no buffer data)
   */
  post: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    const uploadedFiles = await FileFactory.upload(req, File);
    return FileDto.toMetadataArray(uploadedFiles);
  },

  /**
   * GET - Retrieve files
   * Returns metadata-only for regular GET
   * Returns buffer data for /blob endpoint
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
        const files = await File.find().select(FileDto.metadataSelect());
        return FileDto.toMetadataArray(files);
      }

      default: {
        const files = await File.find({
          _id: req.params.id,
        }).select(FileDto.metadataSelect());

        return FileDto.toMetadataArray(files);
      }
    }
  },

  /**
   * DELETE - Remove files
   */
  delete: async (req, res, options) => {
    /** @type {import('./file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    const result = await File.findByIdAndDelete(req.params.id);

    if (!result) {
      throw new Error('File not found');
    }

    return FileDto.toMetadata(result);
  },
};

export { FileService, FileFactory, FileDto };
