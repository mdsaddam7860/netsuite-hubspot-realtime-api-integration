/**
 * jobs/scheduler.js
 * Manages all internal cron jobs for the application.
 */
import { logger } from "../index.js";
import cron from "node-cron";
import { runProductSync } from "../../sync_products.js";
import { netsuiteToHubspot } from "../services/netsuite.service.js";

const schedulerFreq = "*/1 * * * *";
// const schedulerFreq = "0 */6 * * *";

export function startSchedulers() {
  logger.info(
    `Initializing product sync background jobs, schedulerFreq : ${schedulerFreq}...`
  );
  // Schedule: '0 * * * *' (Every hour on the hour)
  // Tip: Change to '*/2 * * * *' to run every 2 minutes while testing!
  cron.schedule(schedulerFreq, async () => {
    logger.info(
      `\n [CRON] Triggered hourly batch Product sync: ${new Date().toISOString()}`
    );
    try {
      // Run the batch sync incrementally (false = not a full sync)
      // await runProductSync(false);
      await netsuiteToHubspot(); // Sync Customer as Contact/Company to HubSpot
    } catch (error) {
      logger.error(`[CRON] netsuiteToHubspot batch sync failed:`, {
        status: error?.status,
        url: error?.config?.url,
        message: error.message,
        method: error?.method,
        stack: error?.stack || error,
      });
    }
  });
}
