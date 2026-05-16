// --------------------Local Imports --------------------------
import { companyProperties, contactProperties, logger } from "../index.js";

// -----------------------Config Imports-----------------------
import { getNetsuiteClient } from "../configs/netsuite.config.js";
import { getHubspotClient } from "../configs/hubspot.config.js";
// -----------------------Executor Imports-----------------------
import { hubspotExecutor, netsuiteExecutor } from "../utils/executors.js";
// -----------------------Service Imports-----------------------
import { runSuiteQL } from "../services/suiteql.js"; // Update with your actual filename
// -----------------------OAuth CLient Imports-----------------------
import { oauthRequest } from "./auth/netsuiteOAuthClient.js";
// -----------------------Hubspot Imports-----------------------
import {
  processBatchOfCustomers,
  upsertCompanyInHubspot,
  upsertContactInHubspot,
} from "./hubspot.service.js";

import {
  mapToNetSuitePerson,
  mapToNetSuiteCompany,
} from "../mapping/hubspot-netsuite.mapping.js";

// import { companyProperties } from "../utils/helper.util.js";
//------------------------Mappings Functions --------------------------
// import {
//   hubspotDealToNetsuiteInvoiceMapping,
//   getlineItemPayload,
// } from "../mappings/hubspot-netsuite.mapping.js";

// ------------------------HubspotServices Functions --------------------------
// import {
//   fetchHubSpotAssociationIds,
//   fetchHubspotObject,
// } from "./hubspot.service.js";

async function* netsuiteGenerator(endpoint, limit = 1, offset = 1) {
  try {
    const client = getNetsuiteClient();
    // const limit = 100;
    // let offset = 0;
    let hasMore = true;
    let pageCount = 0;
    let totalProcessed = 0;
    const startTime = Date.now();

    do {
      pageCount++;
      const response = await netsuiteExecutor(
        () =>
          client.get(endpoint, {
            params: { limit, offset },
          }),
        { name: "Netsuite Generator", endpoint }
      );

      const records = response.data?.items || [];
      totalProcessed += records.length;
      const elapsedSeconds = (Date.now() - startTime) / 1000;

      yield {
        records,
        stats: {
          page: pageCount,
          totalProcessed,
          recordsPerSecond:
            elapsedSeconds > 0
              ? (totalProcessed / elapsedSeconds).toFixed(2)
              : "0.00",
        },
      };
      offset += limit;
      hasMore = response.data?.hasMore;
    } while (hasMore);
  } catch (error) {
    logger.error(" Critical startup failure:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
  }
}

async function syncNetsuiteInvoiceToHubspot() {
  try {
    // get invoice stream from invoice endpoint
    const endpoint = "/services/rest/record/v1/invoice";
    const invoiceStream = netsuiteGenerator(endpoint, 100, 100);
    for await (const { records, stats } of invoiceStream) {
      logger.info(
        `[Netsuite Progress] Processing Invoices: ${
          records.length
        } : ${JSON.stringify(records[0], null, 2)}`
      );
      logger.info(`[Netsuite Progress] ${endpoint}`, {
        page: stats.page,
        processed: stats.totalProcessed,
        speed: `${stats.recordsPerSecond} rec/sec`,
      });
      return; // TODO Remove after testing
    }
  } catch (error) {
    logger.error(" Critical startup failure:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
  }
}
async function syncNetsuiteCustomerToHubspot() {
  try {
    // get invoice stream from invoice endpoint
    const endpoint = "/services/rest/record/v1/customer";
    const invoiceStream = netsuiteGenerator(endpoint, 100, 100);
    for await (const { records, stats } of invoiceStream) {
      logger.info(
        `[Netsuite Progress] Processing Customers: ${
          records.length
        } : ${JSON.stringify(records[0], null, 2)}`
      );

      logger.info(`[Netsuite Progress] ${endpoint}`, {
        page: stats.page,
        processed: stats.totalProcessed,
        speed: `${stats.recordsPerSecond} rec/sec`,
      });
      return; // TODO Remove after testing
    }
  } catch (error) {
    logger.error(" Critical startup failure:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
  }
}

/**
 * Creates an Invoice in NetSuite via REST API
 * @param {Object} invoiceData - The invoice object containing entity, department, and items
 * @returns {Promise<Object>} - The NetSuite API response
 */
async function createNetSuiteInvoice(payload) {
  try {
    const client = getNetsuiteClient();

    // Log the payload for debugging
    logger.info(`Payload: ${JSON.stringify(payload, null, 2)}`);

    // The endpoint based on your CURL call
    const endpoint = "/services/rest/record/v1/invoice";

    const response = await client.post(endpoint, payload, {
      headers: {
        Prefer: "return=representation",
      },
    });

    logger.info("Invoice Created Successfully:", response?.data?.id);
    logger.info(
      `Invoice Created Successfully: ${JSON.stringify(response?.data)}`
    );
    logger.info(
      `Invoice Created Successfully: ${JSON.stringify(
        response?.headers,
        null,
        2
      )}`
    );
    return response?.data;
  } catch (error) {
    // Log detailed error for debugging (NetSuite provides detailed error objects)
    logger.error(
      "NetSuite Invoice Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Example Usage:

// createNetSuiteInvoice(myInvoice);

async function upsertInvoiceInNetsuite(
  record,
  lineItems = [
    {
      item: {
        id: "182",
      },
      quantity: 1,
      rate: 139,
      custcol_agency_mf_flight_start_date: "2026-03-06",
      custcol_agency_mf_flight_end_date: "2026-03-10",
    },
  ]
) {
  try {
    // search invoice in netsuite by deal id
    // if exist update else create
    let payload = hubspotDealToNetsuiteInvoiceMapping(record);

    lineItems.map((item) => {
      const lineItemPayload = getlineItemPayload(item);
      payload.item.items.push(lineItemPayload);
    });

    // payload.item.items = lineItems;

    logger.info(`Payload: ${JSON.stringify(payload, null, 2)}`);
    return;
    return await createNetSuiteInvoice(payload);
  } catch (error) {
    logger.error(" Critical startup failure:", {
      httpStatus: error?.status,
      message: error.message,
      data: error.response?.data,
      stack: error?.stack,
    });
  }
}

async function* netsuiteGeneratorFunction(query, limit = 10, offset = 0) {
  let allRecords = [];
  let hasMore = true;
  let pageCount = 0;
  let totalProcessed = 0;

  logger.info("Starting NetSuite customer extraction...");
  const startTime = Date.now();

  try {
    while (hasMore) {
      pageCount++;
      // Call your wrapper
      const response = await runSuiteQL(query, { limit, offset });

      // NetSuite returns the rows inside the 'items' array
      const records = response.items || [];
      // allRecords.push(...records);
      totalProcessed += records.length;

      // logger.info(
      //   `Fetched ${records.length} records... (Total: ${
      //     allRecords.length
      //   }) | ${JSON.stringify(allRecords[allRecords.length - 1], null, 2)}`
      // );
      const elapsedSeconds = (Date.now() - startTime) / 1000;

      yield {
        records,
        stats: {
          page: pageCount,
          totalProcessed,
          recordsPerSecond:
            elapsedSeconds > 0
              ? (totalProcessed / elapsedSeconds).toFixed(2)
              : "0.00",
        },
      };

      // Check if there is another page
      hasMore = response.hasMore;

      if (hasMore) {
        offset += limit;
      }
    }

    logger.info(
      `Extraction complete. Total active customers: ${allRecords.length}`
    );

    // TODO: Pass allCustomers array to your HubSpot mapping function
    // return allRecords;
  } catch (error) {
    logger.error("Failed to execute SuiteQL:", {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}

/**
 * Generically fetches records from NetSuite using SuiteQL with pagination.
 * Yields records page-by-page to keep memory usage low.
 *
 * @param {string} query - The SuiteQL query string.
 * @param {Object} [options] - Optional configurations.
 * @param {number} [options.limit=100] - Number of records to fetch per page.
 * @param {Object} [options.logger=console] - Logger instance.
 * @returns {AsyncGenerator<{records: Array, stats: Object}>}
 */
async function* fetchSuiteQLPaged(query, options = {}) {
  const limit = options.limit || 100;
  const logger = options.logger || console;

  let hasMore = true;
  let offset = 0;
  let pageCount = 0;
  let totalProcessed = 0;

  // Track start time for the throughput stats
  const startTime = Date.now();

  logger.info("Starting NetSuite data extraction via generic SuiteQL pager...");

  try {
    while (hasMore) {
      pageCount++;

      // Execute the query using your existing wrapper
      const response = await runSuiteQL(query, { limit, offset });

      // Handle cases where response or items might be missing safely
      const records = response?.items || [];
      totalProcessed += records.length;

      // Calculate elapsed time for records-per-second metric
      const elapsedSeconds = (Date.now() - startTime) / 1000;

      yield {
        records,
        stats: {
          page: pageCount,
          totalProcessed,
          recordsPerSecond:
            elapsedSeconds > 0
              ? (totalProcessed / elapsedSeconds).toFixed(2)
              : "0.00",
          elapsedSeconds: elapsedSeconds.toFixed(1),
        },
      };

      // Check if NetSuite indicates there are more pages
      hasMore = !!response?.hasMore;

      if (hasMore) {
        offset += limit;
      }
    }

    logger.info(
      `Extraction complete. Total records processed: ${totalProcessed}`
    );
  } catch (error) {
    logger.error("Failed to execute generic SuiteQL paging:", {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
    throw error; // Re-throw so the calling function knows something went wrong
  }
}
async function fetchAllActiveCustomers(query) {
  let allCustomers = [];
  let hasMore = true;
  let offset = 0;
  let pageCount = 0;
  let totalProcessed = 0;
  const limit = 1; // Match the limit in your wrapper

  logger.info("Starting NetSuite customer extraction...");

  try {
    while (hasMore) {
      pageCount++;
      // Call your wrapper
      const response = await runSuiteQL(query, { limit, offset });

      // NetSuite returns the rows inside the 'items' array
      const records = response.items || [];
      allCustomers.push(...records);

      return allCustomers; // TODO remove after testing
      totalProcessed += records.length;

      // logger.info(
      //   `Fetched ${records.length} records... (Total: ${
      //     allCustomers.length
      //   }) | ${JSON.stringify(allCustomers[allCustomers.length - 1], null, 2)}`
      // );

      // yield {
      //   records,
      //   stats: {
      //     page: pageCount,
      //     totalProcessed,
      //     recordsPerSecond:
      //       elapsedSeconds > 0
      //         ? (totalProcessed / elapsedSeconds).toFixed(2)
      //         : "0.00",
      //   },
      // };

      // Check if there is another page
      hasMore = response.hasMore;

      if (hasMore) {
        offset += limit;
      }
    }

    logger.info(
      `Extraction complete. Total active customers: ${allCustomers.length}`
    );

    // TODO: Pass allCustomers array to your HubSpot mapping function
    return allCustomers;
  } catch (error) {
    logger.error("Failed to execute SuiteQL:", {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}

/**
 * Creates or Updates a customer in NetSuite
 * @param {Object} mappedPayload - The JSON payload formatted for NetSuite
 * @param {string} [netsuiteId] - The internal ID if updating (leave null to create)
 */
async function upsertNetSuiteCustomer(mappedPayload, netsuiteId = null) {
  // You'll need to define NETSUITE_BASE_URL in your .env
  const baseUrl = process.env.NETSUITE_BASE_URL?.replace(/\/+$/, "");
  const basePath = "/services/rest/record/v1/customer";

  try {
    if (netsuiteId) {
      // UPDATE: Use PATCH
      const url = `${baseUrl}${basePath}/${netsuiteId}`;
      logger.info(`Updating NetSuite Customer [${netsuiteId}]...`);

      await oauthRequest("PATCH", url, mappedPayload);

      return {
        success: true,
        action: "updated",
        netsuiteId: netsuiteId,
      };
    } else {
      // CREATE: Use POST
      const url = `${baseUrl}${basePath}`;
      logger.info("Creating new NetSuite Customer...");

      // Note: Depending on how your axios wrapper is configured,
      // you may need to expose the full response object to grab the Location header
      // to extract the newly created ID.
      await oauthRequest("POST", url, mappedPayload);

      return {
        success: true,
        action: "created",
      };
    }
  } catch (error) {
    logger.error("NetSuite Customer Upsert Failed:", error.message);
    throw error;
  }
}

/**
 * Fetches a single active customer from NetSuite by their internal ID.
 * @param {string|number} customerId - The NetSuite internal ID of the customer.
 * @returns {Promise<Object|null>} The customer record object, or null if not found.
 */
async function fetchCustomerById(customerId) {
  if (!customerId) {
    logger.warn("customerId is empty");
    return;
  }
  // Update the query to filter by the specific ID
  // SELECT id, companyname, firstname, lastname, email, phone, isperson
  const query = `
    SELECT *
    FROM customer 
    WHERE id = '${customerId}' 
      AND isinactive = 'F'
  `;

  logger.info(`Fetching NetSuite customer with ID: ${customerId}...`);

  try {
    // We only need 1 record, so limit = 1 and offset = 0
    const response = await runSuiteQL(query, { limit: 1, offset: 0 });

    const records = response.items || [];

    // Check if the customer actually exists
    if (records.length === 0) {
      logger.warn(`⏭️ No active customer found with ID: ${customerId}`);
      return null;
    }

    const customer = records[0];
    logger.info(
      `Successfully fetched customer: ${JSON.stringify(
        response.items,
        null,
        2
      )}`
    );

    return customer;
  } catch (error) {
    logger.error(` Failed to fetch customer ${customerId}:`, error.message);
    // It's usually best to throw the error so the caller (like your webhook handler) can catch it
    throw error;
  }
}
async function fetchCustomer(customKey, customValue) {
  if (!customKey || !customValue) {
    logger.warn("field or value is empty");
    return;
  }
  // Update the query to filter by the specific ID
  // SELECT id, companyname, firstname, lastname, email, phone, isperson
  const query = `
    SELECT *
    FROM customer 
    WHERE ${customKey} = '${customValue}' 
      AND isPerson = 'F'
    `;
  // -- AND isinactive = 'F'

  // logger.info(`Fetching NetSuite customer with ID: ${customerId}...`);

  try {
    // We only need 1 record, so limit = 1 and offset = 0
    const response = await runSuiteQL(query, { limit: 1, offset: 0 });

    const records = response.items || [];

    // Check if the customer actually exists
    if (records.length === 0) {
      logger.warn(`No active customer found with value: ${customValue}`);
      return null;
    }

    // const customer = records[0];
    logger.info(
      `Successfully fetched customer: ${JSON.stringify(
        response.items,
        null,
        2
      )}`
    );

    return records;
  } catch (error) {
    logger.error(` Failed to fetch customer :`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
    // It's usually best to throw the error so the caller (like your webhook handler) can catch it
    throw error;
  }
}
//   const query = `
//   SELECT
//   nkey,
//   addr1,
//   addr2,
//   city,
//   state,
//   zip,
//   country
// FROM customeraddressbookentityaddress
// WHERE nkey = '427140'
// `;
async function fetchObjectFromNetsuite(table, customKey, customValue) {
  if (!customKey || !customValue) {
    logger.warn("field or value is empty");
    return;
  }
  // FROM ${table}
  // WHERE ${customKey} = '${customValue}'

  const query = `
    SELECT 
        c.*,
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
    FROM ${table} c
    LEFT JOIN customeraddressbookentityaddress bill_addr 
        ON c.defaultbillingaddress = bill_addr.nkey
    LEFT JOIN customeraddressbookentityaddress ship_addr 
        ON c.defaultshippingaddress = ship_addr.nkey
    WHERE ${customKey} = '${customValue}'
`;

  // AND isinactive = 'F'

  try {
    // We only need 1 record, so limit = 1 and offset = 0
    const response = await runSuiteQL(query, { limit: 1, offset: 0 });

    const records = response.items || [];

    // Check if the customer actually exists
    if (records.length === 0) {
      logger.warn(`No active customer found with value: ${customValue}`);
      return null;
    }

    const customer = records[0];
    logger.info(
      `Successfully fetched customer: ${JSON.stringify(
        response.items,
        null,
        2
      )}`
    );

    return customer;
  } catch (error) {
    logger.error(` Failed to fetch customer:`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
    // It's usually best to throw the error so the caller (like your webhook handler) can catch it
    throw error;
  }
}
async function fetchFromNetsuite(query, limit = 1, offset = 0) {
  if (!query) {
    logger.warn(`Query is empty : ${query}`);
    return;
  }

  try {
    // We only need 1 record, so limit = 1 and offset = 0
    const response = await runSuiteQL(query, { limit, offset });

    const records = response.items || [];

    // Check if the customer actually exists
    if (records.length === 0) {
      logger.warn(`No Record found for Query: ${query}`);
      return null;
    }

    logger.info(`Resords found: ${JSON.stringify(records, null, 2)}`);

    // const res = records[0];
    // logger.info(
    //   `Successfully fetched customer: ${JSON.stringify(
    //     response.items,
    //     null,
    //     2
    //   )}`
    // );

    return response;
  } catch (error) {
    logger.error(` Failed to fetch Record:`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
    // It's usually best to throw the error so the caller (like your webhook handler) can catch it
    throw error;
  }
}

async function processCustomers() {
  try {
    const customerStream = fetchAllActiveCustomers();

    for await (const [records, stats] of customerStream) {
      try {
        await processBatchOfCustomers(records); // Implement this function to handle the batch processing logic

        logger.info(`[Netsuite-Hubspot Progress] `, {
          page: stats.page,
          processed: stats.totalProcessed,
          speed: `${stats.recordsPerSecond} rec/sec`,
        });

        return;
      } catch (error) {
        logger.error(`Error processing customers`, {
          status: error?.status,
          response: error.response?.data,
          method: error?.method,
          url: error?.config?.url,
          message: error.message,
          stack: error?.stack || error,
        });
      }
    }
  } catch (error) {
    logger.error(`Error processing customers`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}

async function processHSToNetsuite(sourceData, type) {
  if (!sourceData || !type) {
    logger.warn(
      `sourceData : ${JSON.stringify(sourceData)} or type : ${type} is empty`
    );
    return;
  }
  try {
    // find customer details by ID (if provided) and get full details from hubspot before pushing to NetSuite. This ensures we always have the most up-to-date data and can handle cases where HubSpot might not send all fields in the webhook payload.

    const hs_client = getHubspotClient();

    // check type
    if (type === "contact" && sourceData?.id) {
      const hs_contact = await hs_client.contacts.getContact(
        sourceData.id,
        contactProperties()
      );

      console.log("Contact", hs_contact);
      let sourceId = null;
      if (hs_contact) {
        sourceId = hs_contact?.properties?.sourceid;
      }

      const payload = mapToNetSuitePerson(hs_contact?.properties);

      console.log("Payload", payload);

      // Insert as Contact in NetSuite
      const netsuiteCustomer = await upsertNetSuiteCustomer(payload, sourceId);
      logger.info(
        `NetSuite Customer: ${JSON.stringify(netsuiteCustomer, null, 2)}`
      );

      if (!sourceId && netsuiteCustomer?.netsuiteId) {
        // Update Contact
        const HSContactUpdate = await hs_client.contacts.updateContact(
          sourceData.id,
          {
            // properties: {
            sourceid: netsuiteCustomer.netsuiteId,
            // },
          }
        );

        logger.info(
          `Hubspot Contact Updated Successfully: ${JSON.stringify(
            HSContactUpdate,
            null,
            2
          )}`
        );
      }
    } else if (type === "company" && sourceData?.id) {
      const hs_company = await hs_client.companies.getCompany(
        sourceData?.id,
        companyProperties()
      );

      console.log("hs_company", hs_company);

      let sourceId = null;
      if (hs_company) {
        sourceId = hs_company?.properties?.sourceid;
      }

      const payload = mapToNetSuiteCompany(hs_company?.properties);

      console.log("payload", payload);

      // Insert as Contact in NetSuite
      const netsuiteCustomer = await upsertNetSuiteCustomer(payload, sourceId);
      logger.info(
        `NetSuite Customer: ${JSON.stringify(netsuiteCustomer, null, 2)}`
      );

      if (!sourceId && netsuiteCustomer?.netsuiteId) {
        // Update Contact
        await hs_client.companies.updateCompany(sourceData.id, {
          // properties: {
          sourceid: netsuiteCustomer.netsuiteId,
          // },
        });
      }
    }
  } catch (error) {
    logger.error(`Error processing customers:processHSToNetsuite`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}

async function sync_netsuite_customers_to_hubspot_companies_and_contacts() {
  try {
    // const query = `SELECT *
    // FROM customer
    // WHERE isinactive = 'F'
    //   AND lastmodifieddate > TO_DATE('2026-05-14', 'YYYY-MM-DD')`;

    /*Errors


    -- c.lasttsaledate, NetSuite error 400: {"type":"https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.1","title":"Bad Request","status":4


    -- c.custentity_skidpro_carrier_machineA24:D24
     NetSuite error 400: {"type":"https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.1","title":"Bad Request","status":400,"o:errorDetails":[{"detail":"Invalid search query. Detailed unprocessed description follows. Invalid search type: Email.","o:errorQueryParam":"q","o:errorCode":"INVALID_PARAMETER"}]}

    */

    const targetDate = "2026-05-10"; // Can be calculated programmatically

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
        -- c.custentity_skidpro_carrier_machineA24:D24
        c.custentity16,
        c.custentity_skidpro_carrier3,
        c.custentity_skidpro_carrier4,
        c.custentity4,
        c.custentity5,
        c.custentity_sp_skid_steer_model,
        c.custentity_sp_skid_steer_make,
        c.custentity29,
        c.custentity18,
        c.custentity27,
        
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
      AND c.lastmodifieddate > TO_DATE('${targetDate}', 'YYYY-MM-DD')
      AND isperson = 'F'
`;

    const customers = await fetchAllActiveCustomers(query);

    await processBatchOfCustomers(customers);
    return;

    const customerStream = netsuiteGeneratorFunction(query);

    for await (const { records, stats } of customerStream) {
      try {
        console.log("records", records[0]);
        logger.info(`Records ${JSON.stringify(records, null, 2)}`);
        // return;

        await processBatchOfCustomers(records); // Implement this function to handle the batch processing logic
        logger.info(`[Netsuite-Hubspot Progress] `, {
          total: stats.total,
          processed: stats.processed,
          remaining: stats.remaining,
        });
      } catch (error) {
        logger.error(`Error in syncing netsuite customers to hubspot:`, {
          status: error?.status,
          response: error.response?.data,
          method: error?.method,
          url: error?.config?.url,
          message: error.message,
          stack: error?.stack || error,
        });
      }
    }
  } catch (error) {
    logger.error(`Error in syncing netsuite customers to hubspot:`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}
// async function sync_netsuite_tasks_to_hubspot_tasks()
// async function sync_netsuite_phonecalls_to_hubspot_phonecalls()

export {
  fetchFromNetsuite,
  fetchObjectFromNetsuite,
  fetchCustomer,
  processHSToNetsuite,
  fetchCustomerById,
  processCustomers,
  upsertNetSuiteCustomer,
  fetchAllActiveCustomers,
  netsuiteGenerator,
  syncNetsuiteInvoiceToHubspot,
  syncNetsuiteCustomerToHubspot,
  createNetSuiteInvoice,

  // ----------------------[Main Orchestration Functions]---------------------- //
  sync_netsuite_customers_to_hubspot_companies_and_contacts,
};
