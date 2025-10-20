import { shellExec } from '../src/server/process.js';
import fs from 'fs-extra';
import { loggerFactory } from '../src/server/logger.js';
import { getUnderpostRootPath } from '../src/server/conf.js';

const logger = loggerFactory(import.meta);
const underpostRoot = getUnderpostRootPath();

if (!fs.existsSync('/root/.config/zed')) fs.mkdirSync('/root/.config/zed', { recursive: true });
fs.copyFileSync(`${underpostRoot}/.vscode/zed.settings.json`, `/root/.config/zed/settings.json`);
fs.copyFileSync(`${underpostRoot}/.vscode/zed.keymap.json`, `/root/.config/zed/keymap.json`);

shellExec(`ZED_ALLOW_ROOT=true zed ${process.argv[2] ? process.argv[2] : '.'}`);

logger.info('Connect copilot device', 'https://github.com/login/device');
logger.info('Comments', 'Ctrl shift 7');
logger.info('Unfold', 'Ctrl K + Ctrl J');
logger.info('Fold', 'Ctrl K + Ctrl 0');
logger.info('Command Palette', 'Ctrl Shift P');
logger.info('Open File', 'Ctrl P');
logger.info('Find in Files', 'Ctrl Shift F');
logger.info('Go to Line', 'Ctrl G');
logger.info('New file', 'Ctrl N');
