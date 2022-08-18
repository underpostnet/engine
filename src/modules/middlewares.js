

import { buildURL, newInstance, range } from '../api/util.js';
import { morganMiddleware } from './morgan.js';
import fileUpload from 'express-fileupload';
import express from 'express';
import compression from 'compression';
import fs from 'fs';
import cors from 'cors';

const middlewares = (app, views) => {

    views = newInstance(views);

    const origin = views.map(viewObj => `https://${viewObj.viewMetaData.host}`)
        .concat(views.map(viewObj => `https://www.${viewObj.viewMetaData.host}`))
        .concat(buildURL());

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

    setTimeout(() => {
        // errors
        app.use((req, res, next) => {
            for (let num_error of range(400, 499)) {
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
    });

};

export { middlewares };