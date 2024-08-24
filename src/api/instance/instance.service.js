import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { InstanceDto } from './instance.model.js';

const logger = loggerFactory(import.meta);

const InstanceService = {
  post: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Instance;
    return await new Instance(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Instance;

    /** @type {import('../user/user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    const user = await User.findOne({
      _id: req.auth.user._id,
    });
    switch (req.params.id) {
      default:
        switch (user.role) {
          case 'admin':
            if (req.params.id) return await Instance.findById(req.params.id);
            return await Instance.find().populate(InstanceDto.populate.get());

          default:
            return await Instance.find({ userId: req.auth.user._id }).populate(InstanceDto.populate.get());
        }
    }
  },
  put: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Instance;
    return await Instance.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.Instance;
    if (req.params.id) return await Instance.findByIdAndDelete(req.params.id);
    else return await await Instance.deleteMany();
  },
};

export { InstanceService };
