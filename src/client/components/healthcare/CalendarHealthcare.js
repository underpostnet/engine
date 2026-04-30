import { CalendarCore } from '../core/CalendarCore.js';

class CalendarHealthcare {
  static async Render(options) {
    return html`${await CalendarCore.Render(options)}`;
  }
}

export { CalendarHealthcare };
