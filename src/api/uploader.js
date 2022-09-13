

import fs from 'fs';
import { authValidator, getUsers } from './auth.js';
import express from 'express';
import { logger } from '../modules/logger.js';
import { buildBaseApiUri, isInvalidChar, newInstance } from './util.js';
import dotenv from 'dotenv';

dotenv.config();

const uriUploader = 'uploader';

const filesPathData = './data/uploads/files.json';

const srcFolders = ['./data/uploads/editor', './data/uploads/markdown', './data/uploads/js-demo'];

const attrFiles = srcFolders.map(x => x.split('/').pop());

const components = ['editor', 'markdown', 'js_demo'];

const getFiles = () => JSON.parse(fs.readFileSync(filesPathData));

const writeFiles = files => fs.writeFileSync(filesPathData, JSON.stringify(files, null, 3), 'utf8');

const mods = ['francisco-verdugo'];

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

            if (mods.includes(req.user.username) && req.body.update && JSON.parse(req.body.update).username) {
                let fixUpdate = JSON.parse(req.body.update);
                req.user.username = newInstance(fixUpdate.username);
                delete fixUpdate.username;
                req.body.update = JSON.stringify(fixUpdate);
            }

            const indexUserFile = findIndexUsernameFile(req);
            const typeFile = srcFolders[parseInt(req.body.indexFolder)].split('/').pop();

            // TODO: add extension validator folder index

            console.log('typeFile', typeFile);

            Object.keys(req.files).map(keyFile => {

                let successProcess = false;

                let staticPath = req.body.update ?
                    JSON.parse(req.body.update).static :
                    '/' + typeFile + '/' + req.files[keyFile].name;

                fileObj = {
                    static: staticPath,
                    title: req.body.title,
                    date: new Date().toISOString(),
                    component: components[parseInt(req.body.indexFolder)],
                    public: typeof req.body.public == 'string' ? JSON.parse(req.body.public) : req.body.public,
                    approved: false
                };

                if (indexUserFile >= 0) {
                    if (req.body.update) {
                        let indObjFile = 0;
                        for (let objFile of files[indexUserFile][typeFile]) {
                            if (objFile.static == staticPath) {
                                fileObj.approved = JSON.parse(req.body.update).approved;
                                files[indexUserFile][typeFile][indObjFile] = fileObj;
                                successProcess = true;
                                break;
                            }
                            indObjFile++;
                        }
                        if (successProcess) {
                            const dataUpdate = JSON.parse(req.body.update);
                            fs.unlinkSync(`./data/uploads${dataUpdate.static}`);
                            staticPath = dataUpdate.static;
                        }
                    } else {
                        files[indexUserFile][typeFile].push(fileObj);
                        successProcess = true;
                    };
                } else if (!req.body.update) {
                    let newFileObj = {
                        username: req.user.username,
                        'editor': [],
                        'markdown': [],
                        'js-demo': []
                    };
                    newFileObj[typeFile].push(fileObj);
                    files.push(newFileObj);
                    successProcess = true;
                }

                if (successProcess) {
                    fs.writeFileSync(`./data/uploads${staticPath}`, req.files[keyFile].data, 'utf8');
                } else {
                    throw { message: 'invalid user data' };
                }

            });

            writeFiles(files);

        }

        return res.status(200).json({
            status: 'success',
            data: fileObj
        });

    } catch (error) {
        console.log(error);
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
        let result = getFiles().filter(file => file.username == req.user.username);
        if (mods.includes(req.user.username) && result[0]) {
            attrFiles.map(attrFile => {
                let globalFilesAtrr = [];
                getFiles().map(objFileData => {
                    globalFilesAtrr = globalFilesAtrr.concat(
                        objFileData[attrFile]
                            .map(x => (x.username = objFileData.username, x))
                    );
                });
                result[0][`global-${attrFile}`] = globalFilesAtrr;
            });
        }
        return res.status(200).json({
            status: 'success',
            data: result
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

        if (mods.includes(req.user.username) && req.body.username)
            req.user.username = req.body.username;

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
                files[indexUserFile][typeFile].splice(indObjFile, 1);
                fs.unlinkSync(`./data/uploads${req.body.static}`);
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
            data: 'invalid request data'
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

        if (mods.includes(req.user.username) && req.body.username)
            req.user.username = req.body.username;

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
                files[indexUserFile][typeFile][indObjFile].approved = typeof req.body.approved == 'string' ?
                    JSON.parse(req.body.public) : req.body.approved;
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
                        fileMetaObj[attrFile] = fileMetaObj[attrFile].filter(x => x.public === true && x.approved === true));
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

const postPath = (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        console.log('postPath', req.body);

        const validateAddPath = req.body.path && req.body.newNamePath && req.body.data;


        if (validateAddPath && isInvalidChar(req.body.newNamePath))
            return res.status(400).json({
                status: 'error',
                data: 'invalid name path',
            });

        if (validateAddPath) {
            fs.mkdirSync('./data/uploads/cloud' + req.body.path, { recursive: true });
            fs.writeFileSync(
                `./data/uploads/cloud/${req.user.username}/data.json`,
                JSON.stringify(req.body.data, null, 4),
                'utf8');
        }

        return res.status(200).json({
            status: 'success',
            data: JSON.parse(fs.readFileSync(`./data/uploads/cloud/${req.user.username}/data.json`, 'utf8'))
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

    const attrValidators = [
        ['approved', false],
        ['public', false]
    ];

    writeFiles(getFiles().map(x => {
        attrFiles.map(attrFile => {
            x[attrFile] = x[attrFile].map(xObjFile => {
                attrValidators.map(attr => {
                    if (!xObjFile[attr[0]]) xObjFile[attr[0]] = attr[1];
                });
                return xObjFile;
            });
        });
        return x;
    }));

    app.post(`${buildBaseApiUri()}/api/${uriUploader}`, authValidator, onUploadFile);
    app.get(`${buildBaseApiUri()}/api/${uriUploader}`, authValidator, getContents);
    app.delete(`${buildBaseApiUri()}/api/${uriUploader}`, authValidator, deleteContents);
    app.put(`${buildBaseApiUri()}/api/${uriUploader}/visibility`, authValidator, changeVisibility);
    app.post(`${buildBaseApiUri()}/api/${uriUploader}/public`, getPublicContent);
    app.post(`${buildBaseApiUri()}/api/${uriUploader}/path`, authValidator, postPath);

    app.use(`${buildBaseApiUri()}/uploads/js-demo`, express.static(`./data/uploads/js-demo`));
    app.use(`${buildBaseApiUri()}/uploads/editor`, express.static(`./data/uploads/editor`));
    app.use(`${buildBaseApiUri()}/uploads/markdown`, express.static(`./data/uploads/markdown`));

}

export {
    uriUploader,
    apiUploader
};