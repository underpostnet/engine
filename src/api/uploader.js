

import fs from 'fs';

const uriUploader = 'uploader';

const srcFolders = ['./data/uploads'];

const onUploadFile = (req, res) => {

    console.log("onUploadFile files:", req.files);
    console.log("onUploadFile file:", req.file);
    console.log("onUploadFile body:", req.body);


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

    return res.status(200).json({
        status: 'success',
        data: 'ok'
    });

};

const apiUploader = app => {
    srcFolders.map(srcFolder => !fs.existsSync(srcFolder) ?
        fs.mkdirSync(srcFolder, { recursive: true }) : null);

    app.post(`/api/${uriUploader}`, onUploadFile);
    // app.get(`/api/${uriKeys}`, getKeys);

}

export {
    uriUploader,
    apiUploader
};