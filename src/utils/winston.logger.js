import { createLogger, format, transports } from "winston";
import "winston-daily-rotate-file";

const { combine, timestamp, printf, errors, colorize } = format;

// Custom timestamp (12-hour)
const customTimestamp = timestamp({
  format: () =>
    new Date().toLocaleString("en-IN", {
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
  const dailyError = new transports.DailyRotateFile({
    filename: "logs/error-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    level: "error",
    zippedArchive: true,
    maxSize: "10m",
    maxFiles: "28d", // keep 28 days of logs
  });

  const dailyCombined = new transports.DailyRotateFile({
    filename: "logs/combined-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    level: process.env.LOG_LEVEL || "info", // logs info, warn, debug
    zippedArchive: true,
    maxSize: "10m",
    maxFiles: "28d",
  });

  return createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: combine(customTimestamp, errors({ stack: true })),
    defaultMeta: { service: "openphone-service" },
    transports: [
      dailyCombined, // all logs
      dailyError, // error-only logs
      new transports.Console({
        format: combine(colorize(), customTimestamp, consoleFormat),
        level: "info",
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
    exceptionHandlers: [
      new transports.DailyRotateFile({
        filename: "logs/exceptions-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "10m",
        maxFiles: "14d",
        zippedArchive: true,
      }),
    ],
    rejectionHandlers: [
      new transports.DailyRotateFile({
        filename: "logs/rejections-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "10m",
        maxFiles: "14d",
        zippedArchive: true,
      }),
    ],
  });
};

// Select logger based on environment
const logger =
  process.env.NODE_ENV === "production"
    ? productionLogger()
    : createLogger({
        level: "info",
        format: combine(customTimestamp, errors({ stack: true })),
        transports: [
          new transports.Console({
            format: combine(colorize(), customTimestamp, consoleFormat),
            handleExceptions: true,
            handleRejections: true,
          }),
          new transports.File({
            filename: "logs/development.log",
            format: fileFormat,
            level: "info",
            maxsize: 5 * 1024 * 1024, // 5MB
            handleExceptions: true,
            handleRejections: true,
          }),
        ],
      });

export { logger };

/**
 * Method to use logger for handling error
 * 
 * logger.error("HubSpot Axios error", {
        status: "HubSpot Axios error",
        response: "HubSpot Axios error",
        method: "HubSpot Axios error",
        url: "HubSpot Axios error",
        headers: "HubSpot Axios error",
      });

      Working example
      logger.error("HubSpot Axios error", {
      status: error.response?.status,
      response: error.response?.data,
      method: error.config?.method,
      url: error.config?.url,
      headers: error.config?.headers,
    });
 */

/*!SECTION

    import { createLogger, format, transports } from "winston";
import "winston-daily-rotate-file";

const { combine, timestamp, printf, errors, colorize } = format;

// Custom Timestamp
const customTimestamp = timestamp({
  format: () =>
    new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: true,
    }),
});

// Formatting Logic
const consoleFormat = printf(
  ({ level, message, timestamp, stack, ...meta }) => {
    const metaData = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : "";
    return `${timestamp} [${level}]: ${stack || message}${metaData}`;
  }
);

const fileFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaData = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} [${level}]: ${stack || message}${metaData}`;
});

// Production Logger (Daily Rotation)
const productionLogger = () => {
  return createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: combine(customTimestamp, errors({ stack: true })),
    defaultMeta: { service: "serviceM8-hubspot-integration" },
    transports: [
      new transports.DailyRotateFile({
        filename: "logs/prod-combined-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "28d",
        format: fileFormat,
      }),
      new transports.DailyRotateFile({
        level: "error",
        filename: "logs/prod-error-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "28d",
        format: fileFormat,
      }),
      new transports.Console({
        level: "info",
        format: combine(colorize(), consoleFormat),
      }),
    ],
  });
};

// Development Logger (Standard Files with Split Logic)
const developmentLogger = () => {
  return createLogger({
    level: "debug", // Capture everything down to debug in dev
    format: combine(customTimestamp, errors({ stack: true })),
    transports: [
      // 1. Console for real-time feedback
      // new transports.Console({
      //   format: combine(colorize(), consoleFormat),
      //   level: "error",
      //   handleExceptions: true,
      //   handleRejections: true,
      // }),
      // 2. Combined file for ALL logs (debug, info, warn, error)
      new transports.File({
        filename: "logs/invoice.log",
        format: fileFormat,
        maxsize: 50 * 1024 * 1024, // 150MB
      }),
      // 3. Separate file for ONLY errors
      new transports.File({
        filename: "logs/invoice-error.log",
        level: "error",
        format: fileFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
      }),
    ],
  });
};

const logger =
  process.env.NODE_ENV === "production"
    ? productionLogger()
    : developmentLogger();

export { logger };


    */
