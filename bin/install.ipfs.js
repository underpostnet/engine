
import shell from 'shelljs';

shell.exec(`npm install -g ipfs`);

const deps = {
    "ipfs": "^0.64.2",
    "ipfs-core": "^0.16.1",
    "ipfs-http-client": "^58.0.1",
    "ipfsd-ctl": "^12.2.1",
    "go-ipfs": "^0.16.0"
};

Object.keys(deps).map(key => shell.exec(`npm install ${key}@${deps[key]}`));