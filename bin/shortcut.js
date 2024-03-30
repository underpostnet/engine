import fs from 'fs';
import { getRootDirectory, shellExec } from '../src/server/process.js';
import os from 'os';

const [exe, dir, oS, env] = process.argv;

switch (oS) {
  case 'windows':
    switch (env) {
      case 'development':
        (() => {
          const desktopDir = `${os.homedir()}/desktop`.replaceAll('\\', '/');
          fs.writeFileSync(
            `./bin/shortcut.ps1`,
            `
          $DesktopPath = [Environment]::GetFolderPath("Desktop") + "/${env}-engine.lnk"  

          $WshShell = New-Object -comObject WScript.Shell 

          $Shortcut = $WshShell.CreateShortcut($DesktopPath) 

          $Shortcut.TargetPath = "cmd.exe"
        
          $Shortcut.Arguments = "PowerShell Start-Process cmd -Verb RunAs -ArgumentList '/k cd ${getRootDirectory()} && npm run dev" 

          $Shortcut.IconLocation = "${getRootDirectory()}/src/client/public/doc/favicon.ico"

          $Shortcut.Save()
          `,
          );
          shellExec(`PowerShell bin/shortcut.ps1`);
          fs.unlinkSync(`./bin/shortcut.ps1`);
        })();
        break;

      default:
        break;
    }

    break;

  default:
    break;
}
