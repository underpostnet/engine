import fs from 'fs-extra';
import { Web3 } from 'web3';
import { loggerFactory } from '../src/server/logger.js';

import { shellCd, shellExec } from '../src/server/process.js';

// https://docs.web3js.org/guides/wallet/

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const operator = process.argv[2];

try {
  switch (operator) {
    case 'create-eth-keys':
      {
        if (!fs.existsSync('./engine-private/eth-keys')) fs.mkdirSync('./engine-private/eth-keys', { recursive: true });

        const provider = new Web3.providers.HttpProvider('http://localhost:8545');

        const web3 = new Web3(provider);

        // generate a new random account
        const account = web3.eth.accounts.create();

        logger.info('Keys generated for account', account.address);
        /*
{
  address: '0x9E82491d1978217d631a3b467BF912933F54788f',
  privateKey: '<redacted>',
  signTransaction: [Function: signTransaction],
  sign: [Function: sign],
  encrypt: [Function: encrypt]
}
*/
        fs.writeFileSync(`./engine-private/eth-keys/${account.address}`, account.privateKey, 'utf8');

        // transaction example:
        // const tx = web3.eth
        //   .sendTransaction({ from: parity_dev, to: poster.address, gas: 210000, value: 10037037 })
        //   .then(function (receipt) {});
      }
      break;

    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
