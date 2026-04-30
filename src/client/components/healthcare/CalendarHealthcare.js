import { CalendarCore } from '../core/CalendarCore.js';

class CalendarHealthcare {
  static async instance(options) {
    return html`${await CalendarCore.instance(options)}`;
  }
}

export { CalendarHealthcare };
