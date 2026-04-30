import { CalendarCore } from '../core/CalendarCore.js';

class CalendarNexodev {
  static async Render(options) {
    return html`${await CalendarCore.Render(options)}`;
  }
}

export { CalendarNexodev };
