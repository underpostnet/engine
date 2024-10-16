const { ethers, upgrades } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying CryptoKoyn from account:', deployer.address);

  const CryptoKoyn = await ethers.getContractFactory('CryptoKoyn');

  const testToken = await CryptoKoyn.deploy(deployer.address);

  console.log('CryptoKoyn deployed to:', testToken.address);

  await testToken.deployed();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
