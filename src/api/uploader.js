

import fs from 'fs';
import { authValidator, getUsers } from './auth.js';
import express from 'express';
import { logger } from '../modules/logger.js';
import { buildBaseApiUri } from './util.js';
import dotenv from 'dotenv';

dotenv.config();

const uriUploader = 'uploader';

const filesPathData = './data/uploads/files.json';

const srcFolders = ['./data/uploads/editor', './data/uploads/markdown', './data/uploads/js-demo'];

const attrFiles = srcFolders.map(x => x.split('/').pop());

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
                    component: components[parseInt(req.body.indexFolder)],
                    public: typeof req.body.public == 'string' ? JSON.parse(req.body.public) : req.body.public
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

const deleteContents = (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        logger.info('deleteContents');
        logger.info(req.body);

        const files = getFiles();
        const indexUserFile = findIndexUsernameFile(req);
        const typeFile = srcFolders[components.indexOf(req.body.component)].split('/').pop();

        if (indexUserFile < 0) {
            return res.status(400).json({
                status: 'error',
                data: 'invalid index user'
            });
        }

        fs.unlinkSync(`./data/uploads${req.body.static}`);

        let indObjFile = 0;
        for (let objFile of files[indexUserFile][typeFile]) {
            if (objFile.static == req.body.static) {
                files[indexUserFile][typeFile].splice(indObjFile, 1);
                break;
            }
            indObjFile++;
        }

        writeFiles(files);

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
};

const changeVisibility = (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        logger.info('changeVisibility');
        logger.info(req.body);

        const files = getFiles();
        const indexUserFile = findIndexUsernameFile(req);
        const typeFile = srcFolders[components.indexOf(req.body.component)].split('/').pop();

        if (indexUserFile < 0) {
            return res.status(400).json({
                status: 'error',
                data: 'invalid index user'
            });
        }

        let indObjFile = 0;
        for (let objFile of files[indexUserFile][typeFile]) {
            if (objFile.static == req.body.static) {
                files[indexUserFile][typeFile][indObjFile].public = typeof req.body.public == 'string' ?
                    JSON.parse(req.body.public) : req.body.public;

                writeFiles(files);

                return res.status(200).json({
                    status: 'success',
                    data: 'ok'
                });
            }
            indObjFile++;
        }

        return res.status(400).json({
            status: 'error',
            data: 'file not found'
        });


    } catch (error) {
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }
};

const getPublicContent = (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        console.log('getPublicContent', req.body);

        const validateUser = getUsers().filter(x => req.body.includes(x.username)).length >= 1;

        const result = getFiles().map(
            fileMetaObj => {
                if (validateUser) {
                    if (req.body.includes(fileMetaObj.username)) {
                        attrFiles.map(attrFile =>
                            fileMetaObj[attrFile] = fileMetaObj[attrFile].filter(x => x.public === true));
                        return fileMetaObj;
                    } else {
                        return null;
                    }
                } else {
                    attrFiles.map(attrFile =>
                        fileMetaObj[attrFile] = fileMetaObj[attrFile].filter(x => x.public === true));
                    return fileMetaObj;
                }

            }
        ).filter(x => x != null);

        return res.status(200).json({
            status: 'success',
            data: {
                validateUser,
                result
            }
        });
    } catch (error) {
        logger.error(error);
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

    app.post(`${buildBaseApiUri()}/api/${uriUploader}`, authValidator, onUploadFile);
    app.get(`${buildBaseApiUri()}/api/${uriUploader}`, authValidator, getContents);
    app.delete(`${buildBaseApiUri()}/api/${uriUploader}`, authValidator, deleteContents);
    app.put(`${buildBaseApiUri()}/api/${uriUploader}/visibility`, authValidator, changeVisibility);
    app.post(`${buildBaseApiUri()}/api/${uriUploader}/public`, getPublicContent);

    app.use(`${buildBaseApiUri()}/uploads/js-demo`, express.static(`./data/uploads/js-demo`));
    app.use(`${buildBaseApiUri()}/uploads/editor`, express.static(`./data/uploads/editor`));
    app.use(`${buildBaseApiUri()}/uploads/markdown`, express.static(`./data/uploads/markdown`));

}

export {
    uriUploader,
    apiUploader
};