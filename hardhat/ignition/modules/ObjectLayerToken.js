// Hardhat Ignition module for deploying the ObjectLayerToken (ERC-1155) contract.
// Learn more about Hardhat Ignition at https://hardhat.org/ignition
//
// Usage:
//   npx hardhat ignition deploy ignition/modules/ObjectLayerToken.js --network besu-ibft2

import { buildModule } from '@nomicfoundation/ignition-core';

const DEFAULT_BASE_URI = 'ipfs://';

export default buildModule('ObjectLayerTokenModule', (m) => {
  // The deployer account is used as the initial owner and receives the CryptoKoyn supply.
  const initialOwner = m.getParameter('initialOwner', m.getAccount(0));
  const baseURI = m.getParameter('baseURI', DEFAULT_BASE_URI);

  // Deploy the unified ERC-1155 multi-token contract.
  // Constructor: constructor(address initialOwner, string memory baseURI)
  const objectLayerToken = m.contract('ObjectLayerToken', [initialOwner, baseURI]);

  return { objectLayerToken };
});
