const { ethers, upgrades } = require('hardhat');

async function main() {
  const maxSupply = 1000000 * 10 ** 18; // To mint 1,000,000 tokens

  const [deployer] = await ethers.getSigners();

  console.log('Deploying CryptoKoyn from account:', deployer.address);

  const CryptoKoyn = await ethers.getContractFactory('CryptoKoyn');
  const testToken = await CryptoKoyn.deploy(maxSupply); // Initial supply

  console.log('CryptoKoyn deployed to:', testToken.address);

  await testToken.deployed();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
