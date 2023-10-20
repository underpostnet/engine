'use strict';

import dotenv from 'dotenv';
import winston from 'winston';
import morgan from 'morgan';
import colorize from 'json-colorizer';
import colors from 'colors';
import { getIdModule } from '../client/components/core/CommonJs.js';

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
const level = () => (process.env.NODE_ENV || 'development' ? 'debug' : 'warn');

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
const format = (project) =>
  winston.format.combine(
    // winston.format.errors({ stack: true }),
    // Add the message timestamp with the preferred format
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    // Tell Winston that the logs must be colored
    winston.format.colorize({ all: true }),
    // Define the format of the message showing the timestamp, the level and the message
    winston.format.printf((info) => {
      const symbols = Object.getOwnPropertySymbols(info);
      return `${`[${project}]`.green} ${info.timestamp} ${info.level} ${
        symbols[1] ? `${info.message}: ${colorize(JSON.stringify(info[symbols[1]][0], null, 4))}` : info.message
      }`;
    })
  );

const loggerFactory = (meta) => {
  const project = getIdModule(meta);
  // Define which transports the logger must use to print out messages.
  // In this example, we are using three different transports
  const transports = [
    // Allow the use the terminal to print the messages
    new winston.transports.Console(),
    // Allow to print all the error level messages inside the error.log file
    new winston.transports.File({
      filename: `logs/${project}/error.log`,
      level: 'error',
    }),
    // Allow to print all the error message inside the all.log file
    // (also the error log that are also printed inside the error.log(
    new winston.transports.File({ filename: `logs/${project}/all.log` }),
  ];

  // Create the logger instance that has to be exported
  // and used to log messages.
  return winston.createLogger({
    level: level(),
    levels,
    format: format(project),
    transports,
    // exceptionHandlers: [new winston.transports.File({ filename: 'exceptions.log' })],
    // rejectionHandlers: [new winston.transports.File({ filename: 'rejections.log' })],
    // exitOnError: false,
  });
};

const loggerMiddleware = (project) => {
  const stream = {
    // Use the http severity
    write: (message) => loggerFactory(project).http(message),
  };

  const skip = (req, res) => process.env.NODE_ENV === 'production';

  return morgan(
    // Define message format string (this is the default one).
    // The message format is made from tokens, and each token is
    // defined inside the Morgan library.
    // You can create your custom token to show what do you want from a request.
    `:remote-addr :method :url :status :res[content-length] - :response-time ms`,
    // Options: in this case, I overwrote the stream and the skip logic.
    // See the methods above.
    { stream, skip }
  );
};

export { loggerFactory, loggerMiddleware };
