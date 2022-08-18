'use strict';

import express from 'express';
import { logger } from './modules/logger.js';
import dotenv from 'dotenv';
import { middlewares } from './modules/middlewares.js';

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

const app = express();

dotenv.config();

middlewares(app, [
    underpost,
    cryptokoyn,
    nexodev,
    dogmadual
]);

apiKeys(app);
apiAuth(app);
apiUploader(app);

ssr(app, [engine, authClient]);
ssr(app, [underpost]);
ssr(app, [authClient]);
ssr(app, [cryptokoyn]);
ssr(app, [nexodev, engine, authClient]);
ssr(app, [dogmadual]);

app.listen(process.env.PORT, () => {
    logger.info(`Server is running on port ${process.env.PORT}`);
});
