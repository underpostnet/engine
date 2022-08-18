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

const copyDir = async (src, dest) => {
    await _fs.mkdir(dest, { recursive: true });
    let entries = await _fs.readdir(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);

        entry.isDirectory() ?
            await copyDir(srcPath, destPath)
                .catch(err => console.log(colors.red(err))) :
            await _fs.copyFile(srcPath, destPath)
                .catch(err => console.log(colors.red(err)))
    }
};

const deleteFolderRecursive = path => {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(file => {
            const curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};

export { getAllFiles, copyDir, deleteFolderRecursive };