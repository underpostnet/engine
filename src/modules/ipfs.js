
import { logger } from './logger.js';
import * as Ctl from 'ipfsd-ctl'; // require equivalent
import * as ipfsModule from 'ipfs';
import * as ipfsHttpModule from 'ipfs-http-client';
import * as goIpfsModule from 'go-ipfs';

const ipfsMod = ipfsHttpModule.create();

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
};

const ipfsDaemon = async (app, options) => {
    // Create a factory to spawn two test disposable controllers, get access to an IPFS api
    // print node ids and clean all the controllers from the factory.}

    // https://github.com/ipfs/js-ipfsd-ctl#controlleroptions
    const factory = Ctl.createFactory(
        {
            type: 'js',
            test: true,
            disposable: true,
            ipfsHttpModule,
            endpoint: 'http://localhost:5001',
            ipfsModule: (await import('ipfs')) // only if you gonna spawn 'proc' controllers
        },
        { // overrides per type
            js: {
                ipfsBin: ipfsModule.path()
            },
            go: {
                ipfsBin: goIpfsModule.path()
            }
        }
    )
    // const ipfsd1 = await factory.spawn() // Spawns using options from `createFactory`
    const ipfsd2 = await factory.spawn({ type: 'go' }) // Spawns using options from `createFactory` but overrides `type` to spawn a `go` controller
    // const ipfsd3 = await factory.spawn({ type: 'proc' })

    // console.log(await ipfsd1.api.id())
    console.log(await ipfsd2.api.id())
    // console.log(await ipfsd3.api.id())

    await factory.clean() // Clean all the controllers created by the factory calling `stop` on all of them.
};

export {
    ipfsMod,
    ipfsAdd,
    ipfsDaemon
}