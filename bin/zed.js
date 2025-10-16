import { shellExec } from '../src/server/process.js';
import fs from 'fs-extra';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

fs.copyFileSync(`./.vscode/zed.settings.json`, `/root/.config/zed/settings.json`);
fs.copyFileSync(`./.vscode/zed.keymap.json`, `/root/.config/zed/keymap.json`);

shellExec(`ZED_ALLOW_ROOT=true zed ${process.argv[2] ? process.argv[2] : '.'}`);

logger.info('Connect device', 'https://github.com/login/device');
