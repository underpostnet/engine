

import { buildURL, newInstance, range, uniqueArray } from '../api/util.js';
import { morganMiddleware } from './morgan.js';
import fileUpload from 'express-fileupload';
import express from 'express';
import compression from 'compression';
import fs from 'fs';
import cors from 'cors';
import { logger } from './logger.js';

const middlewares = (app, views) => {

    views = newInstance(views);

    const origin = uniqueArray(views.map(viewObj => viewObj.viewMetaData.clientID != 'dev' ?
        buildURL(viewObj.viewMetaData) : null)
        .filter(x => x != null)
        .concat(process.env.NODE_ENV == 'development' || process.env.NODE_ENV == 'test-dev' || process.env.NODE_ENV == 'ipfs-dev' || process.env.NODE_ENV == 'cyberia-dev' ?
            [`http://localhost:${process.env.BUILD_DEV_PORT}`, `http://localhost:3001`] :
            [`https://www.cyberiaonline.com`]
        )
    );

    logger.info('origin');
    console.log(origin);

    app.use(cors({ origin }));

    // parse requests of content-type - application/json
    app.use(express.json({ limit: '20MB' }));

    // parse requests of content-type - application/x-www-form-urlencoded
    app.use(express.urlencoded({ extended: true, limit: '20MB' }));
    app.use(fileUpload());

    // log events
    app.use(morganMiddleware);

    // js compression
    function shouldCompress(req, res) {
        if (req.headers['x-no-compression']) {
            // don't compress responses with this request header
            return false
        }
        // fallback to standard filter function
        return compression.filter(req, res)
    };
    app.use(compression({ filter: shouldCompress }));

    return { origin };

};

const errors = (app) => {
    app.use((req, res, next) => {
        for (let num_error of range(400, 499)) {
            // console.log(req.protocol + '://' + req.get('host') + req.originalUrl);
            num_error == 400 ? num_error = 404 : null;
            return res.status(num_error).end(fs.readFileSync('./src/client/assets/404/neon'));
        }
        return next();
    });

    app.use((req, res, next) => {
        for (let num_error of range(500, 599)) {
            return res.status(num_error).end('Error: ' + num_error);
        }
        return next();
    });
};

export { middlewares, errors };