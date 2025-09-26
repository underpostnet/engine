import { Auth } from '../core/Auth.js';
import { CalendarCore } from '../core/CalendarCore.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { LogIn } from '../core/LogIn.js';
import { PanelForm } from '../core/PanelForm.js';
import { ElementsNexodev } from './ElementsNexodev.js';

const LogInNexodev = async function () {
  LogIn.Event['LogInNexodev'] = async (options) => {
    const { token, user } = options;

    ElementsNexodev.Data.user.main.model.user = user;

    if (PanelForm.Data['nexodev-blog']) PanelForm.Data['nexodev-blog'].updatePanel();
    if (CalendarCore.Data['modal-calendar']) CalendarCore.Data['modal-calendar'].updatePanel();
    if (FileExplorer.Api['modal-cloud']) FileExplorer.Api['modal-cloud'].updateData({ display: true });
  };
  const { user } = await Auth.sessionIn();
  ElementsNexodev.Data.user.main.model.user = user;
};

export { LogInNexodev };
