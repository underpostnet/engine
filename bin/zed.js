import { shellExec } from '../src/server/process.js';
import fs from 'fs-extra';
import { loggerFactory } from '../src/server/logger.js';
import { getUnderpostRootPath } from '../src/server/conf.js';

const logger = loggerFactory(import.meta);
const underpostRoot = getUnderpostRootPath();

const settings = {
  ui_font_size: 16,
  buffer_font_size: 15,
  theme: {
    mode: 'system',
    light: 'One Dark',
    dark: 'One Dark',
  },

  features: {
    edit_prediction_provider: 'copilot',
    copilot: true,
  },

  show_edit_predictions: true,

  edit_predictions: {
    mode: 'eager',
  },
};

const keyMap = [
  {
    context: 'Editor',
    bindings: {
      'ctrl-c': 'editor::Copy',
      'ctrl-x': 'editor::Cut',
      'ctrl-v': 'editor::Paste',
      'ctrl-shift-c': 'editor::CopyAndTrim',
      'ctrl-shift-v': 'editor::Paste',
      'cmd-c': 'editor::Copy',
      'cmd-x': 'editor::Cut',
      'cmd-v': 'editor::Paste',
    },
  },
  {
    context: 'Terminal',
    bindings: {
      'ctrl-shift-c': 'terminal::Copy',
      'ctrl-shift-v': 'terminal::Paste',
      'cmd-shift-c': 'terminal::Copy',
      'cmd-shift-v': 'terminal::Paste',
    },
  },
  {
    context: 'Editor && edit_prediction',
    bindings: {
      tab: 'editor::AcceptEditPrediction',
      'alt-tab': 'editor::AcceptEditPrediction',
      'alt-l': null,
    },
  },
  {
    context: 'Editor && edit_prediction_conflict',
    bindings: {
      'alt-l': 'editor::AcceptEditPrediction',
      tab: 'editor::ComposeCompletion',
    },
  },
];

if (!fs.existsSync('/root/.config/zed')) fs.mkdirSync('/root/.config/zed', { recursive: true });
fs.writeFileSync(`/root/.config/zed/settings.json`, JSON.stringify(settings, null, 4), 'utf8');
fs.writeFileSync(`/root/.config/zed/keymap.json`, JSON.stringify(keyMap, null, 4), 'utf8');

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
