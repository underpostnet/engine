


import shell from 'shelljs';
import fs from 'fs';


[
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