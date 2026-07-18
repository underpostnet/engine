import { controllerHandler, sendSuccess, serviceHandler, setCrossOriginHeaders } from '../../server/middlewares.js';
import { FileService } from './file.service.js';

class FileController {
  static post = serviceHandler(FileService.post);
  static get = controllerHandler(async (req, res, options) => {
    setCrossOriginHeaders(req, res);
    const result = await FileService.get(req, res, options);
    if (result instanceof Buffer) return res.status(200).end(result);
    return sendSuccess(res, result);
  });
  static delete = serviceHandler(FileService.delete);
}

export { FileController };
