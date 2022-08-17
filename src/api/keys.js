'use strict';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import SHA256 from 'crypto-js/sha256.js';
import colors from 'colors';
import { getAllFiles } from '../modules/files.js';
import { logger } from '../modules/logger.js';
import { BlockChain } from '../../underpost_modules/underpost.net/underpost-modules-v1/koyn/class/blockChain.js';
import { getHash, buildBaseApiUri } from './util.js';
import dotenv from 'dotenv';
import { authValidator } from './auth.js';

dotenv.config();

const uriKeys = 'keys';

const keyType = 'rsa';

const keyConfig = passphrase => {
    return {
        modulusLength: 4096,
        namedCurve: 'secp256k1',
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            cipher: 'aes-256-cbc',
            passphrase
        }
    };
};

const baseDataFolder = './data/cryptokoyn';
const keyFolder = baseDataFolder + '/keys/' + keyType + '-' + SHA256(JSON.stringify(keyConfig()));
const srcFolders = [
    keyFolder,
    baseDataFolder + '/network/blockchain',
    baseDataFolder + '/network/temp/test-key'
];

const blockChainConfig = JSON.parse(fs.readFileSync(
    `./underpost_modules/underpost-data-template/network/blockchain-config${process.env.NODE_ENV == 'development' ? '.dev' : ''}.json`,
    'utf8'
));

const instanceStaticChainObj = async () => {

    const chainObj = new BlockChain({
        generation: blockChainConfig.constructor.generation,
        userConfig: {
            blocksToUndermine: 1,
            propagateBlock: true,
            bridgeUrl: blockChainConfig.constructor.userConfig.bridgeUrl,
            intervalBridgeMonitoring: 1000,
            zerosConstDifficulty: null,
            rewardAddress: '',
            blockChainDataPath: baseDataFolder + '/network/blockchain',
            // blockChainDataPath: '../data/network/blockchain',
            // blockChainDataPath: null,
            maxErrorAttempts: 5,
            RESTdelay: 1000,
            charset: 'utf-8',
            limitMbBlock: blockChainConfig.constructor.limitMbBlock,
            blockchain: blockChainConfig,
            dataDir: './',
            dataFolder: baseDataFolder + '/network',
            dev: blockChainConfig.constructor.dev
        },
        validatorMode: true
    });

    // UPDATE CHAIN WITH BRIDGE
    await chainObj.setCurrentChain();
    const chain = chainObj.chain;
    const validateChain = await chainObj.globalValidateChain(chain);

    return { chainObj, chain, validateChain };
};


const encryptStringWithRsaPrivateKey = (toEncrypt, relativeOrAbsolutePathToPrivateKey, passphrase) => {
    const absolutePath = path.resolve(relativeOrAbsolutePathToPrivateKey);
    const privateKey = fs.readFileSync(absolutePath, 'utf8');
    const buffer = Buffer.from(toEncrypt);
    const encrypted = crypto.privateEncrypt({
        key: privateKey.toString(),
        passphrase: passphrase,
    }, buffer);
    return encrypted.toString('base64');
};

const decryptStringWithRsaPublicKey = (toDecrypt, relativeOrAbsolutePathtoPublicKey) => {
    const absolutePath = path.resolve(relativeOrAbsolutePathtoPublicKey);
    const publicKey = fs.readFileSync(absolutePath, 'utf8');
    const buffer = Buffer.from(toDecrypt, 'base64');
    const decrypted = crypto.publicDecrypt(publicKey, buffer);
    return decrypted.toString('utf8');
};

const getBase64AsymmetricPublicKeySignFromJSON = (data) => {
    return Buffer.from(JSON.stringify(data)).toString('base64');
};

const getJSONAsymmetricPublicKeySignFromBase64 = (data) => {
    return JSON.parse(Buffer.from(data, 'base64').toString());
};

const generateSignData = (req, dataTransaction) => {

    const publicDirPem = `${keyFolder}/${req.body.hashId}/public.pem`;
    const privateDirPem = `${keyFolder}/${req.body.hashId}/private.pem`;

    const publicKey = fs.readFileSync(publicDirPem);
    const privateKey = fs.readFileSync(privateDirPem);

    const publicBase64 = publicKey.toString('base64');

    let dataSign = {
        base64PublicKey: publicBase64,
        B64PUKSHA256: SHA256(publicBase64).toString(),
        timestamp: (+ new Date())
    };

    if (req.body.cyberiaAuthToken) dataSign = { AUTH_TOKEN: req.body.cyberiaAuthToken, ...dataSign };
    if (dataTransaction) dataSign = dataTransaction;

    return getBase64AsymmetricPublicKeySignFromJSON({
        data: dataSign,
        sign: encryptStringWithRsaPrivateKey(
            SHA256(
                JSON.stringify(dataSign)
            ).toString(),
            privateDirPem,
            req.body.passphrase
        )
    })

};

const createKey = (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {

        req.body.hashId = getHash();

        const { publicKey, privateKey } = crypto.generateKeyPairSync(keyType,
            keyConfig(req.body.passphrase));

        fs.mkdirSync(`${keyFolder}/${req.body.hashId}`);
        fs.writeFileSync(`${keyFolder}/${req.body.hashId}/public.pem`, publicKey, 'utf8');
        fs.writeFileSync(`${keyFolder}/${req.body.hashId}/private.pem`, privateKey, 'utf8');

        // https://restfulapi.net/http-status-codes/
        return res.status(200).json({
            status: 'success',
            data: [{ 'Hash ID': req.body.hashId }]
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }

};

const getKeys = (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        if (process.env.NODE_ENV != 'development') {
            return res.status(200).json({
                status: 'success',
                data: []
            })
        }

        return res.status(200).json({
            status: 'success',
            data: getAllFiles(keyFolder).map(key => {
                return {
                    'Hash ID': key.split('\\')[4]
                }
            }).filter((v, i) => i % 2 == 0)
        })
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }

};

const getKey = (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {



        logger.info(req.params);
        /*
        const result = getAllFiles(keyFolder).map(key => {
            return {
                'Hash ID': key.split('\\')[3]
            }
        })
            .filter((v, i) => i % 2 == 0)
            .find(v => v['Hash ID'] == req.params.hashId);
        */

        const result = fs.existsSync(keyFolder + '/' + req.params.hashId);

        if (result) {
            return res.status(200).json({
                status: 'success',
                data: [{ 'Hash ID': req.params.hashId }]
            });
        }
        return res.status(400).json({
            status: 'error',
            data: 'hashId does not exist'
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }

};

const postCopyCyberia = (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {

        logger.info(req.body);
        /* validateDataTempKeyAsymmetricSign */
        return res.status(200).json({
            status: 'success',
            data: generateSignData(req)
        });
    } catch (error) {
        logger.error(error);
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }
};

const postEmitLinkItemCyberia = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {

        const signCyberiaKey = await axios.get(
            blockChainConfig.constructor.userConfig.bridgeUrl + '/cyberia-well-key'
        );

        const sender = getJSONAsymmetricPublicKeySignFromBase64(
            generateSignData(req)
        );
        const receiver = signCyberiaKey.data;

        logger.info('sender ->');
        logger.info(sender);
        logger.info('receiver ->');
        logger.info(receiver);

        const { chainObj, chain, validateChain } = await instanceStaticChainObj();

        logger.info(req.body);
        logger.info(validateChain);

        if (validateChain.global == true) {

            const tempDataTransactions = await axios.get(
                blockChainConfig.constructor.userConfig.bridgeUrl +
                '/transactions/' + blockChainConfig.constructor.generation);

            const objAmount = await chainObj.currentAmountCalculator(
                sender.data.base64PublicKey,
                false,
                tempDataTransactions.data.pool
            );

            console.log(
                colors.cyan(' > current total amount sender: ' + objAmount.amount)
            );


            if (req.body.amount > 0 && req.body.amount <= objAmount.amount) {

                console.log('generate transaction');

                const dataTransaction = {
                    sender: sender,
                    receiver: receiver,
                    amount: parseInt(req.body.amount),
                    subject: req.body.subject,
                    createdDate: (+ new Date())
                };

                console.log(' data transaction ->');
                console.log(dataTransaction);

                const endObjTransaction = getJSONAsymmetricPublicKeySignFromBase64(
                    generateSignData(req, dataTransaction)
                );

                logger.info(' endObjTransaction ->');
                logger.info(endObjTransaction);


                const endPointTransaction = blockChainConfig.constructor.userConfig.bridgeUrl + '/transactions/'
                    + blockChainConfig.constructor.generation + '/true';

                const postTransactionStatus =
                    await new Promise((resolve, reject) => axios.post(endPointTransaction, endObjTransaction)
                        .then(function (response) {
                            // console.log(endPointTransaction, response);
                            resolve(response);
                        })
                        .catch(function (error) {
                            // console.log(endPointTransaction, error);
                            reject(error);
                        }));

                // console.log('postTransactionStatus ->');
                // console.log(postTransactionStatus);
                if (postTransactionStatus.data == false) {
                    return res.status(400).json({
                        status: 'error',
                        data: 'invalid transaction status'
                    });
                }
                return res.status(200).json({
                    status: 'success',
                    data: postTransactionStatus.data
                });



            } else {
                return res.status(400).json({
                    status: 'error',
                    data: 'insufficient or invalid current amount: ' + objAmount.amount
                });
            }
        }
        return res.status(500).json({
            status: 'error',
            data: 'invalid blockchain config',
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }

};

const copyCliKey = (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    logger.info(req.body);

    const privateKey = fs.readFileSync(`${keyFolder}/${req.body.hashId}/private.pem`).toString('base64');
    const publicKey = fs.readFileSync(`${keyFolder}/${req.body.hashId}/public.pem`).toString('base64');
    try {
        generateSignData(req);
    } catch (error) {
        return res.status(400).json({
            status: 'error',
            data: 'invalid passphrase'
        });
    }
    try {
        return res.status(200).json({
            status: 'success',
            data: { privateKey, publicKey }
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            data: error.message,
        });
    }
};

const apiKeys = app => {
    srcFolders.map(srcFolder => !fs.existsSync(srcFolder) ?
        fs.mkdirSync(srcFolder, { recursive: true }) : null);

    app.post(`${buildBaseApiUri()}/api/${uriKeys}/create-key`, createKey);
    app.get(`${buildBaseApiUri()}/api/${uriKeys}`, authValidator, getKeys);
    app.get(`${buildBaseApiUri()}/api/${uriKeys}/:hashId`, getKey);
    app.post(`${buildBaseApiUri()}/api/${uriKeys}/copy-cyberia`, postCopyCyberia);
    app.post(`${buildBaseApiUri()}/api/${uriKeys}/transaction/cyberia-link-item`, postEmitLinkItemCyberia);
    app.post(`${buildBaseApiUri()}/api/${uriKeys}/copy-cli-key`, copyCliKey);

};

export {
    uriKeys,
    apiKeys,
    createKey,
    getKeys,
    postEmitLinkItemCyberia,
    instanceStaticChainObj
};