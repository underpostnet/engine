import { controllerHandler, sendSuccess, serviceHandler } from '../../server/middlewares.js';
import { TestService } from './test.service.js';

class TestController {
  static post = serviceHandler(TestService.post);
  static get = controllerHandler(async (req, res, options) => {
    const result = await TestService.get(req, res, options);
    if (result) return sendSuccess(res, result);
    return res.status(400).json({ status: 'error' });
  });
  static delete = serviceHandler(TestService.delete);
}

export { TestController };
