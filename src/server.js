'use strict';

import express from 'express';
import { logger } from './modules/logger.js';
import dotenv from 'dotenv';
import { errors, middlewares } from './modules/middlewares.js';

// api
import { apiKeys } from './api/keys.js';
import { apiUploader } from './api/uploader.js';
import { apiAuth } from './api/auth.js';

// ssr
import { ssr } from './modules/ssr.js';

// views modules
import { engine } from './client/modules/engine.js';
import { underpost } from './client/modules/underpost.js';
import { cryptokoyn } from './client/modules/cryptokoyn.js';
import { authClient } from './client/modules/auth.js';
import { nexodev } from './client/modules/nexodev.js';
import { dogmadual } from './client/modules/dogmadual.js';
import { statics } from './modules/statics.js';

logger.info(process.argv);

const app = express();

dotenv.config();

const APPS = [
    underpost,
    cryptokoyn,
    nexodev,
    dogmadual
];

middlewares(app, APPS);

apiKeys(app);
apiAuth(app);
apiUploader(app);

(async () => {
  
    await ssr(app, [underpost]);
    await ssr(app, [cryptokoyn]);
    await ssr(app, [dogmadual]);
    await ssr(app, [nexodev, authClient, engine]);

    statics(app, APPS);
    errors(app);

    if (process.argv[2] != 'build')
        app.listen(process.env.PORT, () => {
            logger.info(`Server is running on port ${process.env.PORT}`);
        });
    if (process.env.NODE_ENV != 'development') {
        console.log = () => null;
        console.warn = () => null;
        console.error = () => null;
    }
})();
