// --------------------Local Imports --------------------------
import { logger } from "../index.js";

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
    logger.error("❌ Critical startup failure:", {
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
    logger.error("❌ Critical startup failure:", {
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
    logger.error("❌ Critical startup failure:", {
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
    logger.error("❌ Critical startup failure:", {
      httpStatus: error?.status,
      message: error.message,
      data: error.response?.data,
      stack: error?.stack,
    });
  }
}

async function* fetchAllActiveCustomers() {
  // The query we discussed earlier
  const query = `
        SELECT id, companyname, firstname, lastname, email, phone, isperson 
        FROM customer 
        WHERE isinactive = 'F'
    `;

  let allCustomers = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100; // Match the limit in your wrapper

  logger.info("Starting NetSuite customer extraction...");

  try {
    while (hasMore) {
      // Call your wrapper
      const response = await runSuiteQL(query, { limit, offset });

      // NetSuite returns the rows inside the 'items' array
      const records = response.items || [];
      // allCustomers.push(...records);

      // logger.info(
      //   `Fetched ${records.length} records... (Total: ${
      //     allCustomers.length
      //   }) | ${JSON.stringify(allCustomers[allCustomers.length - 1], null, 2)}`
      // );

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
      `Extraction complete. Total active customers: ${allCustomers.length}`
    );

    // TODO: Pass allCustomers array to your HubSpot mapping function
    return allCustomers;
  } catch (error) {
    logger.error("Failed to execute SuiteQL:", error.message);
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
    logger.error(`❌ Failed to fetch customer ${customerId}:`, error.message);
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
      AND isinactive = 'F'
  `;

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
    logger.error(`❌ Failed to fetch customer ${customerId}:`, error.message);
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
      const hs_contact = await hs_client.contacts.get(sourceData.id);
      let netsuiteId = null;
      if (hs_contact && hs_contact?.properties?.sourceid) {
        // TODO , Change field name to match the one you are using in HubSpot to store the NetSuite internal ID. This is crucial for the upsert logic to work correctly.
        const ns_customer = await fetchCustomerById(
          hs_contact?.properties?.sourceid
        );
        netsuiteId = ns_customer?.id;
      }

      const payload = mapToNetSuitePerson(hs_contact?.properties);

      // Insert as Contact in NetSuite
      const netsuiteCustomer = await upsertNetSuiteCustomer(
        payload,
        netsuiteId
      );
      logger.info(
        `NetSuite Customer: ${JSON.stringify(netsuiteCustomer, null, 2)}`
      );
    } else if (type === "company" && sourceData?.id) {
      const hs_company = await hs_client.companies.get(sourceData?.id);

      let netsuiteId = null;
      if (hs_company && hs_company?.properties?.sourceid) {
        // TODO , Change field name to match the one you are using in HubSpot to store the NetSuite internal ID. This is crucial for the upsert logic to work correctly.
        const ns_customer = await fetchCustomerById(
          hs_contact?.properties?.sourceid
        );
        netsuiteId = ns_customer?.id;
      }

      const payload = mapToNetSuiteCompany(hs_contact?.properties);

      // Insert as Contact in NetSuite
      const netsuiteCustomer = await upsertNetSuiteCustomer(
        payload,
        netsuiteId
      );
      logger.info(
        `NetSuite Customer: ${JSON.stringify(netsuiteCustomer, null, 2)}`
      );
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

export {
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
};
