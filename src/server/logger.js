'use strict';

import dotenv from 'dotenv';
import winston from 'winston';
import morgan from 'morgan';
import colorize from 'json-colorizer';
import colors from 'colors';
import v8 from 'v8';
import isAdmin from 'is-admin';
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

// This method set the current severity based on
// the current NODE_ENV: show all the log levels
// if the server was run in development mode; otherwise,
// if it was run in production, show only warn and error messages.
const level = () => 'info'; // (process.env.NODE_ENV || 'development' ? 'debug' : 'warn');

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

const loggerFactory = (meta) => {
  meta = meta.url.split('/').pop();
  // Define which transports the logger must use to print out messages.
  // In this example, we are using three different transports
  const transports = [
    // Allow the use the terminal to print the messages
    new winston.transports.Console(),
    // Allow to print all the error level messages inside the error.log file
    new winston.transports.File({
      filename: `logs/${meta}/error.log`,
      level: 'error',
    }),
    // Allow to print all the error message inside the all.log file
    // (also the error log that are also printed inside the error.log(
    new winston.transports.File({ filename: `logs/${meta}/all.log` }),
  ];

  // Create the logger instance that has to be exported
  // and used to log messages.
  const logger = winston.createLogger({
    defaultMeta: meta,
    level: level(),
    levels,
    format: format(meta),
    transports,
    // exceptionHandlers: [new winston.transports.File({ filename: 'exceptions.log' })],
    // rejectionHandlers: [new winston.transports.File({ filename: 'rejections.log' })],
    // exitOnError: false,
  });
  logger.setUpInfo = async () => {
    logger.info('argv', process.argv);
    logger.info('env', process.env.NODE_ENV);
    logger.info('admin', await isAdmin());
    logger.info('--max-old-space-size', {
      total_available_size: formatBytes(v8.getHeapStatistics().total_available_size),
    });
  };
  return logger;
};

const loggerMiddleware = (meta) => {
  const stream = {
    // Use the http severity
    write: (message) => loggerFactory(meta).http(message),
  };

  const skip = (req, res) => process.env.NODE_ENV === 'production';

  morgan.token('host', function (req, res) {
    return req.headers['host'];
  });

  return morgan(
    // Define message format string (this is the default one).
    // The message format is made from tokens, and each token is
    // defined inside the Morgan library.
    // You can create your custom token to show what do you want from a request.
    `:remote-addr :method :host:url :status :res[content-length] - :response-time ms`,
    // Options: in this case, I overwrote the stream and the skip logic.
    // See the methods above.
    { stream, skip },
  );
};

export { loggerFactory, loggerMiddleware };
