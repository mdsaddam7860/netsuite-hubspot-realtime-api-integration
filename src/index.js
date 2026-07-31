// This file is used to export all the modules and utilities from a single entry point. This way, other parts of the application can import what they need from this file, rather than having to know the specific paths to each module.

//  ---------------------Logger---------------------
import { logger } from "./utils/winston.logger.js";
// ---------------------Configs--------------------------
import { getHSAxios, hubspotClient } from "./configs/hubspot.config.js";
// ---------------------Utilities--------------------------
import {
  Throttle,
  throttle,
  withRetry,
  isRetryableError,
  createRequestExecutor,
} from "./utils/requestExecutor.js";

import {
  isValidEmail,
  shouldUpdateDeal,
  taskProperties,
  needsUpdate,
  needsUpdateJob,
  convertAustralianFormat,
  companyProperties,
  delta,
  currentDate,
  contactProperties,
  dealProperties,
  cleanProps,
  getLastSyncTime,
  saveLastSyncTime,
  taskClient,
  customerQuery,
} from "./utils/helper.util.js";

export {
  customerQuery,
  isValidEmail,
  shouldUpdateDeal,
  taskProperties,
  needsUpdate,
  needsUpdateJob,
  convertAustralianFormat,
  companyProperties,
  delta,
  currentDate,
  contactProperties,
  dealProperties,
  cleanProps,
  getLastSyncTime,
  saveLastSyncTime,
  taskClient,
  logger,
  getHSAxios,
  hubspotClient,
  Throttle,
  throttle,
  withRetry,
  isRetryableError,
  createRequestExecutor,
};
