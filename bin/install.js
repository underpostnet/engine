import fs from 'fs';
import { Downloader } from '../src/server/downloader.js';
import { getRootDirectory, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, os, program] = process.argv;

try {
  let cmd;
  switch (program) {
    case 'certbot':
      switch (os) {
        case 'windows':
          await (async () => {
            const urlDownload =
              'https://github.com/certbot/certbot/releases/latest/download/certbot-beta-installer-win_amd64_signed.exe';
            const folderPath = `./engine-private/setup`;
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
            const fullPath = `${folderPath}/${urlDownload.split('/').pop()}`;
            logger.info('destination', fullPath);
            if (!fs.existsSync(fullPath)) await Downloader(urlDownload, fullPath);
            cmd = `PowerShell Start-Process -FilePath "${fullPath}" -ArgumentList "/S" -Wait`;
            shellExec(cmd);
          })();
          break;
        default:
          throw new Error(`Os not found: ${os} for program ${program}`);
      }
      break;
    case 'xampp':
      switch (os) {
        case 'windows':
          await (async () => {
            const versions = {
              '7.4.13':
                'https://ufpr.dl.sourceforge.net/project/xampp/XAMPP%20Windows/7.4.13/xampp-portable-windows-x64-7.4.13-1-VC15-installer.exe',
              '8.0.28':
                'https://sitsa.dl.sourceforge.net/project/xampp/XAMPP%20Windows/8.0.28/xampp-windows-x64-8.0.28-0-VS16-installer.exe',
            };
            const urlDownload = versions['7.4.13'];
            const folderPath = `./engine-private/setup`;
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
            const fullPath = `${folderPath}/${urlDownload.split('/').pop()}`;
            logger.info('destination', fullPath);
            if (!fs.existsSync(fullPath)) await Downloader(urlDownload, fullPath);
            cmd = `${getRootDirectory()}${fullPath.slice(1)} --mode unattended`;
            if (!fs.existsSync(`C:/xampp/apache`)) shellExec(cmd);
            fs.writeFileSync(
              `C:/xampp/apache/conf/httpd.template.conf`,
              fs.readFileSync(`C:/xampp/apache/conf/httpd.conf`, 'utf8'),
              'utf8'
            );
            fs.writeFileSync(
              `C:/xampp/apache/conf/extra/httpd-ssl.template.conf`,
              fs.readFileSync(`C:/xampp/apache/conf/extra/httpd-ssl.conf`, 'utf8'),
              'utf8'
            );
          })();
          break;
        default:
          throw new Error(`Os not found: ${os} for program ${program}`);
      }
      break;
    case 'docker':
      switch (os) {
        case 'windows':
          await (async () => {
            const urlDownload = `https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe`;
            const folderPath = `./engine-private/setup`;
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
            const fullPath = `${folderPath}/${urlDownload.split('/').pop()}`;
            logger.info('destination', fullPath);
            if (!fs.existsSync(fullPath)) await Downloader(urlDownload, fullPath);
            logger.warn('You must have WSL, install with the following command', `wsl --install`);
            cmd = `${getRootDirectory()}${fullPath.slice(1)} install --quiet --accept-license`;
            if (!fs.existsSync(`C:/Program Files/Docker/Docker`)) shellExec(cmd);
          })();
          break;

        default:
          throw new Error(`Os not found: ${os} for program ${program}`);
      }
      break;
    case 'wordpress':
      await (async () => {
        const urlDownload = `https://wordpress.org/latest.zip`;
      })();
      break;
    default:
      throw new Error(`Program not found: ${program}`);
  }
  logger.info(`success: ${program} on ${os}`);
} catch (error) {
  logger.error(error);
}
