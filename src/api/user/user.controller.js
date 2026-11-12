import { loggerFactory } from '../../server/ops/logger.js';
import { isApiAsset, sendApiAsset } from '../../server/domain/api-assets.js';
import { UserService } from './user.service.js';

const logger = loggerFactory(import.meta);

const handleRequest = (serviceMethod) => async (req, res, context) => {
  try {
    const result = await serviceMethod(req, res, context);
    if (res.headersSent) {
      return;
    }
    if (isApiAsset(result)) return sendApiAsset(req, res, result);
    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    if (error.expected) logger.warn(`${error.status ?? 400} ${error.message}`);
    else logger.error(error, error.stack);
    return res.status(error.status ?? 400).json({
      status: 'error',
      message: error.message,
    });
  }
};

class UserController {
  static post = handleRequest(UserService.post);
  static get = handleRequest(UserService.get);
  static delete = handleRequest(UserService.delete);
  static put = handleRequest(UserService.put);
}

export { UserController };
