import cron from 'node-cron';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

const CronManagement = {
  data: {},
  init: function () {
    // verify tokens
    // https://github.com/settings/tokens
    for (const cronKey of Object.keys(this.data)) {
      if (this.data[cronKey].valid) {
        this.data[cronKey].task.start();
        logger.info(`Cron task "${this.data[cronKey].name}" started`);
      } else {
        logger.error(
          `Invalid cron expression "${this.data[cronKey].expression}" for task "${this.data[cronKey].name}"`,
        );
      }
    }
  },
  add: function (name = 'task', expression = '* * * * *', callback = async () => null) {
    const args = { name, expression, valid: cron.validate(expression) };
    this.data[name] = {
      ...args,
      task: cron.schedule(expression, callback, {
        scheduled: true,
        timezone: process.env.TIME_ZONE || 'America/New_York',
        name,
      }),
    };
  },
};

export { CronManagement };
