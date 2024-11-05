import { BackUpManagement } from '../src/server/backup.js';
import { Dns } from '../src/server/dns.js';

switch (process.argv[2]) {
  case 'backups':
    {
      await BackUpManagement.Init({ deployId: process.argv[3] });
    }
    break;
  case 'dns':
    {
      await Dns.InitIpDaemon({ deployId: process.argv[3] });
    }
    break;

  default:
    break;
}
