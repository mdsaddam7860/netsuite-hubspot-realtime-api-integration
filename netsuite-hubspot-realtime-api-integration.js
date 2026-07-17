import "./bootstrap.js";
import app from "./src/app.js";
import fs from "fs";
import { customerQuery, logger } from "./src/index.js";
import { getHubspotClient } from "./src/configs/hubspot.config.js";
import { getNetsuiteClient } from "./src/configs/netsuite.config.js";
import {
  fetchCustomer,
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
//     billing_address_line_1: "2720 OLD COUNTY ROAD 120 NE",
//     billing_city: "ALEXANDRIA",
//     billing_country: "US",
//     billing_state: "MN",
//     billing_zip: "56308",
//     carrier_machine_2_id: "356",
//     carrier_machine_2_name: "CAT 257D",
//     carrier_machine_3_id: "351",
//     carrier_machine_3_name: "CAT 249D",
//     carrier_machine_id: "362",
//     carrier_machine_name: "CAT 262D",
//     companyname: "Rosengren Lawn Care & Landscpaing",
//     custentity11: "T",
//     custentity2: "F",
//     custentity36: "F",
//     custentity_date_lsa: "11/17/2025",
//     custentity_sp_alt_email: "ryanrosengren@gctel.net",
//     custentity_sp_skid_steer_make: "CAT",
//     custentity_sp_skid_steer_model: "262-C",
//     dateclosed: "10/29/2022",
//     email: "ryanrosengren@gctel.net",
//     entityid: "75094",
//     entitystatus: "13",
//     firstname: "Ryan",
//     firstsaledate: "4/6/2018",
//     id: "82085",
//     isinactive: "F",
//     isperson: "T",
//     lastmodifieddate: "11/17/2025",
//     lastname: "Rosengren",
//     phone: "1 320-815-3217",
//     salesrep_id: "98",
//     salesrep_name: "Erik Gullickson",
//     shipping_address_line_1: "807 MCKAY AVE S",
//     shipping_city: "ALEXANDRIA",
//     shipping_country: "US",
//     shipping_state: "MN",
//     shipping_zip: "56308",
//     stage: "CUSTOMER",
//     taxable: "T",
//     unsubscribe: "T",
//   },
//   // {
//   //   links: [],
//   //   billing_address_line_1: "723 S Lasalle St",
//   //   billing_city: "Aurora",
//   //   billing_country: "US",
//   //   billing_state: "IL",
//   //   billing_zip: "60505",
//   //   companyname: "Cbc Bricks Inc.",
//   //   custentity11: "F",
//   //   custentity16: "250",
//   //   custentity2: "F",
//   //   custentity29: "1",
//   //   custentity36: "F",
//   //   custentity_acs_processed: "F",
//   //   custentity_date_lsa: "6/2/2026",
//   //   custentity_skidpro_carrier3: "186",
//   //   custentity_sp_alt_email: "bsupplyplus@gmail.com",
//   //   custentity_sp_skid_steer_make: "TAX EXEMPT ON FILE",
//   //   dateclosed: "10/25/2022",
//   //   email: "jessicag@bricksinc.net",
//   //   entityid: "51281",
//   //   entitystatus: "13",
//   //   firstname: "Kim",
//   //   firstsaledate: "9/15/2021",
//   //   id: "56033",
//   //   isinactive: "F",
//   //   isperson: "T",
//   //   lastmodifieddate: "6/2/2026",
//   //   lastname: "Schmitt",
//   //   phone: "1 630-730-5164",
//   //   salesrep_id: "100",
//   //   salesrep_name: "Chris Wessel",
//   //   shipping_address_line_1: "723 S Lasalle St",
//   //   shipping_city: "Aurora",
//   //   shipping_country: "US",
//   //   shipping_state: "IL",
//   //   shipping_zip: "60505",
//   //   stage: "CUSTOMER",
//   //   taxable: "F",
//   //   unsubscribe: "T",
//   // },
// ]);

// --------------------------------------------------
// processBatchOfContacts([
//   {
//     links: [],
//     billing_address_line_1: "TBD",
//     billing_city: "ALEXANDRIA",
//     billing_country: "US",
//     billing_state: "MN",
//     billing_zip: "56308",
//     companyname: "Upper Deck Construction",
//     custentity11: "F",
//     custentity2: "F",
//     custentity36: "F",
//     custentity_acs_processed: "F",
//     custentity_date_lsa: "4/17/2024",
//     email: "rey.upperdeckconstruction@gmail.com",
//     entityid: "1288927794",
//     entitystatus: "10",
//     firstname: "Rey",
//     id: "1147194",
//     isinactive: "F",
//     isperson: "T",
//     lastmodifieddate: "7/21/2025",
//     lastname: "Fuglestad",
//     phone: "1 320-491-9047",
//     salesrep_id: "114",
//     salesrep_name: "Tyson Langlie",
//     shipping_address_line_1: "807 MCKAY AVE S",
//     shipping_city: "ALEXANDRIA",
//     shipping_country: "US",
//     shipping_state: "MN",
//     shipping_zip: "56308",
//     stage: "PROSPECT",
//     taxable: "T",
//     unsubscribe: "T",
//   },
// ]);

const query = `
    SELECT
        -- Core Identification
        c.id,
        c.entityid,
        c.companyname,
        c.firstname,
        c.lastname,
        c.email,
        c.phone,
        c.mobilephone,
        c.isperson,
        c.isinactive,
        c.custentity_sp_alt_email,
        c.custentity31,
        c.custentity32,
        c.custentity33,
        c.custentity34,
        c.custentity35,

        -- Equipment & Machine Info
        -- c.custentity_skidpro_carrier_machine,
        -- c.custentity16,
        -- c.custentity_skidpro_carrier3,
        -- c.custentity_skidpro_carrier4,
        c.custentity4,
        c.custentity5,
        c.custentity_sp_skid_steer_model,
        c.custentity_sp_skid_steer_make,
        -- c.custentity29,
        c.custentity18,
        c.custentity27,

        c.custentity_skidpro_carrier_machine AS carrier_machine_id,
        BUILTIN.DF(c.custentity_skidpro_carrier_machine) AS carrier_machine_name, -- This will output machine type"

        c.custentity29,
        BUILTIN.DF(c.custentity29) AS carrier_machine_type, -- This will output machine type"

        c.custentity16 AS carrier_machine_2_id,
        BUILTIN.DF(c.custentity16) AS carrier_machine_2_name, -- This will output "CAT 257D"

        c.custentity_skidpro_carrier3 AS carrier_machine_3_id,
        BUILTIN.DF(c.custentity_skidpro_carrier3) AS carrier_machine_3_name, -- This will output "CAT 249D"

        c.custentity_skidpro_carrier4,
        BUILTIN.DF(c.custentity_skidpro_carrier4) AS carrier_machine_4_name,

        -- Sales & Ownership
        BUILTIN.DF(c.salesrep) AS salesrep_name,
        c.salesrep AS salesrep_id,

        -- Verified Custom Fields (Found in JSON)
        c.custentity2,
        c.custentity11,
        c.custentity36,
        c.custentity_date_lsa,
        c.custentity_acs_processed,

        -- Status & Lifecycle (Verified from JSON) Issue is here
        c.entitystatus,
        BUILTIN.DF(c.entitystatus) AS ns_status,
        c.stage,
        c.lastmodifieddate,
        c.dateclosed,
        c.firstsaledate,

        -- Lead Source & Marketing
        c.custentity1,
        c.custentity2,
        c.custentity28,

        -- Communication Preferences & Financial
        c.custentity11,
        c.unsubscribe,
        c.custentity36,
        c.taxable,

        -- Sales Activity and Engagement
        c.custentity_date_lsa,

        -- Address Fields (Via Joins)
        bill_addr.addr1 AS billing_address_line_1,
        bill_addr.addr2 AS billing_address_line_2,
        bill_addr.city AS billing_city,
        bill_addr.state AS billing_state,
        bill_addr.zip AS billing_zip,
        bill_addr.country AS billing_country,
        ship_addr.addr1 AS shipping_address_line_1,
        ship_addr.addr2 AS shipping_address_line_2,
        ship_addr.city AS shipping_city,
        ship_addr.state AS shipping_state,
        ship_addr.zip AS shipping_zip,
        ship_addr.country AS shipping_country
    FROM customer c
    LEFT JOIN customeraddressbookentityaddress bill_addr
        ON c.defaultbillingaddress = bill_addr.nkey
    LEFT JOIN customeraddressbookentityaddress ship_addr
        ON c.defaultshippingaddress = ship_addr.nkey
    WHERE c.isinactive = 'F'
     AND isperson = 'F'     
    `;

// AND c.id = '82085'
// fetchFromNetsuite(query, 10);

const statusQuery = `
  SELECT *
  FROM
    entitystatus
`;

// // Fetch up to 100 statuses to ensure you get the complete mapping table
fetchFromNetsuite(statusQuery, 100);
// fetchCustomer("companyname", "Rosengren Lawn Care & Landscpaing");

// processBatchOfCompanies([
//   {
//     links: [],
//     billing_address_line_1: "TBD",
//     billing_city: "ALEXANDRIA",
//     billing_country: "US",
//     billing_state: "MN",
//     billing_zip: "56308",
//     companyname: "Upper Deck Construction",
//     custentity11: "F",
//     custentity2: "F",
//     custentity36: "F",
//     custentity_acs_processed: "F",
//     custentity_date_lsa: "4/17/2024",
//     email: "rey.upperdeckconstruction@gmail.com",
//     entityid: "1288927794",
//     entitystatus: "10",
//     firstname: "Rey",
//     id: "1147194",
//     isinactive: "F",
//     isperson: "T",
//     lastmodifieddate: "7/21/2025",
//     lastname: "Fuglestad",
//     phone: "1 320-491-9047",
//     salesrep_id: "114",
//     salesrep_name: "Tyson Langlie",
//     shipping_address_line_1: "807 MCKAY AVE S",
//     shipping_city: "ALEXANDRIA",
//     shipping_country: "US",
//     shipping_state: "MN",
//     shipping_zip: "56308",
//     stage: "PROSPECT",
//     taxable: "T",
//     unsubscribe: "T",
//   },
// ]);

/*!SECTION
 {
    links: [],
    billing_address_line_1: "2720 OLD COUNTY ROAD 120 NE",
    billing_city: "ALEXANDRIA",
    billing_country: "US",
    billing_state: "MN",
    billing_zip: "56308",
    companyname: "Rosengren Lawn Care & Landscpaing",
    custentity11: "T",
    custentity16: "356",
    custentity2: "F",
    custentity36: "F",
    custentity_date_lsa: "11/17/2025",
    custentity_skidpro_carrier3: "351",
    custentity_sp_alt_email: "ryanrosengren@gctel.net",
    custentity_sp_skid_steer_make: "CAT",
    custentity_sp_skid_steer_model: "262-C",
    dateclosed: "10/29/2022",
    email: "ryanrosengren@gctel.net",
    entityid: "75094",
    entitystatus: "13",
    firstname: "Ryan",
    firstsaledate: "4/6/2018",
    id: "82085",
    isinactive: "F",
    isperson: "T",
    lastmodifieddate: "11/17/2025",
    lastname: "Rosengren",
    phone: "1 320-815-3217",
    salesrep_id: "98",
    salesrep_name: "Erik Gullickson",
    shipping_address_line_1: "807 MCKAY AVE S",
    shipping_city: "ALEXANDRIA",
    shipping_country: "US",
    shipping_state: "MN",
    shipping_zip: "56308",
    stage: "CUSTOMER",
    taxable: "T",
    unsubscribe: "T",
  },

*/
