/**
 * Module for managing logger control and configuration
 * @module src/server/logger.js
 * @namespace Logger
 */

'use strict';

import dotenv from 'dotenv';
import winston from 'winston';
import morgan from 'morgan';
import colorize from 'json-colorizer';
import colors from 'colors';
import v8 from 'v8';
import { clearTerminalStringColor, formatBytes } from '../client/components/core/CommonJs.js';

colors.enable();
dotenv.config();

// Define your severity levels.
// With them, You can create log files,
// see or hide levels based on the running ENV.
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

/**
 * The `level` function determines the logging level based on the provided `logLevel` parameter or defaults to 'info'.
 * @param {string} logLevel - The logging level to be used. If not provided, it defaults to 'info'.
 * @returns {string} The logging level to be used for the logger.
 * @memberof Logger
 */
const level = (logLevel = '') => logLevel || 'info';

// Define different colors for each level.
// Colors make the log message more visible,
// adding the ability to focus or ignore messages.

// Tell winston that you want to link the colors
// defined above to the severity levels.
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
});

// Chose the aspect of your log customizing the log format.
const format = (meta) =>
  winston.format.combine(
    // winston.format.errors({ stack: true }),
    // Add the message timestamp with the preferred format
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    // Tell Winston that the logs must be colored
    winston.format.colorize({ all: true }),
    // Define the format of the message showing the timestamp, the level and the message
    winston.format.printf((info) => {
      const symbols = Object.getOwnPropertySymbols(info);
      return `${`[${meta}]`.green} ${info.timestamp} ${info.level} ${
        symbols[1]
          ? `${clearTerminalStringColor(info.message)}: ${colorize(JSON.stringify(info[symbols[1]][0], null, 4), {
              colors: {
                STRING_KEY: 'green',
                STRING_LITERAL: 'magenta.bold',
                NUMBER_LITERAL: '#FF0000',
              },
            })}`
          : info.message
      }`;
    }),
  );

/**
 * Logs information about the current process environment to the console.
 *
 * This function is used to log details about
 * the execution context, such as command-line arguments,
 * environment variables, and the maximum available heap space size.
 *
 * @param {winston.Logger} logger - A pre-configured Winston logger object.
 * @memberof Logger
 */
const setUpInfo = async (logger = new winston.Logger()) => {
  logger.info('argv', process.argv);
  logger.info('cwd', process.cwd());
  logger.info('platform', process.platform);
  logger.info('env', process.env.NODE_ENV);
  logger.info('--max-old-space-size', {
    total_available_size: formatBytes(v8.getHeapStatistics().total_available_size),
  });
};

/**
 * The function `loggerFactory` creates a logger instance with specified transports for printing out
 * messages.
 * @param meta - The `meta` parameter in the `loggerFactory` function is used to extract the last part
 * of a URL and use it to create log files in a specific directory.
 * @param logLevel - Specify the logging level for the logger instance. e.g., 'error', 'warn', 'info', 'debug'.
 * @param enableFileLogs - Whether to write logs to files. Defaults to false.
 * @returns {underpostLogger} The `loggerFactory` function returns a logger instance created using Winston logger
 * library. The logger instance is configured with various transports for printing out messages to
 * different destinations such as the terminal, error.log file, and all.log file. The logger instance
 * also has a method `setUpInfo` attached to it for setting up additional information.
 * @memberof Logger
 */
const loggerFactory = (meta = { url: '' }, logLevel = '', enableFileLogs = false) => {
  meta = meta.url.split('/').pop();
  // Define which transports the logger must use to print out messages.
  // In this example, we are using three different transports
  const transports = [
    // Allow the use the terminal to print the messages
    new winston.transports.Console(),
    // Optionally write log files when enableFileLogs is true
    ...(enableFileLogs
      ? [
          // Allow to print all the error level messages inside the error.log file
          new winston.transports.File({
            filename: `logs/${meta}/error.log`,
            level: 'error',
          }),
          // Allow to print all the error messages inside the all.log file
          // (also includes error logs that are also printed inside error.log)
          new winston.transports.File({ filename: `logs/${meta}/all.log` }),
        ]
      : []),
  ];

  // Create the logger instance that has to be exported
  // and used to log messages.
  const logger = winston.createLogger({
    defaultMeta: meta,
    level: level(logLevel),
    levels,
    format: format(meta),
    transports,
    // exceptionHandlers: [new winston.transports.File({ filename: 'exceptions.log' })],
    // rejectionHandlers: [new winston.transports.File({ filename: 'rejections.log' })],
    // exitOnError: false,
  });
  /**
   * The returned logger is a real Winston logger instance with an extra `setUpInfo` method.
   *
   * @memberof Logger
   * @typedef {winston.Logger & {
   *  setUpInfo: (logger?: winston.Logger) => Promise<void>
   * }} underpostLogger
   */
  logger.setUpInfo = () => setUpInfo(logger);

  return logger;
};

/**
 * The `loggerMiddleware` function is an Express middleware that uses the Morgan library to log HTTP requests.
 * @param {Object} meta - An object containing metadata, such as the URL, to be used in the logger.
 * @param {string} logLevel - The logging level to be used for the logger (e.g., 'error', 'warn', 'info', 'debug').
 * @param {Function} skip - A function to determine whether to skip logging for a particular request.
 * @param {boolean} enableFileLogs - Whether to write logs to files. Defaults to false.
 * @returns {Function} A middleware function that can be used in an Express application to log HTTP requests.
 * @memberof Logger
 */
const loggerMiddleware = (
  meta = { url: '' },
  logLevel = 'info',
  skip = (req, res) => process.env.NODE_ENV === 'production',
  enableFileLogs = false,
) => {
  const stream = {
    // Use the http severity
    write: (message) => loggerFactory(meta, logLevel, enableFileLogs).http(message),
  };

  morgan.token('host', function (req, res) {
    return req.headers['host'];
  });

  return morgan(
    // Define message format string
    `:remote-addr :method :host:url :status :res[content-length] - :response-time ms`,
    { stream, skip },
  );
};

const underpostASCII = () => `

██╗░░░██╗███╗░░██╗██████╗░███████╗██████╗░██████╗░░█████╗░░██████╗████████╗
██║░░░██║████╗░██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
██║░░░██║██╔██╗██║██║░░██║█████╗░░██████╔╝██████╔╝██║░░██║╚█████╗░░░░██║░░░
██║░░░██║██║╚████║██║░░██║██╔══╝░░██╔══██╗██╔═══╝░██║░░██║░╚═══██╗░░░██║░░░
╚██████╔╝██║░╚███║██████╔╝███████╗██║░░██║██║░░░░░╚█████╔╝██████╔╝░░░██║░░░
░╚═════╝░╚═╝░░╚══╝╚═════╝░╚══════╝╚═╝░░╚═╝╚═╝░░░░░░╚════╝░╚═════╝░░░░╚═╝░░░
                                                `;

const actionInitLog = () =>
  console.log(
    underpostASCII() +
      `
    https://www.nexodev.org/docs
`,
  );

export { loggerFactory, loggerMiddleware, setUpInfo, underpostASCII, actionInitLog };
