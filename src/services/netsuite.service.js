// --------------------Local Imports --------------------------
import {
  companyProperties,
  contactProperties,
  customerQuery,
  logger,
  delta,
} from "../index.js";

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
  processBatchOfContacts,
  processBatchOfCompanies,
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

/**
 * Fetch All Customers from NetSuite using SuiteQL with pagination.
 * @param {*} query - This suiteql query will fetch all active customers and it also has a limit and delta filter which will be passed from the caller function.The delta filter wil ensure that only new/updates customer will be fetched.
 * @returns - It returns all active customers.
 */
async function fetchAllActiveCustomers(query) {
  let allCustomers = [];
  let hasMore = true;
  let offset = 0;
  let pageCount = 0;
  let totalProcessed = 0;
  const limit = 1; // Match the limit in your wrapper

  logger.debug("Starting NetSuite customer extraction...");

  try {
    while (hasMore) {
      pageCount++;
      // Call your wrapper
      const response = await runSuiteQL(query, { limit, offset });

      // NetSuite returns the rows inside the 'items' array
      const records = response.items || [];
      allCustomers.push(...records);

      totalProcessed += records.length;

      // Check if there is another page
      hasMore = response.hasMore;

      if (hasMore) {
        offset += limit;
      }
    }

    logger.info(
      `Extraction complete. Total active customers: ${allCustomers.length}`
    );

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
 * Fetch All Customers from NetSuite using SuiteQL with pagination.
 * @param {*} query - This suiteql query will fetch all active customers and it also has a limit and delta filter which will be passed from the caller function.The delta filter wil ensure that only new/updates customer will be fetched.
 * @returns - It returns all active customers.
 */
async function* fetchAllActiveCustomersPagingWithGenerator(query) {
  let hasMore = true;
  let offset = 0;
  let pageCount = 0;
  let totalProcessed = 0;
  const limit = 100; // Optimized production batch size
  const startTime = Date.now();

  logger.info("Starting NetSuite customer extraction...");

  // Define executor options outside the loop to prevent repeated allocations
  const executorOptions = {
    name: "fetch-all-active-customers with pagination and generator functionality",
  };

  try {
    while (hasMore) {
      pageCount++;

      // Cleaned up the wrapper invocation using a direct, concise arrow return
      const response = await netsuiteExecutor(
        () => runSuiteQL(query, { limit, offset }),
        executorOptions
      );

      const records = response.items || [];

      // Safeguard: Drop out early if NetSuite returns an empty data set mid-stream
      if (records.length === 0) {
        logger.warn(
          `Received empty items array on page ${pageCount} at offset ${offset}. Ending stream.`
        );
        break;
      }

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

      // Defensively normalize boolean values from response metadata
      hasMore = response.hasMore === true || response.hasMore === "true";

      if (hasMore) {
        offset += limit;
      }
    }

    logger.info(
      `Extraction complete. Total records extracted: ${totalProcessed} across ${pageCount} pages.`
    );
  } catch (error) {
    logger.error("Failed to execute SuiteQL:", {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
    throw error;
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
    `;
  // -- AND isinactive = 'F'
  // AND isPerson = 'F'

  // logger.info(`Fetching NetSuite customer with ID: ${customerId}...`);

  try {
    // We only need 1 record, so limit = 1 and offset = 0
    const response = await runSuiteQL(query, { limit: 100, offset: 0 });

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
        await processBatchOfCompanies(records); // Implement this function to handle the batch processing logic

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

async function sync_netsuite_customers_to_hubspot_companies() {
  try {
    const previousDate = "2026-05-15";
    // const previousDate = delta();

    const query = customerQuery({ targetDate: previousDate, isPerson: "F" });

    // const customers = await fetchAllActiveCustomers(query);

    // await processBatchOfCompanies(customers);

    const customerStream = fetchAllActiveCustomersPagingWithGenerator(query);

    for await (const { records, stats } of customerStream) {
      try {
        await processBatchOfCompanies(records);

        logger.info(
          `[Netsuite-Hubspot Progress] : ${
            (stats.page, stats.totalProcessed, stats.recordsPerSecond)
          }`
        );
        return; // TODO Remove after testing
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
async function sync_netsuite_customers_to_hubspot_contacts() {
  try {
    const previousDate = delta();

    const query = customerQuery({ targetDate: previousDate, isPerson: "T" });

    // const customers = await fetchAllActiveCustomers(query);

    const customerStream = fetchAllActiveCustomersPagingWithGenerator(query);

    for await (const { records, stats } of customerStream) {
      try {
        await processBatchOfContacts(records);

        logger.info(
          `[Netsuite-Hubspot Progress] Person: ${
            (stats.page, stats.totalProcessed, stats.recordsPerSecond)
          }`
        );
        return; // TODO Remove after testing
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
    logger.error(`Error in syncing netsuite customers to hubspot Contacts:`, {
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
  sync_netsuite_customers_to_hubspot_companies,
  sync_netsuite_customers_to_hubspot_contacts,
};
