import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';
import { InstanceDto } from './instance.model.js';

const logger = loggerFactory(import.meta);

const InstanceService = {
  post: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Instance;
    return await new Instance(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Instance;

    /** @type {import('../user/user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.User;

    const user = await User.findOne({
      _id: req.auth.user._id,
    });
    switch (req.params.id) {
      case 'count': {
        switch (user.role) {
          case 'admin':
            return { total: await Instance.countDocuments() };
          default:
            return { total: await Instance.countDocuments({ userId: req.auth.user._id }) };
        }
      }
      default:
        // Use DataQuery.parse for filtering, sorting, and pagination
        const defaultSort = { updatedAt: -1 };
        const baseQuery = user.role === 'admin' ? {} : { userId: req.auth.user._id };
        const { query, sort, skip, limit, page } = DataQuery.parse({
          ...req.query,
          query: baseQuery,
        });

        // Apply default sort if no sort was specified
        const finalSort = Object.keys(sort).length > 0 ? sort : defaultSort;

        switch (user.role) {
          case 'admin':
            if (req.params.id) return await Instance.findById(req.params.id);
            const [dataAdmin, totalAdmin] = await Promise.all([
              Instance.find(query).sort(finalSort).limit(limit).skip(skip).populate(InstanceDto.populate.get()),
              Instance.countDocuments(query),
            ]);
            return { data: dataAdmin, total: totalAdmin, page, totalPages: Math.ceil(totalAdmin / limit) };
          default:
            const [dataUser, totalUser] = await Promise.all([
              Instance.find(query).sort(finalSort).limit(limit).skip(skip).populate(InstanceDto.populate.get()),
              Instance.countDocuments(query),
            ]);
            return { data: dataUser, total: totalUser, page, totalPages: Math.ceil(totalUser / limit) };
        }
    }
  },
  put: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Instance;
    return await Instance.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Instance;
    if (req.params.id) return await Instance.findByIdAndDelete(req.params.id);
    else return await Instance.deleteMany();
  },
};

export { InstanceService };
