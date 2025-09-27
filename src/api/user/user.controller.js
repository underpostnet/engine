import { loggerFactory } from '../../server/logger.js';
import { UserService } from './user.service.js';

const logger = loggerFactory(import.meta);

const handleRequest = (serviceMethod) => async (req, res, options) => {
  try {
    const result = await serviceMethod(req, res, options);
    if (res.headersSent) {
      return;
    }
    if (result instanceof Buffer) {
      return res.status(200).end(result);
    }
    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    logger.error(error, error.stack);
    return res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

const UserController = {
  post: handleRequest(UserService.post),
  get: handleRequest(UserService.get),
  delete: handleRequest(UserService.delete),
  put: handleRequest(UserService.put),
};

export { UserController };
