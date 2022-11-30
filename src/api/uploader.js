

import fs from 'fs';
import { authValidator, getUsers } from './auth.js';
import express from 'express';
import { logger } from '../modules/logger.js';
import { buildBaseApiUri, isInvalidChar, newInstance } from './util.js';
import dotenv from 'dotenv';
import { deleteFolderRecursive, getAllFiles } from '../modules/files.js';
import { fileTypeFromStream } from 'file-type';
import { ipfsAdd } from '../modules/ipfs.js';

dotenv.config();

const uriUploader = 'uploader';

const filesPathData = './data/uploads/files.json';

const srcFolders = ['./data/uploads/editor', './data/uploads/markdown', './data/uploads/js-demo'];

const attrFiles = srcFolders.map(x => x.split('/').pop());

const components = ['editor', 'markdown', 'js_demo'];

const getFiles = () => JSON.parse(fs.readFileSync(filesPathData));

const writeFiles = files => fs.writeFileSync(filesPathData, JSON.stringify(files, null, 3), 'utf8');

const mods = ['francisco-verdugo'];

const findIndexUsernameFile = (req) =>
    getFiles()
        .findIndex(fileObj => fileObj.username == req.user.username);

const allowMimes = [
    'audio/mp3',
    'audio/mpeg',
    'application/pdf',
    'image/png',
    'image/webp',
    'image/jpg',
    'image/jpeg'
];

const scanFile = filePath => false;
// new Promise(async resolve => {
//     try {
//         const extFileTest = await fileTypeFromStream(
//             fs.createReadStream(filePath)
//         );
//         console.log('scanFile', extFileTest);
//         //=> {ext: 'mp4', mime: 'video/mp4'}
//         if (allowMimes.includes(extFileTest.mime)) {
//             return resolve(false);
//         }
//         fs.unlinkSync(filePath);
//         return resolve(true);
//     } catch (error) {
//         logger.error(error);
//         if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
//         return resolve(false);
//     }
// });

const onUploadFile = async (req, res) => {
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

            for (let keyFile of Object.keys(req.files)) {

                let successProcess = false;

                let staticPath = req.body.update ?
                    JSON.parse(req.body.update).static :
                    '/' + typeFile + '/' + req.files[keyFile].name;

                const ipfsObj = await ipfsAdd(req.files[keyFile].data);

                fileObj = {
                    static: staticPath,
                    title: req.body.title,
                    date: new Date().toISOString(),
                    component: components[parseInt(req.body.indexFolder)],
                    public: typeof req.body.public == 'string' ? JSON.parse(req.body.public) : req.body.public,
                    approved: false,
                    ipfs: ipfsObj.path
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

                    // const isInfected = await scanFile(`./data/uploads${staticPath}`);
                    // console.log('isInfected', isInfected);
                    // if (isInfected) throw { message: 'Corrupt Extension File' };

                } else {
                    throw { message: 'invalid user data' };
                }

            };

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


        if (!fs.existsSync(`./data/uploads/cloud/${req.user.username}`))
            fs.mkdirSync(`./data/uploads/cloud/${req.user.username}`, { recursive: true });

        const validateAddPath = req.body.path && req.body.newNamePath && req.body.data;


        if (validateAddPath && isInvalidChar(req.body.newNamePath))
            return res.status(400).json({
                status: 'error',
                data: 'invalid name path',
            });

        if (validateAddPath)
            fs.mkdirSync('./data/uploads/cloud' + req.body.path, { recursive: true });



        if (!validateAddPath && req.body.data && req.body.deletePath)
            deleteFolderRecursive('./data/uploads/cloud' + req.body.deletePath);


        if (req.body.data)
            fs.writeFileSync(
                `./data/uploads/cloud/${req.user.username}/data.json`,
                JSON.stringify(req.body.data, null, 4),
                'utf8');


        if (!fs.existsSync(`./data/uploads/cloud/${req.user.username}/data.json`))
            fs.writeFileSync(`./data/uploads/cloud/${req.user.username}/data.json`, JSON.stringify([
                {
                    "name": "/" + req.user.username,
                    "data": []
                }
            ], null, 4), 'utf8');

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

const postGlobalFiles = async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        console.log('postGlobalFiles', req.body);

        if (!fs.existsSync(`./data/uploads/cloud/${req.user.username}`))
            fs.mkdirSync(`./data/uploads/cloud/${req.user.username}`, { recursive: true });

        if (req.body.deletePath && req.body.data && !req.body.path) {

            fs.unlinkSync('./data/uploads/cloud' + req.body.deletePath);

            fs.writeFileSync(
                `./data/uploads/cloud/${req.user.username}/data.json`,
                JSON.stringify(req.body.data, null, 4),
                'utf8');

            return res.status(200).json({
                status: 'success',
                data: 'ok'
            });
        }

        if (!req.body.path || !req.body.data)
            return res.status(400).json({
                status: 'error',
                data: 'invalid request data'
            });

        req.body.data = JSON.parse(req.body.data);

        for (let keyFile of Object.keys(req.files)) {
            // console.log(req.files[keyFile]);
            req.files[keyFile].mv(`./data/uploads/cloud${req.body.path}/${keyFile}`);

            const isInfected = await scanFile(`./data/uploads/cloud${req.body.path}/${keyFile}`);
            console.log('isInfected', isInfected);
            if (isInfected) throw { message: 'Corrupt Extension File' };
        }

        fs.writeFileSync(
            `./data/uploads/cloud/${req.user.username}/data.json`,
            JSON.stringify(req.body.data, null, 4),
            'utf8');

        return res.status(200).json({
            status: 'success',
            data: 'ok'
        });
    } catch (error) {
        if (error.message == 'Corrupt Extension File')
            return res.status(400).json({
                status: 'error',
                data: error.message
            });
        logger.error(error);
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }

};


const getFilesByFormat = (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        if (!fs.existsSync(`./data/uploads/cloud/${req.user.username}`))
            fs.mkdirSync(`./data/uploads/cloud/${req.user.username}`, { recursive: true });

        const result = getAllFiles(`./data/uploads/cloud/${req.user.username}${req.body.path ? req.body.path : ''}`);

        console.log('result', result);
        console.log('ext', req.params.ext);

        return res.status(200).json({
            status: 'success',
            data: result.filter(x => x.split('.').pop() == req.params.ext)
                .map(x => x.replace(/\\/g, '/')
                    .replace('data', ''))
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
        ['public', false],
        ['ipfs', '']
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
    app.post(`${buildBaseApiUri()}/api/${uriUploader}/files`, authValidator, postGlobalFiles);
    app.post(`${buildBaseApiUri()}/api/${uriUploader}/files/:ext`, authValidator, getFilesByFormat);

    app.use(`${buildBaseApiUri()}/uploads/js-demo`, express.static(`./data/uploads/js-demo`));
    app.use(`${buildBaseApiUri()}/uploads/editor`, express.static(`./data/uploads/editor`));
    app.use(`${buildBaseApiUri()}/uploads/markdown`, express.static(`./data/uploads/markdown`));
    app.use(`${buildBaseApiUri()}/uploads/cloud`, express.static(`./data/uploads/cloud`));

}

export {
    uriUploader,
    apiUploader
};