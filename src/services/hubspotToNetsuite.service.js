// src/services/hubspotToNetsuite.service.js
import { readCheckpoint, writeCheckpoint } from "../utils/checkpointStore.js";
import { hubspotGenerator } from "./hubspot.service.js"; // export this generator
import {
  contactMappingHSToNS,
  companyMappingHSToNS,
} from "../mapping/hubspot-netsuite.mapping.js";
import { upsertNetSuiteCustomer } from "./netsuite.service.js";
import { companyProperties, contactProperties } from "../utils/helper.util.js";
import { getHubspotClient } from "../configs/hubspot.config.js";
import { logger } from "../utils/winston.logger.js";

const CP_CONTACTS = "./checkpoints/hs_contacts.json";
const CP_COMPANIES = "./checkpoints/hs_companies.json";
const INTEGRATION_STAMP_PROP = "ns_last_synced_at"; // set on HS write from NS side

function wasJustSyncedByUs(props, toleranceMs = 5 * 60 * 1000) {
  if (!props?.ns_last_synced_at) return false;
  const modified = Date.parse(props.lastmodifieddate);
  const stamped = Date.parse(props.ns_last_synced_at);
  return Math.abs(modified - stamped) <= toleranceMs;
}
export async function syncHubspotContactsToNetsuite() {
  const hs_client = getHubspotClient();
  const cp = await readCheckpoint(CP_CONTACTS, { lastModified: null });
  const sinceTs =
    cp.lastModified || new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const filterGroups = [
    {
      filters: [
        { propertyName: "lastmodifieddate", operator: "GT", value: sinceTs },
      ],
    },
  ];

  let newest = sinceTs;
  const stream = hubspotGenerator("/crm/v3/objects/contacts", {
    properties: [...contactProperties(), INTEGRATION_STAMP_PROP],
    filterGroups,
  });

  for await (const { records } of stream) {
    for (const hsContact of records) {
      try {
        // ---- LOOP GUARD (see #2) ----
        if (wasJustSyncedByUs(hsContact.properties)) continue;

        const payload = contactMappingHSToNS(hsContact.properties);
        if (!payload) continue;

        const sourceId = hsContact.properties?.sourceid;
        const result = await upsertNetSuiteCustomer(payload, sourceId);

        // Critical: without writing the new NetSuite id back onto the HubSpot
        // record, the next run will see no sourceid again and CREATE a
        // duplicate customer instead of updating the one we just made.
        if (!sourceId && result?.netsuiteId) {
          await hs_client.contacts.updateContact(hsContact.id, {
            sourceid: result.netsuiteId,
          });
        }

        const lm = hsContact.properties?.lastmodifieddate;
        if (lm && lm > newest) newest = lm;
      } catch (err) {
        // Don't let one bad record (missing required NetSuite fields, a
        // transient API error, etc.) abort the whole run and permanently
        // block the checkpoint from advancing past it.
        logger.error(
          `Skipping HubSpot contact ${hsContact.id} due to sync error: ${err.message}`
        );
      }
    }
  }

  await writeCheckpoint(CP_CONTACTS, {
    lastModified: newest,
    ranAt: new Date().toISOString(),
  });
}
export async function syncHubspotCompaniesToNetsuite() {
  const hs_client = getHubspotClient();
  const cp = await readCheckpoint(CP_COMPANIES, { lastModified: null });
  const sinceTs =
    cp.lastModified || new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const filterGroups = [
    {
      filters: [
        { propertyName: "hs_lastmodifieddate", operator: "GT", value: sinceTs },
      ],
    },
  ];

  let newest = sinceTs;
  const stream = hubspotGenerator("/crm/v3/objects/companies", {
    properties: [...companyProperties(), INTEGRATION_STAMP_PROP],
    filterGroups,
  });

  for await (const { records } of stream) {
    for (const hsCompany of records) {
      try {
        // ---- LOOP GUARD (see #2) ----
        if (wasJustSyncedByUs(hsCompany.properties)) continue;

        const payload = companyMappingHSToNS(hsCompany.properties);
        if (!payload) continue;

        const sourceId = hsCompany.properties?.sourceid;
        const result = await upsertNetSuiteCustomer(payload, sourceId);

        if (!sourceId && result?.netsuiteId) {
          await hs_client.companies.updateCompany(hsCompany.id, {
            sourceid: result.netsuiteId,
          });
        }

        const lm = hsCompany.properties?.hs_lastmodifieddate;
        if (lm && lm > newest) newest = lm;
      } catch (err) {
        logger.error(
          `Skipping HubSpot company ${hsCompany.id} due to sync error: ${err.message}`
        );
      }
    }
  }

  await writeCheckpoint(CP_COMPANIES, {
    lastModified: newest,
    ranAt: new Date().toISOString(),
  });
}
