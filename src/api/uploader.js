

import fs from 'fs';
import { authValidator } from './auth.js';

const uriUploader = 'uploader';

const srcFolders = ['./data/uploads/editor', './data/uploads/markdown'];

const onUploadFile = (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        console.log("onUploadFile files:", req.files);
        console.log("onUploadFile body:", req.body);

        if (req.files) {
            Object.keys(req.files).map(keyFile => {
                fs.writeFileSync(srcFolders[parseInt(req.body.indexFolder)] + '/' + req.files[keyFile].name, req.files[keyFile].data, 'utf8');
            });
        }

        return res.status(200).json({
            status: 'success',
            data: 'ok'
        });

    } catch (error) {
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }

    // return res.status(400).json({
    //     status: 'error',
    //     data: 'invalid passphrase'
    // });
    // return res.status(200).json({
    //     status: 'success',
    //     data: { privateKey, publicKey }
    // });
    // return res.status(500).json({
    //     status: 'error',
    //     data: error.message,
    // });

};

const apiUploader = app => {
    srcFolders.map(srcFolder => !fs.existsSync(srcFolder) ?
        fs.mkdirSync(srcFolder, { recursive: true }) : null);

    app.post(`/api/${uriUploader}`, authValidator, onUploadFile);
    // app.get(`/api/${uriKeys}`, getKeys);

}

export {
    uriUploader,
    apiUploader
};