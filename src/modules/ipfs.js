import { create } from 'ipfs-http-client';
import { logger } from '../modules/logger.js';

const ipfsMod = create();

const ipfsAdd = async file => {
    let ipfsObj;
    try {
        ipfsObj = await ipfsMod.add(file);
        console.log('ipfsObj', ipfsObj);
    } catch (error) {
        logger.error('ipfs not running');
        logger.error(error);
        ipfsObj = {
            path: ''
        };
    }
    return ipfsObj;
}

export {
    ipfsMod,
    ipfsAdd
}