import "./bootstrap.js";
import app from "./src/app.js";
import fs from "fs";
import { customerQuery, logger } from "./src/index.js";
import { getHubspotClient } from "./src/configs/hubspot.config.js";
import { getNetsuiteClient } from "./src/configs/netsuite.config.js";
import { startSchedulers } from "./src/jobs/scheduler.js";

// ============================================================================
// 0. AUTO-CREATE REQUIRED DIRECTORIES
// ============================================================================
// This replaces the need for "mkdir -p logs checkpoints"
const requiredDirs = ["./logs", "./checkpoints"];
requiredDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Auto-created missing directory: ${dir}`);
  }
});

const PORT = process.env.PORT || 5000;
serverInit();

// sync_netsuite_customers_to_hubspot_contacts();
// sync_netsuite_customers_to_hubspot_companies();
// processHSToNetsuite({ id: "221712997980" }, "contact");

async function init() {
  try {
    // Initialize Hubspot Client
    try {
      logger.info(`Configs Initialization initialized successfully`);
      getHubspotClient();
      getNetsuiteClient();
      startSchedulers();
    } catch (error) {
      logger.error("Error in Configs Initialization:", {
        status: error?.status,
        response: error.response?.data,
        method: error?.method,
        url: error?.config?.url,
        message: error.message,
        stack: error?.stack || error,
      });
    }
  } catch (error) {
    logger.error("Critical startup failure:", {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}
function serverInit() {
  try {
    // Server is up and running

    app.listen(PORT, () => {
      logger.info(`Server running on PORT:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });

    init(); // Initialize other services and forget about them
  } catch (error) {
    logger.error("❌ Critical startup failure:", {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}
