
import fs from 'fs';
import { emailValidator, passwordValidator, renderLang, buildBaseApiUri } from './util.js';
import { logger } from '../modules/logger.js';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

const saltRounds = 10;

const uriAuth = 'auth';

const srcFolders = ['./data/users'];

const usersDataPath = srcFolders[0] + '/users.json';

const banUserNames = ['boards', 'login', 'register', 'markdown', 'js-editor', 'editor', 'admin', 'mod'];

const getUsers = () => JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));

const writeUsers = users => fs.writeFileSync(usersDataPath, JSON.stringify(users, null, 4), 'utf8');

const register = async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');

        logger.info("register body:");
        logger.info(req.body);

        if (req.body.email) req.body.email = req.body.email.toLowerCase();

        const testEmail = emailValidator(req.body.email, req);
        if (!testEmail.validate)
            return res.status(400).json({
                status: 'error',
                data: testEmail.msg
            });

        const testPass = passwordValidator(req.body.pass, req);
        if (!testPass.validate)
            return res.status(400).json({
                status: 'error',
                data: testPass.msg
            });

        const users = getUsers();

        if (users.find(x => x.email == req.body.email))
            return res.status(400).json({
                status: 'error',
                data: renderLang({ en: 'existing email', es: 'email ya existente' }, req)
            });

        if (banUserNames.includes(req.body.username.toLowerCase()))
            return res.status(400).json({
                status: 'error',
                data: renderLang({ en: 'invalid username', es: 'nombre de usuario no valido' }, req)
            });

        req.body.username = req.body.username.toLowerCase();
        if (users.find(x => x.username == req.body.username))
            return res.status(400).json({
                status: 'error',
                data: renderLang({ en: 'existing username', es: 'usuario ya existente' }, req)
            });

        req.body.pass = await new Promise((resolve, reject) => {
            try {
                bcrypt.genSalt(saltRounds, (err, salt) => {
                    bcrypt.hash(req.body.pass, salt, (err, hash) => {
                        // Store hash in your password DB.
                        resolve(hash);
                    });
                });
            } catch (error) {
                logger.error(error);
                reject(false);
            }
        });

        if (req.body.pass === false) {
            return res.status(500).json({
                status: 'error',
                data: 'fail generate hash passs',
            });
        }

        users.push({
            pass: req.body.pass,
            email: req.body.email,
            username: req.body.username
        });

        writeUsers(users);

        return res.status(200).json({
            status: 'success',
            data: 'ok'
        });

    } catch (error) {
        logger.error(error);
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

const login = async (req, res) => {

    logger.info('login:');
    logger.info(req.body);

    try {
        req.body.email = `${req.body.email}`;
        const user = getUsers().find(userData => userData.email == req.body.email.toLowerCase());

        // To check a password:
        // Load hash from your password DB.

        const validateLogIng = await new Promise((resolve, reject) => {
            try {
                bcrypt.compare(`${req.body.pass}`, user.pass, function (err, result) {
                    resolve(result);
                });
            } catch (error) {
                // reject(false);
                resolve(false);
            }
        });

        if (validateLogIng === true) {

            const token = jwt.sign(
                {
                    data: user
                },
                process.env.SECRET,
                { expiresIn: `${process.env.EXPIRE}h` }
            );

            return res.status(200).json({
                status: 'success',
                data: {
                    token, user: {
                        email: user.email,
                        username: user.username
                    },
                    expiresIn: (+ new Date()) + parseInt(process.env.EXPIRE) * (60 * 60 * 1000)
                }
            });
        }
        return res.status(400).json({
            status: 'error',
            data: renderLang({ es: 'Email o Contraseñas invalidos', en: 'Invalid Email or passphrase' }, req)
        });
    } catch (error) {
        logger.error(error);
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }

};

const authValidator = (req, res, next) => {
    try {
        logger.info('authValidator');
        logger.info(req.headers);
        const authHeader = String(req.headers['authorization'] || req.headers['Authorization'] || '');
        if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7, authHeader.length);
            console.log(token);
            const response = jwt.verify(token, process.env.SECRET);
            logger.info('authValidator');
            logger.info(response);
            if (typeof response == 'object') {
                if ((response.exp * 1000) <= (+ new Date()))
                    return res.status(401).json({
                        status: 'error',
                        data: 'expire unauthorized'
                    });

                const getUser = getUsers().find(userData =>
                    userData.email == response.data.email && userData.pass == response.data.pass);
                if (getUser) {
                    req.user = getUser;
                    return next();
                }

            }
        }
        return res.status(401).json({
            status: 'error',
            data: 'unauthorized'
        });
    } catch (error) {
        logger.error('authValidator');
        logger.error(error);
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }
}


const getSessionStatus = (req, res) => {
    return res.status(200).json({
        status: 'success',
        data: 'ok'
    });
};

const apiAuth = app => {
    srcFolders.map(srcFolder => !fs.existsSync(srcFolder) ?
        fs.mkdirSync(srcFolder, { recursive: true }) : null);

    if (!fs.existsSync(usersDataPath))
        fs.writeFileSync(usersDataPath, '[]', 'utf8');

    app.post(`${buildBaseApiUri()}/api/${uriAuth}/register`, register);
    app.post(`${buildBaseApiUri()}/api/${uriAuth}/login`, login);
    app.get(`${buildBaseApiUri()}/api/${uriAuth}/session`, authValidator, getSessionStatus);
    // app.get(`/api/${uriKeys}`, getKeys);

};



export {
    uriAuth,
    apiAuth,
    authValidator,
    getUsers,
    writeUsers
};