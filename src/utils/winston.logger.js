import { createLogger, format, transports } from "winston";
import "winston-daily-rotate-file";
const { combine, timestamp, printf, errors, colorize, json } = format;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = path.dirname(fileURLToPath(import.meta.url));
const __dirname = path.join(__filename, "../../", "winstonLogs");
if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname);
}

function getDate() {
  const date = new Date();
  return date.toISOString().split("T")[0];
}

// Custom timestamp (12-hour)
const customTimestamp = timestamp({
  format: () =>
    new Date().toLocaleString("en-IN", {
      // timeZone: "UTC", For UTC time, you can uncomment this line
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: true,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
});

const consoleFormat = printf(
  ({ level, message, timestamp, stack, ...meta }) => {
    const metaString =
      meta && Object.keys(meta).length
        ? `\n${JSON.stringify(meta, null, 2)}`
        : "";

    return `[${level}] ${timestamp} - ${stack || message}${metaString}`;
  }
);

const fileFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaString =
    meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";

  return `[${level}] ${timestamp} - ${stack || message}${metaString}`;
});

const productionLogger = () => {
  const Error = new transports.DailyRotateFile({
    filename: "winstonLogs/error-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    level: "error",
    zippedArchive: true,
    maxSize: "10m",
    maxFiles: "28d", // keep 28 days of logs
  });

  const Prod = new transports.DailyRotateFile({
    filename: "winstonLogs/Prod-Combined-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    level: process.env.LOG_LEVEL || "info", // logs info, warn, debug
    zippedArchive: true,
    maxSize: "10m",
    maxFiles: "28d",
  });

  return createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: combine(customTimestamp, errors({ stack: true })),
    defaultMeta: { service: "Netsuite-Hubspot-RealTime-Integrration" },
    transports: [
      Prod, // all logs
      Error, // error-only logs
      new transports.Console({
        format: combine(colorize(), customTimestamp, consoleFormat),
        level: "info",
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
    exceptionHandlers: [
      new transports.DailyRotateFile({
        filename: "winstonLogs/exceptions-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "10m",
        maxFiles: "14d",
        zippedArchive: true,
      }),
    ],
    rejectionHandlers: [
      new transports.DailyRotateFile({
        filename: "winstonLogs/rejections-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "10m",
        maxFiles: "14d",
        zippedArchive: true,
      }),
    ],
  });
};

const developementLogger = function () {
  // const Error = new transports.DailyRotateFile({
  //   filename: "winstonLogs/Dev-Error-%DATE%.log",
  //   datePattern: "YYYY-MM-DD",
  //   level: "error",
  //   zippedArchive: true,
  //   maxSize: "10m",
  //   maxFiles: "28d", // keep 28 days of logs
  // });

  // const Dev = new transports.DailyRotateFile({
  //   filename: "winstonLogs/Dev-Combined-%DATE%.log",
  //   datePattern: "YYYY-MM-DD",
  //   level: process.env.LOG_LEVEL || "info", // logs info, warn, debug
  //   zippedArchive: true,
  //   maxSize: "10m",
  //   maxFiles: "28d",
  // });

  const Dev = new transports.File({
    // filename: `winstonLogs/Dev-Combined-%DATE%.log`,
    filename: `winstonLogs/Dev-Combined-${getDate()}.log`,
    format: fileFormat,
    level: "info",
    maxsize: 50 * 1024 * 1024, // 5MB
    handleExceptions: true,
    handleRejections: true,
  });

  const Console = new transports.Console({
    format: combine(colorize(), customTimestamp, consoleFormat),
    handleExceptions: true,
    handleRejections: true,
  });

  return createLogger({
    level: "info",
    format: combine(
      errors({ stack: true }),
      customTimestamp,
      json() // This ensures the object is stringified for the files
    ),
    // defaultMeta: { service: "Netsuite-Hubspot-RealTime-Integrration" },

    // exceptionHandlers: [
    //   new transports.DailyRotateFile({
    //     filename: "winstonLogs/exceptions-%DATE%.log",
    //     datePattern: "YYYY-MM-DD",
    //     maxSize: "10m",
    //     maxFiles: "14d",
    //     zippedArchive: true,
    //   }),
    // ],

    // rejectionHandlers: [
    //   new transports.DailyRotateFile({
    //     filename: "winstonLogs/rejections-%DATE%.log",
    //     datePattern: "YYYY-MM-DD",
    //     maxSize: "10m",
    //     maxFiles: "14d",
    //     zippedArchive: true,
    //   }),
    // ],
    transports: [
      // Error,
      // Combined,
      Console,
      Dev,
    ],
  });
};

// Select logger based on environment
const logger =
  process.env.NODE_ENV === "production"
    ? productionLogger()
    : developementLogger();
// : createLogger({
//     level: "info",
//     format: combine(customTimestamp, errors({ stack: true })),

//     exceptionHandlers: [
//       new transports.DailyRotateFile({
//         filename: "winstonLogs/exceptions-%DATE%.log",
//         datePattern: "YYYY-MM-DD",
//         maxSize: "10m",
//         maxFiles: "14d",
//         zippedArchive: true,
//       }),
//     ],

//     rejectionHandlers: [
//       new transports.DailyRotateFile({
//         filename: "winstonLogs/rejections-%DATE%.log",
//         datePattern: "YYYY-MM-DD",
//         maxSize: "10m",
//         maxFiles: "14d",
//         zippedArchive: true,
//       }),
//     ],
//     transports: [
//       new transports.Console({
//         format: combine(colorize(), customTimestamp, consoleFormat),
//         handleExceptions: true,
//         handleRejections: true,
//       }),
//       new transports.File({
//         filename: `winstonLogs/development-${getDate()}.log`,
//         format: fileFormat,
//         level: "info",
//         maxsize: 50 * 1024 * 1024, // 5MB
//         handleExceptions: true,
//         handleRejections: true,
//       }),
//     ],
//   });

export { logger };
