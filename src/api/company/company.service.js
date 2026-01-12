import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { FileCleanup } from '../file/file.service.js';

const logger = loggerFactory(import.meta);

const CompanyService = {
  post: async (req, res, options) => {
    /** @type {import('./company.model.js').CompanyModel} */
    const Company = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Company;
    return await new Company(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./company.model.js').CompanyModel} */
    const Company = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Company;
    if (req.params.id) return await Company.findById(req.params.id);
    return await Company.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./company.model.js').CompanyModel} */
    const Company = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Company;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    const company = await Company.findById(req.params.id);
    if (!company) throw new Error('Company not found');

    // Clean up old logo if being replaced
    await FileCleanup.cleanupReplacedFiles({
      oldDoc: company,
      newData: req.body,
      fileFields: ['logo'],
      File,
    });

    return await Company.findByIdAndUpdate(req.params.id, req.body, { new: true });
  },
  delete: async (req, res, options) => {
    /** @type {import('./company.model.js').CompanyModel} */
    const Company = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Company;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    if (req.params.id) {
      const company = await Company.findById(req.params.id);
      if (company) {
        // Clean up associated logo file
        await FileCleanup.deleteDocumentFiles({
          doc: company,
          fileFields: ['logo'],
          File,
        });
      }
      return await Company.findByIdAndDelete(req.params.id);
    } else {
      // When deleting all companies, clean up all logo files
      const companies = await Company.find();
      for (const company of companies) {
        await FileCleanup.deleteDocumentFiles({
          doc: company,
          fileFields: ['logo'],
          File,
        });
      }
      return await Company.deleteMany();
    }
  },
};

export { CompanyService };
