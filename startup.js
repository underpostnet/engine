
import shell from 'shelljs';
import fs from 'fs';

console.log('---------------------------------');
console.log('> LIST WORK DIRECTORY');
console.log('---------------------------------');
console.log(' CWD:');
shell.exec(`echo $CWD`);
console.log(' PWD:');
shell.exec(`echo $PWD`);
console.log(' DATA:');
shell.exec(`ls -a`);

console.log('---------------------------------');
console.log('> INIT LAMPP/XAMPP');
console.log('---------------------------------');
shell.exec(`sudo /opt/lampp/lampp start`);

console.log('---------------------------------');
console.log('> UNDERPOST MODULES');
console.log('---------------------------------');

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

setTimeout(async () => {
    // const timer = ms => new Promise(res => setTimeout(res, ms));

    // (async () => {
    //     while (true) {
    //         await timer(1000);
    //     }
    // })()
    console.log('---------------------------------');
    console.log('> INIT SSH SERVER');
    console.log('---------------------------------');

    // /usr/bin/supervisord -n
    // /usr/sbin/sshd -D
    shell.exec(`/usr/bin/supervisord -n`);

    console.log('---------------------------------');
    console.log('> INIT APPS SERVICES');
    console.log('---------------------------------');

    shell.exec(`npm run dev`);

}, 1000);

