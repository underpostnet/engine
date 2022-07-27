'use strict';

// import shell from 'shelljs';
import fs from 'fs';

const buildDev = (app) => {
    if (!fs.existsSync(`.env`)) fs.writeFileSync(`.env`, `PORT=5500
NODE_ENV=development`, 'utf8');

    // logger.info(process.env);

    // app.use((req, res, next) => {
    //     console.log('Middleware:', Date.now());
    //     next();
    // });

};

export { buildDev };