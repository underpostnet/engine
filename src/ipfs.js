import { shellCd, shellExec } from './server/process.js';

// https://docs.ipfs.tech/install/command-line/#system-requirements

switch (process.platform) {
  case 'linux':
    {
      if (!process.argv.includes('server')) {
        // Download the Linux binary from dist.ipfs.tech (opens new window).
        shellExec(`wget https://dist.ipfs.tech/kubo/v0.30.0/kubo_v0.30.0_linux-amd64.tar.gz`);

        // Unzip the file:
        shellExec(`tar -xvzf kubo_v0.30.0_linux-amd64.tar.gz`);

        // Move into the kubo folder:
        shellCd(`kubo`);

        // Run the install script
        shellExec(`sudo bash install.sh`);

        // Test that Kubo has installed correctly:
        shellExec(`ipfs --version`);

        shellCd(`..`);
        shellExec(`sudo rm -rf ./kubo`);
        shellExec(`sudo rm -rf ./kubo_v0.30.0_linux-amd64.tar.gz`);
      }
    }

    break;

  default:
    break;
}
