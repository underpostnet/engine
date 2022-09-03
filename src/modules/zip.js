import request from 'superagent';
import fs from 'fs';
import admZip from 'adm-zip';

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

export {
    deployFilesFromZipUrl
}
