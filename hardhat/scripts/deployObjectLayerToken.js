import hre from 'hardhat';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatEther } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deployment script for the ObjectLayerToken (ERC-1155) contract.
 *
 * Deploys the unified multi-token contract to the configured Hyperledger Besu
 * network and logs the deployed address. The deployer account receives:
 *   - Ownership of the contract
 *   - The initial CryptoKoyn (token ID 0) fungible supply
 *
 * Usage:
 *   npx hardhat run scripts/deployObjectLayerToken.js --network besu-ibft2
 *
 * @module scripts/deployObjectLayerToken
 */
async function main() {
  const [deployerClient] = await hre.viem.getWalletClients();
  const deployerAddress = deployerClient.account.address;
  const publicClient = await hre.viem.getPublicClient();

  console.log('──────────────────────────────────────────────────');
  console.log('Deploying ObjectLayerToken (ERC-1155)');
  console.log('──────────────────────────────────────────────────');
  console.log('  Network :', hre.network.name);
  console.log('  Deployer:', deployerAddress);

  const balance = await publicClient.getBalance({ address: deployerAddress });
  console.log('  Balance :', formatEther(balance), 'ETH');
  console.log('');

  // Base URI for IPFS metadata resolution.
  // Token URIs will resolve to: ipfs://<per-token-CID>
  // or fall back to: ipfs://<tokenId>.json
  const baseURI = 'ipfs://';

  const token = await hre.viem.deployContract('ObjectLayerToken', [deployerAddress, baseURI]);
  const deployedAddress = token.address;

  console.log('  ObjectLayerToken deployed to:', deployedAddress);
  console.log('');

  // ── Verify initial state ──────────────────────────────────────────────

  const cryptokoynId = await token.read.CRYPTOKOYN();
  const cryptokoynSupply = await token.read['totalSupply(uint256)']([cryptokoynId]);
  const deployerCryptokoynBalance = await token.read.balanceOf([deployerAddress, cryptokoynId]);

  console.log('  CryptoKoyn (token ID 0):');
  console.log('    Total supply     :', formatEther(cryptokoynSupply), 'CKY');
  console.log('    Deployer balance :', formatEther(deployerCryptokoynBalance), 'CKY');
  console.log('');

  // ── Output deployment info for integration ────────────────────────────

  const chainId = (await publicClient.getChainId()).toString();

  const deploymentInfo = {
    network: hre.network.name,
    chainId,
    contract: 'ObjectLayerToken',
    address: deployedAddress,
    deployer: deployerAddress,
    baseURI: baseURI,
    cryptokoynTokenId: cryptokoynId.toString(),
    initialCryptokoynSupply: cryptokoynSupply.toString(),
    timestamp: new Date().toISOString(),
  };

  console.log('  Deployment JSON (for engine integration):');
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log('');

  // Write deployment artifact to disk for the CLI and server to consume
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
