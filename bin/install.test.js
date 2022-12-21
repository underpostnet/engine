import shell from 'shelljs';

[
    `c8`,
    `mocha`
].map(globalDep =>
    shell.exec(`npm install -g ${globalDep}`));