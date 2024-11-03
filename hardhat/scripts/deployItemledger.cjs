const { ethers, upgrades } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying ItemLedger from account:', deployer.address);

  const ItemLedger = await ethers.getContractFactory('ItemLedger');

  const testToken = await ItemLedger.deploy(deployer.address);

  console.log('ItemLedger deployed to:', testToken.address);

  // Ensures that the deployment transaction is confirmed on the blockchain before proceeding,
  // or wait closed blocks until the transaction is confirmed
  console.log('Wait confirmed...', testToken.address);
  await testToken.deployed();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
