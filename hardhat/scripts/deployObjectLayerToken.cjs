const { ethers } = require('hardhat');

/**
 * Deployment script for the ObjectLayerToken (ERC-1155) contract.
 *
 * Deploys the unified multi-token contract to the configured Hyperledger Besu
 * network and logs the deployed address. The deployer account receives:
 *   - Ownership of the contract
 *   - The initial CryptoKoyn (token ID 0) fungible supply
 *
 * Usage:
 *   npx hardhat run scripts/deployObjectLayerToken.cjs --network besu-ibft2
 *
 * @module scripts/deployObjectLayerToken
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('──────────────────────────────────────────────────');
  console.log('Deploying ObjectLayerToken (ERC-1155)');
  console.log('──────────────────────────────────────────────────');
  console.log('  Network :', hre.network.name);
  console.log('  Deployer:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('  Balance :', ethers.formatEther(balance), 'ETH');
  console.log('');

  // Base URI for IPFS metadata resolution.
  // Token URIs will resolve to: ipfs://<per-token-CID>
  // or fall back to: ipfs://<tokenId>.json
  const baseURI = 'ipfs://';

  const ObjectLayerToken = await ethers.getContractFactory('ObjectLayerToken');
  const token = await ObjectLayerToken.deploy(deployer.address, baseURI);

  await token.waitForDeployment();

  const deployedAddress = await token.getAddress();

  console.log('  ObjectLayerToken deployed to:', deployedAddress);
  console.log('');

  // ── Verify initial state ──────────────────────────────────────────────

  const cryptokoynId = await token.CRYPTOKOYN();
  const cryptokoynSupply = await token.totalSupply(cryptokoynId);
  const deployerCryptokoynBalance = await token.balanceOf(deployer.address, cryptokoynId);

  console.log('  CryptoKoyn (token ID 0):');
  console.log('    Total supply     :', ethers.formatEther(cryptokoynSupply), 'CKY');
  console.log('    Deployer balance :', ethers.formatEther(deployerCryptokoynBalance), 'CKY');
  console.log('');

  // ── Output deployment info for integration ────────────────────────────

  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    contract: 'ObjectLayerToken',
    address: deployedAddress,
    deployer: deployer.address,
    baseURI: baseURI,
    cryptokoynTokenId: cryptokoynId.toString(),
    initialCryptokoynSupply: cryptokoynSupply.toString(),
    timestamp: new Date().toISOString(),
  };

  console.log('  Deployment JSON (for engine integration):');
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log('');

  // Write deployment artifact to disk for the CLI and server to consume
  const fs = require('fs-extra');
  const path = require('path');

  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  await fs.ensureDir(deploymentsDir);

  const artifactPath = path.join(deploymentsDir, `${hre.network.name}-ObjectLayerToken.json`);
  await fs.writeJson(artifactPath, deploymentInfo, { spaces: 2 });
  console.log('  Deployment artifact written to:', artifactPath);

  console.log('──────────────────────────────────────────────────');
  console.log('  Deployment complete.');
  console.log('──────────────────────────────────────────────────');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
