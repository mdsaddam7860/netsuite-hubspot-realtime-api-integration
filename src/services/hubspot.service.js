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
        logger.info(
          `Contact Found via email: ${JSON.stringify(contactByEmail)}`
        );
        return contactByEmail; // Found via email, return early
      }

      logger.info(
        `No email match found for ${contactInfo.email}, attempting phone search...`
      );
    }

    // 2. Fallback: Search by PHONE if email wasn't found (or wasn't provided)
    // const rawPhone = contactInfo?.mobile || contactInfo?.phone || null;

    // if (rawPhone) {
    //   let cleaned = rawPhone.replace(/\D/g, "");

    //   // Format Australian phone numbers
    //   if (cleaned.startsWith("0")) {
    //     cleaned = "+61" + cleaned.substring(1);
    //   } else if (cleaned.startsWith("61")) {
    //     cleaned = "+" + cleaned;
    //   } else if (cleaned) {
    //     cleaned = "+61" + cleaned;
    //   }

    //   const filterGroups = [
    //     {
    //       filters: [
    //         {
    //           propertyName: "mobilephone",
    //           operator: "EQ",
    //           value: cleaned,
    //         },
    //       ],
    //     },
    //   ];

    //   const existingContact = await hs_client.contacts.searchContacts(
    //     filterGroups
    //   );

    //   if (existingContact?.results?.length >= 1) {
    //     return existingContact.results[0]; // Found via phone
    //   }
    // }

    // 3. No match found via email or phone
    return null;
  } catch (error) {
    // logger.error(`Error finding contact: ${error.message}`);
    // throw error;
  }
}

// Future Reference - Params I will need to add in my SDK: endpoint,payload, searchParams,associations, etc. I can also add a param to decide whether to search by email or phone first or both. This function will be used in the upsertContactInHubspot function to check if the contact already exists before deciding to create or update.
async function upsertContactInHubspot(record) {
  if (!record || !record.email) {
    logger.warn(
      `Record is empty or No email found in record: ${JSON.stringify(record)}`
    );
    return;
  }
  try {
    logger.info(
      `[Netsuite Customer/Person] : ${JSON.stringify(record, null, 2)}`
    );
    const hs_client = getHubspotClient();
    const properties = contactMappingNSToHS(record);

    if (!properties) {
      logger.warn(
        `Payload is empty for Record : ${JSON.stringify(record, null, 2)}`
      );
      return;
    }

    const payload = {
      inputs: [
        {
          id: record.email,
          idProperty: "email",
          properties,
        },
      ],
    };

    logger.info(`Payload : ${JSON.stringify(payload, null, 2)}`);

    // hs_client.contacts.batchUpsert;
    const res = await hs_client.contacts.batchUpsert(payload);
    logger.info(
      `Contact Updated/Created Successfully: ${JSON.stringify(res, null, 2)}`
    );
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
  if (!record || !record.id) {
    logger.warn(
      `Record is empty or No id found in record: ${JSON.stringify(record)}`
    );
    return;
  }
  try {
    // Find company if exist update else create company
    const hs_client = getHubspotClient();

    const properties = companyMappingNSToHS(record);

    if (!properties) {
      logger.warn(
        `Payload is empty for Record : ${JSON.stringify(record, null, 2)}`
      );
      return;
    }

    const payload = {
      inputs: [
        {
          id: record.id,
          idProperty: "sourceid",
          properties,
        },
      ],
    };

    logger.info(`Payload ${JSON.stringify(payload, null, 2)}`);

    const res = await hs_client.companies.batchUpsert(payload);

    if (res.status === "COMPLETE")
      logger.info(
        `Company Upserted Successfully: ${JSON.stringify(res, null, 2)}`
      );
  } catch (error) {
    logger.error("❌ HubSpot Company failed to upsert:", {
      httpStatus: error?.status,
      response: error?.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error?.message,
      stack: error?.stack || error,
    });
    // throw error;
  }
}

async function searchInHubspot(
  endpoint,
  propertyName,
  propertyValue,
  limit = 1,
  properties = [],
  axiosInstance = getHSAxios()
) {
  try {
    const url = `/crm/v3/objects/${endpoint}/search`;
    console.log("URL", url);
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
      properties,
      params: {
        limit: `${limit}`,
        after: "",
      },
    });
    const records = response.data?.results || null;
    logger.info(`Search Result: ${JSON.stringify(records, null, 2)}`);
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

// async function processBatchOfCompanies(records) {
//   try {
//     for (const [index, record] of Object.entries(records)) {
//       try {
//         logger.info(
//           `[Netsuite Customer] at index ${index}: ${JSON.stringify(
//             record,
//             null,
//             2
//           )}`
//         );

//         if (record?.isperson === "T") {
//           // create contact in hubspot
//         } else {
//           // create company in hubspot
//         }
//       } catch (error) {
//         logger.error("Error processing Deal in Batch", {
//           status: error?.status,
//           response: error.response?.data,
//           method: error?.method,
//           url: error?.config?.url,
//           headers: error?.config?.headers,
//           message: error.message,
//         });
//       }
//     }
//   } catch (error) {
//     logger.error("Error processing Deal in Batch", {
//       status: error?.status,
//       response: error.response?.data,
//       method: error?.method,
//       url: error?.config?.url,
//       headers: error?.config?.headers,
//       message: error.message,
//     });
//   }
// }

function chunkArray(arr, chunkSize) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

async function processBatchOfContacts(nsRecords) {
  const contacts = nsRecords.filter((item) => item?.companyname && item?.email);
  if (!contacts || contacts.length === 0) return;

  try {
    const contactMap = new Map();
    const contactPayload = [];
    const hs_client = getHubspotClient();

    for (const customer of contacts) {
      const properties = contactMappingNSToHS(customer);

      if (!properties) {
        logger.warn(
          `Payload is empty for Record : ${JSON.stringify(customer, null, 2)}`
        );
        continue;
      } else {
        contactPayload.push({
          id: customer.email,
          idProperty: "email",
          properties,
        });
      }
    }

    // logger.debug(`contactPayload: ${JSON.stringify(contactPayload, null, 2)}`);

    if (contactPayload.length > 0) {
      const chunks = chunkArray(contactPayload, 100);
      for (const chunk of chunks) {
        const res = await hs_client.contacts.batchUpsert({
          inputs: chunk,
        });
        logger.debug(
          `Successfully batched upserted ${chunk.length} contacts to HubSpot.
           Result :${JSON.stringify(res)} \n Payload : ${JSON.stringify(chunk)}`
        );

        if (res && res?.results) {
          for (const item of res.results) {
            const nsId = item?.properties?.sourceid;
            if (nsId) {
              contactMap.set(nsId, item.id);
            } else {
              // Fallback to name only if sourceid is missing from response payload
              logger.debug(
                `sourceid missing in response, fallback to name for ID ${item.id}`
              );
              contactMap.set(item.properties?.email, item.id);
            }
          }
        }
      }
    }

    logger.debug(
      `contactMap: ${JSON.stringify(Object.fromEntries(contactMap), null, 2)}`
    );

    for (const record of contacts) {
      try {
        // logger.debug(
        //   `[Netsuite Customer] : ${JSON.stringify(record, null, 2)}`
        // );
        const companiesRes = await searchInHubspot(
          "companies",
          "name",
          record?.companyname,
          100
        );

        const companyIds = companiesRes.reduce((acc, item) => {
          acc.push(item.id);
          return acc;
        }, []);

        logger.debug(`CompanyIds: ${JSON.stringify(companyIds, null, 2)}`);

        if (companyIds.length > 0) {
          const associationPairs = companyIds.map((id) => {
            return {
              fromId: contactMap.get(record?.id || record?.email),
              toId: id,
            };
          });

          const associationResult = await hs_client.associations.batchAssociate(
            "contacts",
            "companies",
            associationPairs,
            279,
            "HUBSPOT_DEFINED"
          );

          logger.debug(
            `Association Result: ${JSON.stringify(associationResult, null, 2)}`
          );
        }
      } catch (error) {
        logger.error(
          `Error in syncing [Netsuite] Customer as Hubspot Contact`,
          {
            status: error?.status,
            response: error.response?.data,
            method: error?.method,
            url: error?.config?.url,
            headers: error?.config?.headers,
            message: error.message,
            stack: error?.stack || error,
          }
        );
      }
    }

    logger.info(
      `Batch processing completed. Consolidated map size: ${contactMap.size}`
    );
  } catch (error) {
    logger.error(`Error in syncing [Netsuite] Customer as Hubspot Contact`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      headers: error?.config?.headers,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}

async function getContactIds(companies, hs_client = getHubspotClient()) {
  try {
    // Construct Payload for searching contact in Hubspot
    const contactMap = new Map();
    const contacts = companies
      .filter((item) => item?.email)
      .map((item) => {
        return {
          id: item?.email,
        };
      });

    if (contacts.length > 0) {
      const chunk = chunkArray(contacts, 100);
      for (let i = 0; i < chunk.length; i++) {
        const res = await hs_client.contacts.batchSearch({
          inputs: chunk[i],
          idProperty: "email",
        });
        if (res && res.results) {
          res?.results.map((item) => {
            contactMap.set(item?.properties?.email, item.id);
          });
        }
      }
    }

    return contactMap;
  } catch (error) {
    logger.error(`Error in syncing [Netsuite] Customer as Hubspot Contact`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      headers: error?.config?.headers,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}
// This function is used to retrieve conttact ids from hubspot for each company, using batch read endpoint of hubspot.

// const contactMap = await getContactIds(companies);

// logger.info(
//   `ContactMap: ${JSON.stringify(Object.fromEntries(contactMap), null, 2)}`
// );

// Construct Payload for Upsert
async function processBatchOfCompanies(companies) {
  if (!companies || companies.length === 0) return null;

  try {
    const companyMap = new Map();
    // Assuming getHubspotClient cached instance or singleton pattern
    const hs_client = getHubspotClient();
    const companyPayload = [];

    // Construct Payload for Upsert
    for (const customer of companies) {
      const properties = companyMappingNSToHS(customer);

      if (!properties) {
        logger.warn(
          `Payload mapping returned empty for NetSuite Record ID: ${customer.id}`
        );
        continue;
      }

      companyPayload.push({
        id: customer.id, // NetSuite Internal ID
        idProperty: "sourceid", // Custom unique identifier matching on HubSpot side
        properties,
      });
    }

    if (companyPayload.length > 0) {
      // OPTIMIZATION: Maximize HubSpot's batch capabilities (up to 1000 entries)
      const chunks = chunkArray(companyPayload, 100);

      for (const chunk of chunks) {
        const res = await hs_client.companies.batchUpsert({
          inputs: chunk,
        });

        logger.debug(
          `Successfully batched upserted ${chunk.length} companies to HubSpot.
           Result :${JSON.stringify(res)} \n Payload : ${JSON.stringify(chunk)}`
        );

        // Safe Mapping: Tie HubSpot ID back to NetSuite Source ID
        if (res && res.results) {
          for (const item of res.results) {
            const nsId = item.properties?.sourceid;
            if (nsId) {
              companyMap.set(nsId, item.id);
            } else {
              // Fallback to name only if sourceid is missing from response payload
              logger.debug(
                `sourceid missing in response, fallback to name for ID ${item.id}`
              );
              companyMap.set(item.properties?.name, item.id);
            }
          }
        }
      }
    }

    logger.debug(
      `companyMap ${JSON.stringify(Object.fromEntries(companyMap), null, 2)}`
    );

    logger.info(
      `Batch processing completed. Consolidated map size: ${companyMap.size}`
    );

    // Return the map so the parent pipeline can use these mappings (e.g., for Contact associations)
    return companyMap;
  } catch (error) {
    logger.error(`Error in syncing batch payload to HubSpot Companies:`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      headers: error?.config?.headers,
      message: error.message,
    });

    // CRITICAL: Propagate error upward to fail the batch gracefully
    throw error;
  }
}

export {
  // ------------------------------------Functions Which are required for Hubspot------------------------
  searchInHubspot,
  fetchHubSpotAssociationIds,
  // ------------------------------------Upsert in Hubspot---------------------------------
  upsertCompanyInHubspot,
  upsertContactInHubspot,

  //  -----------------Batch Operation & Orchestration-------------------------------
  processBatchOfContacts,
  processBatchOfCompanies,
};
