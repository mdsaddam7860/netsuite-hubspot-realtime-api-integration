/**
 * jobs/scheduler.js
 * Manages all internal cron jobs for the application.
 */
import { logger } from "../index.js";
import cron from "node-cron";
import { runProductSync } from "../../sync_products.js";

const schedulerFreq = "*/1 * * * *";

export function startSchedulers() {
  logger.info(
    `Initializing product sync background jobs, schedulerFreq : ${schedulerFreq}...`
  );
  // Schedule: '0 * * * *' (Every hour on the hour)
  // Tip: Change to '*/2 * * * *' to run every 2 minutes while testing!
  cron.schedule(schedulerFreq, async () => {
    logger.info(
      `\n⏰ [CRON] Triggered hourly batch Product sync: ${new Date().toISOString()}`
    );
    try {
      // Run the batch sync incrementally (false = not a full sync)
      await runProductSync(false);
    } catch (error) {
      logger.error(`[CRON] Product batch sync failed:`, error.message);
    }
  });
}
