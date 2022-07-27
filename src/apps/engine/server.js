'use strict';

// nodejs
import express from 'express';

// server modules
import { morganMiddleware } from '../../modules/morgan.js';
import { logger } from '../../modules/logger.js';

// buil dev env
import { buildDev } from './build-dev.js';
// api
import { apiUtil } from '../../api/util.js';
// server side client render
import { ssr } from '../../client/ssr.js';
// views
import { viewMetaData, viewPaths } from '../../client/engine/server-render.js';

import dotenv from 'dotenv';

const app = express();
buildDev(app);

dotenv.config();

app.use(express.json({ limit: '20MB' }));
app.use(morganMiddleware);

// apiUtil(app);
ssr(app, { viewMetaData, viewPaths });

app.listen(process.env.PORT, () => {
    logger.info(`Server is running on port ${process.env.PORT}`);
});
