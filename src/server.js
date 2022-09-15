'use strict';

import express from 'express';
import { logger } from './modules/logger.js';
import dotenv from 'dotenv';
import { errors, middlewares } from './modules/middlewares.js';

// api
import { apiKeys } from './api/keys.js';
import { apiUploader } from './api/uploader.js';
import { apiAuth } from './api/auth.js';
import { generateZipFromFolder } from './modules/zip.js';

// ssr
import { ssr } from './modules/ssr.js';

// complements modules
import { engine } from './client/modules/engine.js';
import { authClient } from './client/modules/auth.js';
import { media } from './client/modules/media.js';
import { statics } from './modules/statics.js';

// main modules
import { dev } from './client/modules/dev.js';
import { underpost } from './client/modules/underpost.js';
import { cryptokoyn } from './client/modules/cryptokoyn.js';
import { nexodev } from './client/modules/nexodev.js';
import { dogmadual } from './client/modules/dogmadual.js';
import { femmenutrition } from './client/modules/femmenutrition.js';



logger.info(process.argv);

const app = express();

dotenv.config();

const APPS = [
    dev,
    underpost,
    cryptokoyn,
    nexodev,
    dogmadual,
    femmenutrition
];

middlewares(app, APPS);

apiKeys(app);
apiAuth(app);
apiUploader(app);

(async () => {
    if (process.env.NODE_ENV == 'development')
        await ssr(app, APPS);

    await ssr(app, [underpost, authClient, media, engine]);
    await ssr(app, [cryptokoyn]);
    await ssr(app, [dogmadual]);
    await ssr(app, [nexodev, authClient, engine]);
    await ssr(app, [femmenutrition]);

    statics(app, APPS);
    statics(app, [media]);

    if (process.argv[2] != 'build')
        app.listen(process.env.PORT, () => {
            logger.info(`Server is running on port ${process.env.PORT}`);
        });
    else APPS.map(dataRender =>
        dataRender.viewMetaData.generateZipBuild
            && (!process.argv[3] || process.argv[3] == dataRender.viewMetaData.clientID) ?
            (console.log('generate build zip -> ' + dataRender.viewMetaData.clientID), generateZipFromFolder({
                pathFolderToZip: `./builds/${dataRender.viewMetaData.clientID}`,
                writeZipPath: `./builds/${dataRender.viewMetaData.clientID}.zip`
            })) : '');

    if (process.env.NODE_ENV != 'development') {
        console.log = () => null;
        console.warn = () => null;
        console.error = () => null;
    } else
        app.get('/', (req, res) => res.redirect('/dev'));

    errors(app);

})();
