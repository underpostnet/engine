const shell = require('shelljs');

// /usr/bin/supervisord -n
// /usr/sbin/sshd -D

shell.exec(`/usr/bin/supervisord -n`, { async: true });

// shell.exec(`sudo /opt/lampp/lampp start`, { async: true });

// shell.exec(`/usr/bin/mongod -f /etc/mongod.conf`, { async: true });

shell.exec(`underpost new app`);
