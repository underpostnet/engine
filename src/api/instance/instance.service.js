import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
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
        const { page = 1, limit = 10, sort = { updatedAt: -1 } } = req.query;
        const skip = (page - 1) * limit;

        switch (user.role) {
          case 'admin':
            if (req.params.id) return await Instance.findById(req.params.id);
            const [dataAdmin, totalAdmin] = await Promise.all([
              Instance.find({}).sort(sort).limit(limit).skip(skip).populate(InstanceDto.populate.get()),
              Instance.countDocuments({}),
            ]);
            return { data: dataAdmin, total: totalAdmin, page, totalPages: Math.ceil(totalAdmin / limit) };
          default:
            const [dataUser, totalUser] = await Promise.all([
              Instance.find({ userId: req.auth.user._id })
                .sort(sort)
                .limit(limit)
                .skip(skip)
                .populate(InstanceDto.populate.get()),
              Instance.countDocuments({ userId: req.auth.user._id }),
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
