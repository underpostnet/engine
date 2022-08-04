
import fs from 'fs';

const uriAuth = 'auth';

const srcFolders = ['./data/users'];

const register = (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        // email
        // pass

        console.log("register body:", req.body);


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

const apiAuth = app => {
    srcFolders.map(srcFolder => !fs.existsSync(srcFolder) ?
        fs.mkdirSync(srcFolder, { recursive: true }) : null);

    app.post(`/api/${uriAuth}`, register);
    // app.get(`/api/${uriKeys}`, getKeys);

}

export {
    uriAuth,
    apiAuth
};