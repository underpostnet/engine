import { shellExec } from './src/server/process.js';

// /usr/bin/supervisord -n
// /usr/sbin/sshd -D
shellExec(`/usr/bin/supervisord -n`, { async: true });

shellExec(`sudo /opt/lampp/lampp start`, { async: true });

shellExec(`/usr/bin/mongod -f /etc/mongod.conf`, { async: true });

shellExec(`underpost new app server`);
