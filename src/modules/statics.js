
import dotenv from 'dotenv';
import { baseStaticUri, newInstance } from "../api/util.js";
import express from 'express';
import fs from 'fs';

dotenv.config();

const dataStatics = [
    ['/assets/common', `./src/client/assets/common`],
    ['/assets/prism', `./src/client/assets/prism`],
    ['/assets/styles', `./underpost_modules/underpost-library/engine`],
    ['/.well-known', `./src/.well-known`],
    ['/fontawesome', `./node_modules/@fortawesome/fontawesome-free/css`],
    ['/webfonts', `./node_modules/@fortawesome/fontawesome-free/webfonts`],
    ['/tinymce', './node_modules/tinymce'],
    ['/simplemde', './node_modules/simplemde/dist'],
    ['/marked', './node_modules/marked'],
    ['/spectre-markdown.css', './node_modules/spectre-markdown.css'],
    ['/xml', `./underpost_modules/underpost-library/xml`]
];

const renderGlobalStatics = (app, BSU) => {
    dataStatics.map(itemStatic =>
        app.use(
            BSU + itemStatic[0],
            express.static(itemStatic[1])
        )
    );
};

const statics = (app, APPS) => {
    // APPS = newInstance(APPS);
    APPS.map((appData, i) => {
        const BSU = baseStaticUri(appData.viewMetaData);
        if (appData.statics)
            appData.statics(app);
        if (BSU != '')
            renderGlobalStatics(app, BSU);
        if (BSU == '' && i == 0)
            renderGlobalStatics(app, BSU);
    });
};

const renderStatics = (app, viewMetaData) => {

    const BSU = baseStaticUri(viewMetaData);
    if (viewMetaData.statics) viewMetaData.statics.map(itemStatic => {
        // console.log('-');
        // console.log(BSU + itemStatic[0]);
        // console.log(itemStatic[1]);
        app.use(BSU + itemStatic[0], express.static(itemStatic[1]))
    });

    if (BSU != '')
        app.get(`${BSU}/favicon.ico`, (req, res) =>
            res.sendFile(viewMetaData.themeIcons.path + '/favicon.ico'));

    if (process.argv[2] == 'build' && viewMetaData.favicon.ico)
        fs.copyFileSync(viewMetaData.favicon.ico, `./builds/${viewMetaData.clientID}/favicon.ico`);

};

export {
    statics,
    renderGlobalStatics,
    renderStatics,
    dataStatics
}