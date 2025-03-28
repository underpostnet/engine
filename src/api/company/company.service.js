import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

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
    return await Company.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./company.model.js').CompanyModel} */
    const Company = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Company;
    if (req.params.id) return await Company.findByIdAndDelete(req.params.id);
    else return await Company.deleteMany();
  },
};

export { CompanyService };
