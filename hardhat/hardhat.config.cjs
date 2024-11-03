// hardhat.config.js
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');
require('dotenv').config();
const fs = require('fs-extra');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: 'cryptokoyn-itemledger',
  networks: {
    hardhat: {},
    'cryptokoyn-itemledger': {
      // url: 'https://cryptokoyn.net/rpc/mainnet',
      // url: 'https://itemledger.com/rpc/mainnet',
      url: 'http://127.0.0.1:8545',
      accounts: [fs.readFileSync(`../engine-private/eth-networks/cryptokoyn-itemledger/coinbase`, 'utf8')], // process.env.ETH_PRIVATE_KEY
      chainId: 777771,
    },
  },
  // etherscan: {
  //   apiKey: "YOUR_ETHERSCAN_API_KEY", // Replace with your Etherscan API key
  // },
  // vanar: {
  //   apiKey: "YOUR_VANAR_API_KEY", // Replace with your VANAR API key
  // },
  solidity: {
    version: '0.8.27',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  mocha: {
    timeout: 40000,
  },
};
