// ------------------------Index Import --------------------------
import {
  logger,
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
} from "../index.js";
import { getHSAxios } from "../configs/hubspot.config.js";
import { hubspotExecutor } from "../utils/executors.js";
import { getHubspotClient } from "../configs/hubspot.config.js";

// ------------------------Mapping Functions --------------------------
import {
  contactMappingNSToHS,
  companyMappingNSToHS,
} from "../mapping/netsuite-hubspot.mapping.js";
// ------------------------HubspotServices Functions --------------------------
// import {  } from "";
async function* hubspotGenerator(
  endpoint,
  {
    properties = [],
    filterGroups = null,
    axiosInstance = getHSAxios(),
    executor = hubspotExecutor,
    log = logger,
  } = {}
) {
  let after = undefined;
  let pageCount = 0;
  let totalProcessed = 0;
  const startTime = Date.now();

  const isDelta = Array.isArray(filterGroups) && filterGroups.length > 0;

  try {
    do {
      pageCount++;

      const response = await executor(async () => {
        if (isDelta) {
          // 🔥 Use Search API for delta
          return axiosInstance.post(`${endpoint}/search`, {
            filterGroups,
            properties,
            limit: 100,
            after,
          });
        } else {
          // 🔹 Normal list mode
          return axiosInstance.get(endpoint, {
            params: {
              limit: 100,
              after,
              ...(properties.length && {
                properties: properties.join(","),
              }),
            },
          });
        }
      });

      const records = response.data?.results || [];
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

      after = response.data?.paging?.next?.after;
    } while (after);
  } catch (error) {
    log.error("HubSpot Stream Error", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
}

async function findContactInHubspot(contactInfo = {}) {
  try {
    const hs_client = getHubspotClient();

    // 1. Search by EMAIL first
    if (contactInfo.email) {
      // Assuming getContactByCustomField returns the contact or null/undefined
      const contactByEmail = await hs_client.contacts.getContactByCustomField(
        "email",
        contactInfo.email
      );

      if (contactByEmail) {
        return contactByEmail; // Found via email, return early
      }

      logger.info(
        `No email match found for ${contactInfo.email}, attempting phone search...`
      );
    }

    // 2. Fallback: Search by PHONE if email wasn't found (or wasn't provided)
    const rawPhone = contactInfo?.mobile || contactInfo?.phone || null;

    if (rawPhone) {
      let cleaned = rawPhone.replace(/\D/g, "");

      // Format Australian phone numbers
      if (cleaned.startsWith("0")) {
        cleaned = "+61" + cleaned.substring(1);
      } else if (cleaned.startsWith("61")) {
        cleaned = "+" + cleaned;
      } else if (cleaned) {
        cleaned = "+61" + cleaned;
      }

      const filterGroups = [
        {
          filters: [
            {
              propertyName: "mobilephone",
              operator: "EQ",
              value: cleaned,
            },
          ],
        },
      ];

      const existingContact = await hs_client.contacts.searchContacts(
        filterGroups
      );

      if (existingContact?.results?.length >= 1) {
        return existingContact.results[0]; // Found via phone
      }
    }

    // 3. No match found via email or phone
    return null;
  } catch (error) {
    // logger.error(`Error finding contact: ${error.message}`);
    // throw error;
  }
}

// Future Reference - Params I will need to add in my SDK: endpoint,payload, searchParams,associations, etc. I can also add a param to decide whether to search by email or phone first or both. This function will be used in the upsertContactInHubspot function to check if the contact already exists before deciding to create or update.
async function upsertContactInHubspot(record) {
  try {
    logger.info(`[Netsuite Customer] : ${JSON.stringify(record, null, 2)}`);
    const hs_client = getHubspotClient();
    const payload = contactMappingNSToHS(record);

    if (!payload) {
      logger.warn(
        `Payload is empty for Record : ${JSON.stringify(record, null, 2)}`
      );
      return;
    }

    let existingContact = null;
    if (record) {
      existingContact = await findContactInHubspot(record);
    }

    if (existingContact) {
      return await hs_client.contacts.updateContact(
        existingContact.id,
        payload
      );
    } else {
      return await hs_client.contacts.createContact(payload);
    }
  } catch (error) {
    logger.error("❌ HubSpot Contact failed to upsert (outer catch):", {
      httpStatus: error?.status,
      response: error?.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error?.message,
      stack: error?.stack || error,
    });

    throw error;
  }
}
async function upsertCompanyInHubspot(record) {
  try {
    // Find company if exist update else create company
    const hs_client = getHubspotClient();

    const payload = companyMappingNSToHS(record); //
    logger.info(`Payload ${JSON.stringify(payload, null, 2)}`);

    // search company based on sourceid
    const existingCompany = await hs_client.companies.getCompanyByCustomField(
      "name",
      record?.companyname
    );

    if (existingCompany) {
      return await hs_client.companies.updateCompany(
        existingCompany?.id,
        payload
      );
    } else {
      // create  contact
      return await hs_client.companies.createCompany(payload);
    }
  } catch (error) {
    logger.error("❌ HubSpot Company failed to upsert:", {
      httpStatus: error?.status,
      response: error?.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error?.message,
      stack: error?.stack || error,
    });
    throw error;
  }
}

async function syncHubspotContactToServiceM8Client() {
  try {
    const lastSyncTime = "2026-02-14T10:00:00.000Z";
    const endpoint = "/crm/v3/objects/contacts";

    const filterGroups = [
      {
        filters: [
          {
            propertyName: "lastmodifieddate",
            operator: "GT",
            value: lastSyncTime,
          },
        ],
      },
    ];
    const properties = [
      "createdate",
      "lastmodifieddate",
      "email",
      "firstname",
      "lastname",
      "phone",
      "company",
    ];

    const contactStream = hubspotGenerator(endpoint, {
      properties: properties,
      filterGroups,
    });

    // const contactStream = hubspotGenerator(endpoint, properties, filterGroups);

    for await (const { records, stats } of contactStream) {
      // await processBatchContactInServiceM8(records);
      logger.info(`[ServiceM8 Progress] ${endpoint}`, {
        page: stats.page,
        processed: stats.totalProcessed,
        speed: `${stats.recordsPerSecond} rec/sec`,
      });
      // return;
    }
  } catch (error) {
    logger.error("❌ Error processing Deal in Batch", {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      headers: error?.config?.headers,
      message: error.message,
    });
  }
}
async function searchInHubspot(
  endpoint,
  propertyName,
  propertyValue,
  axiosInstance = getHSAxios()
) {
  try {
    const url = `/crm/v3/objects/${endpoint}/search`;
    const filterGroups = [
      {
        filters: [
          {
            propertyName: propertyName,
            operator: "EQ",
            value: propertyValue,
          },
        ],
      },
    ];
    const response = await axiosInstance.post(url, {
      filterGroups,
      params: { limit: 1, after: "" },
    });
    const records = response.data?.results || null;
    // logger.info(`Search Result: ${JSON.stringify(records, null, 2)}`);
    return records;
  } catch (error) {
    logger.error("❌ Error processing Search in Hubspot", {
      httpStatus: error?.status,
      response: error?.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error?.message,
      stack: error?.stack || error,
    });
    throw error;
  }
}

async function fetchHubSpotAssociationIds(
  fromObject = "companies",
  toObject = "contacts",
  objectId
) {
  if (!fromObject || !toObject || !objectId) {
    logger.warn(
      `Missing fromObject or toObject or objectId fromObject:${fromObject}, toObject:${toObject}, objectId:${objectId}`
    );
    return null;
  }
  let associatedIds = [];
  try {
    // fetch associated ids from hubspot
    const endpoint = `/crm/v3/objects/${fromObject}/${objectId}/associations/${toObject}`;
    const client = getHSAxios();
    const response = await client.get(endpoint);

    const results = response.data?.results || [];

    associatedIds = results.reduce((acc, item) => {
      acc.push(item.id);
      return acc;
    }, []);

    // logger.info(
    //   `[Hubspot] ${endpoint} : ${JSON.stringify(associatedIds, null, 2)}`
    // );

    return associatedIds || [];
  } catch (error) {
    logger.error(`❌ Error processing search in Hubspot:getAssociatedIds`, {
      httpStatus: error?.status,
      response: error?.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error?.message,
      stack: error?.stack || error,
    });
  }
}

async function processBatchOfCustomers(records) {
  try {
    for (const [index, record] of Object.entries(records)) {
      try {
        logger.info(
          `[Netsuite Customer] at index ${index}: ${JSON.stringify(
            record,
            null,
            2
          )}`
        );

        if (record?.isperson === "T") {
          // create contact in hubspot
        } else {
          // create company in hubspot
        }
      } catch (error) {
        logger.error("Error processing Deal in Batch", {
          status: error?.status,
          response: error.response?.data,
          method: error?.method,
          url: error?.config?.url,
          headers: error?.config?.headers,
          message: error.message,
        });
      }
    }
  } catch (error) {
    logger.error("Error processing Deal in Batch", {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      headers: error?.config?.headers,
      message: error.message,
    });
  }
}

export {
  syncHubspotContactToServiceM8Client,
  processBatchOfCustomers,
  searchInHubspot,
  fetchHubSpotAssociationIds,
  // ------------------------------------Upsert in Hubspot---------------------------------
  upsertCompanyInHubspot,
  upsertContactInHubspot,
};
