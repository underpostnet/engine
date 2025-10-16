import { shellExec } from '../src/server/process.js';
import fs from 'fs-extra';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

fs.copyFileSync(`./.vscode/zed.settings.json`, `/root/.config/zed/settings.json`);
fs.copyFileSync(`./.vscode/zed.keymap.json`, `/root/.config/zed/keymap.json`);

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
