'use strict';

import fs from 'fs';
import { default as fsWithCallbacks } from 'fs';
const _fs = fsWithCallbacks.promises;
import path from 'path';

const getAllFiles = (dirPath, arrayOfFiles) => {
    const files = fs.readdirSync(dirPath)

    arrayOfFiles = arrayOfFiles || []

    files.forEach((file) => {
        if (fs.statSync(dirPath + '/' + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + '/' + file, arrayOfFiles)
        } else {
            arrayOfFiles.push(path.join(dirPath, '/', file))
        }
    })

    return arrayOfFiles
};

const copyDir = async (src, dest, ignore) => {
    ignore == undefined ? ignore = [] : null;
    await _fs.mkdir(dest, { recursive: true });
    let entries = await _fs.readdir(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);

        ignore.filter(x => x == entry.name).length === 0 ?
            entry.isDirectory() ?
                await copyDir(srcPath, destPath, ignore)
                    .catch(err => console.log(colors.red(err))) :
                await _fs.copyFile(srcPath, destPath)
                    .catch(err => console.log(colors.red(err))) :
            null;
    }
};

export { getAllFiles, copyDir };