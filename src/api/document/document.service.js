import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { DocumentDto } from './document.model.js';

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

    switch (req.params.id) {
      default:
        const queryPayload = {
          userId: req.auth.user._id,
          // ...(req.query['uri'] && req.query['extension']
          //   ? { location: `/^${req.query['uri']}.*${req.query['extension']}$/` }
          //   : undefined),
        };
        logger.info('queryPayload', queryPayload);
        return await Document.find(queryPayload).populate(DocumentDto.populate.get());
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./document.model.js').DocumentModel} */
    const Document = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Document;

    switch (req.params.id) {
      default:
        return await Document.findByIdAndDelete(req.params.id);
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
