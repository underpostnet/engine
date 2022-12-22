import request from 'superagent';
import fs from 'fs';
import admZip from 'adm-zip';
import archiver from 'archiver';

const deployFilesFromZipUrl = options => {
    // EXAMPLE
    // deployFilesFromZipUrl({
    //     url: 'https://underpost.net/download/fontawesome-free-5.3.1.zip',
    //     nameZipDownload: './fontawesome-5.3.1.zip',
    //     pathExtractFolder: './cyberia/assets',
    //     originNameFolderZip: 'fontawesome-free-5.3.1-web',
    //     mewNameFolderZip: 'fontawesome',
    //     end: () => console.log('end deployFilesFromZipUrl')
    // });
    try {
        request
            .get(options.url)
            .on('error', error => {
                console.log(error);
                return options.end(false);
            })
            .pipe(fs.createWriteStream(options.nameZipDownload))
            .on('finish', () => {
                console.log('   -> finished dowloading');
                const zip = new admZip(options.nameZipDownload);
                console.log('   -> start unzip');
                zip.extractAllTo(options.pathExtractFolder, true);
                console.log('   -> finished unzip');
                fs.unlinkSync(options.nameZipDownload);
                fs.renameSync(
                    options.pathExtractFolder + '/' + options.originNameFolderZip,
                    options.pathExtractFolder + '/' + options.mewNameFolderZip
                );
                return options.end(true);
            });
    } catch (error) {
        console.log(error);
        return options.end(false);
    }
};

const generateZipFromFolder = async clientId => {


    const output = fs.createWriteStream(`${clientId}.zip`, 'utf8');
    const archive = archiver('zip');

    output.on('close', function () {
        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');
    });

    archive.on('error', function (err) {
        throw err;
    });

    archive.pipe(output);


    await archive.directory(
        process.env.APP_PATH + `/builds/${clientId}`,
        false/*option subdir*/).finalize();

    fs.renameSync(
        `${process.env.APP_PATH}/${clientId}.zip`,
        `${process.env.APP_PATH}/builds/${clientId}.zip`);

};


export {
    deployFilesFromZipUrl,
    generateZipFromFolder
}
