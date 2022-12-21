'use strict';

import express from 'express';
import { logger } from './modules/logger.js';
import dotenv from 'dotenv';
import { errors, middlewares } from './modules/middlewares.js';

// server
import { ssr } from './modules/ssr.js';
import { statics } from './modules/statics.js';
import { ioModule } from './modules/socket.io.js';
import { peerServer } from './modules/peer.js';

// api
import { apiKeys } from './api/keys.js';
import { apiUploader } from './api/uploader.js';
import { apiAuth } from './api/auth.js';
import { apiUtil, loadModule } from './api/util.js';

// client complements
import { engine } from './client/modules/engine.js';
import { authClient } from './client/modules/auth.js';
import { media } from './client/modules/media.js';

// client
import { dev } from './client/modules/dev.js';
import { underpost } from './client/modules/underpost.js';
import { cryptokoyn } from './client/modules/cryptokoyn.js';
import { nexodev } from './client/modules/nexodev.js';
import { dogmadual } from './client/modules/dogmadual.js';
import { femmenutrition } from './client/modules/femmenutrition.js';
import { cyberiaonline } from './client/modules/cyberiaonline.js';

dotenv.config();
logger.info(process.argv);
logger.info(`version ${process.env.npm_package_version}`);
const app = express();

const APPS = [
    dev,
    underpost,
    cryptokoyn,
    nexodev,
    dogmadual,
    femmenutrition,
    cyberiaonline
];

const { origin } = middlewares(app, APPS);

apiUtil(app);
apiKeys(app);
apiAuth(app);
apiUploader(app);

(async () => {

    await ssr(app, [underpost, authClient, engine]);
    await ssr(app, [cyberiaonline, authClient, media]);
    await ssr(app, [cryptokoyn]);
    await ssr(app, [dogmadual]);
    await ssr(app, [nexodev, authClient, engine]);
    await ssr(app, [femmenutrition]);

    statics(app, APPS);
    statics(app, [media]);

    if (process.argv[2] != 'build') {
        const { httpServer, io } = ioModule(app, { origin });
        httpServer.listen(process.env.PORT, async () => {
            logger.info(`Http Server is running on port ${process.env.PORT}`);
            peerServer();
            if (process.env.NODE_ENV == 'ipfs-dev') {
                const { ipfsDaemon } = await loadModule('../modules/ipfs.js');
                ipfsDaemon();
            }
        });
    }

    else {
        const { generateZipFromFolder } = await loadModule('../modules/zip.js');
        APPS.map(dataRender =>
            dataRender.viewMetaData.generateZipBuild
                && (!process.argv[3] || process.argv[3] == dataRender.viewMetaData.clientID) ?
                (console.log('generate build zip -> ' + dataRender.viewMetaData.clientID), generateZipFromFolder({
                    pathFolderToZip: `./builds/${dataRender.viewMetaData.clientID}`,
                    writeZipPath: `./builds/${dataRender.viewMetaData.clientID}.zip`
                })) : '');
    }


    if (process.env.NODE_ENV != 'development' && process.env.NODE_ENV != 'test-dev' && process.env.NODE_ENV != 'ipfs-dev') {
        console.log = () => null;
        console.warn = () => null;
        console.error = () => null;
    } else {
        const { swaggerMod } = await loadModule('../modules/swagger.js');
        await ssr(app, APPS);
        app.get('/', (req, res) => res.redirect('/dev'));
        swaggerMod(app);
    }

    errors(app);

})();


export { app };
