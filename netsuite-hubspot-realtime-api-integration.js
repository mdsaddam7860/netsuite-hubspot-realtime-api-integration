import "./bootstrap.js";
import app from "./src/app.js";
import fs from "fs";
import { logger } from "./src/index.js";
import { getHubspotClient } from "./src/configs/hubspot.config.js";
import { getNetsuiteClient } from "./src/configs/netsuite.config.js";
import {
  fetchFromNetsuite,
  sync_netsuite_customers_to_hubspot_companies,
  sync_netsuite_customers_to_hubspot_contacts,
} from "./src/services/netsuite.service.js";
import {
  processBatchOfCompanies,
  processBatchOfContacts,
} from "./src/services/hubspot.service.js";
// import { startSchedulers } from "./src/jobs/scheduler.js";
// import { test } from "./src/controllers/webhookController.js";

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
      // startSchedulers();
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

// processBatchOfCompanies([
//   {
//     links: [],
//     billing_address_line_1: "400 Arrow Mines Rd",
//     billing_city: "Mt Pleasant",
//     billing_country: "US",
//     billing_state: "TN",
//     billing_zip: "38474",
//     companyname: "Smelter Service",
//     custentity11: "F",
//     custentity18: "seeder",
//     custentity2: "F",
//     custentity36: "F",
//     custentity_acs_processed: "F",
//     custentity_date_lsa: "5/14/2026",
//     custentity_sp_alt_email: "accountspayable@smelterservice.com",
//     custentity_sp_skid_steer_make: "Bobcat",
//     custentity_sp_skid_steer_model: "S740",
//     dateclosed: "7/26/2023",
//     email: "SAllred@smelterservice.com",
//     entityid: "93953",
//     entitystatus: "13",
//     firstsaledate: "12/9/2022",
//     id: "102425",
//     isinactive: "F",
//     isperson: "F",
//     lastmodifieddate: "5/14/2026",
//     phone: "1 931-374-8859",
//     salesrep_id: "114",
//     salesrep_name: "Tyson Langlie",
//     shipping_address_line_1: "400 Arrow Mines Rd",
//     shipping_city: "Mt Pleasant",
//     shipping_country: "US",
//     shipping_state: "TN",
//     shipping_zip: "38474",
//     stage: "CUSTOMER",
//     taxable: "F",
//     unsubscribe: "T",
//   },
// ]);

// ------------------------------------------------------

// processBatchOfContacts([
//   {
//     links: [],
//     billing_address_line_1: "723 S Lasalle St",
//     billing_city: "Aurora",
//     billing_country: "US",
//     billing_state: "IL",
//     billing_zip: "60505",
//     companyname: "Cbc Bricks Inc.",
//     custentity11: "F",
//     custentity16: "250",
//     custentity2: "F",
//     custentity29: "1",
//     custentity36: "F",
//     custentity_acs_processed: "F",
//     custentity_date_lsa: "6/2/2026",
//     custentity_skidpro_carrier3: "186",
//     custentity_sp_alt_email: "bsupplyplus@gmail.com",
//     custentity_sp_skid_steer_make: "TAX EXEMPT ON FILE",
//     dateclosed: "10/25/2022",
//     email: "jessicag@bricksinc.net",
//     entityid: "51281",
//     entitystatus: "13",
//     firstname: "Kim",
//     firstsaledate: "9/15/2021",
//     id: "56033",
//     isinactive: "F",
//     isperson: "T",
//     lastmodifieddate: "6/2/2026",
//     lastname: "Schmitt",
//     phone: "1 630-730-5164",
//     salesrep_id: "100",
//     salesrep_name: "Chris Wessel",
//     shipping_address_line_1: "723 S Lasalle St",
//     shipping_city: "Aurora",
//     shipping_country: "US",
//     shipping_state: "IL",
//     shipping_zip: "60505",
//     stage: "CUSTOMER",
//     taxable: "F",
//     unsubscribe: "T",
//   },
// ]);
