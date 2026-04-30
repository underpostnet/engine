import { CalendarCore } from '../core/CalendarCore.js';

class CalendarNexodev {
  static async instance(options) {
    return html`${await CalendarCore.instance(options)}`;
  }
}

export { CalendarNexodev };
