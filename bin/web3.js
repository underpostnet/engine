import fs from 'fs-extra';
import { Web3 } from 'web3';
import { loggerFactory } from '../src/server/logger.js';

import { shellCd, shellExec } from '../src/server/process.js';
import { range } from '../src/client/components/core/CommonJs.js';

// https://docs.web3js.org/guides/wallet/

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const operator = process.argv[2];

try {
  switch (operator) {
    case 'build-nodes': {
      const network = process.argv[3];
      const keysFolder = `/dd/engine/engine-private/eth-networks/${network}`;

      fs.mkdirSync(keysFolder, { recursive: true });
      shellExec(
        'export PATH=$PATH:/dd/besu-24.9.1/bin && besu' +
          ` operator generate-blockchain-config --config-file=/dd/engine/hardhat/networks/${network}.network.json --to=${keysFolder} --private-key-file-name=key`,
      );

      const folderKeys = await fs.readdir(`${keysFolder}/keys`);

      let indexNode = -1;
      for (const keyFile of folderKeys) {
        indexNode++;
        fs.copySync(`${keysFolder}/keys/${keyFile}`, `${keysFolder}/nodes/node-${indexNode}/data`);
      }
      break;
    }
    case 'run': {
      const network = process.argv[3];
      const besuApis = 'ADMIN,ETH,NET,WEB3,CLIQUE,IBFT,QBFT,PERM,DEBUG,MINER,EEA,TXPOOL,PRIV,PLUGINS';

      const cmd =
        'export PATH=$PATH:/dd/besu-24.9.1/bin && besu' +
        ` --rpc-http-enabled --rpc-http-api=${besuApis}` +
        ` --rpc-ws-enabled --rpc-ws-api=${besuApis}` +
        ` --genesis-file=/dd/engine/engine-private/eth-networks/${network}/genesis.json` +
        ` --host-allowlist="*"` +
        ` --rpc-http-cors-origins="all"`;

      let currentPort = 8544;

      for (const node of range(0, 3)) {
        currentPort++;
        if (`${process.argv[4]}` !== `${node}`) continue;
        shellCd(`/dd/engine/engine-private/eth-networks/${network}/nodes/node-${node}`);

        shellExec(
          `${cmd} --data-path=data --rpc-http-port=${currentPort}`,
          // `${cmd} --data-path=/dd/engine/hardhat/data/${network}-${node}` +
          //   ` --node-private-key-file=/dd/engine/hardhat/server/${network}/key${node}`,
          { async: true },
        );
      }

      break;
    }
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

        if (process.argv[3]) fs.writeFileSync(process.argv[3], account.address, 'utf8');

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
