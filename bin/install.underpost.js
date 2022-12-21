


import shell from 'shelljs';
import fs from 'fs';

shell.exec(`npm install -g npm@latest`);

const nameFolderModules = 'underpost_modules';

if (!fs.existsSync(`./${nameFolderModules}`)) fs.mkdirSync(`./${nameFolderModules}`);
shell.cd(nameFolderModules);

[
    'underpost-library',
    'underpost.net',
    'underpost-data-template'
].map(underpostModule => {
    if (fs.existsSync(`./${underpostModule}`)) {
        shell.cd(underpostModule);
        shell.exec(`git pull origin master`);
        shell.cd('..');
        return;
    }
    shell.exec(`git clone https://github.com/underpostnet/${underpostModule}`);
    return;
});