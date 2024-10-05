import fs from 'fs-extra';
import { faBase64Png, getBufferPngText } from '../../server/client-icons.js';

process.exit(0);

fs.writeFileSync(
  './tmp/api-user-invalid-token.png',
  await getBufferPngText({ text: 'Invalid token', textColor: '#ff0000' }),
  'utf8',
);
fs.writeFileSync(
  './tmp/api-user-recover.png',
  Buffer.from(faBase64Png('rotate-left', 50, 50, '#ffffff'), 'base64'),
  'utf8',
);
fs.writeFileSync('./tmp/api-user-check.png', Buffer.from(faBase64Png('check', 50, 50), 'base64'), 'utf8');
