

import fs from 'fs';
import { authValidator } from './auth.js';

const uriUploader = 'uploader';

const filesPathData = './data/uploads/files.json';

const srcFolders = ['./data/uploads/editor', './data/uploads/markdown', './data/uploads/js-demo'];

const getFiles = () => JSON.parse(fs.readFileSync(filesPathData));

const writeFiles = files => fs.writeFileSync(filesPathData, JSON.stringify(files, null, 3), 'utf8');

const findIndexUsernameFile = (req) => {
    let indFile = 0;
    for (let userFile of getFiles()) {
        if (userFile.username == req.user.username)
            return indFile;
        indFile++;
    }
    return -1;
};

const onUploadFile = (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        console.log("onUploadFile files:", req.files);
        console.log("onUploadFile body:", req.body);

        if (req.files) {

            const files = getFiles();
            const indexUserFile = findIndexUsernameFile(req);
            const typeFile = srcFolders[parseInt(req.body.indexFolder)].split('/').pop();

            // TODO: add extension validator folder index

            console.log('typeFile', typeFile);

            Object.keys(req.files).map(keyFile => {
                fs.writeFileSync(srcFolders[parseInt(req.body.indexFolder)] + '/' + req.files[keyFile].name, req.files[keyFile].data, 'utf8');

                const fileObj = {
                    static: req.files[keyFile].name,
                    title: req.body.title,
                    date: new Date().toISOString()
                };

                if (indexUserFile >= 0) {
                    files[indexUserFile][typeFile].push(fileObj);
                } else {
                    let newFileObj = {
                        username: req.user.username,
                        'editor': [],
                        'markdown': [],
                        'js-demo': []
                    };
                    newFileObj[typeFile].push(fileObj);
                    files.push(newFileObj);
                }

            });

            writeFiles(files);

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

    if (!fs.existsSync(filesPathData))
        fs.writeFileSync(filesPathData, '[]', 'utf8');

    app.post(`/api/${uriUploader}`, authValidator, onUploadFile);
    // app.get(`/api/${uriKeys}`, getKeys);

}

export {
    uriUploader,
    apiUploader
};