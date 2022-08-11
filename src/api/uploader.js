

import fs from 'fs';
import { authValidator } from './auth.js';
import express from 'express';

const uriUploader = 'uploader';

const filesPathData = './data/uploads/files.json';

const srcFolders = ['./data/uploads/editor', './data/uploads/markdown', './data/uploads/js-demo'];
const components = ['editor', 'markdown', 'js_demo'];

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

        let fileObj = {};

        if (req.files) {

            const files = getFiles();
            const indexUserFile = findIndexUsernameFile(req);
            const typeFile = srcFolders[parseInt(req.body.indexFolder)].split('/').pop();

            // TODO: add extension validator folder index

            console.log('typeFile', typeFile);

            Object.keys(req.files).map(keyFile => {

                let staticPath = '/' + typeFile + '/' + req.files[keyFile].name;
                if (req.body.update) {
                    const dataUpdate = JSON.parse(req.body.update);
                    fs.unlinkSync(`./data/uploads${dataUpdate.static}`);
                    staticPath = dataUpdate.static;
                }
                fs.writeFileSync(`./data/uploads${staticPath}`, req.files[keyFile].data, 'utf8');


                fileObj = {
                    static: staticPath,
                    title: req.body.title,
                    date: new Date().toISOString(),
                    component: components[parseInt(req.body.indexFolder)]
                };

                if (indexUserFile >= 0) {
                    if (req.body.update) {
                        let indObjFile = 0;
                        for (let objFile of files[indexUserFile][typeFile]) {
                            if (objFile.static == staticPath) {
                                files[indexUserFile][typeFile][indObjFile] = fileObj;
                                break;
                            }
                            indObjFile++;
                        }
                    } else {
                        files[indexUserFile][typeFile].push(fileObj)
                    };
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
            data: fileObj
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

const getContents = (req, res) => {
    try {
        return res.status(200).json({
            status: 'success',
            data: getFiles().filter(file => file.username == req.user.username)
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }
};

const apiUploader = app => {
    srcFolders.map(srcFolder => !fs.existsSync(srcFolder) ?
        fs.mkdirSync(srcFolder, { recursive: true }) : null);

    if (!fs.existsSync(filesPathData))
        fs.writeFileSync(filesPathData, '[]', 'utf8');

    app.post(`/api/${uriUploader}`, authValidator, onUploadFile);
    app.get(`/api/${uriUploader}`, authValidator, getContents);

    app.use('/uploads/js-demo', express.static(`./data/uploads/js-demo`));
    app.use('/uploads/editor', express.static(`./data/uploads/editor`));
    app.use('/uploads/markdown', express.static(`./data/uploads/markdown`));


    // app.get(`/api/${uriKeys}`, getKeys);

}

export {
    uriUploader,
    apiUploader
};